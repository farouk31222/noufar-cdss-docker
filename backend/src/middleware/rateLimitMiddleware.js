const rateLimit = require("express-rate-limit");

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildLimiter = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        message,
        code: "RATE_LIMIT_EXCEEDED",
        reason: null,
      });
    },
  });

const loginLimiter = buildLimiter({
  windowMs: toInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 15 * 60 * 1000),
  max: toInt(process.env.RATE_LIMIT_LOGIN_MAX, 8),
  message: "Too many login attempts, please try again later.",
});

const twoFactorLimiter = buildLimiter({
  windowMs: toInt(process.env.RATE_LIMIT_2FA_WINDOW_MS, 10 * 60 * 1000),
  max: toInt(process.env.RATE_LIMIT_2FA_MAX, 5),
  message: "Too many 2FA verification attempts, please try again later.",
});

const forgotPasswordLimiter = buildLimiter({
  windowMs: toInt(process.env.RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS, 30 * 60 * 1000),
  max: toInt(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX, 5),
  message: "Too many password reset requests, please try again later.",
});

const resetPasswordLimiter = buildLimiter({
  windowMs: toInt(process.env.RATE_LIMIT_RESET_PASSWORD_WINDOW_MS, 30 * 60 * 1000),
  max: toInt(process.env.RATE_LIMIT_RESET_PASSWORD_MAX, 5),
  message: "Too many password reset attempts, please try again later.",
});

const registerLimiter = buildLimiter({
  windowMs: toInt(process.env.RATE_LIMIT_REGISTER_WINDOW_MS, 60 * 60 * 1000),
  max: toInt(process.env.RATE_LIMIT_REGISTER_MAX, 5),
  message: "Too many registration attempts, please try again later.",
});

const createAdminLimiter = buildLimiter({
  windowMs: toInt(process.env.RATE_LIMIT_CREATE_ADMIN_WINDOW_MS, 60 * 60 * 1000),
  max: toInt(process.env.RATE_LIMIT_CREATE_ADMIN_MAX, 4),
  message: "Too many admin creation attempts, please try again later.",
});

const supportCreateLimiter = buildLimiter({
  windowMs: toInt(process.env.RATE_LIMIT_SUPPORT_CREATE_WINDOW_MS, 15 * 60 * 1000),
  max: toInt(process.env.RATE_LIMIT_SUPPORT_CREATE_MAX, 5),
  message: "Too many support ticket submissions, please try again later.",
});

const supportReplyLimiter = buildLimiter({
  windowMs: toInt(process.env.RATE_LIMIT_SUPPORT_REPLY_WINDOW_MS, 5 * 60 * 1000),
  max: toInt(process.env.RATE_LIMIT_SUPPORT_REPLY_MAX, 12),
  message: "Too many support replies, please try again later.",
});

const predictionCreateLimiter = buildLimiter({
  windowMs: toInt(process.env.RATE_LIMIT_PREDICTION_CREATE_WINDOW_MS, 10 * 60 * 1000),
  max: toInt(process.env.RATE_LIMIT_PREDICTION_CREATE_MAX, 12),
  message: "Too many prediction requests, please try again later.",
});

const predictionUpdateLimiter = buildLimiter({
  windowMs: toInt(process.env.RATE_LIMIT_PREDICTION_UPDATE_WINDOW_MS, 10 * 60 * 1000),
  max: toInt(process.env.RATE_LIMIT_PREDICTION_UPDATE_MAX, 12),
  message: "Too many prediction update attempts, please try again later.",
});

module.exports = {
  loginLimiter,
  twoFactorLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  registerLimiter,
  createAdminLimiter,
  supportCreateLimiter,
  supportReplyLimiter,
  predictionCreateLimiter,
  predictionUpdateLimiter,
};
