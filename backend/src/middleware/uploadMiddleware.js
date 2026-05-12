const path = require("path");
const multer = require("multer");

const createUploadValidationError = (message, code = "UPLOAD_VALIDATION_FAILED", statusCode = 400) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.isUploadValidationError = true;
  return error;
};

const getLowerCaseExtension = (fileName = "") => path.extname(String(fileName || "").trim()).toLowerCase();

const doctorDocumentsUploadPolicy = {
  fieldLabel: "doctor verification documents",
  maxFileSize: 5 * 1024 * 1024,
  errorMessage: "Only PDF, PNG, JPG, JPEG, and WEBP files up to 5 MB are allowed.",
  allowedExtensions: new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]),
  allowedMimeTypesByExtension: {
    ".pdf": new Set(["application/pdf"]),
    ".png": new Set(["image/png"]),
    ".jpg": new Set(["image/jpeg"]),
    ".jpeg": new Set(["image/jpeg"]),
    ".webp": new Set(["image/webp"]),
  },
};

const supportAttachmentUploadPolicy = {
  fieldLabel: "support attachments",
  maxFileSize: 10 * 1024 * 1024,
  errorMessage:
    "Supported support attachments are PDF, images, text, Office documents, ZIP archives, and MP3 audio up to 10 MB.",
  allowedExtensions: new Set([
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".txt",
    ".csv",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".zip",
    ".mp3",
  ]),
  allowedMimeTypesByExtension: {
    ".pdf": new Set(["application/pdf"]),
    ".png": new Set(["image/png"]),
    ".jpg": new Set(["image/jpeg"]),
    ".jpeg": new Set(["image/jpeg"]),
    ".webp": new Set(["image/webp"]),
    ".gif": new Set(["image/gif"]),
    ".txt": new Set(["text/plain"]),
    ".csv": new Set(["text/csv"]),
    ".doc": new Set(["application/msword"]),
    ".docx": new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
    ".xls": new Set(["application/vnd.ms-excel"]),
    ".xlsx": new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),
    ".ppt": new Set(["application/vnd.ms-powerpoint"]),
    ".pptx": new Set(["application/vnd.openxmlformats-officedocument.presentationml.presentation"]),
    ".zip": new Set(["application/zip", "application/x-zip-compressed"]),
    ".mp3": new Set(["audio/mpeg"]),
  },
};

const datasetImportUploadPolicy = {
  fieldLabel: "dataset import files",
  maxFileSize: 20 * 1024 * 1024,
  errorMessage: "Only CSV, XLS, and XLSX dataset files up to 20 MB are allowed.",
  allowedExtensions: new Set([".csv", ".xls", ".xlsx"]),
  allowedMimeTypesByExtension: {
    ".csv": new Set(["text/csv"]),
    ".xls": new Set(["application/vnd.ms-excel"]),
    ".xlsx": new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),
  },
};

const validateFileAgainstPolicy = (file, policy) => {
  const originalName = String(file?.originalname || "").trim();
  const extension = getLowerCaseExtension(originalName);
  const mimeType = String(file?.mimetype || "").trim().toLowerCase();

  if (!originalName || !extension) {
    throw createUploadValidationError(
      `A valid file name with extension is required for ${policy.fieldLabel}.`,
      "UPLOAD_INVALID_NAME"
    );
  }

  if (!policy.allowedExtensions.has(extension)) {
    throw createUploadValidationError(policy.errorMessage, "UPLOAD_EXTENSION_NOT_ALLOWED");
  }

  const allowedMimeTypes = policy.allowedMimeTypesByExtension[extension];
  if (!allowedMimeTypes || !allowedMimeTypes.has(mimeType)) {
    throw createUploadValidationError(policy.errorMessage, "UPLOAD_MIME_NOT_ALLOWED");
  }
};

const createUpload = (policy) => {
  const fileFilter = (_req, file, cb) => {
    try {
      validateFileAgainstPolicy(file, policy);
      cb(null, true);
    } catch (error) {
      cb(error);
    }
  };

  return multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: {
      fileSize: policy.maxFileSize,
    },
  });
};

const upload = createUpload(doctorDocumentsUploadPolicy);
const supportUpload = createUpload(supportAttachmentUploadPolicy);
const datasetImportUpload = createUpload(datasetImportUploadPolicy);

module.exports = {
  upload,
  supportUpload,
  datasetImportUpload,
  createUploadValidationError,
  doctorDocumentsUploadPolicy,
  supportAttachmentUploadPolicy,
  datasetImportUploadPolicy,
};
