const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const API_BASE_URL = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
const DOCTOR_AUTH_STORAGE_KEY = "noufar-doctor-auth-v1";
const siteNavLinks = Array.from(document.querySelectorAll('.site-nav a[href^="#"]'));
const contactForm = document.querySelector("#contact-form");
const formNote = document.querySelector("#form-note");
const modalLayer = document.querySelector("#modal-layer");
const modalTriggers = document.querySelectorAll("[data-modal-open]");
const modalCloses = document.querySelectorAll("[data-modal-close]");
const modals = {
  demo: document.querySelector("#demo-modal"),
  login: document.querySelector("#login-modal"),
  reset: document.querySelector("#reset-modal"),
  twoStep: document.querySelector("#twoStep-modal"),
  register: document.querySelector("#register-modal"),
  documentPreview: document.querySelector("#document-preview-modal"),
  registerSuccess: document.querySelector("#register-success-modal"),
  pendingApproval: document.querySelector("#pending-approval-modal"),
  deactivatedAccount: document.querySelector("#deactivated-account-modal"),
  deletedAccount: document.querySelector("#deleted-account-modal"),
};
const demoVideo = document.querySelector("#demo-video");
const loginForm = document.querySelector("#login-form");
const resetForm = document.querySelector("#reset-form");
const registerForm = document.querySelector("#register-form");
const twoStepForm = document.querySelector("#twoStep-form");
const loginNote = document.querySelector("#login-note");
const resetNote = document.querySelector("#reset-note");
const twoStepNote = document.querySelector("#twoStep-note");
const registerNote = document.querySelector("#register-note");
const twoStepMessage = document.querySelector("#twoStep-message");
const registerSuccessMessage = document.querySelector("#register-success-modal .success-modal-copy p:last-child");
const registerSuccessStatusMessage = document.querySelector("#register-success-modal .success-modal-status-copy p");
const pendingApprovalMessage = document.querySelector("#pending-approval-message");
const deactivatedAccountMessage = document.querySelector("#deactivated-account-message");
const deactivatedAccountReason = document.querySelector("#deactivated-account-reason");
const deactivatedAccountUnderstood = document.querySelector("#deactivated-account-understood");
const deletedAccountReason = document.querySelector("#deleted-account-reason");
const deletedAccountUnderstood = document.querySelector("#deleted-account-understood");
const uploadFields = {
  medicalLicense: registerForm?.elements?.medicalLicense ?? null,
  nationalId: registerForm?.elements?.nationalId ?? null,
};
const uploadMeta = {
  medicalLicense: document.querySelector('[data-file-meta="medicalLicense"]'),
  nationalId: document.querySelector('[data-file-meta="nationalId"]'),
};
const uploadNames = {
  medicalLicense: document.querySelector('[data-file-name="medicalLicense"]'),
  nationalId: document.querySelector('[data-file-name="nationalId"]'),
};
const uploadPreviewButtons = {
  medicalLicense: document.querySelector('[data-file-preview="medicalLicense"]'),
  nationalId: document.querySelector('[data-file-preview="nationalId"]'),
};
const documentPreviewTitle = document.querySelector("#document-preview-title");
const documentPreviewMeta = document.querySelector("#document-preview-meta");
const documentPreviewImage = document.querySelector("#document-preview-image");
const documentPreviewPdf = document.querySelector("#document-preview-pdf");
const passwordStrengthText = document.querySelector("#password-strength-text");
const passwordStrengthFill = document.querySelector("#password-strength-fill");
const passwordRuleLength = document.querySelector("#password-rule-length");
const passwordRuleFormat = document.querySelector("#password-rule-format");
const passwordRuleMatch = document.querySelector("#password-rule-match");
let lastTrigger = null;
let currentDocumentPreviewUrl = "";
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const allowedUploadTypes = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const allowedUploadExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
const authForms = [loginForm, resetForm, registerForm].filter(Boolean);
let pendingTwoStepLogin = null;

if (registerSuccessMessage) {
  registerSuccessMessage.textContent =
    "Your account is now pending admin approval. We'll notify you by email as soon as it's reviewed.";
}

if (registerSuccessStatusMessage) {
  registerSuccessStatusMessage.textContent = "You'll receive an email once your account has been approved.";
}

