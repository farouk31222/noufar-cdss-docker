const AuditLog = require("../models/AuditLog");

const SENSITIVE_METADATA_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "confirmPassword",
  "token",
  "refreshToken",
  "accessToken",
  "authorization",
  "adminKey",
  "code",
  "twoStepCode",
  "twoStepCodeToken",
  "passwordResetToken",
  "challengeToken",
]);

const toPlainString = (value) => String(value ?? "").trim();

const sanitizeMetadata = (value, depth = 0) => {
  if (depth > 4) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((entry) => sanitizeMetadata(entry, depth + 1));
  }

  if (!value || typeof value !== "object") {
    if (typeof value === "string") {
      return value.length > 500 ? `${value.slice(0, 500)}…` : value;
    }
    return value;
  }

  return Object.entries(value).reduce((accumulator, [key, entryValue]) => {
    if (SENSITIVE_METADATA_KEYS.has(String(key || "").trim())) {
      return accumulator;
    }

    accumulator[key] = sanitizeMetadata(entryValue, depth + 1);
    return accumulator;
  }, {});
};

const buildRequestContext = (req) => ({
  ipAddress: toPlainString(req?.ip || req?.headers?.["x-forwarded-for"] || ""),
  userAgent: toPlainString(req?.get?.("user-agent") || req?.headers?.["user-agent"] || ""),
  sessionId: toPlainString(req?.auth?.sessionId || ""),
});

const buildActorContext = ({ req, actor = null, actorRole = "" } = {}) => {
  const source = actor || req?.user || null;

  return {
    actorId: source?._id || null,
    actorRole: toPlainString(actorRole || source?.role || ""),
    actorName: toPlainString(source?.name || ""),
    actorEmail: toPlainString(source?.email || "").toLowerCase(),
  };
};

const logAuditEvent = async ({
  req,
  actor,
  actorRole,
  action,
  targetType = "",
  targetId = "",
  outcome = "success",
  metadata = {},
} = {}) => {
  if (!action) {
    throw new Error("Audit action is required.");
  }

  const actorContext = buildActorContext({ req, actor, actorRole });
  const requestContext = buildRequestContext(req);

  return AuditLog.create({
    ...actorContext,
    ...requestContext,
    action: toPlainString(action),
    targetType: toPlainString(targetType),
    targetId: toPlainString(targetId),
    outcome,
    metadata: sanitizeMetadata(metadata),
  });
};

const logAuditEventSafe = async (event) => {
  try {
    await logAuditEvent(event);
  } catch (error) {
    console.error("[audit] Failed to persist audit event:", error.message);
  }
};

const serializeAuditLog = (entry) => ({
  id: entry?._id ? String(entry._id) : "",
  actorId: entry?.actorId ? String(entry.actorId) : null,
  actorRole: toPlainString(entry?.actorRole || ""),
  actorName: toPlainString(entry?.actorName || ""),
  actorEmail: toPlainString(entry?.actorEmail || ""),
  action: toPlainString(entry?.action || ""),
  targetType: toPlainString(entry?.targetType || ""),
  targetId: toPlainString(entry?.targetId || ""),
  outcome: toPlainString(entry?.outcome || ""),
  ipAddress: toPlainString(entry?.ipAddress || ""),
  userAgent: toPlainString(entry?.userAgent || ""),
  sessionId: toPlainString(entry?.sessionId || ""),
  metadata: sanitizeMetadata(entry?.metadata || {}),
  createdAt: entry?.createdAt || null,
  updatedAt: entry?.updatedAt || null,
});

module.exports = {
  logAuditEvent,
  logAuditEventSafe,
  serializeAuditLog,
};
