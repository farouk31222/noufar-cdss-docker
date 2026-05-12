const normalizeDisplayFileName = (fileName = "") => {
  const cleaned = String(fileName || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[\\/:"*?<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const limited = cleaned.slice(0, 120).trim();
  return limited || "file";
};

const normalizeStoredFileName = (fileName = "") =>
  normalizeDisplayFileName(fileName)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || "file";

const scanUploadedFile = async (file) => {
  const mode = String(process.env.UPLOAD_MALWARE_SCAN_MODE || "disabled").trim().toLowerCase();

  if (mode === "disabled") {
    return {
      accepted: true,
      mode,
    };
  }

  const error = new Error(
    `Upload malware scan mode "${mode}" is not configured yet. Disable it or implement a scanner provider first.`
  );
  error.statusCode = 503;
  error.code = "UPLOAD_SCAN_NOT_CONFIGURED";
  error.reason = "Malware scanning hook is prepared but no scanner provider is integrated yet.";
  throw error;
};

module.exports = {
  normalizeDisplayFileName,
  normalizeStoredFileName,
  scanUploadedFile,
};
