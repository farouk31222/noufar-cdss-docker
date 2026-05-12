const DEFAULT_LOGIN_LOCK_THRESHOLD = 5;
const DEFAULT_TWO_STEP_LOCK_THRESHOLD = 5;
const DEFAULT_LOCK_BASE_MS = 15 * 60 * 1000;
const DEFAULT_LOCK_MAX_MS = 24 * 60 * 60 * 1000;

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const LOGIN_LOCK_THRESHOLD = toPositiveInteger(
  process.env.AUTH_LOGIN_LOCK_THRESHOLD,
  DEFAULT_LOGIN_LOCK_THRESHOLD
);
const TWO_STEP_LOCK_THRESHOLD = toPositiveInteger(
  process.env.AUTH_2FA_LOCK_THRESHOLD,
  DEFAULT_TWO_STEP_LOCK_THRESHOLD
);
const LOCK_BASE_MS = toPositiveInteger(process.env.AUTH_LOCK_BASE_MS, DEFAULT_LOCK_BASE_MS);
const LOCK_MAX_MS = toPositiveInteger(process.env.AUTH_LOCK_MAX_MS, DEFAULT_LOCK_MAX_MS);

const hasActiveLock = (account) =>
  Boolean(account?.lockUntil) && new Date(account.lockUntil).getTime() > Date.now();

const getLockDurationMs = (failedCount, threshold) => {
  const overflow = Math.max(Number(failedCount || 0) - Number(threshold || 0), 0);
  const multiplier = 2 ** overflow;
  return Math.min(LOCK_BASE_MS * multiplier, LOCK_MAX_MS);
};

const buildLockError = (account) => {
  const lockUntil = account?.lockUntil ? new Date(account.lockUntil) : null;
  const error = new Error("This account is temporarily locked due to repeated failed authentication attempts. Please try again later.");
  error.statusCode = 423;
  error.code = "ACCOUNT_TEMPORARILY_LOCKED";
  error.lockUntil = lockUntil ? lockUntil.toISOString() : null;
  return error;
};

const ensureAccountIsNotLocked = (account) => {
  if (hasActiveLock(account)) {
    throw buildLockError(account);
  }
};

const persistFailedAttempt = async (account, countField, lastFailedField, threshold) => {
  if (!account) {
    return {
      failedCount: 0,
      lockApplied: false,
      lockUntil: null,
      lockDurationMs: 0,
    };
  }

  account[countField] = Number(account[countField] || 0) + 1;
  account[lastFailedField] = new Date();

  let lockApplied = false;
  let lockDurationMs = 0;
  let lockUntil = null;

  if (account[countField] >= threshold) {
    lockApplied = true;
    lockDurationMs = getLockDurationMs(account[countField], threshold);
    lockUntil = new Date(Date.now() + lockDurationMs);
    account.lockUntil = lockUntil;
  }

  await account.save();

  return {
    failedCount: Number(account[countField] || 0),
    lockApplied,
    lockUntil: lockUntil ? lockUntil.toISOString() : account.lockUntil ? new Date(account.lockUntil).toISOString() : null,
    lockDurationMs,
  };
};

const registerFailedLoginAttempt = async (account) =>
  persistFailedAttempt(account, "failedLoginCount", "lastFailedAuthAt", LOGIN_LOCK_THRESHOLD);

const registerFailedTwoStepAttempt = async (account) =>
  persistFailedAttempt(account, "failedTwoStepCount", "lastFailedTwoStepAt", TWO_STEP_LOCK_THRESHOLD);

const resetLoginProtection = async (account) => {
  if (!account) return;
  account.failedLoginCount = 0;
  account.lastFailedAuthAt = null;
  account.lockUntil = null;
  await account.save();
};

const resetTwoStepProtection = async (account) => {
  if (!account) return;
  account.failedTwoStepCount = 0;
  account.lastFailedTwoStepAt = null;
  account.lockUntil = null;
  await account.save();
};

const resetAllAuthProtection = async (account) => {
  if (!account) return;
  account.failedLoginCount = 0;
  account.lastFailedAuthAt = null;
  account.failedTwoStepCount = 0;
  account.lastFailedTwoStepAt = null;
  account.lockUntil = null;
  await account.save();
};

module.exports = {
  ensureAccountIsNotLocked,
  registerFailedLoginAttempt,
  registerFailedTwoStepAttempt,
  resetLoginProtection,
  resetTwoStepProtection,
  resetAllAuthProtection,
  authProtectionConfig: {
    loginLockThreshold: LOGIN_LOCK_THRESHOLD,
    twoStepLockThreshold: TWO_STEP_LOCK_THRESHOLD,
    lockBaseMs: LOCK_BASE_MS,
    lockMaxMs: LOCK_MAX_MS,
  },
};
