const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const Admin = require("../models/Admin");
const User = require("../models/User");
const AuthSession = require("../models/AuthSession");

const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "30m";
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const DURATION_UNITS_MS = {
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hrs: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

const parseDurationToMs = (value, fallbackMs) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallbackMs;

  const numericValue = Number(raw);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue * 1000;
  }

  const compactMatch = raw.match(/^(\d+)\s*([a-z]+)$/i);
  if (!compactMatch) return fallbackMs;

  const amount = Number(compactMatch[1]);
  const unit = compactMatch[2].toLowerCase();
  const multiplier = DURATION_UNITS_MS[unit];

  if (!Number.isFinite(amount) || amount <= 0 || !multiplier) {
    return fallbackMs;
  }

  return amount * multiplier;
};

const ACCESS_TOKEN_EXPIRES_MS = parseDurationToMs(ACCESS_TOKEN_EXPIRES_IN, 30 * 60 * 1000);
const REFRESH_TOKEN_EXPIRES_MS = parseDurationToMs(REFRESH_TOKEN_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000);

const hashToken = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");

const getActorType = (user) => (user?.role === "admin" ? "admin" : "doctor");

const getAuthModel = (actorType) => (actorType === "admin" ? Admin : User);

const buildTokenPayload = ({ user, sessionId, tokenType }) => ({
  id: String(user._id),
  role: user.role,
  actorType: getActorType(user),
  sessionId,
  type: tokenType,
});

const signAccessToken = ({ user, sessionId }) =>
  jwt.sign(buildTokenPayload({ user, sessionId, tokenType: "access" }), ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });

const signRefreshToken = ({ user, sessionId }) =>
  jwt.sign(buildTokenPayload({ user, sessionId, tokenType: "refresh" }), REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });

const buildTokenBundle = ({ user, sessionId }) => {
  const accessToken = signAccessToken({ user, sessionId });
  const refreshToken = signRefreshToken({ user, sessionId });

  return {
    token: accessToken,
    accessToken,
    refreshToken,
    sessionId,
    accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN,
    accessTokenExpiresAt: new Date(Date.now() + ACCESS_TOKEN_EXPIRES_MS).toISOString(),
    refreshTokenExpiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_MS).toISOString(),
  };
};

const getRequestMetadata = (req) => ({
  ipAddress: String(req?.ip || req?.headers?.["x-forwarded-for"] || "").trim(),
  userAgent: String(req?.headers?.["user-agent"] || "").trim().slice(0, 512),
});

const buildAuthResponse = (user, tokenBundle) => ({
  ...user,
  ...tokenBundle,
});

const createAuthSession = async ({ user, req }) => {
  const sessionId = crypto.randomBytes(24).toString("hex");
  const tokenBundle = buildTokenBundle({ user, sessionId });
  const metadata = getRequestMetadata(req);

  const session = await AuthSession.create({
    userId: user._id,
    role: user.role,
    actorType: getActorType(user),
    sessionId,
    refreshTokenHash: hashToken(tokenBundle.refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_MS),
    revokedAt: null,
    ...metadata,
  });

  return {
    session,
    tokenBundle,
  };
};

const verifyAccessToken = (token) => {
  const decoded = jwt.verify(String(token || ""), ACCESS_TOKEN_SECRET);
  if (decoded.type !== "access" || !decoded.sessionId) {
    const error = new Error("Invalid access token");
    error.statusCode = 401;
    throw error;
  }
  return decoded;
};

const verifyRefreshToken = (token) => {
  const decoded = jwt.verify(String(token || ""), REFRESH_TOKEN_SECRET);
  if (decoded.type !== "refresh" || !decoded.sessionId) {
    const error = new Error("Invalid refresh token");
    error.statusCode = 401;
    throw error;
  }
  return decoded;
};

const getSessionRecordById = async (sessionId) => AuthSession.findOne({ sessionId });

const assertSessionIsActive = (session) => {
  if (!session) {
    const error = new Error("Session not found");
    error.statusCode = 401;
    throw error;
  }

  if (session.revokedAt) {
    const error = new Error("Session has been revoked");
    error.statusCode = 401;
    throw error;
  }

  if (!session.expiresAt || session.expiresAt.getTime() <= Date.now()) {
    const error = new Error("Session has expired");
    error.statusCode = 401;
    throw error;
  }
};

const getUserForDecodedToken = async (decoded) => {
  const Model = getAuthModel(decoded.actorType || decoded.role);
  const user = await Model.findById(decoded.id).select("-password");

  if (!user) {
    const error = new Error("Not authorized, user not found");
    error.statusCode = 401;
    throw error;
  }

  if (!user.role) {
    user.role = decoded.role;
  }

  return user;
};

const authenticateAccessToken = async (token) => {
  if (!token) {
    const error = new Error("Not authorized, no token");
    error.statusCode = 401;
    throw error;
  }

  const decoded = verifyAccessToken(token);
  const session = await getSessionRecordById(decoded.sessionId);
  assertSessionIsActive(session);
  const user = await getUserForDecodedToken(decoded);

  return {
    decoded,
    session,
    user,
  };
};

const rotateAuthSession = async ({ session, user, req }) => {
  assertSessionIsActive(session);

  const tokenBundle = buildTokenBundle({ user, sessionId: session.sessionId });
  const metadata = getRequestMetadata(req);

  session.refreshTokenHash = hashToken(tokenBundle.refreshToken);
  session.expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_MS);
  session.revokedAt = null;
  session.ipAddress = metadata.ipAddress || session.ipAddress;
  session.userAgent = metadata.userAgent || session.userAgent;
  await session.save();

  return {
    session,
    tokenBundle,
  };
};

const refreshAuthSession = async ({ refreshToken, req }) => {
  if (!refreshToken) {
    const error = new Error("Refresh token is required");
    error.statusCode = 401;
    throw error;
  }

  const decoded = verifyRefreshToken(refreshToken);
  const session = await getSessionRecordById(decoded.sessionId);
  assertSessionIsActive(session);

  if (session.userId.toString() !== String(decoded.id) || session.role !== decoded.role) {
    const error = new Error("Refresh session mismatch");
    error.statusCode = 401;
    throw error;
  }

  if (session.refreshTokenHash !== hashToken(refreshToken)) {
    const error = new Error("Refresh token is invalid");
    error.statusCode = 401;
    throw error;
  }

  const user = await getUserForDecodedToken(decoded);
  const rotation = await rotateAuthSession({ session, user, req });

  return {
    session: rotation.session,
    user,
    tokenBundle: rotation.tokenBundle,
  };
};

const revokeSessionRecord = async (session) => {
  if (!session || session.revokedAt) return;
  session.revokedAt = new Date();
  await session.save();
};

const revokeAuthSessionById = async (sessionId) => {
  if (!sessionId) return null;
  const session = await getSessionRecordById(sessionId);
  await revokeSessionRecord(session);
  return session;
};

const revokeAuthSessionByRefreshToken = async (refreshToken) => {
  if (!refreshToken) return null;
  const decoded = verifyRefreshToken(refreshToken);
  return revokeAuthSessionById(decoded.sessionId);
};

module.exports = {
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  ACCESS_TOKEN_EXPIRES_MS,
  REFRESH_TOKEN_EXPIRES_MS,
  buildAuthResponse,
  createAuthSession,
  refreshAuthSession,
  authenticateAccessToken,
  revokeAuthSessionById,
  revokeAuthSessionByRefreshToken,
  rotateAuthSession,
  getSessionRecordById,
  assertSessionIsActive,
  getAuthModel,
  getActorType,
};
