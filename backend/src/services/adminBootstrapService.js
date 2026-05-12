const Admin = require("../models/Admin");
const { validatePasswordPolicy } = require("./passwordPolicyService");

const ADMIN_EMAIL_PLACEHOLDERS = new Set([
  "",
  "admin",
  "admin@admin.com",
  "change-me@example.com",
  "example@example.com",
]);

const ADMIN_NAME_PLACEHOLDERS = new Set([
  "",
  "admin",
  "administrator",
  "change me",
]);

const validateSeedAdminInput = ({ name, email, password }) => {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedName || ADMIN_NAME_PLACEHOLDERS.has(normalizedName.toLowerCase())) {
    throw new Error("Admin name must be explicit and cannot use a placeholder value.");
  }

  if (
    !normalizedEmail ||
    ADMIN_EMAIL_PLACEHOLDERS.has(normalizedEmail) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    throw new Error("Admin email must be valid and cannot use a placeholder value.");
  }

  const normalizedPassword = validatePasswordPolicy({
    password,
    email: normalizedEmail,
  });

  return {
    name: normalizedName,
    email: normalizedEmail,
    password: normalizedPassword,
  };
};

const shouldAllowEmptyAdminBootstrap = () =>
  String(process.env.NODE_ENV || "development").toLowerCase() === "development" &&
  String(process.env.ALLOW_DEV_EMPTY_ADMIN_BOOTSTRAP || "false").toLowerCase() === "true";

const ensureAdminBootstrapState = async () => {
  const adminCount = await Admin.countDocuments();

  if (adminCount > 0) {
    console.log(`Admin bootstrap check passed: ${adminCount} admin account(s) available.`);
    return {
      adminCount,
      bypassed: false,
    };
  }

  const message =
    "No admin provisioned; run `npm run seed:admin` to create the first secure admin account before starting the platform.";

  if (shouldAllowEmptyAdminBootstrap()) {
    console.warn(
      `[security] ${message} Development bypass is enabled with ALLOW_DEV_EMPTY_ADMIN_BOOTSTRAP=true.`
    );
    return {
      adminCount: 0,
      bypassed: true,
    };
  }

  const error = new Error(message);
  error.code = "ADMIN_BOOTSTRAP_REQUIRED";
  throw error;
};

module.exports = {
  ensureAdminBootstrapState,
  validateSeedAdminInput,
};
