(() => {
const accountSidebar = document.querySelector(".sidebar");
const accountMobileButton = document.querySelector(".mobile-nav-button");
const saveAccountButton = document.querySelector("#save-account-settings");
const accountSaveBanner = document.querySelector("#account-save-banner");
const accountLastUpdated = document.querySelector("#account-last-updated");
const accountStatusIndicator = document.querySelector("#account-status-indicator");
const accountStatusTitle = document.querySelector("#account-status-title");
const photoInput = document.querySelector("#profile-photo-input");
const photoPickerButton = document.querySelector("#open-photo-picker");
const removePhotoButton = document.querySelector("#remove-photo-button");
const photoPreview = document.querySelector("#account-photo-preview");
const photoNote = document.querySelector("#account-photo-note");
const changeEmailModal = document.querySelector("#change-email-modal");
const changePasswordModal = document.querySelector("#change-password-modal");
const forgotPasswordModal = document.querySelector("#forgot-password-modal");
const accountModalCloseButtons = document.querySelectorAll("[data-close-account-modal]");
const removePhotoModal = document.querySelector("#remove-photo-modal");
const removePhotoCloseButtons = document.querySelectorAll("[data-close-photo-modal]");
const confirmRemovePhotoButton = document.querySelector("#confirm-remove-photo");
const photoCropModal = document.querySelector("#photo-crop-modal");
const photoCropCloseButtons = document.querySelectorAll("[data-close-photo-crop]");
const photoCropStage = document.querySelector("#photo-crop-stage");
const photoCropImage = document.querySelector("#photo-crop-image");
const photoCropZoom = document.querySelector("#photo-crop-zoom");
const photoCropZoomOut = document.querySelector("#photo-crop-zoom-out");
const photoCropZoomIn = document.querySelector("#photo-crop-zoom-in");
const saveCroppedPhotoButton = document.querySelector("#save-cropped-photo");
const changeEmailButton = document.querySelector("#change-email-button");
const togglePasswordPanelButton = document.querySelector("#toggle-password-panel");
const changeEmailForm = document.querySelector("#change-email-form");
const changePasswordForm = document.querySelector("#change-password-form");
const changeEmailNote = document.querySelector("#change-email-note");
const changePasswordNote = document.querySelector("#change-password-note");
const accountPasswordStrengthText = document.querySelector("#account-password-strength-text");
const accountPasswordStrengthFill = document.querySelector("#account-password-strength-fill");
const accountPasswordRuleLength = document.querySelector("#account-password-rule-length");
const accountPasswordRuleNumber = document.querySelector("#account-password-rule-number");
const accountPasswordRuleMatch = document.querySelector("#account-password-rule-match");
const forgotPasswordForm = document.querySelector("#forgot-password-form");
const forgotPasswordButton = document.querySelector("#forgot-password-button");
const forgotPasswordNote = document.querySelector("#forgot-password-note");
const currentEmailDisplay = document.querySelector("#current-email-display");
const currentEmailModalDisplay = document.querySelector("#change-email-current-display");
const newEmailInput = document.querySelector("#new-email-input");
const confirmEmailInput = document.querySelector("#confirm-email-input");
const confirmEmailPasswordInput = document.querySelector("#confirm-email-password");
const forgotPasswordEmailInput = document.querySelector("#forgot-password-email");
const twoStepToggle = document.querySelector("#two-step-toggle");
const sessionTimeoutSelect = document.querySelector("#session-timeout-select");
const currentPasswordInput = document.querySelector("#current-password");
const newPasswordInput = document.querySelector("#new-password");
const confirmPasswordInput = document.querySelector("#confirm-password");
const fullNameInput = document.querySelector("#account-full-name");
const specialtyInput = document.querySelector("#account-specialty");
const hospitalInput = document.querySelector("#account-hospital");
const profileAvatars = document.querySelectorAll(
  ".sidebar-profile .profile-avatar, .profile-trigger-avatar, .profile-menu-avatar"
);

const doctorAuthStorageKey = "noufar-doctor-auth-v1";
const API_BASE_URL = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
const maxProfilePhotoSize = 2 * 1024 * 1024;
const doctorSessionBridge = window.NoufarDoctorSessionBridge || null;

let doctorSession = null;
let currentProfile = null;
let pendingPhotoData = null;
let cropSourceData = "";
let cropImageState = null;

const cropViewportSize = 300;
const cropOutputSize = 560;

const getDoctorSession = () => {
  try {
    const raw = window.localStorage.getItem(doctorAuthStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const setDoctorSession = (session) => {
  doctorSession = session;
  if (doctorSessionBridge?.setSession) {
    doctorSessionBridge.setSession(session);
    return;
  }
  window.localStorage.setItem(doctorAuthStorageKey, JSON.stringify(session));
};

const getAuthHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${(doctorSessionBridge?.getSession?.() || doctorSession || {}).token || ""}`,
});

const requestJson = async (path, options = {}) =>
  doctorSessionBridge?.requestJson
    ? doctorSessionBridge.requestJson(path, options)
    : (async () => {
        const response = await fetch(`${API_BASE_URL}${path}`, options);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const error = new Error(data.message || "Request failed");
          error.status = response.status;
          error.payload = data;
          throw error;
        }

        return data;
      })();

const stampLastUpdated = (value = new Date()) => {
  if (!accountLastUpdated) return;

  const date = typeof value === "string" ? new Date(value) : value;
  const formatted = date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  accountLastUpdated.textContent = formatted;
};

const accountToastStack = document.querySelector("#account-toast-stack");
let accountProgressToast = null;

const TOAST_ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5m0 3h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3Z"/></svg>`,
  progress: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>`,
  neutral: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg>`,
};

const TOAST_TITLES = {
  success: "Saved successfully",
  error: "Could not save",
  progress: "Saving...",
  neutral: "Notice",
};

const dismissAccountToast = (toast) => {
  if (!toast || toast.dataset.dismissing === "true") return;
  toast.dataset.dismissing = "true";
  toast.classList.add("is-leaving");
  setTimeout(() => toast.remove(), 280);
  if (accountProgressToast === toast) accountProgressToast = null;
};

const showAccountToast = (message, state = "neutral", { duration } = {}) => {
  const resolvedState =
    typeof state === "string" ? state : state === false ? "error" : "success";
  const stack = accountToastStack || document.body;

  if (accountProgressToast && resolvedState !== "progress") {
    dismissAccountToast(accountProgressToast);
  }

  const toast = document.createElement("div");
  toast.className = `account-toast is-${resolvedState}`;
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <span class="account-toast-icon" aria-hidden="true">${TOAST_ICONS[resolvedState] || TOAST_ICONS.neutral}</span>
    <div class="account-toast-copy">
      <strong>${TOAST_TITLES[resolvedState] || TOAST_TITLES.neutral}</strong>
      <span>${message || ""}</span>
    </div>
    <button class="account-toast-close" type="button" aria-label="Dismiss notification">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18"/>
      </svg>
    </button>
  `;

  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  toast.querySelector(".account-toast-close").addEventListener("click", () => dismissAccountToast(toast));

  if (resolvedState === "progress") {
    accountProgressToast = toast;
  } else {
    const lifeMs = typeof duration === "number" ? duration : resolvedState === "error" ? 5000 : 3500;
    setTimeout(() => dismissAccountToast(toast), lifeMs);
  }

  stampLastUpdated();
  return toast;
};

const showBanner = (message, state = "neutral") => showAccountToast(message, state);

const setStrengthVisualState = (level, text) => {
  if (accountPasswordStrengthText) {
    accountPasswordStrengthText.className = `password-strength-badge ${level ? `is-${level}` : "is-empty"}`;
    accountPasswordStrengthText.textContent = text;
  }

  if (accountPasswordStrengthFill) {
    accountPasswordStrengthFill.className = `password-strength-fill ${level ? `is-${level}` : "is-empty"}`;
  }
};

const setRuleState = (element, isValid) => {
  if (!element) return;
  element.classList.toggle("is-valid", Boolean(isValid));
};

const getAccountPasswordState = () => {
  const currentPassword = currentPasswordInput?.value || "";
  const newPassword = newPasswordInput?.value || "";
  const confirmPassword = confirmPasswordInput?.value || "";
  const hasMinLength = newPassword.length >= 12;
  const hasNumber = /\d/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasSymbol = /[^A-Za-z0-9]/.test(newPassword);
  const hasRequiredFormat = hasLower && hasUpper && hasNumber && hasSymbol;
  const matches = newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword;
  const isDifferentFromCurrent = currentPassword.length > 0 && newPassword.length > 0 && newPassword !== currentPassword;

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

  return {
    currentPassword,
    newPassword,
    confirmPassword,
    hasMinLength,
    hasRequiredFormat,
    matches,
    isDifferentFromCurrent,
    strength,
    label,
  };
};

const syncAccountPasswordStrengthState = () => {
  const passwordState = getAccountPasswordState();
  setStrengthVisualState(passwordState.strength, passwordState.label);
  setRuleState(accountPasswordRuleLength, passwordState.hasMinLength);
  setRuleState(accountPasswordRuleNumber, passwordState.hasRequiredFormat);
  setRuleState(accountPasswordRuleMatch, passwordState.matches);
};

const buildInitials = (name = "") =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "DR";

const applyPhotoToShell = (photoData, initials) => {
  profileAvatars.forEach((avatar) => {
    avatar.style.backgroundImage = photoData ? `url("${photoData}")` : "";
    avatar.style.backgroundSize = photoData ? "cover" : "";
    avatar.style.backgroundPosition = photoData ? "center" : "";
    avatar.textContent = photoData ? "" : initials;
  });
};

const renderPhotoState = () => {
  if (!photoPreview || !photoPickerButton || !removePhotoButton) return;

  const activePhoto = pendingPhotoData ?? currentProfile?.profilePhoto ?? "";
  const initials = buildInitials(currentProfile?.name);
  const hasPhoto = Boolean(activePhoto);

  photoPreview.style.backgroundImage = hasPhoto ? `url("${activePhoto}")` : "";
  photoPreview.style.backgroundSize = hasPhoto ? "cover" : "";
  photoPreview.style.backgroundPosition = hasPhoto ? "center" : "";
  photoPreview.classList.toggle("has-image", hasPhoto);
  photoPreview.textContent = hasPhoto ? "" : initials;

  photoPickerButton.textContent = hasPhoto ? "Change Image" : "Upload Profile Photo";
  removePhotoButton.hidden = !hasPhoto;

  if (photoNote) {
    photoNote.textContent = hasPhoto
      ? "Current physician profile photo is active for this account."
      : "We support PNG, JPG, JPEG, GIF and WEBP files under 2 MB.";
  }

  applyPhotoToShell(activePhoto, initials);
};

const updateShellProfileCopy = () => {
  const initials = buildInitials(currentProfile?.name);
  const profileName = document.querySelector(".profile-menu-copy strong");
  const profileMeta = document.querySelector(".profile-menu-copy span");
  const triggerAvatar = document.querySelector(".profile-trigger-avatar");
  const menuAvatar = document.querySelector(".profile-menu-avatar");

  if (profileName) profileName.textContent = currentProfile?.name || "Doctor account";
  if (profileMeta) {
    profileMeta.textContent =
      currentProfile?.specialty || currentProfile?.hospital || "Doctor account";
  }

  if (triggerAvatar && !currentProfile?.profilePhoto) triggerAvatar.textContent = initials;
  if (menuAvatar && !currentProfile?.profilePhoto) menuAvatar.textContent = initials;
};

const hydrateForm = (profile) => {
  currentProfile = profile;
  pendingPhotoData = null;

  if (fullNameInput) fullNameInput.value = profile.name || "";
  if (specialtyInput) specialtyInput.value = profile.specialty || "";
  if (hospitalInput) hospitalInput.value = profile.hospital || "";
  if (currentEmailDisplay) currentEmailDisplay.value = profile.email || "";
  if (currentEmailModalDisplay) currentEmailModalDisplay.value = profile.email || "";
  if (forgotPasswordEmailInput) forgotPasswordEmailInput.value = profile.email || "";
  if (twoStepToggle) twoStepToggle.checked = profile.twoStepEnabled !== false;
  if (sessionTimeoutSelect) sessionTimeoutSelect.value = profile.sessionTimeout || "30 minutes";

  renderPhotoState();
  updateShellProfileCopy();
  stampLastUpdated(profile.updatedAt || new Date());
};

const refreshProfile = async () => {
  const response = await requestJson("/auth/profile", {
    headers: {
      Authorization: `Bearer ${doctorSession.token}`,
    },
  });

  const refreshedSession = {
    ...doctorSession,
    user: {
      ...doctorSession.user,
      ...response,
    },
  };

  setDoctorSession(refreshedSession);
  hydrateForm(response);
};

const closeRemovePhotoModal = () => {
  if (removePhotoModal) removePhotoModal.hidden = true;
};

const openRemovePhotoModal = () => {
  if (removePhotoModal) removePhotoModal.hidden = false;
};

const closePhotoCropModal = () => {
  if (photoCropModal) photoCropModal.hidden = true;
  if (photoInput) photoInput.value = "";
  cropSourceData = "";
  cropImageState = null;
  if (photoCropImage) {
    photoCropImage.removeAttribute("src");
    photoCropImage.style.transform = "";
  }
};

const clampCropOffset = () => {
  if (!cropImageState) return;
  const { width, height, scale } = cropImageState;
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const minX = Math.min(0, cropViewportSize - scaledWidth);
  const minY = Math.min(0, cropViewportSize - scaledHeight);
  cropImageState.x = Math.min(0, Math.max(minX, cropImageState.x));
  cropImageState.y = Math.min(0, Math.max(minY, cropImageState.y));
};

const renderCropPreview = () => {
  if (!cropImageState || !photoCropImage) return;
  clampCropOffset();
  photoCropImage.style.transform = `translate3d(${cropImageState.x}px, ${cropImageState.y}px, 0) scale(${cropImageState.scale})`;
  photoCropImage.style.transformOrigin = "top left";
};

const setCropScale = (nextScale) => {
  if (!cropImageState) return;
  const previousScale = cropImageState.scale;
  const clampedScale = Math.min(cropImageState.maxScale, Math.max(cropImageState.minScale, nextScale));
  if (clampedScale === previousScale) return;

  const centerX = cropViewportSize / 2;
  const centerY = cropViewportSize / 2;
  const imagePointX = (centerX - cropImageState.x) / previousScale;
  const imagePointY = (centerY - cropImageState.y) / previousScale;

  cropImageState.scale = clampedScale;
  cropImageState.x = centerX - imagePointX * clampedScale;
  cropImageState.y = centerY - imagePointY * clampedScale;

  if (photoCropZoom) {
    photoCropZoom.value = String(Math.round((clampedScale / cropImageState.minScale) * 100));
  }

  renderCropPreview();
};

const openPhotoCropModal = (dataUrl) => {
  if (!photoCropModal || !photoCropImage || !photoCropZoom) return;

  const image = new Image();
  image.onload = () => {
    const minScale = Math.max(cropViewportSize / image.naturalWidth, cropViewportSize / image.naturalHeight);

    cropSourceData = dataUrl;
    cropImageState = {
      width: image.naturalWidth,
      height: image.naturalHeight,
      minScale,
      maxScale: minScale * 3,
      scale: minScale,
      x: (cropViewportSize - image.naturalWidth * minScale) / 2,
      y: (cropViewportSize - image.naturalHeight * minScale) / 2,
      dragging: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0,
    };

    photoCropImage.src = dataUrl;
    photoCropZoom.min = "100";
    photoCropZoom.max = "300";
    photoCropZoom.value = "100";
    renderCropPreview();
    photoCropModal.hidden = false;
  };
  image.src = dataUrl;
};

const closeAccountModal = (modal) => {
  if (modal) modal.hidden = true;
};

const openAccountModal = (modal) => {
  if (modal) modal.hidden = false;
};

const setModalNote = (element, message = "") => {
  if (!element) return;
  element.textContent = message;
  element.hidden = !message;
};

if (accountMobileButton && accountSidebar) {
  accountMobileButton.addEventListener("click", () => {
    const isOpen = accountSidebar.classList.toggle("is-open");
    accountMobileButton.setAttribute("aria-expanded", String(isOpen));
  });
}

if (photoPickerButton && photoInput) {
  photoPickerButton.addEventListener("click", () => {
    photoInput.click();
  });
}

if (photoInput) {
  photoInput.addEventListener("change", () => {
    const [file] = photoInput.files || [];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showBanner("Please select a valid image file for the profile picture.", false);
      return;
    }

    if (file.size > maxProfilePhotoSize) {
      showBanner("Profile photo was not updated because the file exceeds the 2 MB limit.", false);
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      openPhotoCropModal(String(reader.result));
    });
    reader.readAsDataURL(file);
  });
}

if (removePhotoButton) {
  removePhotoButton.addEventListener("click", openRemovePhotoModal);
}

removePhotoCloseButtons.forEach((button) => {
  button.addEventListener("click", closeRemovePhotoModal);
});

if (confirmRemovePhotoButton) {
  confirmRemovePhotoButton.addEventListener("click", () => {
    pendingPhotoData = "";
    if (photoInput) photoInput.value = "";
    renderPhotoState();
    closeRemovePhotoModal();
    showBanner("Profile photo will be removed when you save your changes.", "neutral");
  });
}

photoCropCloseButtons.forEach((button) => {
  button.addEventListener("click", closePhotoCropModal);
});

if (photoCropZoom) {
  photoCropZoom.addEventListener("input", () => {
    if (!cropImageState) return;
    const ratio = Number(photoCropZoom.value || 100) / 100;
    setCropScale(cropImageState.minScale * ratio);
  });
}

photoCropZoomOut?.addEventListener("click", () => {
  if (!photoCropZoom) return;
  photoCropZoom.value = String(Math.max(Number(photoCropZoom.min), Number(photoCropZoom.value) - 10));
  photoCropZoom.dispatchEvent(new Event("input", { bubbles: true }));
});

photoCropZoomIn?.addEventListener("click", () => {
  if (!photoCropZoom) return;
  photoCropZoom.value = String(Math.min(Number(photoCropZoom.max), Number(photoCropZoom.value) + 10));
  photoCropZoom.dispatchEvent(new Event("input", { bubbles: true }));
});

photoCropStage?.addEventListener("pointerdown", (event) => {
  if (!cropImageState || !photoCropImage) return;
  cropImageState.dragging = true;
  cropImageState.pointerId = event.pointerId;
  cropImageState.startX = event.clientX;
  cropImageState.startY = event.clientY;
  cropImageState.originX = cropImageState.x;
  cropImageState.originY = cropImageState.y;
  photoCropStage.setPointerCapture(event.pointerId);
  photoCropStage.classList.add("is-dragging");
});

photoCropStage?.addEventListener("pointermove", (event) => {
  if (!cropImageState?.dragging || cropImageState.pointerId !== event.pointerId) return;
  cropImageState.x = cropImageState.originX + (event.clientX - cropImageState.startX);
  cropImageState.y = cropImageState.originY + (event.clientY - cropImageState.startY);
  renderCropPreview();
});

const finishCropDrag = (event) => {
  if (!cropImageState?.dragging || cropImageState.pointerId !== event.pointerId) return;
  cropImageState.dragging = false;
  photoCropStage?.classList.remove("is-dragging");
  if (photoCropStage?.hasPointerCapture(event.pointerId)) {
    photoCropStage.releasePointerCapture(event.pointerId);
  }
};

photoCropStage?.addEventListener("pointerup", finishCropDrag);
photoCropStage?.addEventListener("pointercancel", finishCropDrag);

if (saveCroppedPhotoButton) {
  saveCroppedPhotoButton.addEventListener("click", () => {
    if (!cropImageState || !cropSourceData) return;

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = cropOutputSize;
      canvas.height = cropOutputSize;
      const context = canvas.getContext("2d");
      if (!context) return;

      const srcX = Math.max(0, -cropImageState.x / cropImageState.scale);
      const srcY = Math.max(0, -cropImageState.y / cropImageState.scale);
      const srcSize = cropViewportSize / cropImageState.scale;

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, srcX, srcY, srcSize, srcSize, 0, 0, cropOutputSize, cropOutputSize);

      pendingPhotoData = canvas.toDataURL("image/png", 0.96);
      renderPhotoState();
      closePhotoCropModal();
      showBanner("Profile photo ready. Click Save Changes to update your account.", "neutral");
    };
    image.src = cropSourceData;
  });
}

if (changeEmailButton) {
  changeEmailButton.addEventListener("click", () => {
    setModalNote(changeEmailNote, "");
    openAccountModal(changeEmailModal);
  });
}

if (togglePasswordPanelButton) {
  togglePasswordPanelButton.addEventListener("click", () => {
    setModalNote(changePasswordNote, "");
    syncAccountPasswordStrengthState();
    openAccountModal(changePasswordModal);
  });
}

accountModalCloseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    closeAccountModal(changeEmailModal);
    closeAccountModal(changePasswordModal);
    closeAccountModal(forgotPasswordModal);
  });
});

if (saveAccountButton) {
  saveAccountButton.addEventListener("click", async () => {
    try {
      const fullName = fullNameInput?.value.trim() || "";

      if (!fullName) {
        showBanner("Please enter your full name before saving.", false);
        return;
      }

      showBanner("Saving your profile changes...", "progress");

      const response = await requestJson("/auth/profile", {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: fullName,
          specialty: specialtyInput?.value.trim() || "",
          hospital: hospitalInput?.value.trim() || "",
          profilePhoto: pendingPhotoData !== null ? pendingPhotoData : currentProfile?.profilePhoto || "",
          twoStepEnabled: Boolean(twoStepToggle?.checked),
          sessionTimeout: sessionTimeoutSelect?.value || "30 minutes",
        }),
      });

      const refreshedSession = {
        ...doctorSession,
        user: {
          ...doctorSession.user,
          ...response.user,
        },
      };

      setDoctorSession(refreshedSession);
      hydrateForm(response.user);
      showBanner("Account settings updated successfully. Your clinical profile is now synced.");
    } catch (error) {
      showBanner(error.message || "Unable to save your account settings right now.", false);
    }
  });
}

if (changeEmailForm) {
  changeEmailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setModalNote(changeEmailNote, "");

    try {
      const response = await requestJson("/auth/profile/email", {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          currentPassword: confirmEmailPasswordInput?.value || "",
          newEmail: newEmailInput?.value || "",
          confirmEmail: confirmEmailInput?.value || "",
        }),
      });

      const refreshedSession = {
        ...doctorSession,
        token: response.token || doctorSession.token,
        user: {
          ...doctorSession.user,
          ...response.user,
        },
      };

      setDoctorSession(refreshedSession);
      closeAccountModal(changeEmailModal);
      changeEmailForm.reset();
      await refreshProfile();
      showBanner("Professional email updated successfully for your account.");
    } catch (error) {
      setModalNote(changeEmailNote, error.message || "Unable to update your email right now.");
    }
  });
}

if (forgotPasswordButton) {
  forgotPasswordButton.addEventListener("click", () => {
    closeAccountModal(changePasswordModal);
    openAccountModal(forgotPasswordModal);
  });
}

if (changePasswordForm) {
  [newPasswordInput, confirmPasswordInput, currentPasswordInput].forEach((field) => {
    field?.addEventListener("input", syncAccountPasswordStrengthState);
  });

  changePasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setModalNote(changePasswordNote, "");

    const passwordState = getAccountPasswordState();

    if (!passwordState.currentPassword || !passwordState.newPassword || !passwordState.confirmPassword) {
      setModalNote(
        changePasswordNote,
        "Current password, new password, and confirmation are required"
      );
      return;
    }

    if (!passwordState.hasMinLength) {
      setModalNote(changePasswordNote, "The new password must contain at least 12 characters");
      return;
    }

    if (!passwordState.hasRequiredFormat) {
      setModalNote(
        changePasswordNote,
        "The new password must include uppercase, lowercase, numeric, and special characters"
      );
      return;
    }

    if (!passwordState.isDifferentFromCurrent) {
      setModalNote(changePasswordNote, "The new password shouldn't be the same as the previous password");
      return;
    }

    if (!passwordState.matches) {
      setModalNote(changePasswordNote, "The new password and confirmation do not match");
      return;
    }

    try {
      await requestJson("/auth/profile/password", {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          currentPassword: currentPasswordInput?.value || "",
          newPassword: newPasswordInput?.value || "",
          confirmPassword: confirmPasswordInput?.value || "",
        }),
      });

      closeAccountModal(changePasswordModal);
      changePasswordForm.reset();
      syncAccountPasswordStrengthState();
      showBanner("Password updated successfully. Your account credentials have been refreshed.");
    } catch (error) {
      setModalNote(changePasswordNote, error.message || "Unable to update your password right now.");
    }
  });
}

if (forgotPasswordForm) {
  forgotPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = forgotPasswordEmailInput?.value.trim() || currentProfile?.email || "";

    if (!email) {
      setModalNote(forgotPasswordNote, "Email is required");
      return;
    }

    try {
      const response = await requestJson("/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
        }),
      });

      closeAccountModal(forgotPasswordModal);
      if (forgotPasswordForm) forgotPasswordForm.reset();
      if (forgotPasswordEmailInput) forgotPasswordEmailInput.value = currentProfile?.email || "";
      showBanner(
        response.message || "If an account with that email exists, a reset link has been sent."
      );
    } catch (error) {
      setModalNote(forgotPasswordNote, error.message || "Unable to send a reset link right now.");
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && removePhotoModal && !removePhotoModal.hidden) {
    closeRemovePhotoModal();
  }

  if (event.key === "Escape" && photoCropModal && !photoCropModal.hidden) {
    closePhotoCropModal();
  }

  if (event.key === "Escape") {
    closeAccountModal(changeEmailModal);
    closeAccountModal(changePasswordModal);
    closeAccountModal(forgotPasswordModal);
  }
});

const bootstrap = async () => {
  doctorSession = getDoctorSession();

  if (!doctorSession?.authenticated || !doctorSession?.token) {
    window.location.href = "index.html";
    return;
  }

  try {
    await refreshProfile();
      showBanner("Your account settings are synced with the platform.", "success");
  } catch (error) {
    showBanner(error.message || "Unable to load your account settings.", false);
  }
};

syncAccountPasswordStrengthState();
bootstrap();
})();
