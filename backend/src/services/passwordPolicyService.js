const PASSWORD_MIN_LENGTH = 12;

const COMMON_WEAK_PASSWORDS = new Set(
  [
    "password",
    "password123",
    "admin123",
    "12345678",
    "qwerty123",
  ].map((value) => value.toLowerCase())
);

const validatePasswordPolicy = ({ password, email = "" }) => {
  const normalizedPassword = String(password || "");
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const emailUsername = normalizedEmail.includes("@") ? normalizedEmail.split("@")[0] : "";
  const normalizedPasswordLower = normalizedPassword.toLowerCase();

  if (normalizedPassword.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  if (!/[a-z]/.test(normalizedPassword)) {
    throw new Error("Password must include at least one lowercase letter.");
  }

  if (!/[A-Z]/.test(normalizedPassword)) {
    throw new Error("Password must include at least one uppercase letter.");
  }

  if (!/\d/.test(normalizedPassword)) {
    throw new Error("Password must include at least one number.");
  }

  if (!/[^A-Za-z0-9]/.test(normalizedPassword)) {
    throw new Error("Password must include at least one special character.");
  }

  if (COMMON_WEAK_PASSWORDS.has(normalizedPasswordLower)) {
    throw new Error("Password is too common. Please choose a stronger password.");
  }

  if (normalizedPasswordLower.includes("admin")) {
    throw new Error("Password cannot contain the word 'admin'.");
  }

  if (emailUsername && normalizedPasswordLower.includes(emailUsername)) {
    throw new Error("Password cannot contain the email username.");
  }

  return normalizedPassword;
};

module.exports = {
  PASSWORD_MIN_LENGTH,
  validatePasswordPolicy,
};