if (pendingApprovalMessage) {
  pendingApprovalMessage.textContent =
    "You’ll receive an email once it has been approved. If it takes more than 24 hours, please contact support at: noufar.cdss@gmail.com.";
}

if (deactivatedAccountMessage) {
  deactivatedAccountMessage.textContent =
    "If you have any questions, please contact support at noufar.cdss@gmail.com.";
}

if (deactivatedAccountUnderstood) {
  deactivatedAccountUnderstood.addEventListener("click", () => {
    clearDoctorSession();
    closeModals();
    window.location.href = "index.html";
  });
}

if (deletedAccountUnderstood) {
  deletedAccountUnderstood.addEventListener("click", () => {
    clearDoctorSession();
    closeModals();
    window.location.href = "index.html";
  });
}

const loadDoctorSession = () => {
  try {
    const raw = window.localStorage.getItem(DOCTOR_AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const persistDoctorSession = (payload) => {
  const existingSession = loadDoctorSession();
  const session = {
    authenticated: true,
    token: payload.accessToken || payload.token || existingSession?.token || "",
    accessToken: payload.accessToken || payload.token || existingSession?.accessToken || existingSession?.token || "",
    refreshToken: payload.refreshToken || existingSession?.refreshToken || "",
    sessionId: payload.sessionId || existingSession?.sessionId || "",
    accessTokenExpiresAt: payload.accessTokenExpiresAt || existingSession?.accessTokenExpiresAt || "",
    refreshTokenExpiresAt: payload.refreshTokenExpiresAt || existingSession?.refreshTokenExpiresAt || "",
    user: {
      _id: payload._id,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      doctorAccountType: payload.doctorAccountType === "standard" ? "standard" : "prediction",
      specialty: payload.specialty,
      hospital: payload.hospital,
      approvalStatus: payload.approvalStatus,
      accountStatus: payload.accountStatus,
      profilePhoto: payload.profilePhoto,
      sessionTimeout: payload.sessionTimeout,
      twoStepEnabled: payload.twoStepEnabled,
    },
    loggedAt: existingSession?.loggedAt || new Date().toISOString(),
  };

  window.localStorage.setItem(DOCTOR_AUTH_STORAGE_KEY, JSON.stringify(session));
  return session;
};

const clearDoctorSession = () => {
  window.localStorage.removeItem(DOCTOR_AUTH_STORAGE_KEY);
};

const isDoctorAccount = (user) => user?.role === "doctor";

const clearPendingTwoStepLogin = () => {
  pendingTwoStepLogin = null;
  if (twoStepForm) {
    twoStepForm.reset();
    twoStepForm.dataset.submitAttempted = "false";
  }
  setFormMessage(twoStepNote, "", "default");
};

const setFormMessage = (element, message, tone = "default") => {
  if (!element) return;

  element.textContent = message;
  element.dataset.tone = tone;
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

const requestDoctorSessionRefresh = async () => {
  const session = loadDoctorSession();
  const refreshToken = session?.refreshToken;

  if (!refreshToken) {
    clearDoctorSession();
    throw new Error("Doctor refresh token is missing.");
  }

  const payload = await requestJson("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });

  return persistDoctorSession(payload);
};

const redirectAfterAuth = (user) => {
  const destination =
    (user?.doctorAccountType || "prediction") === "standard" ? "patients.html" : "dashboard.html";
  window.location.href = destination;
};

const validateExistingDoctorSession = async () => {
  const existingDoctorSession = loadDoctorSession();
  const isIndexPage = window.location.pathname.toLowerCase().endsWith("/index.html");

  if (!isIndexPage || !existingDoctorSession?.authenticated || !existingDoctorSession?.token) {
    return;
  }

  try {
    let profile;

    try {
      profile = await requestJson("/auth/profile", {
        headers: {
          Authorization: `Bearer ${existingDoctorSession.token}`,
        },
      });
    } catch (error) {
      if (error.status !== 401 || !existingDoctorSession.refreshToken) {
        throw error;
      }

      const refreshedSession = await requestDoctorSessionRefresh();
      profile = await requestJson("/auth/profile", {
        headers: {
          Authorization: `Bearer ${refreshedSession.token}`,
        },
      });
    }

    if (!profile?._id || !profile?.role) {
      clearDoctorSession();
      return;
    }

    if (!isDoctorAccount(profile)) {
      clearDoctorSession();
      return;
    }

    redirectAfterAuth(profile);
  } catch (error) {
    clearDoctorSession();
  }
};

const formatUploadName = (name) => {
  if (!name) return "No file selected";

  const extensionIndex = name.lastIndexOf(".");
  const extension = extensionIndex > -1 ? name.slice(extensionIndex) : "";
  const baseName = extensionIndex > -1 ? name.slice(0, extensionIndex) : name;

  if (name.length <= 26) return name;

  return `${baseName.slice(0, 14)}...${extension}`;
};

const revokeDocumentPreviewUrl = () => {
  if (!currentDocumentPreviewUrl) return;
  URL.revokeObjectURL(currentDocumentPreviewUrl);
  currentDocumentPreviewUrl = "";
};

const resetDocumentPreview = () => {
  revokeDocumentPreviewUrl();

  if (documentPreviewImage) {
    documentPreviewImage.hidden = true;
    documentPreviewImage.removeAttribute("src");
  }

  if (documentPreviewPdf) {
    documentPreviewPdf.hidden = true;
    documentPreviewPdf.removeAttribute("src");
  }
};

const syncUploadPreviewButton = (fieldName, enabled) => {
  const button = uploadPreviewButtons[fieldName];
  if (!button) return;
  button.hidden = !enabled;
};

const openUploadPreview = (fieldName) => {
  const field = uploadFields[fieldName];
  const file = field?.files?.[0];

  if (!field || !file) return;

  const label = fieldName === "medicalLicense" ? "Medical license" : "National ID";
  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
  const isImage =
    file.type.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".webp"].some((extension) => lowerName.endsWith(extension));

  resetDocumentPreview();

  if (documentPreviewTitle) {
    documentPreviewTitle.textContent = label;
  }

  if (documentPreviewMeta) {
    documentPreviewMeta.textContent = file.name;
  }

  currentDocumentPreviewUrl = URL.createObjectURL(file);

  if (isPdf && documentPreviewPdf) {
    documentPreviewPdf.src = currentDocumentPreviewUrl;
    documentPreviewPdf.hidden = false;
  } else if (isImage && documentPreviewImage) {
    documentPreviewImage.src = currentDocumentPreviewUrl;
    documentPreviewImage.hidden = false;
  } else {
    resetDocumentPreview();
    return;
  }

  openModal("documentPreview");
};

const setStrengthVisualState = (level, text) => {
  if (passwordStrengthText) {
    passwordStrengthText.className = `password-strength-badge ${level ? `is-${level}` : "is-empty"}`;
    passwordStrengthText.textContent = text;
  }

  if (passwordStrengthFill) {
    passwordStrengthFill.className = `password-strength-fill ${level ? `is-${level}` : "is-empty"}`;
  }
};

const setRuleState = (element, isValid) => {
  if (!element) return;
  element.classList.toggle("is-valid", Boolean(isValid));
};

const getFieldContainer = (field) => {
  if (!field) return null;
  if (field.type === "file") return field.closest(".auth-file-field");
  if (field.type === "checkbox") return field.closest(".checkbox-row");
  return field.closest("label") ?? field;
};

const getFieldLabelText = (field) => {
  if (!field) return "Ce champ";
  if (field.type === "file") {
    return field.name === "medicalLicense" ? "Le document de licence médicale" : "Le document d'identité nationale";
  }
  const container = field.closest("label");
  const labelText = container?.childNodes?.[0]?.textContent?.trim();
  return labelText || "Ce champ";
};

const ensureFieldErrorElement = (field) => {
  const container = getFieldContainer(field);
  if (!container) return null;

  let errorElement = container.querySelector(".field-error-message");
  if (!errorElement) {
    errorElement = document.createElement("p");
    errorElement.className = "field-error-message";
    errorElement.setAttribute("aria-live", "polite");
    container.appendChild(errorElement);
  }

  return errorElement;
};

const getFieldErrorMessage = (field) => {
  if (!(field instanceof HTMLElement) || typeof field.checkValidity !== "function") return "";

  if (field.validity.valueMissing) {
    if (field.type === "checkbox") return "Veuillez confirmer cette information.";
    if (field.type === "file") return `${getFieldLabelText(field)} est obligatoire.`;
    return "Ce champ est obligatoire.";
  }

  if (field.validity.typeMismatch && field.type === "email") {
    return "Veuillez entrer une adresse e-mail valide.";
  }

  if (field.validity.tooShort && field.name === "password") {
    return "Le mot de passe doit contenir au moins 6 caractères.";
  }

  if (field.validity.customError) {
    return field.validationMessage;
  }

  return "";
};

const shouldShowFieldError = (field, force = false) => {
  if (!field) return false;
  if (force) return true;
  if (field.dataset.touched === "true") return true;
  if (field.type === "checkbox") return field.checked;
  if (field.type === "file") return Boolean(field.files?.length);
  return typeof field.value === "string" && field.value.trim().length > 0;
};

const getFriendlyFieldLabelText = (field) => {
  if (!field) return "This field";
  if (field.type === "file") {
    return field.name === "medicalLicense" ? "Medical license" : "National ID";
  }

  const container = field.closest("label");
  const labelText = container?.childNodes?.[0]?.textContent?.trim();
  return labelText || "This field";
};

const buildFieldErrorMessage = (field) => {
  if (!(field instanceof HTMLElement) || typeof field.checkValidity !== "function") return "";

  if (field.validity.valueMissing) {
    if (field.type === "checkbox") return "You must confirm this field.";
    if (field.type === "file") return `${getFriendlyFieldLabelText(field)} is required.`;
    return "This field is required.";
  }

  if (field.validity.typeMismatch && field.type === "email") {
    return "Please enter a valid email address.";
  }

  if (field.validity.tooShort && field.name === "password") {
    return "Password must contain at least 6 characters.";
  }

  if (field.validity.customError) {
    return field.validationMessage;
  }

  return "";
};

const shouldDisplayFieldError = (field, force = false) => {
  if (!field) return false;
  if (force) return true;
  return field.form?.dataset.submitAttempted === "true";
};

const syncFieldValidationState = (field, force = false) => {
  if (!(field instanceof HTMLElement) || typeof field.checkValidity !== "function") return;

  if (field.type === "file") {
    validateUploadField(field, field.name === "medicalLicense" ? "Medical license" : "National ID");
  }

  const showError = shouldDisplayFieldError(field, force);
  const isInvalid = showError && !field.checkValidity();
  const target = getFieldContainer(field);
  const errorElement = ensureFieldErrorElement(field);

  if (field.type === "checkbox" || field.type === "file") {
    target?.classList.toggle("is-invalid", isInvalid);
  } else {
    field.classList.toggle("is-invalid", isInvalid);
  }

  if (errorElement) {
    errorElement.textContent = isInvalid ? buildFieldErrorMessage(field) : "";
    errorElement.hidden = !isInvalid;
  }
};

const getPasswordState = () => {
  const password = registerForm?.elements?.password?.value ?? "";
  const confirmPassword = registerForm?.elements?.confirmPassword?.value ?? "";
  const hasMinLength = password.length >= 12;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const hasRequiredFormat = hasLower && hasUpper && hasNumbers && hasSymbol;
  const matches = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

  let strength = "";
  let label = "Add a password";

  if (password.length === 0) {
    strength = "";
    label = "Add a password";
  } else if (!hasMinLength || !hasRequiredFormat) {
    strength = "weak";
    label = "Weak password";
  } else if (password.length >= 16) {
    strength = "strong";
    label = "Strong password";
  } else {
    strength = "medium";
    label = "Medium password";
  }

  return {
    password,
    confirmPassword,
    hasMinLength,
    hasRequiredFormat,
    matches,
    isValid: hasMinLength && hasRequiredFormat,
    strength,
    label,
  };
};

const syncRegisterFormState = () => {
  if (!registerForm) return;

  const passwordField = registerForm.elements.password;
  const confirmPasswordField = registerForm.elements.confirmPassword;
  const passwordState = getPasswordState();

  if (passwordField) {
    if (passwordState.password.length === 0) {
      passwordField.setCustomValidity("");
    } else if (!passwordState.hasMinLength) {
      passwordField.setCustomValidity("Password must contain at least 12 characters.");
    } else if (!passwordState.hasRequiredFormat) {
      passwordField.setCustomValidity(
        "Password must include uppercase, lowercase, numeric, and special characters."
      );
    } else {
      passwordField.setCustomValidity("");
    }
  }

  if (confirmPasswordField) {
    if (passwordState.confirmPassword.length === 0) {
      confirmPasswordField.setCustomValidity("");
    } else if (!passwordState.matches) {
      confirmPasswordField.setCustomValidity("Passwords do not match.");
    } else {
      confirmPasswordField.setCustomValidity("");
    }
  }

  setStrengthVisualState(passwordState.strength, passwordState.label);
  setRuleState(passwordRuleLength, passwordState.hasMinLength);
  setRuleState(passwordRuleFormat, passwordState.hasRequiredFormat);
  setRuleState(passwordRuleMatch, passwordState.matches);

  const uploadsPresent = Object.values(uploadFields).every((field) => {
    if (!field) return true;
    return validateUploadField(field, field.name === "medicalLicense" ? "Medical license" : "National ID");
  });

  const allRequiredFilled = Array.from(registerForm.elements).every((element) => {
    if (!(element instanceof HTMLElement) || element.disabled || !("required" in element) || !element.required) {
      return true;
    }

    if (element.type === "checkbox") {
      return element.checked;
    }

    if (element.type === "file") {
      return Boolean(element.files?.length);
    }

    return element.value.trim().length > 0;
  });

  [
    registerForm.elements.name,
    registerForm.elements.specialty,
    registerForm.elements.institution,
    registerForm.elements.email,
    passwordField,
    confirmPasswordField,
    uploadFields.medicalLicense,
    uploadFields.nationalId,
    registerForm.elements.terms,
  ].forEach((field) => syncFieldValidationState(field));
};

const updateHeaderState = () => {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 14);
};

const getHeaderOffset = () => {
  if (!header) return 24;
  return Math.ceil(header.getBoundingClientRect().height + 14);
};

const scrollToSection = (target, updateHash = true) => {
  if (!(target instanceof HTMLElement)) return;

  const targetTop = window.scrollY + target.getBoundingClientRect().top - getHeaderOffset();
  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: "smooth",
  });

  if (updateHash && target.id) {
    window.history.replaceState(null, "", `#${target.id}`);
  }
};

const setActiveNavLink = (activeLink) => {
  siteNavLinks.forEach((link) => {
    const isActive = link === activeLink;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "true");
    } else {
      link.removeAttribute("aria-current");
    }
  });
};

