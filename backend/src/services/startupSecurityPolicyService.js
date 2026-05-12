const PLACEHOLDER_PATTERNS = [
  /change[_-]?me/i,
  /replace[_-]?me/i,
  /placeholder/i,
  /example/i,
  /your[_-]/i,
  /put[_-]/i,
  /^admin$/i,
  /^password$/i,
  /^secret$/i,
  /^minioadmin$/i,
];

const SMTP_PLACEHOLDERS = [
  "your_email@gmail.com",
  "your_gmail_app_password",
];

const isProductionLikeMode = () =>
  String(process.env.NODE_ENV || "development").trim().toLowerCase() !== "development";

const normalizeValue = (value) => String(value || "").trim();

const isPlaceholderValue = (value, extraPlaceholders = []) => {
  const normalized = normalizeValue(value);
  if (!normalized) return true;

  const lowerValue = normalized.toLowerCase();
  if (extraPlaceholders.map((entry) => String(entry).trim().toLowerCase()).includes(lowerValue)) {
    return true;
  }

  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
};

const assert = (condition, message) => {
  if (!condition) {
    const error = new Error(message);
    error.code = "INSECURE_ENVIRONMENT_CONFIGURATION";
    throw error;
  }
};

const assertRequired = (name) => {
  const value = normalizeValue(process.env[name]);
  assert(Boolean(value), `[security] Missing required environment variable: ${name}.`);
  return value;
};

const assertStrongSecret = (name, options = {}) => {
  const {
    minLength = 24,
    extraPlaceholders = [],
  } = options;
  const value = assertRequired(name);

  assert(
    !isPlaceholderValue(value, extraPlaceholders),
    `[security] ${name} contains a placeholder or unsafe default value.`
  );
  assert(
    value.length >= minLength,
    `[security] ${name} must be at least ${minLength} characters long in production-like mode.`
  );

  return value;
};

const validateMongoUri = () => {
  const value = assertRequired("MONGODB_URI");
  assert(
    !isPlaceholderValue(value, ["mongodb://example", "mongodb://localhost/example"]),
    "[security] MONGODB_URI contains a placeholder value."
  );
};

const validateJwtSecrets = () => {
  const accessSecret = assertStrongSecret("JWT_SECRET", { minLength: 24 });
  const refreshSecret = assertStrongSecret("JWT_REFRESH_SECRET", { minLength: 24 });

  assert(
    accessSecret !== refreshSecret,
    "[security] JWT_SECRET and JWT_REFRESH_SECRET must be different in production-like mode."
  );
};

const validateAdminRegistrationKey = () => {
  assertStrongSecret("ADMIN_REGISTRATION_KEY", { minLength: 24 });
};

const validateAdminBootstrapFlags = () => {
  const bypassEnabled =
    String(process.env.ALLOW_DEV_EMPTY_ADMIN_BOOTSTRAP || "false").trim().toLowerCase() === "true";

  assert(
    !bypassEnabled,
    "[security] ALLOW_DEV_EMPTY_ADMIN_BOOTSTRAP must not be enabled in production-like mode."
  );
};

const validateSmtpConfig = () => {
  const smtpHost = assertRequired("SMTP_HOST");
  const smtpPort = assertRequired("SMTP_PORT");
  const smtpUser = assertRequired("SMTP_USER");
  const smtpPass = assertRequired("SMTP_PASS");
  const smtpFrom = assertRequired("SMTP_FROM");

  assert(!isPlaceholderValue(smtpHost), "[security] SMTP_HOST contains a placeholder value.");
  assert(
    !isPlaceholderValue(smtpUser, SMTP_PLACEHOLDERS),
    "[security] SMTP_USER contains a placeholder or unsafe default value."
  );
  assert(
    !isPlaceholderValue(smtpPass, SMTP_PLACEHOLDERS),
    "[security] SMTP_PASS contains a placeholder or unsafe default value."
  );
  assert(
    !isPlaceholderValue(smtpFrom, SMTP_PLACEHOLDERS),
    "[security] SMTP_FROM contains a placeholder or unsafe default value."
  );
  assert(
    Number.isFinite(Number(smtpPort)) && Number(smtpPort) > 0,
    "[security] SMTP_PORT must be a valid positive number."
  );
};

