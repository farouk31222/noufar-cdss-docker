const multer = require("multer");

const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Not found - ${req.originalUrl}`));
};

const errorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        message: "Uploaded file exceeds the allowed size limit.",
        code: "UPLOAD_FILE_TOO_LARGE",
        reason: null,
        stack: process.env.NODE_ENV === "production" ? null : err.stack,
      });
      return;
    }

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      res.status(400).json({
        message: "Unexpected upload field.",
        code: "UPLOAD_UNEXPECTED_FIELD",
        reason: null,
        stack: process.env.NODE_ENV === "production" ? null : err.stack,
      });
      return;
    }
  }

  if (err?.isUploadValidationError) {
    const statusCode = err.statusCode || 400;
    res.status(statusCode).json({
      message: err.message,
      code: err.code || "UPLOAD_VALIDATION_FAILED",
      reason: err.reason || null,
      stack: process.env.NODE_ENV === "production" ? null : err.stack,
    });
    return;
  }

  const statusCode =
    res.statusCode && res.statusCode !== 200 ? res.statusCode : err.statusCode || 500;

  res.status(statusCode).json({
    message: err.message,
    code: err.code || null,
    reason: err.reason || null,
    email: err.email || null,
    doctorName: err.doctorName || null,
    institution: err.institution || null,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

module.exports = {
  notFound,
  errorHandler,
};