const syncActiveNavFromHash = () => {
  if (!siteNavLinks.length) return;
  const activeLink = siteNavLinks.find((link) => link.getAttribute("href") === window.location.hash) ?? null;
  if (activeLink) {
    setActiveNavLink(activeLink);
  }
};

const syncActiveNavFromScroll = () => {
  if (!siteNavLinks.length) return;

  const sections = siteNavLinks
    .map((link) => ({
      link,
      section: document.querySelector(link.getAttribute("href")),
    }))
    .filter((entry) => entry.section instanceof HTMLElement);

  if (!sections.length) return;

  const scrollMarker = window.scrollY + getHeaderOffset() + 24;
  let activeEntry = null;

  sections.forEach((entry) => {
    const top = entry.section.offsetTop;
    if (scrollMarker >= top) {
      activeEntry = entry;
    }
  });

  if (activeEntry?.link) {
    setActiveNavLink(activeEntry.link);
    return;
  }

  setActiveNavLink(null);
};

updateHeaderState();
window.addEventListener("scroll", updateHeaderState, { passive: true });
window.addEventListener("scroll", syncActiveNavFromScroll, { passive: true });
window.addEventListener("hashchange", () => {
  syncActiveNavFromHash();
  const target = window.location.hash ? document.querySelector(window.location.hash) : null;
  if (target instanceof HTMLElement) {
    window.setTimeout(() => scrollToSection(target, false), 0);
  }
});

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      siteNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

