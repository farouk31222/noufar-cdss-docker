const fs = require("fs");
const path = require("path");
const { Client: MinioClient } = require("minio");
const {
  normalizeDisplayFileName,
  normalizeStoredFileName,
  scanUploadedFile,
} = require("./uploadSecurityService");

const uploadRootDir = path.join(__dirname, "..", "..", "uploads");
const minioBucket = String(process.env.MINIO_BUCKET || "noufar-private-files").trim() || "noufar-private-files";

const minioConfigured = Boolean(
  process.env.MINIO_ENDPOINT &&
    process.env.MINIO_ACCESS_KEY &&
    process.env.MINIO_SECRET_KEY
);

const minioClient = minioConfigured
  ? new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT,
      port: Number(process.env.MINIO_PORT || 9000),
      useSSL: String(process.env.MINIO_USE_SSL || "false").toLowerCase() === "true",
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    })
  : null;

let minioBucketReadyPromise = null;

const ensureUploadDirectory = (directoryPath) => {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
};

ensureUploadDirectory(uploadRootDir);

const normalizeStoredUploadPath = (storedPath = "") => {
  const normalized = String(storedPath || "").trim().replace(/\\/g, "/");
  if (!normalized) return "";
  return normalized.startsWith("/") ? normalized.slice(1) : normalized;
};

const resolveStoredUploadPath = (storedPath = "") => {
  const normalizedRelativePath = normalizeStoredUploadPath(storedPath);

  if (!normalizedRelativePath) {
    const error = new Error("Stored file path is missing.");
    error.statusCode = 404;
    throw error;
  }

  if (!normalizedRelativePath.startsWith("uploads/")) {
    const error = new Error("Stored file path is invalid.");
    error.statusCode = 400;
    throw error;
  }

  const absolutePath = path.resolve(path.join(__dirname, "..", "..", normalizedRelativePath));
  const normalizedUploadRoot = path.resolve(uploadRootDir);

  if (!absolutePath.startsWith(normalizedUploadRoot)) {
    const error = new Error("Stored file path is outside the upload directory.");
    error.statusCode = 400;
    throw error;
  }

  return absolutePath;
};

const buildInlineDisposition = (fileName = "document") => {
  const safeFileName = normalizeDisplayFileName(fileName).replace(/"/g, "");
  return `inline; filename="${safeFileName}"`;
};

const ensureMinioBucketReady = async () => {
  if (!minioConfigured || !minioClient) {
    return false;
  }

  if (!minioBucketReadyPromise) {
    minioBucketReadyPromise = (async () => {
      const bucketExists = await minioClient.bucketExists(minioBucket).catch(() => false);
      if (!bucketExists) {
        await minioClient.makeBucket(minioBucket);
      }
      return true;
    })();
  }

  return minioBucketReadyPromise;
};

const storeFileLocally = async ({ file, folder = "" }) => {
  const displayFileName = normalizeDisplayFileName(file.originalname);
  const safeName = `${Date.now()}-${normalizeStoredFileName(displayFileName)}`;
  const normalizedFolder = String(folder || "").trim().replace(/\\/g, "/");
  const relativeDirectory = normalizedFolder ? path.join("uploads", normalizedFolder) : "uploads";
  const absoluteDirectory = path.join(__dirname, "..", "..", relativeDirectory);
  ensureUploadDirectory(absoluteDirectory);

  const absolutePath = path.join(absoluteDirectory, safeName);
  await fs.promises.writeFile(absolutePath, file.buffer);

  const relativePath = normalizedFolder
    ? `/uploads/${normalizedFolder}/${safeName}`
    : `/uploads/${safeName}`;

  return {
    storageProvider: "local",
    bucket: "",
    objectKey: "",
    filePath: relativePath,
    fileName: displayFileName,
    mimeType: file.mimetype,
    fileSize: file.size,
  };
};

const storeFileInMinio = async ({ file, folder = "" }) => {
  await ensureMinioBucketReady();

  const displayFileName = normalizeDisplayFileName(file.originalname);
  const safeName = `${Date.now()}-${normalizeStoredFileName(displayFileName)}`;
  const normalizedFolder = String(folder || "").trim().replace(/\\/g, "/");
  const objectKey = normalizedFolder ? `${normalizedFolder}/${safeName}` : safeName;

  await minioClient.putObject(minioBucket, objectKey, file.buffer, file.size, {
    "Content-Type": file.mimetype || "application/octet-stream",
  });

  return {
    storageProvider: "minio",
    bucket: minioBucket,
    objectKey,
    filePath: "",
    fileName: displayFileName,
    mimeType: file.mimetype,
    fileSize: file.size,
  };
};

const storePrivateUpload = async ({ file, folder = "" }) => {
  if (!file?.buffer) {
    const error = new Error("Upload buffer is missing.");
    error.statusCode = 400;
    throw error;
  }

  file.originalname = normalizeDisplayFileName(file.originalname);
  await scanUploadedFile(file);

  if (minioConfigured) {
    return storeFileInMinio({ file, folder });
  }

  return storeFileLocally({ file, folder });
};

const getStorageProvider = (storedFile = {}) => {
  if (storedFile.storageProvider === "minio" || storedFile.objectKey || storedFile.bucket) {
    return "minio";
  }

  return "local";
};

const sendStoredFileResponse = async (storedFile = {}, res) => {
  const provider = getStorageProvider(storedFile);

  if (provider === "minio") {
    if (!minioConfigured || !minioClient) {
      const error = new Error("Object storage is not configured.");
      error.statusCode = 503;
      throw error;
    }

    const bucket = String(storedFile.bucket || minioBucket).trim() || minioBucket;
    const objectKey = String(storedFile.objectKey || "").trim();

    if (!objectKey) {
      const error = new Error("Stored object key is missing.");
      error.statusCode = 404;
      throw error;
    }

    const stream = await minioClient.getObject(bucket, objectKey).catch((error) => {
      const wrappedError = new Error("File not found.");
      wrappedError.statusCode = 404;
      wrappedError.cause = error;
      throw wrappedError;
    });

    res.setHeader("Content-Type", storedFile.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      buildInlineDisposition(storedFile.fileName || storedFile.originalName || "document")
    );
    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(404).json({ message: "File not found." });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
    return;
  }

  const absolutePath = resolveStoredUploadPath(storedFile.filePath);

  if (!fs.existsSync(absolutePath)) {
    const error = new Error("File not found.");
    error.statusCode = 404;
    throw error;
  }

  res.setHeader("Content-Type", storedFile.mimeType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    buildInlineDisposition(storedFile.fileName || storedFile.originalName || "document")
  );
  res.sendFile(path.resolve(absolutePath));
};

const removeStoredFile = async (storedFile = {}) => {
  const provider = getStorageProvider(storedFile);

  if (provider === "minio") {
    if (!minioConfigured || !minioClient) {
      return false;
    }

    const bucket = String(storedFile.bucket || minioBucket).trim() || minioBucket;
    const objectKey = String(storedFile.objectKey || "").trim();
    if (!objectKey) return false;

    await minioClient.removeObject(bucket, objectKey).catch(() => {});
    return true;
  }

  const filePath = String(storedFile.filePath || "").trim();
  if (!filePath) return false;

  try {
    const absolutePath = resolveStoredUploadPath(filePath);
    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath);
      return true;
    }
  } catch (error) {
    return false;
  }

  return false;
};

module.exports = {
  buildInlineDisposition,
  ensureMinioBucketReady,
  minioConfigured,
  removeStoredFile,
  storePrivateUpload,
  sendStoredFileResponse,
};