const validateMinioConfigIfEnabled = () => {
  const minioVars = [
    "MINIO_ENDPOINT",
    "MINIO_PORT",
    "MINIO_USE_SSL",
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_BUCKET",
  ];
  const hasAnyMinioValue = minioVars.some((name) => normalizeValue(process.env[name]));

  if (!hasAnyMinioValue) {
    return;
  }

  const endpoint = assertRequired("MINIO_ENDPOINT");
  const accessKey = assertStrongSecret("MINIO_ACCESS_KEY", {
    minLength: 8,
    extraPlaceholders: ["minioadmin"],
  });
  const secretKey = assertStrongSecret("MINIO_SECRET_KEY", {
    minLength: 12,
    extraPlaceholders: ["minioadmin"],
  });
  const bucket = assertRequired("MINIO_BUCKET");
  const port = assertRequired("MINIO_PORT");

  assert(
    !isPlaceholderValue(endpoint),
    "[security] MINIO_ENDPOINT contains a placeholder value."
  );
  assert(
    !isPlaceholderValue(bucket),
    "[security] MINIO_BUCKET contains a placeholder value."
  );
  assert(
    Number.isFinite(Number(port)) && Number(port) > 0,
    "[security] MINIO_PORT must be a valid positive number."
  );
  assert(
    accessKey !== secretKey,
    "[security] MINIO_ACCESS_KEY and MINIO_SECRET_KEY must not be identical."
  );
};

const validateAppBaseUrl = () => {
  const appBaseUrl = assertRequired("APP_BASE_URL");
  assert(
    /^https?:\/\//i.test(appBaseUrl),
    "[security] APP_BASE_URL must be a valid absolute http(s) URL."
  );
};

const validatePatientDataEncryptionConfig = () => {
  const activeKeyId = assertRequired("PATIENT_DATA_ACTIVE_KEY_ID");
  const keyringRaw = assertRequired("PATIENT_DATA_KEYS");
  const blindIndexKey = assertStrongSecret("PATIENT_BLIND_INDEX_KEY", { minLength: 32 });

  let parsedKeyring = null;
  try {
    parsedKeyring = JSON.parse(keyringRaw);
  } catch (_error) {
    assert(false, "[security] PATIENT_DATA_KEYS must be a valid JSON object.");
  }

  assert(
    parsedKeyring && typeof parsedKeyring === "object" && !Array.isArray(parsedKeyring),
    "[security] PATIENT_DATA_KEYS must be a non-array JSON object."
  );
  const activeKey = String(parsedKeyring[activeKeyId] || "").trim();
  assert(activeKey, "[security] PATIENT_DATA_ACTIVE_KEY_ID does not match any entry in PATIENT_DATA_KEYS.");
  assert(
    !isPlaceholderValue(activeKey),
    "[security] Active patient encryption key value is unsafe or placeholder."
  );
  assert(
    !isPlaceholderValue(blindIndexKey),
    "[security] PATIENT_BLIND_INDEX_KEY contains a placeholder or unsafe default value."
  );
};

const enforceStartupSecurityPolicy = () => {
  if (!isProductionLikeMode()) {
    return {
      enforced: false,
      mode: String(process.env.NODE_ENV || "development").trim().toLowerCase(),
    };
  }

  validateMongoUri();
  validateJwtSecrets();
  validateAdminRegistrationKey();
  validateAdminBootstrapFlags();
  validateAppBaseUrl();
  validateSmtpConfig();
  validateMinioConfigIfEnabled();
  validatePatientDataEncryptionConfig();

  console.log("[security] Production startup environment policy passed.");
  return {
    enforced: true,
    mode: String(process.env.NODE_ENV || "production").trim().toLowerCase(),
  };
};

module.exports = {
  enforceStartupSecurityPolicy,
  isProductionLikeMode,
};