const brandLink = document.querySelector('.brand[href^="#"]');
if (brandLink) {
  brandLink.addEventListener("click", (event) => {
    event.preventDefault();
    const target = document.querySelector(brandLink.getAttribute("href"));
    if (target instanceof HTMLElement) {
      scrollToSection(target);
      setActiveNavLink(null);
    }
  });
}

siteNavLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setActiveNavLink(link);
    const target = document.querySelector(link.getAttribute("href"));
    if (target instanceof HTMLElement) {
      scrollToSection(target);
    }
  });
});

if (siteNavLinks.length) {
  syncActiveNavFromHash();
  syncActiveNavFromScroll();
}

window.addEventListener("load", () => {
  if (!window.location.hash) return;
  const target = document.querySelector(window.location.hash);
  if (target instanceof HTMLElement) {
    window.setTimeout(() => scrollToSection(target, false), 0);
  }
});

const closeModals = () => {
  if (!modalLayer) return;

  modalLayer.classList.remove("is-open");
  modalLayer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";

  Object.values(modals).forEach((modal) => {
    if (modal) {
      modal.hidden = true;
    }
  });

  if (demoVideo) {
    demoVideo.pause();
    demoVideo.currentTime = 0;
  }

  resetDocumentPreview();

  clearPendingTwoStepLogin();

  if (lastTrigger) {
    lastTrigger.focus();
  }
};

