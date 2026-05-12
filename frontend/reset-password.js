const API_BASE_URL = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
const form = document.querySelector("#reset-password-page-form");
const note = document.querySelector("#reset-password-page-note");
const newPasswordInput = document.querySelector("#reset-password-new");
const confirmPasswordInput = document.querySelector("#reset-password-confirm");
const strengthText = document.querySelector("#reset-password-strength-text");
const strengthFill = document.querySelector("#reset-password-strength-fill");
const ruleLength = document.querySelector("#reset-password-rule-length");
const ruleNumber = document.querySelector("#reset-password-rule-number");
const ruleMatch = document.querySelector("#reset-password-rule-match");

const setFormMessage = (message, tone = "default") => {
  if (!note) return;
  note.textContent = message;
  note.dataset.tone = tone;
};

const setStrengthVisualState = (level, text) => {
  if (strengthText) {
    strengthText.className = `password-strength-badge ${level ? `is-${level}` : "is-empty"}`;
    strengthText.textContent = text;
  }

  if (strengthFill) {
    strengthFill.className = `password-strength-fill ${level ? `is-${level}` : "is-empty"}`;
  }
};

const setRuleState = (element, isValid) => {
  if (!element) return;
  element.classList.toggle("is-valid", Boolean(isValid));
};

const getPasswordState = () => {
  const newPassword = newPasswordInput?.value || "";
  const confirmPassword = confirmPasswordInput?.value || "";
  const hasLower = /[a-z]/.test(newPassword);
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasMinLength = newPassword.length >= 12;
  const hasNumber = /\d/.test(newPassword);
  const hasSymbol = /[^A-Za-z0-9]/.test(newPassword);
  const hasRequiredFormat = hasLower && hasUpper && hasNumber && hasSymbol;
  const matches = newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword;

  let strength = "";
  let label = "Add a password";

  if (!newPassword) {
    strength = "";
    label = "Add a password";
  } else if (!hasMinLength || !hasRequiredFormat) {
    strength = "weak";
    label = "Weak password";
  } else if (newPassword.length >= 16) {
    strength = "strong";
    label = "Strong password";
  } else {
    strength = "medium";
    label = "Medium password";
  }

  return { newPassword, confirmPassword, hasMinLength, hasRequiredFormat, matches, strength, label };
};

const syncPasswordState = () => {
  const state = getPasswordState();
  setStrengthVisualState(state.strength, state.label);
  setRuleState(ruleLength, state.hasMinLength);
  setRuleState(ruleNumber, state.hasRequiredFormat);
  setRuleState(ruleMatch, state.matches);
};

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Request failed");
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
};

const getResetToken = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || "";
};

[newPasswordInput, confirmPasswordInput].forEach((field) => {
  field?.addEventListener("input", syncPasswordState);
});

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const token = getResetToken();
    const state = getPasswordState();

    if (!token) {
      setFormMessage("This reset link is invalid or missing.", "error");
      return;
    }

    if (!state.hasMinLength) {
      setFormMessage("The new password must contain at least 12 characters", "error");
      return;
    }

    if (!state.hasRequiredFormat) {
      setFormMessage(
        "The new password must include uppercase, lowercase, numeric, and special characters",
        "error"
      );
      return;
    }

    if (!state.matches) {
      setFormMessage("The new password and confirmation do not match", "error");
      return;
    }

    try {
      setFormMessage("Updating your password...", "pending");
      const response = await requestJson("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          newPassword: state.newPassword,
          confirmPassword: state.confirmPassword,
        }),
      });

      setFormMessage(
        response.message || "Password reset successfully. Redirecting to login...",
        "success"
      );

      window.setTimeout(() => {
        window.location.href = "index.html?modal=login";
      }, 1200);
    } catch (error) {
      setFormMessage(error.message || "Unable to reset your password right now.", "error");
    }
  });
}

syncPasswordState();