const openModal = (name, trigger) => {
  const modal = modals[name];
  if (!modal || !modalLayer) return;

  if (name !== "twoStep") {
    clearPendingTwoStepLogin();
  }

  lastTrigger = trigger ?? null;
  Object.values(modals).forEach((item) => {
    if (item) {
      item.hidden = item !== modal;
    }
  });

  modalLayer.classList.add("is-open");
  modalLayer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  const firstField = modal.querySelector("input");
  if (name === "demo" && demoVideo) {
    demoVideo.currentTime = 0;
    demoVideo.play().catch(() => {});
    demoVideo.focus?.();
  } else if (firstField) {
    firstField.focus();
  }
};

const syncModalFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const requestedModal = params.get("modal");

  if (!requestedModal || !(requestedModal in modals) || !modals[requestedModal]) {
    return;
  }

  clearDoctorSession();
  openModal(requestedModal);

  params.delete("modal");
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash || ""}`;
  window.history.replaceState({}, "", nextUrl);
};

modalTriggers.forEach((trigger) => {
  trigger.addEventListener("click", () => {
    openModal(trigger.dataset.modalOpen, trigger);
  });
});

modalCloses.forEach((control) => {
  control.addEventListener("click", closeModals);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalLayer?.classList.contains("is-open")) {
    closeModals();
  }
});

syncModalFromUrl();
validateExistingDoctorSession();

if (contactForm && formNote) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!contactForm.reportValidity()) {
      formNote.textContent = "Please complete the required fields before sending your request.";
      return;
    }

    formNote.textContent = "Thank you. Your support request has been prepared for the NOUFAR CDSS team.";
    contactForm.reset();
  });
}

authForms.forEach((form) => {
  form.addEventListener(
    "invalid",
    (event) => {
      const field = event.target;
      if (field instanceof HTMLElement) {
        event.preventDefault();
        syncFieldValidationState(field, true);
      }
    },
    true,
  );

  Array.from(form.elements).forEach((field) => {
    if (!(field instanceof HTMLElement) || typeof field.checkValidity !== "function") return;

    const primaryEvent = field.type === "checkbox" || field.type === "file" ? "change" : "input";

    field.addEventListener(primaryEvent, () => {
      syncFieldValidationState(field);
    });
  });
});

if (loginForm && loginNote) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginForm.dataset.submitAttempted = "true";

    Array.from(loginForm.elements).forEach((field) => {
      if (field instanceof HTMLElement && typeof field.checkValidity === "function") {
        syncFieldValidationState(field, true);
      }
    });

    if (!loginForm.checkValidity()) {
      setFormMessage(loginNote, "Please enter your professional email and password.", "error");
      return;
    }

    const email = loginForm.elements.email.value.trim();
    const password = loginForm.elements.password.value;

    try {
      setFormMessage(loginNote, "Signing you in...", "pending");
      const payload = await requestJson("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, expectedRole: "doctor" }),
      });

      if (payload?.requiresTwoStep) {
        clearDoctorSession();
        pendingTwoStepLogin = {
          email: payload.email,
          challengeToken: payload.challengeToken,
          maskedEmail: payload.maskedEmail,
          expiresInMinutes: payload.expiresInMinutes,
        };
        setFormMessage(loginNote, "", "default");
        if (twoStepMessage) {
          twoStepMessage.textContent = `Enter the 6-digit verification code sent to ${payload.maskedEmail || payload.email}. The code expires in ${payload.expiresInMinutes || 10} minutes.`;
        }
        setFormMessage(twoStepNote, "Verification code sent. Check your email to continue.", "pending");
        openModal("twoStep");
        return;
      }

      if (!isDoctorAccount(payload)) {
        clearDoctorSession();
        setFormMessage(
          loginNote,
          "Invalid email or password",
          "error"
        );
        return;
      }

      persistDoctorSession(payload);
      setFormMessage(loginNote, "Login successful. Redirecting...", "success");
      window.setTimeout(() => {
        redirectAfterAuth(payload);
      }, 500);
    } catch (error) {
      clearDoctorSession();
      if (error.status === 403 && (error.payload?.code === "ACCOUNT_PENDING_APPROVAL" || /pending approval/i.test(error.message || ""))) {
        setFormMessage(loginNote, "", "default");
        openModal("pendingApproval");
        return;
      }
      if (error.status === 403 && error.payload?.code === "DOCTOR_ACCESS_ONLY") {
        setFormMessage(loginNote, "Invalid email or password", "error");
        return;
      }
      if (error.status === 403 && error.payload?.code === "ACCOUNT_DEACTIVATED") {
        setFormMessage(loginNote, "", "default");
        if (deactivatedAccountReason) {
          deactivatedAccountReason.textContent =
            error.payload?.reason || "No reason was provided by the admin.";
        }
        openModal("deactivatedAccount");
        return;
      }
      if (error.status === 403 && error.payload?.code === "ACCOUNT_DELETED") {
        setFormMessage(loginNote, "", "default");
        if (deletedAccountReason) {
          deletedAccountReason.textContent =
            error.payload?.reason || "No reason was provided by the admin.";
        }
        openModal("deletedAccount");
        return;
      }
      setFormMessage(loginNote, error.message || "Unable to sign in right now.", "error");
    }
  });
}

if (twoStepForm && twoStepNote) {
  twoStepForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    twoStepForm.dataset.submitAttempted = "true";

    if (!pendingTwoStepLogin?.email || !pendingTwoStepLogin?.challengeToken) {
      setFormMessage(twoStepNote, "Your verification session expired. Please sign in again.", "error");
      return;
    }

    const code = twoStepForm.elements.code.value.trim();

    if (!code) {
      setFormMessage(twoStepNote, "Please enter the verification code sent to your email.", "error");
      return;
    }

    try {
      setFormMessage(twoStepNote, "Verifying your code...", "pending");
      const payload = await requestJson("/auth/login/verify-2fa", {
        method: "POST",
        body: JSON.stringify({
          email: pendingTwoStepLogin.email,
          challengeToken: pendingTwoStepLogin.challengeToken,
          code,
        }),
      });

      clearPendingTwoStepLogin();

      if (!isDoctorAccount(payload)) {
        clearDoctorSession();
        setFormMessage(
          loginNote,
          "Invalid email or password",
          "error"
        );
        return;
      }

      persistDoctorSession(payload);
      setFormMessage(loginNote, "Login successful. Redirecting...", "success");
      closeModals();
      window.setTimeout(() => {
        redirectAfterAuth(payload);
      }, 500);
    } catch (error) {
      setFormMessage(twoStepNote, error.message || "Unable to verify your code right now.", "error");
    }
  });
}

if (resetForm && resetNote) {
  resetForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    resetForm.dataset.submitAttempted = "true";

    Array.from(resetForm.elements).forEach((field) => {
      if (field instanceof HTMLElement && typeof field.checkValidity === "function") {
        syncFieldValidationState(field, true);
      }
    });

    if (!resetForm.checkValidity()) {
      setFormMessage(resetNote, "Please enter the professional email associated with your account.", "error");
      return;
    }

    try {
      setFormMessage(resetNote, "Sending your reset link...", "pending");
      const email = resetForm.elements.email.value.trim();
      const payload = await requestJson("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      setFormMessage(
        resetNote,
        payload.message || "If an account with that email exists, a reset link has been sent.",
        "success"
      );
      resetForm.reset();
      resetForm.dataset.submitAttempted = "false";
    } catch (error) {
      setFormMessage(resetNote, error.message || "Unable to send a reset link right now.", "error");
    }
  });
}

const validateUploadField = (field, label) => {
  if (!field) return true;

  const file = field.files?.[0];
  const meta = uploadMeta[field.name];

  field.setCustomValidity("");

  if (!file) {
    if (meta) {
      meta.textContent = "PDF, PNG, JPG or WEBP up to 5 MB.";
      meta.classList.remove("is-selected");
    }
    if (uploadNames[field.name]) {
      uploadNames[field.name].textContent = "No file selected";
    }
    syncUploadPreviewButton(field.name, false);
    return false;
  }

  const fileName = file.name.toLowerCase();
  const hasValidExtension = allowedUploadExtensions.some((extension) => fileName.endsWith(extension));
  const hasValidType = allowedUploadTypes.has(file.type) || (file.type === "" && hasValidExtension);

    if (!hasValidType) {
      field.setCustomValidity(`${label} must be a PDF, PNG, JPG, or WEBP file.`);
    } else if (file.size > MAX_UPLOAD_SIZE) {
      field.setCustomValidity(`${label} must be 5 MB or smaller.`);
    }

  if (meta) {
    if (field.validationMessage) {
      meta.textContent = field.validationMessage;
      meta.classList.remove("is-selected");
    } else {
      meta.textContent = `${formatUploadName(file.name)} selected`;
      meta.classList.add("is-selected");
    }
  }

  if (uploadNames[field.name]) {
    uploadNames[field.name].textContent = field.validationMessage
      ? "No file selected"
      : formatUploadName(file.name);
  }

  syncUploadPreviewButton(field.name, !field.validationMessage);

  return !field.validationMessage;
};

Object.entries(uploadFields).forEach(([name, field]) => {
  if (!field) return;

  const label = name === "medicalLicense" ? "Medical license" : "National ID";
  field.addEventListener("change", () => {
    validateUploadField(field, label);
    syncRegisterFormState();
    syncFieldValidationState(field);
  });
});

Object.entries(uploadPreviewButtons).forEach(([name, button]) => {
  if (!button) return;

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openUploadPreview(name);
  });
});

if (registerForm && registerNote) {
  registerForm.addEventListener("input", syncRegisterFormState);
  registerForm.addEventListener("change", syncRegisterFormState);
  syncRegisterFormState();

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    registerForm.dataset.submitAttempted = "true";

    syncRegisterFormState();

    Array.from(registerForm.elements).forEach((field) => {
      if (field instanceof HTMLElement && typeof field.checkValidity === "function") {
        syncFieldValidationState(field, true);
      }
    });

    if (!registerForm.checkValidity()) {
      setFormMessage(registerNote, "Please complete the required registration fields.", "error");
      return;
    }

    const { password, confirmPassword, isValid: isPasswordValid } = getPasswordState();

    if (password !== confirmPassword) {
      setFormMessage(registerNote, "Passwords do not match. Please confirm them again.", "error");
      return;
    }

    if (!isPasswordValid) {
      setFormMessage(
        registerNote,
        "Your password must contain at least 12 characters and include uppercase, lowercase, numeric, and special characters.",
        "error",
      );
      return;
    }

    const uploadsValid = [
      validateUploadField(uploadFields.medicalLicense, "Medical license"),
      validateUploadField(uploadFields.nationalId, "National ID"),
    ].every(Boolean);

    if (!uploadsValid || !registerForm.checkValidity()) {
      setFormMessage(
        registerNote,
        "Please upload a valid medical license and national ID before registering.",
        "error",
      );
      return;
    }

    const payload = new FormData();
    payload.append("name", registerForm.elements.name.value.trim());
    payload.append("specialty", registerForm.elements.specialty.value.trim());
    payload.append("hospital", registerForm.elements.institution.value.trim());
    payload.append("email", registerForm.elements.email.value.trim());
    payload.append("password", password);
    payload.append("role", "doctor");
    payload.append("doctorAccountType", registerForm.elements.doctorAccountType?.value || "standard");
    payload.append("termsAccepted", String(Boolean(registerForm.elements.terms?.checked)));
    payload.append("medicalLicense", uploadFields.medicalLicense.files[0]);
    payload.append("nationalId", uploadFields.nationalId.files[0]);

    try {
      setFormMessage(registerNote, "Creating your account...", "pending");
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        body: payload,
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || "Unable to create the account right now.");
      }

      clearDoctorSession();
      registerForm.reset();
      registerForm.dataset.submitAttempted = "false";
      syncRegisterFormState();
      return openModal("registerSuccess");
      closeModals();
      window.alert("Your account has been created. Approval pending — you'll receive an email soon.");
    } catch (error) {
      clearDoctorSession();
      setFormMessage(registerNote, error.message || "Unable to create the account right now.", "error");
    }
  });
}
