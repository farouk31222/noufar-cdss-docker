const profileToggle = document.querySelector("[data-profile-toggle]");
const profileMenu = document.querySelector("[data-profile-menu]");
const appLayout = document.querySelector(".app-layout");
const sidebar = document.querySelector(".sidebar");
const sidebarToggle = document.querySelector(".mobile-nav-button");
const doctorLogoutLinks = document.querySelectorAll('.profile-menu-link.logout[href="index.html"]');
const notificationToggles = document.querySelectorAll('.icon-button[aria-label="Notifications"]');
const sidebarLinks = document.querySelectorAll(".sidebar-link");
const comingSoonModal = document.querySelector("#coming-soon-modal");
const comingSoonTitle = document.querySelector("#coming-soon-title");
const comingSoonCopy = document.querySelector("#coming-soon-copy");
const comingSoonTriggers = document.querySelectorAll("[data-coming-soon-trigger]");
const comingSoonClosers = document.querySelectorAll("[data-coming-soon-close]");
const supportTriggers = document.querySelectorAll("[data-support-new-message]");
const supportAccessUpgradeShell = document.querySelector("[data-standard-access-upgrade-shell]");
const supportAccessUpgradeTrigger = document.querySelector("[data-support-access-upgrade]");
const desktopSidebarStorageKey = "noufar-sidebar-collapsed";
const doctorAuthStorageKey = "noufar-doctor-auth-v1";
const API_BASE_URL = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
const ADMIN_SUPPORT_AVATAR_URL = "assets/Admin%20profileee.png";
const BLOCKED_ACCOUNT_ICON_URL = "assets/Block.png";
const sessionTimeoutDurations = {
  "10 seconds": 10 * 1000,
  "30 minutes": 30 * 60 * 1000,
  "1 hour": 60 * 60 * 1000,
  "4 hours": 4 * 60 * 60 * 1000,
  Never: Number.POSITIVE_INFINITY,
  "15 minutes": 15 * 60 * 1000,
  "60 minutes": 60 * 60 * 1000,
};
let sessionWarningTimer = null;
let sessionLogoutTimer = null;
let sessionCountdownTimer = null;
let sessionExpiresAt = null;
let sessionTimeoutModal = null;
let sessionActivityTrackingRegistered = false;
let doctorSupportThreadsCache = [];
let doctorNotificationsCache = [];
let activeDoctorInboxTicketId = null;
let previousDoctorUnreadNotificationCount = null;
let doctorNotificationPollingStarted = false;
let doctorNotificationAudioArmed = false;
let doctorNotificationAudio = null;
let doctorRealtimeSource = null;
let doctorRealtimeConnected = false;
const DOCTOR_FALLBACK_POLL_INTERVAL = 15000;
let doctorRealtimeRefreshTimer = null;
let doctorRealtimeRefreshInFlight = false;
let doctorRealtimeRefreshQueued = false;
let doctorRealtimeFocusTicketId = null;
let activeDoctorAttachmentBlobUrl = "";
let doctorRefreshPromise = null;
const DOCTOR_REFRESH_SKEW_MS = 60 * 1000;

const getDoctorSession = () => {
  try {
    const raw = window.localStorage.getItem(doctorAuthStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const setDoctorSession = (session) => {
  if (!session) {
    window.localStorage.removeItem(doctorAuthStorageKey);
  } else {
    window.localStorage.setItem(doctorAuthStorageKey, JSON.stringify(session));
  }

  window.dispatchEvent(
    new CustomEvent("noufar:doctor-session-updated", {
      detail: session,
    })
  );
};

const clearDoctorSession = () => {
  setDoctorSession(null);
};

const buildDoctorSessionFromPayload = (payload, existingSession = getDoctorSession()) => ({
  authenticated: true,
  token: payload.accessToken || payload.token || existingSession?.token || "",
  accessToken: payload.accessToken || payload.token || existingSession?.accessToken || existingSession?.token || "",
  refreshToken: payload.refreshToken || existingSession?.refreshToken || "",
  sessionId: payload.sessionId || existingSession?.sessionId || "",
  accessTokenExpiresAt: payload.accessTokenExpiresAt || existingSession?.accessTokenExpiresAt || "",
  refreshTokenExpiresAt: payload.refreshTokenExpiresAt || existingSession?.refreshTokenExpiresAt || "",
  user: {
    ...(existingSession?.user || {}),
    ...(payload?.user || {}),
    ...(payload && !payload.user
      ? {
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
        }
      : {}),
  },
  loggedAt: existingSession?.loggedAt || new Date().toISOString(),
});

const persistDoctorSessionFromPayload = (payload, existingSession = getDoctorSession()) => {
  const session = buildDoctorSessionFromPayload(payload, existingSession);
  setDoctorSession(session);
  return session;
};

const extractErrorPayload = async (response, fallbackMessage) => {
  const data = await response.json().catch(() => ({}));
  const error = new Error(data.message || fallbackMessage);
  error.status = response.status;
  error.payload = data;
  throw error;
};

const requestDoctorSessionRefresh = async () => {
  if (doctorRefreshPromise) {
    return doctorRefreshPromise;
  }

  doctorRefreshPromise = (async () => {
    const session = getDoctorSession();
    const refreshToken = session?.refreshToken;

    if (!refreshToken) {
      clearDoctorSession();
      throw new Error("Doctor refresh token is missing.");
    }

    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearDoctorSession();
      return extractErrorPayload(response, "Unable to refresh your doctor session.");
    }

    const payload = await response.json().catch(() => ({}));
    const nextSession = persistDoctorSessionFromPayload(payload, session);
    return nextSession;
  })();

  try {
    return await doctorRefreshPromise;
  } finally {
    doctorRefreshPromise = null;
  }
};

const ensureFreshDoctorSession = async () => {
  const session = getDoctorSession();

  if (!session?.authenticated || !session?.token) {
    throw new Error("Doctor session token is missing.");
  }

  const expiresAt = Date.parse(session.accessTokenExpiresAt || "");
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() <= DOCTOR_REFRESH_SKEW_MS) {
    return requestDoctorSessionRefresh();
  }

  return session;
};

const logoutDoctorSession = async (redirectUrl = "index.html") => {
  let session = getDoctorSession();

  try {
    if (session?.refreshToken) {
      session = await ensureFreshDoctorSession().catch(() => requestDoctorSessionRefresh());
    }
    if (session?.token) {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          refreshToken: session.refreshToken || "",
        }),
      });
    }
  } catch (error) {
    // Ignore logout transport errors and continue local cleanup.
  }

  clearDoctorSession();
  window.location.href = redirectUrl;
};

const hideDoctorSupportCenterProfileLink = () => {
  document
    .querySelectorAll('.profile-menu-link[href="index.html#support"]')
    .forEach((link) => link.remove());
};

const getDoctorAccountType = (sessionOrUser) => {
  const rawType = sessionOrUser?.user?.doctorAccountType ?? sessionOrUser?.doctorAccountType;
  return rawType === "standard" ? "standard" : "prediction";
};

const doctorCanRunPredictions = (sessionOrUser) => getDoctorAccountType(sessionOrUser) === "prediction";

const getCurrentPageName = () => {
  const pathname = window.location.pathname.split("/").pop() || "index.html";
  return pathname.toLowerCase();
};

const armDoctorNotificationAudio = () => {
  doctorNotificationAudioArmed = true;
};

const getDoctorNotificationAudio = () => {
  if (!doctorNotificationAudio) {
    doctorNotificationAudio = new Audio("assets/doctor%20notif.mp3");
    doctorNotificationAudio.preload = "auto";
  }
  return doctorNotificationAudio;
};

const playDoctorNotificationSound = async () => {
  if (!doctorNotificationAudioArmed || document.hidden) return;
  const audio = getDoctorNotificationAudio();
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
    await audio.play();
  } catch (error) {
    // Ignore autoplay or transient playback errors.
  }
};

const getSessionTimeoutMs = (value) => sessionTimeoutDurations[value] ?? sessionTimeoutDurations["30 minutes"];

const isSessionTimeoutWarningOpen = () => Boolean(sessionTimeoutModal && document.body?.contains(sessionTimeoutModal));

const removeSessionTimeoutWarning = () => {
  if (sessionTimeoutModal) {
    sessionTimeoutModal.remove();
    sessionTimeoutModal = null;
  }

  if (document.body) {
    document.body.classList.remove("session-timeout-warning-open");
  }
};

const clearSessionTimeoutTimers = () => {
  window.clearTimeout(sessionWarningTimer);
  window.clearTimeout(sessionLogoutTimer);
  window.clearInterval(sessionCountdownTimer);
  sessionWarningTimer = null;
  sessionLogoutTimer = null;
  sessionCountdownTimer = null;
  sessionExpiresAt = null;
};

const performSessionTimeoutLogout = () => {
  clearSessionTimeoutTimers();
  removeSessionTimeoutWarning();
  logoutDoctorSession("index.html").catch(() => {
    clearDoctorSession();
    window.location.href = "index.html";
  });
};

const redirectToLoginModal = () => {
  clearSessionTimeoutTimers();
  removeSessionTimeoutWarning();
  logoutDoctorSession("index.html?modal=login").catch(() => {
    clearDoctorSession();
    window.location.href = "index.html?modal=login";
  });
};

const updateSessionTimeoutCountdown = () => {
  if (!sessionTimeoutModal || !sessionExpiresAt) return;

  const countdownNode = sessionTimeoutModal.querySelector("[data-session-timeout-countdown]");
  if (!countdownNode) return;

  const remainingSeconds = Math.max(0, Math.ceil((sessionExpiresAt - Date.now()) / 1000));
  countdownNode.textContent = String(remainingSeconds);
};

const openSessionTimeoutWarning = () => {
  removeSessionTimeoutWarning();

  sessionTimeoutModal = document.createElement("section");
  sessionTimeoutModal.className = "session-timeout-warning";
  sessionTimeoutModal.innerHTML = `
    <div class="session-timeout-warning-backdrop"></div>
    <div class="session-timeout-warning-card" role="alertdialog" aria-live="assertive" aria-modal="true" aria-labelledby="session-timeout-warning-title">
      <div class="session-timeout-warning-badge">Session timeout</div>
      <strong id="session-timeout-warning-title">Your session is about to end</strong>
      <p>You selected a very short session timeout. For security, you will be signed out automatically if you stay inactive.</p>
      <div class="session-timeout-warning-countdown">
        Automatic logout in <span data-session-timeout-countdown>5</span> seconds
      </div>
      <div class="session-timeout-warning-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-session-timeout-stay>Stay signed in</button>
        <button class="btn btn-primary btn-sm" type="button" data-session-timeout-login>Login again</button>
      </div>
    </div>
  `;

  document.body.appendChild(sessionTimeoutModal);
  document.body.classList.add("session-timeout-warning-open");
  updateSessionTimeoutCountdown();

  sessionTimeoutModal
    .querySelector("[data-session-timeout-stay]")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentSession = getDoctorSession();
      if (!currentSession?.authenticated || currentSession.user?.role !== "doctor") {
        performSessionTimeoutLogout();
        return;
      }

      removeSessionTimeoutWarning();
      scheduleSessionTimeout(currentSession);
    });

  sessionTimeoutModal
    .querySelector("[data-session-timeout-login]")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      redirectToLoginModal();
    });

  sessionCountdownTimer = window.setInterval(updateSessionTimeoutCountdown, 1000);
};

const scheduleSessionTimeout = (session) => {
  clearSessionTimeoutTimers();
  removeSessionTimeoutWarning();

  if (!session?.authenticated || session.user?.role !== "doctor") {
    return;
  }

  const timeoutMs = getSessionTimeoutMs(session.user?.sessionTimeout);
  if (!Number.isFinite(timeoutMs)) {
    return;
  }

  sessionExpiresAt = Date.now() + timeoutMs;
  const warningLeadMs = timeoutMs <= 10 * 1000 ? 5 * 1000 : 60 * 1000;
  const warningDelay = Math.max(0, timeoutMs - warningLeadMs);

  sessionWarningTimer = window.setTimeout(() => {
    openSessionTimeoutWarning();
  }, warningDelay);

  sessionLogoutTimer = window.setTimeout(() => {
    performSessionTimeoutLogout();
  }, timeoutMs);
};

const registerSessionActivityTracking = () => {
  if (sessionActivityTrackingRegistered) return;
  sessionActivityTrackingRegistered = true;
  const activityEvents = ["click", "keydown", "mousedown", "touchstart", "scroll"];

  activityEvents.forEach((eventName) => {
    window.addEventListener(
      eventName,
      () => {
        const currentSession = getDoctorSession();
        if (!currentSession?.authenticated || currentSession.user?.role !== "doctor") return;
        if (isSessionTimeoutWarningOpen()) return;
        scheduleSessionTimeout(currentSession);
      },
      { passive: true }
    );
  });
};

const requestDoctorProfile = async () => {
  return requestDoctorJson("/auth/profile");
};

const requestDoctorJson = async (path, options = {}) => {
  const session = await ensureFreshDoctorSession();

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const makeRequest = async (token) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(!isFormData && options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });

  let response = await makeRequest(session.token);

  if (response.status === 401) {
    const refreshedSession = await requestDoctorSessionRefresh();
    response = await makeRequest(refreshedSession.token);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Doctor request failed.");
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
};

const requestDoctorBlob = async (path, options = {}) => {
  const session = await ensureFreshDoctorSession();

  const normalizedPath = String(path || "").trim();
  const apiOrigin = API_BASE_URL.replace(/\/api\/?$/i, "");
  const requestUrl = /^https?:/i.test(normalizedPath)
    ? normalizedPath
    : normalizedPath.startsWith("/api/")
      ? `${apiOrigin}${normalizedPath}`
      : `${API_BASE_URL}${normalizedPath}`;

  const makeRequest = async (token) =>
    fetch(requestUrl, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

  let response = await makeRequest(session.token);

  if (response.status === 401) {
    const refreshedSession = await requestDoctorSessionRefresh();
    response = await makeRequest(refreshedSession.token);
  }

  if (!response.ok) {
    let message = "Unable to load this attachment.";
    try {
      const data = await response.json();
      message = data?.message || message;
    } catch (error) {
      // Ignore JSON parse failures for binary responses.
    }

    const requestError = new Error(message);
    requestError.status = response.status;
    throw requestError;
  }

  return response.blob();
};

const revokeDoctorAttachmentBlobUrl = () => {
  if (activeDoctorAttachmentBlobUrl) {
    URL.revokeObjectURL(activeDoctorAttachmentBlobUrl);
    activeDoctorAttachmentBlobUrl = "";
  }
};

const openDoctorSupportAttachment = async (url, mode = "open", fileName = "attachment") => {
  try {
    const blob = await requestDoctorBlob(url);
    revokeDoctorAttachmentBlobUrl();
    activeDoctorAttachmentBlobUrl = URL.createObjectURL(blob);

    if (mode === "download") {
      const anchor = document.createElement("a");
      anchor.href = activeDoctorAttachmentBlobUrl;
      anchor.download = fileName || "attachment";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(revokeDoctorAttachmentBlobUrl, 1000);
      return;
    }

    window.open(activeDoctorAttachmentBlobUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    showNoufarToast?.(error?.message || "Unable to open this attachment.", "danger");
  }
};

const openDoctorStatePopup = (options) => {
  const existing = document.getElementById("doctor-state-modal");
  if (existing) existing.remove();

  const modal = document.createElement("section");
  modal.className = "modal-shell";
  modal.id = "doctor-state-modal";
  modal.setAttribute("aria-labelledby", "doctor-state-title");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("role", "dialog");
  const isDeleted = options.variant === "deleted";
  const blockedReason = options.reason || "No block reason was provided.";
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-card modal-card-support doctor-state-card doctor-state-card-rich${isDeleted ? " doctor-state-card-deleted" : ""}">
      <div class="modal-card-head">
        <div class="doctor-state-head">
          <div class="doctor-state-lock${isDeleted ? " doctor-state-lock-deleted" : ""}" aria-hidden="true">
            ${
              isDeleted
                ? `<img src="${BLOCKED_ACCOUNT_ICON_URL}" alt="" />`
                : '<svg viewBox="0 0 24 24"><path d="M8 10V7.5A4 4 0 0 1 16 7.5V10" /><rect x="6.5" y="10" width="11" height="9" rx="2.2" /><path d="M12 13.2v2.8" /></svg>'
            }
          </div>
          <div>
            <h2 id="doctor-state-title">${options.title}</h2>
          </div>
        </div>
      </div>
      <p class="doctor-state-intro">${options.message}</p>
      <div class="doctor-state-reason doctor-state-reason-rich${isDeleted ? " doctor-state-reason-deleted" : ""}">
        <strong>Reason</strong>
        <p>${escapeNotificationHtml(isDeleted ? blockedReason : options.reason || "No reason was provided by the admin.")}</p>
      </div>
      <div class="doctor-state-support-rich${isDeleted ? " doctor-state-support-deleted" : ""}">
        <div class="doctor-state-support-icon${isDeleted ? " doctor-state-support-icon-deleted" : ""}" aria-hidden="true">${isDeleted ? "!" : "i"}</div>
        <p>${
          isDeleted
            ? "If you believe this is a mistake, contact support and request an account unblock review."
            : 'If you have any questions or need assistance, please contact our support team: <a href="mailto:noufar.cdss@gmail.com">noufar.cdss@gmail.com</a>'
        }</p>
      </div>
      <div class="doctor-state-note-rich${isDeleted ? " doctor-state-note-deleted" : ""}">
        <div class="doctor-state-note-icon${isDeleted ? " doctor-state-note-icon-deleted" : ""}" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 7.5h16v9H4z" />
            <path d="m5 8 7 5 7-5" />
          </svg>
        </div>
        <p>${isDeleted ? "Use the support form to send an unblock request directly to the admin team." : "Once your account is reactivated, you will receive an email notification."}</p>
      </div>
      <div class="account-modal-actions doctor-state-actions">
        ${isDeleted ? '<button class="btn btn-secondary btn-sm" type="button" id="doctor-state-contact-support">Contact support</button>' : ""}
        <button class="btn btn-primary btn-sm${isDeleted ? " btn-danger-surface" : ""}" type="button" id="doctor-state-understood">Understood</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";

  modal.querySelector("#doctor-state-understood")?.addEventListener("click", () => {
    clearDoctorSession();
    document.body.style.overflow = "";
    window.location.href = "index.html";
  });

  modal.querySelector("#doctor-state-contact-support")?.addEventListener("click", () => {
    const params = new URLSearchParams({
      support: "unlock",
      name: options.name || doctorSession?.user?.name || "",
      email: options.email || doctorSession?.user?.email || "",
      institution: options.institution || doctorSession?.user?.hospital || "",
      reason: blockedReason,
    });
    clearDoctorSession();
    document.body.style.overflow = "";
    window.location.href = `index.html?${params.toString()}#support`;
  });
};

const requireDoctorSession = () => {
  const session = getDoctorSession();

  if (!session?.authenticated || !session?.token) {
    window.location.href = "index.html";
    return null;
  }

  if (session.user?.role === "admin") {
    window.location.href = "admin-doctor-management/index.html";
    return null;
  }

  return session;
};

const applyDoctorAccessMode = (session) => {
  const accountType = getDoctorAccountType(session);
  const canRunPredictions = doctorCanRunPredictions(session);
  const currentPage = getCurrentPageName();
  const restrictedPages = new Set([
    "dashboard.html",
    "new-prediction.html",
    "history.html",
    "prediction-details.html",
    "dataset-selection.html",
    "my-imports.html",
  ]);

  if (document.body) {
    document.body.dataset.doctorAccountType = accountType;
  }

  if (supportAccessUpgradeShell) {
    const shouldShowAccessUpgrade = accountType === "standard";
    supportAccessUpgradeShell.hidden = !shouldShowAccessUpgrade;
    supportAccessUpgradeShell.toggleAttribute("hidden", !shouldShowAccessUpgrade);
    supportAccessUpgradeShell.style.display = shouldShowAccessUpgrade ? "" : "none";
  }

  document.querySelectorAll('option[value="Access upgrade request"]').forEach((option) => {
    option.hidden = accountType !== "standard";
    option.disabled = accountType !== "standard";
  });

  document
    .querySelectorAll(
      '.sidebar-link[href="dashboard.html"], .sidebar-link[href="new-prediction.html"], .sidebar-link[href="history.html"], .profile-menu-link[href="history.html"]'
        + ', .profile-menu-link[href="my-imports.html"]'
    )
    .forEach((node) => {
      const shouldHide = !canRunPredictions;
      node.hidden = shouldHide;
      node.toggleAttribute("hidden", shouldHide);
      node.style.display = shouldHide ? "none" : "";
    });

  if (!canRunPredictions && restrictedPages.has(currentPage)) {
    window.location.href = "patients.html";
  }
};

let doctorSession = requireDoctorSession();

if (doctorSession) {
  applyDoctorAccessMode(doctorSession);
}

if (doctorSession?.token) {
  requestDoctorProfile()
    .then((profile) => {
      if (profile?.role === "doctor" && profile?.accountStatus === "Deleted") {
        openDoctorStatePopup({
          title: "Your account has been blocked",
          message: "Your account has been blocked by the administrator.",
          reason: profile?.deletionReason,
          name: profile?.name,
          email: profile?.email,
          institution: profile?.hospital,
          variant: "deleted",
        });
        return;
      }

      if (profile?.role === "doctor" && profile?.accountStatus !== "Active") {
        openDoctorStatePopup({
          title: "Your account is currently deactivated",
          message: "Your account is currently deactivated.",
          reason: profile?.deactivationReason,
          variant: "deactivated",
        });
        return;
      }

      const refreshedSession = {
        ...doctorSession,
        user: {
          ...doctorSession.user,
          ...profile,
        },
      };
      setDoctorSession(refreshedSession);
      doctorSession = refreshedSession;
      applyDoctorAccessMode(refreshedSession);
      scheduleSessionTimeout(doctorSession);
    })
    .catch((error) => {
      if (error.status === 403 && error.payload?.code === "ACCOUNT_DEACTIVATED") {
        openDoctorStatePopup({
          title: "Your account is currently deactivated",
          message: "Your access to the platform is currently disabled.",
          reason: error.payload?.reason,
          variant: "deactivated",
        });
        return;
      }

      if (error.status === 403 && error.payload?.code === "ACCOUNT_DELETED") {
        openDoctorStatePopup({
          title: "Your account has been blocked",
          message: "Your account has been blocked by the administrator.",
          reason: error.payload?.reason,
          name: error.payload?.doctorName || doctorSession?.user?.name,
          email: error.payload?.email || doctorSession?.user?.email,
          institution: error.payload?.institution || doctorSession?.user?.hospital,
          variant: "deleted",
        });
        return;
      }

      if (error.status === 401 || error.status === 403) {
        clearDoctorSession();
        window.location.href = "index.html";
      }
    });
}

window.NoufarDoctorSessionBridge = {
  getSession: getDoctorSession,
  setSession: setDoctorSession,
  clearSession: clearDoctorSession,
  persistSessionFromPayload: persistDoctorSessionFromPayload,
  ensureFreshSession: ensureFreshDoctorSession,
  refreshSession: requestDoctorSessionRefresh,
  requestJson: requestDoctorJson,
  requestBlob: requestDoctorBlob,
  logout: logoutDoctorSession,
};

window.addEventListener("noufar:doctor-session-updated", (event) => {
  const nextSession = event.detail || null;
  const previousToken = doctorSession?.token || "";
  doctorSession = nextSession;
  if (!nextSession?.token) {
    stopDoctorRealtimeStream();
    return;
  }
  if (previousToken && previousToken !== nextSession.token) {
    stopDoctorRealtimeStream();
    startDoctorRealtimeStream().catch(() => {});
  }
});

if (doctorSession?.user) {
  hideDoctorSupportCenterProfileLink();

  const formatDoctorDisplayName = (rawName) => {
    const name = String(rawName || "").trim();
    if (!name) return "Dr. Doctor";
    if (/^dr\.?\s+/i.test(name)) return name.replace(/^dr\.?\s+/i, "Dr. ");
    return `Dr. ${name}`;
  };

  const applyDoctorIdentity = (sessionUser) => {
    const initials = sessionUser.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "DR";

    document.querySelectorAll(".profile-trigger-avatar, .profile-menu-avatar").forEach((node) => {
      const profilePhoto = sessionUser.profilePhoto || "";
      node.style.backgroundImage = profilePhoto ? `url("${profilePhoto}")` : "";
      node.style.backgroundSize = profilePhoto ? "cover" : "";
      node.style.backgroundPosition = profilePhoto ? "center" : "";
      node.textContent = profilePhoto ? "" : initials;
    });

    const profileName = document.querySelector(".profile-menu-copy strong");
    const profileMeta = document.querySelector(".profile-menu-copy span");
    const profileCopy = document.querySelector(".profile-menu-copy");
    const accountTypeLabel =
      (sessionUser.doctorAccountType || "prediction") === "standard"
        ? "Standard doctor"
        : "Doctor with prediction";

    if (profileName) profileName.textContent = formatDoctorDisplayName(sessionUser.name);
    if (profileMeta) profileMeta.textContent = sessionUser.specialty || sessionUser.hospital || "Doctor account";

    if (profileCopy) {
      let badge = profileCopy.querySelector(".profile-access-badge");
      if (!badge) {
        badge = document.createElement("span");
        profileCopy.appendChild(badge);
      }
      const isPrediction = (sessionUser.doctorAccountType || "prediction") !== "standard";
      badge.className = "profile-access-badge" + (isPrediction ? " badge-prediction" : "");
      badge.textContent = accountTypeLabel;
    }
  };

  applyDoctorIdentity(doctorSession.user);

  window.addEventListener("noufar:doctor-session-updated", (event) => {
    const nextSession = event.detail || getDoctorSession();
    if (!nextSession?.user) return;
    doctorSession = nextSession;
    applyDoctorAccessMode(nextSession);
    applyDoctorIdentity(nextSession.user);
    scheduleSessionTimeout(nextSession);
  });
}

if (doctorSession?.authenticated && doctorSession.user?.role === "doctor") {
  scheduleSessionTimeout(doctorSession);
  registerSessionActivityTracking();
}

const escapeNotificationHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getInboxPriorityClass = (priority) => {
  const p = String(priority || "").toLowerCase();
  if (p === "urgent") return "inbox-tag-red";
  if (p === "high") return "inbox-tag-orange";
  if (p === "routine" || p === "low") return "inbox-tag-blue";
  return "";
};

const getInboxStatusClass = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "open") return "inbox-tag-green";
  if (s === "closed" || s === "resolved") return "inbox-tag-gray";
  if (s === "in progress" || s === "in_progress") return "inbox-tag-purple";
  return "";
};

window.showNoufarToast = (message, variant = "success") => {
  let stack = document.getElementById("noufar-toast-stack");

  if (!stack) {
    stack = document.createElement("div");
    stack.id = "noufar-toast-stack";
    stack.className = "noufar-toast-stack";
    document.body.appendChild(stack);
  }

  const toast = document.createElement("div");
  toast.className = `noufar-toast ${variant}`;
  toast.textContent = message;
  stack.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
    if (!stack.childElementCount) {
      stack.remove();
    }
  }, 3200);
};

const getDoctorNotificationItems = () =>
  doctorNotificationsCache
    .filter((notification) => notification.targetType === "support-ticket")
    .map((notification) => ({
      notificationId: notification.id,
      ticketId: notification.targetId,
      subject: notification.title,
      category: notification.metadata?.category || "Support",
      priority: notification.metadata?.priority || "Routine",
      status: notification.metadata?.status || "Open",
      unread: !notification.isRead,
      repliedAt: notification.createdAt,
      reply: notification.message,
    }))
    .sort((left, right) => new Date(right.repliedAt) - new Date(left.repliedAt));

const fetchDoctorSupportThreads = async () => {
  const tickets = await requestDoctorJson("/support/tickets/mine");
  doctorSupportThreadsCache = Array.isArray(tickets) ? tickets : [];
  return doctorSupportThreadsCache;
};

const fetchDoctorNotifications = async () => {
  const notifications = await requestDoctorJson("/notifications");
  doctorNotificationsCache = Array.isArray(notifications) ? notifications : [];
  return doctorNotificationsCache;
};

const doctorNeedsSupportThreads = () =>
  document.body?.dataset.page === "doctor-inbox" || Boolean(activeSupportConversationId);

const refreshDoctorNotificationSurface = () => {
  renderNotificationButtonState();
  if (notificationPanel && !notificationPanel.hidden) {
    renderNotificationPanel();
  }
};

const refreshDoctorRealtimeState = async ({ focusTicketId = null } = {}) => {
  const refreshTasks = [fetchDoctorNotifications()];
  const shouldRefreshThreads = doctorNeedsSupportThreads();

  if (shouldRefreshThreads) {
    refreshTasks.unshift(fetchDoctorSupportThreads());
  }

  await Promise.allSettled(refreshTasks);

  refreshDoctorNotificationSurface();

  if (shouldRefreshThreads && document.body?.dataset.page === "doctor-inbox") {
    if (focusTicketId && doctorSupportThreadsCache.some((ticket) => ticket.id === focusTicketId)) {
      activeDoctorInboxTicketId = focusTicketId;
    } else if (
      activeDoctorInboxTicketId &&
      !doctorSupportThreadsCache.some((ticket) => ticket.id === activeDoctorInboxTicketId)
    ) {
      activeDoctorInboxTicketId = doctorSupportThreadsCache[0]?.id || null;
    }

    renderDoctorInbox();
  }

  if (activeSupportConversationId) {
    const activeModalTicket = doctorSupportThreadsCache.find(
      (ticket) => ticket.id === activeSupportConversationId
    );

    if (activeModalTicket) {
      await openDoctorSupportConversation(activeSupportConversationId).catch(() => {});
    } else {
      closeDoctorSupportConversation();
    }
  }
};

const runDoctorRealtimeRefresh = async () => {
  if (doctorRealtimeRefreshInFlight) {
    doctorRealtimeRefreshQueued = true;
    return;
  }

  doctorRealtimeRefreshInFlight = true;

  try {
    const focusTicketId = doctorRealtimeFocusTicketId;
    doctorRealtimeFocusTicketId = null;
    await refreshDoctorRealtimeState({ focusTicketId });
  } finally {
    doctorRealtimeRefreshInFlight = false;

    if (doctorRealtimeRefreshQueued) {
      doctorRealtimeRefreshQueued = false;
      runDoctorRealtimeRefresh().catch(() => {});
    }
  }
};

const scheduleDoctorRealtimeRefresh = ({ focusTicketId = null } = {}) => {
  if (focusTicketId) {
    doctorRealtimeFocusTicketId = focusTicketId;
  }

  if (doctorRealtimeRefreshTimer) {
    clearTimeout(doctorRealtimeRefreshTimer);
  }

  doctorRealtimeRefreshTimer = setTimeout(() => {
    doctorRealtimeRefreshTimer = null;
    runDoctorRealtimeRefresh().catch(() => {});
  }, 250);
};

const stopDoctorRealtimeStream = () => {
  doctorRealtimeConnected = false;
  doctorRealtimeSource?.close();
  doctorRealtimeSource = null;
};

const startDoctorRealtimeStream = async () => {
  if (doctorRealtimeSource || typeof EventSource === "undefined") {
    return;
  }

  let session = doctorSession;
  try {
    session = await ensureFreshDoctorSession();
  } catch (error) {
    return;
  }

  if (!session?.token) {
    return;
  }

  const streamUrl = `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(
    session.token
  )}`;
  doctorRealtimeSource = new EventSource(streamUrl);
  doctorRealtimeSource.addEventListener("open", () => {
    doctorRealtimeConnected = true;
  });

  doctorRealtimeSource.addEventListener("notification:new", () => {
    scheduleDoctorRealtimeRefresh();
  });

  doctorRealtimeSource.addEventListener("support:ticket-updated", (event) => {
    let payload = null;

    try {
      payload = JSON.parse(event.data || "{}");
    } catch (error) {
      payload = null;
    }

    scheduleDoctorRealtimeRefresh({
      focusTicketId: payload?.ticketId || null,
    });
  });

  doctorRealtimeSource.addEventListener("error", () => {
    doctorRealtimeConnected = false;
    stopDoctorRealtimeStream();
    if (!doctorSession?.token) return;
    requestDoctorSessionRefresh()
      .then(() => {
        startDoctorRealtimeStream().catch(() => {});
      })
      .catch(() => {
        clearDoctorSession();
      });
  });
};

const openDoctorNotificationTarget = async (notificationId) => {
  const response = await requestDoctorJson(`/notifications/${notificationId}/open`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  if (response?.notification) {
    doctorNotificationsCache = doctorNotificationsCache.map((notification) =>
      notification.id === response.notification.id ? response.notification : notification
    );
  }

  return response?.target || null;
};

const syncDoctorInboxLocation = (ticketId) => {
  if (document.body?.dataset.page !== "doctor-inbox") return;
  const nextUrl = new URL(window.location.href);
  if (ticketId) {
    nextUrl.searchParams.set("ticket", ticketId);
  } else {
    nextUrl.searchParams.delete("ticket");
  }
  window.history.replaceState({}, "", nextUrl.toString());
};

const formatDoctorTicketMeta = (ticket) =>
  [ticket.category, ticket.priority, ticket.status].filter(Boolean).join(" - ");

const formatSupportFileSize = (size) => {
  const fileSize = Number(size || 0);
  if (!fileSize) return "";
  if (fileSize < 1024) return `${fileSize} B`;
  if (fileSize < 1024 * 1024) return `${(fileSize / 1024).toFixed(1)} KB`;
  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
};

const getSupportMessagePreviewText = (message) =>
  String(message?.body || "").trim() ||
  (message?.attachment?.originalName
    ? `Shared file: ${message.attachment.originalName}`
    : "No messages yet.");

const buildSupportAttachmentMarkup = (attachment, senderRole) => {
  if (!attachment?.downloadUrl && !attachment?.fileUrl && !attachment?.filePath) return "";

  const fileUrl = attachment.downloadUrl || attachment.fileUrl || attachment.filePath;
  const fileName = attachment.originalName || attachment.fileName || "Attachment";
  const metaParts = [
    attachment.mimeType ? attachment.mimeType.split("/").pop()?.toUpperCase() : "",
    formatSupportFileSize(attachment.fileSize),
  ].filter(Boolean);

  return `
    <div class="support-attachment-card support-attachment-card-${senderRole}">
      <div class="support-attachment-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M8.5 12.5v-5a3.5 3.5 0 1 1 7 0v8a5 5 0 1 1-10 0V8.8" />
        </svg>
      </div>
      <div class="support-attachment-copy">
        <strong>${escapeNotificationHtml(fileName)}</strong>
        ${
          metaParts.length
            ? `<span>${escapeNotificationHtml(metaParts.join(" • "))}</span>`
            : ""
        }
      </div>
      <div class="support-attachment-actions">
        <button
          class="support-attachment-action support-attachment-action-open"
          type="button"
          data-support-attachment-open="${escapeNotificationHtml(fileUrl)}"
          data-support-attachment-name="${escapeNotificationHtml(fileName)}"
          aria-label="Open file"
          title="Open file"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 3.5h5.5L19 9v10.5A1.5 1.5 0 0 1 17.5 21h-9A1.5 1.5 0 0 1 7 19.5v-14A1.5 1.5 0 0 1 8.5 4h4.5" />
            <path d="M13 4v5h5" />
            <path d="M10 13h4" />
            <path d="M10 16h4" />
          </svg>
        </button>
        <button
          class="support-attachment-action support-attachment-action-download"
          type="button"
          data-support-attachment-download="${escapeNotificationHtml(fileUrl)}"
          data-support-attachment-name="${escapeNotificationHtml(fileName)}"
          aria-label="Download file"
          title="Download file"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4v10" />
            <path d="m8 10 4 4 4-4" />
            <path d="M5 19h14" />
          </svg>
        </button>
      </div>
    </div>
  `;
};

const buildSupportReplyFormData = ({ text, file }) => {
  const formData = new FormData();
  if (text) formData.append("body", text);
  if (file) formData.append("attachment", file);
  return formData;
};

const syncSupportReplyComposerState = (root, options = {}) => {
  if (!root) return;

  const input = root.querySelector(options.textSelector || "[data-doctor-inbox-reply]");
  const fileInput = root.querySelector(options.fileSelector || "[data-doctor-inbox-file]");
  const submitButton = root.querySelector(options.submitSelector || "[data-doctor-inbox-submit]");
  const attachmentBar = root.querySelector(options.attachmentBarSelector || "[data-doctor-inbox-attachment-bar]");
  const attachmentName = root.querySelector(options.attachmentNameSelector || "[data-doctor-inbox-attachment-name]");

  if (!input || !fileInput || !submitButton) return;

  const selectedFile = fileInput.files?.[0] || null;
  const canSend = Boolean(input.value.trim() || selectedFile);

  submitButton.classList.toggle("is-hidden", !canSend);
  submitButton.disabled = !canSend;

  if (attachmentBar) attachmentBar.hidden = !selectedFile;
  if (attachmentName) {
    attachmentName.textContent = selectedFile ? selectedFile.name : "";
  }
};

const clearSupportReplyAttachment = (root, options = {}) => {
  const fileInput = root?.querySelector(options.fileSelector || "[data-doctor-inbox-file]");
  if (!fileInput) return;
  fileInput.value = "";
  syncSupportReplyComposerState(root, options);
};

const buildDoctorMessageAvatarMarkup = (message) => {
  const senderName = message.senderName || "Support";
  const senderInitial = escapeNotificationHtml(senderName.trim().charAt(0).toUpperCase() || "S");
  const doctorPhoto = doctorSession?.user?.profilePhoto || "";

  if (message.senderRole === "admin") {
    return `
      <span
        class="message-bubble-avatar has-photo is-admin-avatar"
        aria-hidden="true"
        data-message-avatar-photo="${encodeURIComponent(ADMIN_SUPPORT_AVATAR_URL)}"
      ></span>
    `;
  }

  if (message.senderRole === "doctor" && doctorPhoto) {
    return `
      <span
        class="message-bubble-avatar has-photo"
        aria-hidden="true"
        data-message-avatar-photo="${encodeURIComponent(doctorPhoto)}"
      ></span>
    `;
  }

  return `<span class="message-bubble-avatar" aria-hidden="true">${senderInitial}</span>`;
};

const replaceDoctorTicketInCache = (nextTicket) => {
  doctorSupportThreadsCache = doctorSupportThreadsCache.map((ticket) =>
    ticket.id === nextTicket.id ? nextTicket : ticket
  );
};

const removeDoctorTicketsFromCache = (ticketIds = []) => {
  const blockedIds = new Set(ticketIds.map((value) => String(value)));
  doctorSupportThreadsCache = doctorSupportThreadsCache.filter((ticket) => !blockedIds.has(String(ticket.id)));
};

const createDoctorThreadModal = () => {
  let modal = document.getElementById("doctor-thread-modal");
  if (modal) return modal;

  modal = document.createElement("section");
  modal.className = "modal-shell";
  modal.id = "doctor-thread-modal";
  modal.hidden = true;
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("role", "dialog");
  modal.innerHTML = `
    <div class="modal-backdrop" data-doctor-thread-modal-close></div>
    <div class="modal-card modal-card-support doctor-thread-modal-card">
      <div class="modal-card-head doctor-thread-modal-head">
        <div class="doctor-thread-modal-copy">
          <span class="doctor-thread-modal-kicker">Support thread</span>
          <h2 id="doctor-thread-modal-title">Thread update</h2>
          <p id="doctor-thread-modal-message">This conversation has been updated.</p>
        </div>
        <button class="modal-close-button" type="button" aria-label="Close thread message" data-doctor-thread-modal-close>
          <span></span>
          <span></span>
        </button>
      </div>
      <div class="doctor-thread-modal-actions" id="doctor-thread-modal-actions"></div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
};

const openDoctorThreadDialog = ({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  showCancel = true,
  variant = "danger",
}) =>
  new Promise((resolve) => {
    const modal = createDoctorThreadModal();
    const titleNode = modal.querySelector("#doctor-thread-modal-title");
    const messageNode = modal.querySelector("#doctor-thread-modal-message");
    const actionsNode = modal.querySelector("#doctor-thread-modal-actions");
    const cardNode = modal.querySelector(".doctor-thread-modal-card");

    titleNode.textContent = title;
    messageNode.textContent = message;
    cardNode.classList.toggle("is-danger", variant === "danger");
    cardNode.classList.toggle("is-warning", variant === "warning");
    actionsNode.innerHTML = `
      ${showCancel ? `<button class="btn btn-secondary btn-sm" type="button" data-doctor-thread-modal-cancel>${cancelLabel}</button>` : ""}
      <button class="btn btn-primary btn-sm${variant === "danger" ? " btn-danger-surface" : ""}" type="button" data-doctor-thread-modal-confirm>${confirmLabel}</button>
    `;

    modal.hidden = false;
    document.body.style.overflow = "hidden";

    const close = (result) => {
      modal.hidden = true;
      document.body.style.overflow = "";
      resolve(result);
    };

    modal.querySelectorAll("[data-doctor-thread-modal-close], [data-doctor-thread-modal-cancel]").forEach((node) => {
      node.addEventListener(
        "click",
        () => {
          close(false);
        },
        { once: true }
      );
    });

    modal.querySelector("[data-doctor-thread-modal-confirm]")?.addEventListener(
      "click",
      () => {
        close(true);
      },
      { once: true }
    );
  });

const confirmDoctorThreadDeletion = (message) =>
  openDoctorThreadDialog({
    title: "Delete support thread",
    message,
    confirmLabel: "Delete thread",
    cancelLabel: "Keep thread",
    showCancel: true,
    variant: "danger",
  });

const showDoctorThreadUnavailablePopup = (message) =>
  openDoctorThreadDialog({
    title: "Thread no longer available",
    message,
    confirmLabel: "Understood",
    showCancel: false,
    variant: "danger",
  });

const handleDoctorThreadUnavailableError = async (error, ticketId, statusNode = null) => {
  const isUnavailableError =
    error?.status === 410 &&
    (error?.payload?.code === "THREAD_DELETED_BY_ADMIN" ||
      error?.payload?.code === "THREAD_DELETED_BY_DOCTOR");

  if (!isUnavailableError) {
    return false;
  }

  removeDoctorTicketsFromCache([ticketId]);

  if (activeDoctorInboxTicketId === ticketId) {
    activeDoctorInboxTicketId = doctorSupportThreadsCache[0]?.id || null;
  }

  if (activeSupportConversationId === ticketId) {
    closeDoctorSupportConversation();
  }

  await fetchDoctorNotifications().catch(() => {});
  refreshDoctorNotificationSurface();
  renderDoctorInbox();

  if (statusNode) {
    statusNode.textContent = "";
    statusNode.className = "support-request-status";
  }

  await showDoctorThreadUnavailablePopup(error.message || "This thread is no longer available.");
  return true;
};

const deleteDoctorSupportThreads = async ({ ticketIds = [], deleteAll = false }) => {
  const response = await requestDoctorJson("/support/tickets", {
    method: "DELETE",
    body: JSON.stringify({ ticketIds, deleteAll }),
  });

  if (Array.isArray(response?.deletedIds)) {
    removeDoctorTicketsFromCache(response.deletedIds);
  } else if (deleteAll) {
    doctorSupportThreadsCache = [];
  }

  if (activeDoctorInboxTicketId && !doctorSupportThreadsCache.some((ticket) => ticket.id === activeDoctorInboxTicketId)) {
    activeDoctorInboxTicketId = doctorSupportThreadsCache[0]?.id || null;
  }

  await fetchDoctorNotifications().catch(() => {});
  renderNotificationButtonState();
  renderNotificationPanel();
  renderDoctorInbox();
  return response;
};

const deleteSingleDoctorSupportThread = async (ticketId) => {
  const response = await requestDoctorJson(`/support/tickets/${ticketId}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });

  removeDoctorTicketsFromCache([ticketId]);
  if (activeDoctorInboxTicketId === ticketId) {
    activeDoctorInboxTicketId = doctorSupportThreadsCache[0]?.id || null;
  }

  await fetchDoctorNotifications().catch(() => {});
  renderNotificationButtonState();
  renderNotificationPanel();
  renderDoctorInbox();
  return response;
};

const buildDoctorInboxConversationMarkup = (ticket) => {
  if (!ticket) {
    return `
      <div class="doctor-inbox-empty-state doctor-inbox-empty-state-detail">
        <strong>Select a conversation</strong>
        <p>Choose a support thread from your inbox to read the full exchange and continue the conversation.</p>
      </div>
    `;
  }

  return `
    <div class="doctor-inbox-conversation-head">
      <div class="doctor-inbox-conversation-summary">
        <span class="doctor-inbox-kicker">Support conversation</span>
        <h2>${escapeNotificationHtml(ticket.subject)}</h2>
        <div class="doctor-inbox-conversation-meta">
          <span>${escapeNotificationHtml(ticket.category)}</span>
          <span class="${getInboxPriorityClass(ticket.priority)}">${escapeNotificationHtml(ticket.priority)}</span>
          <span class="${getInboxStatusClass(ticket.status)}">${escapeNotificationHtml(ticket.status)}</span>
        </div>
      </div>
    </div>
    <div class="doctor-inbox-timeline-stamp">${escapeNotificationHtml(
      new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(
        new Date(ticket.updatedAt || ticket.createdAt || Date.now())
      )
    )}</div>
    <div class="doctor-inbox-message-list" data-doctor-inbox-message-list>
      ${buildDoctorSupportConversationMarkup(ticket)}
    </div>
    <form class="doctor-inbox-reply-form doctor-inbox-reply-shell" data-doctor-inbox-reply-form>
      <label class="field doctor-inbox-reply-field">
        <span>Reply to support</span>
        <textarea class="support-textarea" data-doctor-inbox-reply placeholder="Write your reply to the admin..."></textarea>
      </label>
      <div class="support-attachment-toolbar">
        <label class="support-attachment-trigger" aria-label="Attach file">
          <input type="file" data-doctor-inbox-file hidden />
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8.5 12.5v-5a3.5 3.5 0 1 1 7 0v8a5 5 0 1 1-10 0V8.8" />
          </svg>
          <span>Attach file</span>
        </label>
        <div class="support-attachment-selected" data-doctor-inbox-attachment-bar hidden>
          <span data-doctor-inbox-attachment-name></span>
          <button class="support-attachment-clear" type="button" data-doctor-inbox-file-clear>Remove</button>
        </div>
      </div>
      <p class="support-request-status" data-doctor-inbox-status aria-live="polite"></p>
      <div class="doctor-inbox-reply-actions">
        <span class="doctor-inbox-reply-hint">Press Enter to send, Shift + Enter for a new line.</span>
        <button class="btn btn-primary btn-sm is-hidden" type="submit" data-doctor-inbox-submit disabled>Send Reply</button>
      </div>
    </form>
  `;
};

const renderDoctorInbox = () => {
  const inboxRoot = document.querySelector("[data-doctor-inbox]");
  if (!inboxRoot) return;

  const listNode = inboxRoot.querySelector("[data-doctor-inbox-list]");
  const detailNode = inboxRoot.querySelector("[data-doctor-inbox-detail]");
  if (!listNode || !detailNode) return;

  const tickets = [...doctorSupportThreadsCache].sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  const selectedTicket =
    tickets.find((ticket) => ticket.id === activeDoctorInboxTicketId) || tickets[0] || null;

  activeDoctorInboxTicketId = selectedTicket?.id || null;
  syncDoctorInboxLocation(activeDoctorInboxTicketId);

  if (!tickets.length) {
    listNode.innerHTML = `
      <div class="doctor-inbox-empty-state">
        <strong>No support conversations yet</strong>
        <p>Send your first support request to start a conversation with the admin team.</p>
      </div>
    `;
    detailNode.innerHTML = buildDoctorInboxConversationMarkup(null);
    return;
  }

  listNode.innerHTML = `
    <div class="doctor-inbox-thread-toolbar">
      <div class="doctor-inbox-thread-toolbar-top">
        <div class="doctor-inbox-thread-toolbar-copy">
          <span class="doctor-inbox-thread-toolbar-label">Mailbox controls</span>
          <p>Select the threads you want to clean up, or keep browsing the latest support activity.</p>
        </div>
      </div>
      <div class="doctor-inbox-thread-toolbar-bottom">
        <label class="message-select-control doctor-thread-select-all">
          <input type="checkbox" data-doctor-thread-select-all />
          <span>Select all</span>
        </label>
        <div class="doctor-inbox-thread-toolbar-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-doctor-thread-delete-selected>Delete selected</button>
          <button class="btn btn-secondary btn-sm" type="button" data-doctor-thread-delete-all>Delete all</button>
        </div>
      </div>
    </div>
    <div class="doctor-inbox-thread-stack">
    ${tickets
    .map((ticket) => {
      const latestMessage = ticket.messages?.[ticket.messages.length - 1];
      const latestLabel = latestMessage?.createdAt
        ? new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(latestMessage.createdAt))
        : "";

      return `
        <article
          class="doctor-inbox-thread${ticket.id === activeDoctorInboxTicketId ? " is-active" : ""}${ticket.unreadByDoctor ? " is-unread" : ""}"
          data-doctor-inbox-ticket="${escapeNotificationHtml(ticket.id)}"
        >
          <div class="doctor-inbox-thread-head">
            <div class="doctor-inbox-thread-head-main">
              <label class="message-select-control doctor-inbox-thread-select">
                <input type="checkbox" value="${escapeNotificationHtml(ticket.id)}" data-doctor-thread-select />
                <span>Select</span>
              </label>
              <div class="doctor-inbox-thread-copy">
                <strong>${escapeNotificationHtml(ticket.subject)}</strong>
                <p>${escapeNotificationHtml(getSupportMessagePreviewText(latestMessage))}</p>
              </div>
            </div>
            <div class="doctor-inbox-thread-head-meta">
              ${ticket.unreadByDoctor ? '<span class="doctor-inbox-thread-unread-dot" aria-hidden="true"></span>' : ""}
              <time>${escapeNotificationHtml(latestLabel)}</time>
            </div>
          </div>
          <div class="doctor-inbox-thread-footer">
            <div class="doctor-inbox-thread-meta">
              <span>${escapeNotificationHtml(ticket.category)}</span>
              <span class="${getInboxPriorityClass(ticket.priority)}">${escapeNotificationHtml(ticket.priority)}</span>
              <span class="${getInboxStatusClass(ticket.status)}">${escapeNotificationHtml(ticket.status)}</span>
            </div>
            <div class="doctor-inbox-thread-card-actions">
              <button class="icon-button doctor-thread-delete-button" type="button" data-doctor-thread-delete="${escapeNotificationHtml(ticket.id)}" aria-label="Delete support thread">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 7h14M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-8 0 1 11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-11M10 11.5v4.5M14 11.5v4.5" />
                </svg>
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("")}
    </div>
  `;

  detailNode.innerHTML = buildDoctorInboxConversationMarkup(selectedTicket);
  syncSupportReplyComposerState(detailNode);
  detailNode.querySelectorAll("[data-message-avatar-photo]").forEach((node) => {
    const photo = node.getAttribute("data-message-avatar-photo");
    if (!photo) return;
    node.style.backgroundImage = `url("${decodeURIComponent(photo)}")`;
    node.style.backgroundSize = "cover";
    node.style.backgroundPosition = "center";
    node.style.backgroundRepeat = "no-repeat";
  });
  const messageList = detailNode.querySelector("[data-doctor-inbox-message-list]");
  if (messageList) {
    requestAnimationFrame(() => {
      messageList.scrollTop = messageList.scrollHeight;
    });
  }
};

const selectDoctorInboxTicket = async (ticketId, options = {}) => {
  const { markRead = true } = options;

  if (!doctorSupportThreadsCache.length) {
    await fetchDoctorSupportThreads();
  }

  activeDoctorInboxTicketId = ticketId;

  if (markRead) {
    const ticket = doctorSupportThreadsCache.find((entry) => entry.id === ticketId);
    if (ticket?.unreadByDoctor) {
      await requestDoctorJson("/support/tickets/mine/read", {
        method: "PATCH",
        body: JSON.stringify({}),
      }).catch(() => {});
      await Promise.all([fetchDoctorSupportThreads(), fetchDoctorNotifications().catch(() => doctorNotificationsCache)]);
      renderNotificationButtonState();
      renderNotificationPanel();
    }
  }

  renderDoctorInbox();
};

const initializeDoctorInboxPage = async () => {
  if (document.body?.dataset.page !== "doctor-inbox") return;

  await Promise.all([fetchDoctorSupportThreads(), fetchDoctorNotifications().catch(() => doctorNotificationsCache)]);
  renderNotificationButtonState();
  renderNotificationPanel();

  const params = new URLSearchParams(window.location.search);
  const requestedTicketId = params.get("ticket");
  const initialTicketId = requestedTicketId || doctorSupportThreadsCache[0]?.id || null;

  if (initialTicketId) {
    await selectDoctorInboxTicket(initialTicketId);
  } else {
    renderDoctorInbox();
  }

  const inboxRoot = document.querySelector("[data-doctor-inbox]");
  if (!inboxRoot) return;

  inboxRoot.addEventListener("click", async (event) => {
    if (event.target.closest("[data-doctor-thread-select]") || event.target.closest("[data-doctor-thread-select-all]")) {
      return;
    }

    const deleteThreadButton = event.target.closest("[data-doctor-thread-delete]");
    if (deleteThreadButton) {
      event.preventDefault();
      const confirmed = await confirmDoctorThreadDeletion(
        "Delete this thread from your inbox? The admin will still keep their side until they try to reply."
      );
      if (!confirmed) return;
      try {
        await deleteSingleDoctorSupportThread(deleteThreadButton.dataset.doctorThreadDelete);
      } catch (error) {
        const statusNode = inboxRoot.querySelector("[data-doctor-inbox-status]");
        if (statusNode) {
          statusNode.textContent = error.message || "Unable to delete this support thread right now.";
          statusNode.className = "support-request-status is-error";
        }
      }
      return;
    }

    const deleteSelectedButton = event.target.closest("[data-doctor-thread-delete-selected]");
    if (deleteSelectedButton) {
      event.preventDefault();
      const selectedTicketIds = Array.from(inboxRoot.querySelectorAll("[data-doctor-thread-select]:checked")).map(
        (input) => input.value
      );
      const statusNode = inboxRoot.querySelector("[data-doctor-inbox-status]");
      if (!selectedTicketIds.length) {
        if (statusNode) {
          statusNode.textContent = "Select at least one support thread to delete.";
          statusNode.className = "support-request-status is-error";
        }
        return;
      }

      const confirmed = await confirmDoctorThreadDeletion(
        `Delete ${selectedTicketIds.length} selected thread${selectedTicketIds.length === 1 ? "" : "s"} from your inbox?`
      );
      if (!confirmed) return;

      try {
        await deleteDoctorSupportThreads({ ticketIds: selectedTicketIds });
      } catch (error) {
        if (statusNode) {
          statusNode.textContent = error.message || "Unable to delete selected support threads right now.";
          statusNode.className = "support-request-status is-error";
        }
      }
      return;
    }

    const deleteAllButton = event.target.closest("[data-doctor-thread-delete-all]");
    if (deleteAllButton) {
      event.preventDefault();
      const confirmed = await confirmDoctorThreadDeletion(
        "Delete all support threads from your inbox? The admin will still keep their side until they try to reply."
      );
      if (!confirmed) return;
      try {
        await deleteDoctorSupportThreads({ deleteAll: true });
      } catch (error) {
        const statusNode = inboxRoot.querySelector("[data-doctor-inbox-status]");
        if (statusNode) {
          statusNode.textContent = error.message || "Unable to delete all support threads right now.";
          statusNode.className = "support-request-status is-error";
        }
      }
      return;
    }

    const ticketButton = event.target.closest("[data-doctor-inbox-ticket-open], [data-doctor-inbox-ticket]");
    if (ticketButton) {
      const nextTicketId =
        ticketButton.dataset.doctorInboxTicketOpen || ticketButton.dataset.doctorInboxTicket;
      await selectDoctorInboxTicket(nextTicketId);
      return;
    }

    const composeButton = event.target.closest("[data-doctor-inbox-compose]");
    if (composeButton) {
      event.preventDefault();
      document.querySelector('.profile-menu-link[href="index.html#support"]')?.click();
    }
  });

  inboxRoot.addEventListener("change", (event) => {
    const selectAll = event.target.closest("[data-doctor-thread-select-all]");
    if (selectAll) {
      inboxRoot
        .querySelectorAll("[data-doctor-thread-select]")
        .forEach((checkbox) => {
          checkbox.checked = selectAll.checked;
        });
    }
  });

  inboxRoot.addEventListener("input", (event) => {
    const replyInput = event.target.closest("[data-doctor-inbox-reply]");
    if (!replyInput) return;
    syncSupportReplyComposerState(replyInput.closest("[data-doctor-inbox-reply-form]"));
  });

  inboxRoot.addEventListener("change", (event) => {
    const fileInput = event.target.closest("[data-doctor-inbox-file]");
    if (!fileInput) return;
    syncSupportReplyComposerState(fileInput.closest("[data-doctor-inbox-reply-form]"));
  });

  inboxRoot.addEventListener("keydown", (event) => {
    const replyInput = event.target.closest("[data-doctor-inbox-reply]");
    if (!replyInput) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const replyForm = replyInput.closest("[data-doctor-inbox-reply-form]");
      const fileInput = replyForm?.querySelector("[data-doctor-inbox-file]");
      if (!replyInput.value.trim() && !(fileInput?.files?.length)) return;
      replyForm?.requestSubmit();
    }
  });

  inboxRoot.addEventListener("click", (event) => {
    const clearButton = event.target.closest("[data-doctor-inbox-file-clear]");
    if (!clearButton) return;
    event.preventDefault();
    clearSupportReplyAttachment(clearButton.closest("[data-doctor-inbox-reply-form]"));
  });

  inboxRoot.addEventListener("submit", async (event) => {
    const replyForm = event.target.closest("[data-doctor-inbox-reply-form]");
    if (!replyForm || !activeDoctorInboxTicketId) return;

    event.preventDefault();
    const replyInput = replyForm.querySelector("[data-doctor-inbox-reply]");
    const fileInput = replyForm.querySelector("[data-doctor-inbox-file]");
    const statusNode = replyForm.querySelector("[data-doctor-inbox-status]");
    const submitButton = replyForm.querySelector("[data-doctor-inbox-submit]");
    const replyBody = replyInput?.value.trim();
    const replyFile = fileInput?.files?.[0] || null;
    if (!replyBody && !replyFile) return;

    submitButton.disabled = true;
    submitButton.textContent = "Sending...";

    try {
      const payload = buildSupportReplyFormData({ text: replyBody, file: replyFile });
      const response = await requestDoctorJson(`/support/tickets/${activeDoctorInboxTicketId}/reply`, {
        method: "POST",
        body: payload,
      });

      if (response?.ticket) {
        replaceDoctorTicketInCache(response.ticket);
      }

      await fetchDoctorNotifications().catch(() => {});
      renderNotificationButtonState();
      renderNotificationPanel();
      statusNode.textContent = "Your reply has been sent successfully.";
      statusNode.className = "support-request-status is-success";
      renderDoctorInbox();
      if (replyInput) replyInput.value = "";
      clearSupportReplyAttachment(replyForm);
    } catch (error) {
      const handled = await handleDoctorThreadUnavailableError(
        error,
        activeDoctorInboxTicketId,
        statusNode
      );
      if (handled) {
        return;
      }
      statusNode.textContent = error.message || "Unable to send your reply right now.";
      statusNode.className = "support-request-status is-error";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send Reply";
      syncSupportReplyComposerState(replyForm);
    }
  });
};

let notificationPanel = null;
let activeNotificationToggle = null;
let doctorNotificationFilter = "all";

const closeNotificationPanel = () => {
  if (!notificationPanel) return;
  notificationPanel.hidden = true;
  notificationToggles.forEach((toggle) => toggle.setAttribute("aria-expanded", "false"));
  activeNotificationToggle = null;
};

const renderNotificationButtonState = () => {
  const unreadCount = doctorNotificationsCache.filter((item) => !item.isRead).length;

  if (
    previousDoctorUnreadNotificationCount !== null &&
    unreadCount > previousDoctorUnreadNotificationCount
  ) {
    playDoctorNotificationSound().catch(() => {});
  }
  previousDoctorUnreadNotificationCount = unreadCount;

  notificationToggles.forEach((toggle) => {
    const existingBadge = toggle.querySelector(".notification-badge");

    if (unreadCount <= 0) {
      if (existingBadge) {
        existingBadge.remove();
      }
      return;
    }

    const badge = existingBadge || document.createElement("span");
    if (!existingBadge) {
      badge.className = "notification-badge";
      toggle.appendChild(badge);
    }

    badge.hidden = false;
    badge.textContent = String(unreadCount);
    badge.setAttribute("data-count", String(unreadCount));
  });
};

const markAllDoctorNotificationsAsRead = async () => {
  await requestDoctorJson("/notifications/read-all", {
    method: "PATCH",
    body: JSON.stringify({}),
  });

  doctorNotificationsCache = doctorNotificationsCache.map((notification) => ({
    ...notification,
    isRead: true,
    readAt: notification.readAt || new Date().toISOString(),
  }));
};

const renderNotificationPanel = () => {
  if (!notificationPanel) return;

  const repliedThreads = getDoctorNotificationItems();

  const list = notificationPanel.querySelector("[data-notification-list]");
  const unreadThreads = repliedThreads.filter((thread) => thread.unread);
  const visibleThreads = doctorNotificationFilter === "unread" ? unreadThreads : repliedThreads;
  const allCountNode = notificationPanel.querySelector("[data-notification-count-all]");
  const unreadCountNode = notificationPanel.querySelector("[data-notification-count-unread]");
  const allTab = notificationPanel.querySelector('[data-notification-filter="all"]');
  const unreadTab = notificationPanel.querySelector('[data-notification-filter="unread"]');
  const markAllButton = notificationPanel.querySelector("[data-notification-mark-all]");

  if (allCountNode) allCountNode.textContent = String(repliedThreads.length);
  if (unreadCountNode) unreadCountNode.textContent = String(unreadThreads.length);
  if (allTab) allTab.classList.toggle("is-active", doctorNotificationFilter === "all");
  if (unreadTab) unreadTab.classList.toggle("is-active", doctorNotificationFilter === "unread");
  if (markAllButton) markAllButton.disabled = unreadThreads.length === 0;

  if (!repliedThreads.length) {
    list.innerHTML = `
      <div class="notification-empty-state">
        <strong>No support replies yet</strong>
        <p>When the NOUFAR support team replies to one of your requests, the update will appear here.</p>
      </div>
    `;
    return;
  }

  if (!visibleThreads.length) {
    list.innerHTML = `
      <div class="notification-empty-state">
        <strong>No unread notifications</strong>
        <p>All support replies have already been reviewed.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = visibleThreads
    .map((thread) => {
      const repliedLabel = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(thread.repliedAt));

      const priorityClass = String(thread.priority || "Routine").toLowerCase().replace(/\s+/g, "-");

      return `
        <button class="notification-item notification-open-button${thread.unread ? " is-unread" : ""}" type="button" data-notification-id="${escapeNotificationHtml(thread.notificationId)}" data-ticket-id="${escapeNotificationHtml(thread.ticketId)}">
          <span class="notification-item-rail" aria-hidden="true"></span>
          <div class="notification-item-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4.5 7.5A2.5 2.5 0 0 1 7 5h10a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 17 16H9l-4.5 3v-11.5Z"></path><path d="M8.5 9.5h7"></path><path d="M8.5 12.5h4.5"></path></svg>
          </div>
          <div class="notification-item-body">
            <div class="notification-item-head">
              <span class="notification-status-pill">Support reply</span>
              <time datetime="${escapeNotificationHtml(thread.repliedAt)}">${escapeNotificationHtml(repliedLabel)}</time>
            </div>
            <strong>Admin replied to your request</strong>
            <p>${escapeNotificationHtml(thread.subject)}</p>
            <span class="notification-meta">
              <span>${escapeNotificationHtml(thread.category)}</span>
              <span class="notification-meta-separator">&bull;</span>
              <span class="notification-priority notification-priority-${escapeNotificationHtml(priorityClass)}">${escapeNotificationHtml(thread.priority)}</span>
            </span>
          </div>
        </button>
      `;
    })
    .join("");
};

const positionNotificationPanel = () => {
  if (!notificationPanel || !activeNotificationToggle) return;

  const toggleBounds = activeNotificationToggle.getBoundingClientRect();
  const panelWidth = Math.min(560, window.innerWidth - 24);
  const left = Math.max(12, Math.min(toggleBounds.right - panelWidth, window.innerWidth - panelWidth - 12));
  const top = toggleBounds.bottom + 12;

  notificationPanel.style.width = `${panelWidth}px`;
  notificationPanel.style.left = `${left}px`;
  notificationPanel.style.top = `${top}px`;
};

let supportConversationModal = null;
let activeSupportConversationId = null;

const buildDoctorSupportConversationMarkup = (ticket) => {
  const messages = Array.isArray(ticket?.messages) ? ticket.messages : [];
  if (!messages.length) {
    return `<div class="notification-empty-state"><strong>No messages yet</strong><p>This conversation has no messages yet.</p></div>`;
  }

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );

  const dayKeyFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const dayLabelFormatter = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const startOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const formatDayLabel = (date) => {
    const day = startOfDay(date);
    if (day.getTime() === today.getTime()) return "Today";
    if (day.getTime() === yesterday.getTime()) return "Yesterday";
    return dayLabelFormatter.format(day);
  };

  let lastDayKey = null;
  const parts = [];

  sortedMessages.forEach((message) => {
    const createdDate = new Date(message.createdAt);
    const dayKey = dayKeyFormatter.format(createdDate);

    if (dayKey !== lastDayKey) {
      parts.push(`
        <div class="message-day-divider" role="separator" aria-label="${escapeNotificationHtml(formatDayLabel(createdDate))}">
          <span class="message-day-divider-pill">${escapeNotificationHtml(formatDayLabel(createdDate))}</span>
        </div>
      `);
      lastDayKey = dayKey;
    }

    const senderName = message.senderName || "Support";
    const messageTime = timeFormatter.format(createdDate);

    parts.push(`
      <article class="message-bubble ${message.senderRole === "admin" ? "admin" : "doctor"}">
        ${buildDoctorMessageAvatarMarkup(message)}
        <div class="message-bubble-card">
          <div class="message-bubble-head">
            <strong>${escapeNotificationHtml(senderName)}</strong>
            <time>${escapeNotificationHtml(messageTime)}</time>
          </div>
          ${message.body ? `<p>${escapeNotificationHtml(message.body)}</p>` : ""}
          ${buildSupportAttachmentMarkup(message.attachment, message.senderRole)}
        </div>
      </article>
    `);
  });

  return parts.join("");
};

const closeDoctorSupportConversation = () => {
  if (!supportConversationModal) return;
  supportConversationModal.hidden = true;
  activeSupportConversationId = null;
};

const openDoctorSupportConversation = async (ticketId) => {
  if (!supportConversationModal) return;

  if (!doctorSupportThreadsCache.length) {
    await fetchDoctorSupportThreads();
  }

  const ticket = doctorSupportThreadsCache.find((entry) => entry.id === ticketId);
  if (!ticket) {
    throw new Error("Support conversation not found.");
  }

  activeSupportConversationId = ticketId;
  supportConversationModal.querySelector("[data-support-thread-subject]").textContent = ticket.subject;
  supportConversationModal.querySelector("[data-support-thread-meta]").textContent = `${ticket.category} - ${ticket.priority} - ${ticket.status}`;
  supportConversationModal.querySelector("[data-support-thread-messages]").innerHTML = buildDoctorSupportConversationMarkup(ticket);
  supportConversationModal.querySelectorAll("[data-message-avatar-photo]").forEach((node) => {
    const photo = node.getAttribute("data-message-avatar-photo");
    if (!photo) return;
    node.style.backgroundImage = `url("${decodeURIComponent(photo)}")`;
    node.style.backgroundSize = "cover";
    node.style.backgroundPosition = "center";
    node.style.backgroundRepeat = "no-repeat";
  });
  supportConversationModal.querySelector("[data-support-thread-reply]").value = "";
  clearSupportReplyAttachment(supportConversationModal, {
    textSelector: "[data-support-thread-reply]",
    fileSelector: "[data-support-thread-file]",
    submitSelector: "[data-support-thread-submit]",
    attachmentBarSelector: "[data-support-thread-file-bar]",
    attachmentNameSelector: "[data-support-thread-file-name]",
  });
  const statusNode = supportConversationModal.querySelector("[data-support-thread-status]");
  statusNode.textContent = "";
  statusNode.className = "support-request-status";
  syncSupportReplyComposerState(supportConversationModal, {
    textSelector: "[data-support-thread-reply]",
    fileSelector: "[data-support-thread-file]",
    submitSelector: "[data-support-thread-submit]",
    attachmentBarSelector: "[data-support-thread-file-bar]",
    attachmentNameSelector: "[data-support-thread-file-name]",
  });
  supportConversationModal.hidden = false;

  const messagesBox = supportConversationModal.querySelector("[data-support-thread-messages]");
  requestAnimationFrame(() => {
    messagesBox.scrollTop = messagesBox.scrollHeight;
  });
};

if (notificationToggles.length) {
  document.addEventListener("pointerdown", armDoctorNotificationAudio, { once: true });
  document.addEventListener("keydown", armDoctorNotificationAudio, { once: true });

  notificationPanel = document.createElement("section");
  notificationPanel.className = "notification-panel";
  notificationPanel.hidden = true;
  notificationPanel.setAttribute("aria-label", "Support notifications");
  notificationPanel.innerHTML = `
    <div class="notification-panel-head">
      <div>
        <h2>Notifications</h2>
        <p>Support replies</p>
      </div>
      <button class="notification-close-button" type="button" aria-label="Close notifications" data-notification-close>
        <span></span>
        <span></span>
      </button>
    </div>
    <div class="notification-toolbar">
      <div class="notification-filter-tabs" role="tablist" aria-label="Notification filters">
        <button class="notification-filter-tab is-active" type="button" data-notification-filter="all">
          <span>All</span>
          <b data-notification-count-all>0</b>
        </button>
        <button class="notification-filter-tab" type="button" data-notification-filter="unread">
          <span>Unread</span>
          <b data-notification-count-unread>0</b>
        </button>
      </div>
      <button class="notification-mark-all" type="button" data-notification-mark-all>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5 8.2 17 20 6"></path></svg>
        <span>Mark all as read</span>
      </button>
    </div>
    <div class="notification-list" data-notification-list></div>
    <button class="notification-footer-link" type="button" data-notification-view-all>
      <span>View all notifications</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>
    </button>
  `;
  document.body.appendChild(notificationPanel);

  const closeButton = notificationPanel.querySelector("[data-notification-close]");
  if (closeButton) {
    closeButton.addEventListener("click", closeNotificationPanel);
  }

  notificationToggles.forEach((toggle) => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.classList.add("notification-button");

    toggle.addEventListener("click", async (event) => {
      event.preventDefault();

      if (!notificationPanel) return;

      const shouldOpen = notificationPanel.hidden || activeNotificationToggle !== toggle;
      if (!shouldOpen) {
        closeNotificationPanel();
        return;
      }

      activeNotificationToggle = toggle;
      try {
        await fetchDoctorNotifications();
      } catch (error) {
        const list = notificationPanel.querySelector("[data-notification-list]");
        if (list) {
          list.innerHTML = `
            <div class="notification-empty-state">
              <strong>Notifications unavailable</strong>
              <p>${escapeNotificationHtml(error.message || "We could not load support notifications right now.")}</p>
            </div>
          `;
        }
      }
      renderNotificationPanel();
      notificationPanel.hidden = false;
      notificationToggles.forEach((button) =>
        button.setAttribute("aria-expanded", String(button === toggle))
      );
      positionNotificationPanel();
    });
  });

  notificationPanel.addEventListener("click", async (event) => {
    const filterButton = event.target.closest("[data-notification-filter]");
    if (filterButton) {
      doctorNotificationFilter = filterButton.dataset.notificationFilter === "unread" ? "unread" : "all";
      renderNotificationPanel();
      return;
    }

    const markAllButton = event.target.closest("[data-notification-mark-all]");
    if (markAllButton) {
      try {
        await markAllDoctorNotificationsAsRead();
        renderNotificationButtonState();
        renderNotificationPanel();
      } catch (error) {
        const list = notificationPanel.querySelector("[data-notification-list]");
        if (list) {
          list.innerHTML = `
            <div class="notification-empty-state">
              <strong>Unable to update notifications</strong>
              <p>${escapeNotificationHtml(error.message || "We could not mark notifications as read right now.")}</p>
            </div>
          `;
        }
      }
      return;
    }

    const viewAllButton = event.target.closest("[data-notification-view-all]");
    if (viewAllButton) {
      window.location.href = "doctor-inbox.html";
      return;
    }

    const notificationButton = event.target.closest("[data-notification-id]");
    if (!notificationButton) return;

    try {
      const target = await openDoctorNotificationTarget(notificationButton.dataset.notificationId);
      await fetchDoctorNotifications();
      renderNotificationButtonState();
      renderNotificationPanel();

      if (target?.type === "support-ticket" && target.id) {
        window.location.href = `doctor-inbox.html?ticket=${encodeURIComponent(target.id)}`;
        closeNotificationPanel();
      }
    } catch (error) {
      const list = notificationPanel.querySelector("[data-notification-list]");
      if (list) {
        list.innerHTML = `
          <div class="notification-empty-state">
            <strong>Notification unavailable</strong>
            <p>${escapeNotificationHtml(error.message || "We could not open this notification right now.")}</p>
          </div>
        `;
      }
    }
  });

  document.addEventListener("click", (event) => {
    if (!notificationPanel || notificationPanel.hidden) return;
    if (notificationPanel.contains(event.target)) return;
    if ([...notificationToggles].some((toggle) => toggle.contains(event.target))) return;
    closeNotificationPanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !notificationPanel || notificationPanel.hidden) return;
    closeNotificationPanel();
  });

  window.addEventListener("resize", () => {
    if (!notificationPanel || notificationPanel.hidden) return;
    positionNotificationPanel();
  });

  renderNotificationButtonState();
  if (doctorSession?.token) {
    startDoctorRealtimeStream();
    fetchDoctorNotifications()
      .then(() => {
        renderNotificationButtonState();
        renderNotificationPanel();
      })
      .catch(() => {
        doctorNotificationsCache = [];
        renderNotificationButtonState();
      });

    if (!doctorNotificationPollingStarted) {
      doctorNotificationPollingStarted = true;
      window.setInterval(() => {
        if (document.hidden || doctorRealtimeConnected) return;
        const fallbackTasks = [fetchDoctorNotifications()];
        if (doctorNeedsSupportThreads()) {
          fallbackTasks.unshift(fetchDoctorSupportThreads());
        }
        Promise.allSettled(fallbackTasks).then(() => {
          refreshDoctorNotificationSurface();
          if (doctorNeedsSupportThreads() && document.body?.dataset.page === "doctor-inbox") {
            renderDoctorInbox();
          }
        });
      }, DOCTOR_FALLBACK_POLL_INTERVAL);
    }
  }
}

document.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-support-attachment-open]");
  if (openButton) {
    event.preventDefault();
    openDoctorSupportAttachment(
      openButton.getAttribute("data-support-attachment-open") || "",
      "open",
      openButton.getAttribute("data-support-attachment-name") || "attachment"
    );
    return;
  }

  const downloadButton = event.target.closest("[data-support-attachment-download]");
  if (downloadButton) {
    event.preventDefault();
    openDoctorSupportAttachment(
      downloadButton.getAttribute("data-support-attachment-download") || "",
      "download",
      downloadButton.getAttribute("data-support-attachment-name") || "attachment"
    );
  }
});

const ensureDoctorInboxNavigation = () => {
  const sidebarNav = document.querySelector(".sidebar-nav");
  if (sidebarNav && !sidebarNav.querySelector('a[href="history.html"]')) {
    const predictionsLink = document.createElement("a");
    predictionsLink.className = "sidebar-link";
    if (document.body?.dataset.page === "history") {
      predictionsLink.classList.add("active");
    }
    predictionsLink.href = "history.html";
    predictionsLink.dataset.label = "Predictions";
    predictionsLink.innerHTML = `
      <img class="sidebar-icon-image" src="assets/history.png" alt="" aria-hidden="true" />
      <span>Predictions</span>
    `;
    sidebarNav.appendChild(predictionsLink);
  }

  if (sidebarNav && !sidebarNav.querySelector('a[href="patients.html"]')) {
    const patientsLink = document.createElement("a");
    patientsLink.className = "sidebar-link";
    if (document.body?.dataset.page === "patients") {
      patientsLink.classList.add("active");
    }
    patientsLink.href = "patients.html";
    patientsLink.dataset.label = "Patients";
    patientsLink.innerHTML = `
      <img class="sidebar-icon-image" src="assets/pattients.png" alt="" aria-hidden="true" />
      <span>Patients</span>
    `;
    sidebarNav.appendChild(patientsLink);
  }

  if (sidebarNav && !sidebarNav.querySelector('a[href="doctor-inbox.html"]')) {
    const inboxLink = document.createElement("a");
    inboxLink.className = "sidebar-link";
    if (document.body?.dataset.page === "doctor-inbox") {
      inboxLink.classList.add("active");
    }
    inboxLink.href = "doctor-inbox.html";
    inboxLink.dataset.label = "Inbox";
    inboxLink.innerHTML = `
      <img class="sidebar-icon-image" src="assets/inbox.png" alt="" aria-hidden="true" />
      <span>Inbox</span>
    `;
    sidebarNav.appendChild(inboxLink);
  }

  if (sidebarNav) {
    const professionalOrder = [
      'a.sidebar-link[href="dashboard.html"]',
      'a.sidebar-link[href="patients.html"]',
      'a.sidebar-link[href="new-prediction.html"]',
      'a.sidebar-link[href="history.html"]',
      'a.sidebar-link[href="doctor-inbox.html"]',
    ];

    professionalOrder.forEach((selector) => {
      const link = sidebarNav.querySelector(selector);
      if (link) {
        sidebarNav.appendChild(link);
      }
    });
  }

  document.querySelectorAll(".profile-menu-links").forEach((menu) => {
    if (!menu.querySelector('a[href="my-imports.html"]')) {
      const importsLink = document.createElement("a");
      importsLink.className = "profile-menu-link";
      if (document.body?.dataset.page === "my-imports") {
        importsLink.classList.add("active");
      }
      importsLink.href = "my-imports.html";
      importsLink.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7c0-1.66 3.13-3 7-3s7 1.34 7 3-3.13 3-7 3-7-1.34-7-3Zm0 0v10c0 1.66 3.13 3 7 3s7-1.34 7-3V7M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" />
        </svg>
        <span>My imported data</span>
      `;
      const accountLink = menu.querySelector('a[href="account-settings.html"]');
      menu.insertBefore(importsLink, accountLink || null);
    }

    const importsLink = menu.querySelector('a[href="my-imports.html"]');
    if (importsLink) {
      const shouldHideImportsLink = !doctorCanRunPredictions(doctorSession);
      importsLink.hidden = shouldHideImportsLink;
      importsLink.toggleAttribute("hidden", shouldHideImportsLink);
      importsLink.style.display = shouldHideImportsLink ? "none" : "";
    }

    if (!menu.querySelector('a[href="doctor-inbox.html"]')) {
      const inboxLink = document.createElement("a");
      inboxLink.className = "profile-menu-link";
      inboxLink.href = "doctor-inbox.html";
      inboxLink.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Zm0 6.5h5l1.5 2h3L15 14h5" />
        </svg>
        <span>Support Inbox</span>
      `;
      menu.appendChild(inboxLink);
    }
  });
};

doctorLogoutLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    logoutDoctorSession("index.html").catch(() => {
      clearDoctorSession();
      window.location.href = "index.html";
    });
  });
});

sidebarLinks.forEach((link) => {
  if (link.dataset.label) return;
  const label = link.querySelector("span")?.textContent?.trim();
  if (label) {
    link.dataset.label = label;
  }
});

if (appLayout && sidebar && sidebarToggle) {
  const desktopMediaQuery = window.matchMedia("(max-width: 900px)");

  const applyDesktopSidebarState = () => {
    if (desktopMediaQuery.matches) {
      appLayout.classList.remove("sidebar-collapsed");
      sidebar.classList.remove("is-open");
      sidebarToggle.setAttribute("aria-expanded", "false");
      return;
    }

    const isCollapsed = window.localStorage.getItem(desktopSidebarStorageKey) === "true";
    appLayout.classList.toggle("sidebar-collapsed", isCollapsed);
    sidebarToggle.setAttribute("aria-expanded", String(!isCollapsed));
  };

  applyDesktopSidebarState();

  sidebarToggle.addEventListener("click", () => {
    if (desktopMediaQuery.matches) {
      const isOpen = sidebar.classList.toggle("is-open");
      sidebarToggle.setAttribute("aria-expanded", String(isOpen));
      return;
    }

    const shouldCollapse = !appLayout.classList.contains("sidebar-collapsed");
    appLayout.classList.toggle("sidebar-collapsed", shouldCollapse);
    window.localStorage.setItem(desktopSidebarStorageKey, String(shouldCollapse));
    sidebarToggle.setAttribute("aria-expanded", String(!shouldCollapse));
  });

  desktopMediaQuery.addEventListener("change", applyDesktopSidebarState);
}

if (supportTriggers.length) {
  const supportModal = document.createElement("section");
  supportModal.className = "modal-shell";
  supportModal.id = "support-request-modal";
  supportModal.hidden = true;
  supportModal.setAttribute("aria-labelledby", "support-request-title");
  supportModal.setAttribute("aria-modal", "true");
  supportModal.setAttribute("role", "dialog");
  supportModal.innerHTML = `
    <div class="modal-backdrop" data-support-close></div>
    <div class="modal-card modal-card-support">
      <div class="modal-card-head">
        <div>
          <h2 id="support-request-title">Contact Support Center</h2>
          <p>Share your workflow question and the NOUFAR CDSS support team will follow up securely.</p>
        </div>
        <button class="modal-close-button" type="button" aria-label="Close support form" data-support-close>
          <span></span>
          <span></span>
        </button>
      </div>
      <form class="account-modal-form support-request-form" id="support-request-form">
        <div class="support-request-grid">
          <label class="field">
            <span>Clinical contact</span>
            <input type="text" id="support-request-contact" readonly />
          </label>
          <label class="field">
            <span>Email address</span>
            <input type="email" id="support-request-email" readonly />
          </label>
        </div>
        <div class="support-request-grid">
          <label class="field">
            <span>Support category</span>
            <select id="support-request-category" required>
              <option value="">Select a category</option>
              <option value="Access upgrade request">Access upgrade request</option>
              <option value="Prediction workflow">Prediction workflow</option>
              <option value="Dataset import">Dataset import</option>
              <option value="Account settings">Account settings</option>
              <option value="Clinical dashboard">Clinical dashboard</option>
              <option value="Technical issue">Technical issue</option>
            </select>
          </label>
          <label class="field">
            <span>Priority level</span>
            <select id="support-request-priority" required>
              <option value="">Select priority</option>
              <option value="Routine">Routine</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span>Subject</span>
          <input type="text" placeholder="Briefly describe your request" required />
        </label>
        <label class="field">
          <span>Message</span>
          <textarea class="support-textarea" placeholder="Describe the issue, the page involved, and the support you need."></textarea>
        </label>
        <div class="support-attachment-toolbar">
          <label class="support-attachment-trigger" aria-label="Attach file">
            <input type="file" id="support-request-file" hidden />
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8.5 12.5v-5a3.5 3.5 0 1 1 7 0v8a5 5 0 1 1-10 0V8.8" />
            </svg>
            <span>Attach file</span>
          </label>
        <div class="support-attachment-selected" id="support-request-file-bar" hidden>
          <span id="support-request-file-name"></span>
          <button class="support-attachment-clear" type="button" id="support-request-file-clear">Remove</button>
        </div>
        </div>
        <p class="support-request-status" id="support-request-status" aria-live="polite"></p>
        <div class="account-modal-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-support-close>Cancel</button>
          <button class="btn btn-primary btn-sm" type="submit" id="support-submit-button">Send Request</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(supportModal);

  supportConversationModal = document.createElement("section");
  supportConversationModal.className = "modal-shell";
  supportConversationModal.id = "support-conversation-modal";
  supportConversationModal.hidden = true;
  supportConversationModal.setAttribute("aria-modal", "true");
  supportConversationModal.setAttribute("role", "dialog");
  supportConversationModal.innerHTML = `
    <div class="modal-backdrop" data-support-thread-close></div>
    <div class="modal-card modal-card-support">
      <div class="modal-card-head">
        <div>
          <h2 data-support-thread-subject>Support conversation</h2>
          <p data-support-thread-meta>Ticket details</p>
        </div>
        <button class="modal-close-button" type="button" aria-label="Close support conversation" data-support-thread-close>
          <span></span>
          <span></span>
        </button>
      </div>
      <div class="conversation conversation-shell" data-support-thread-messages></div>
      <form class="account-modal-form" data-support-thread-form>
        <label class="field">
          <span>Reply</span>
          <textarea class="support-textarea" data-support-thread-reply placeholder="Write your reply to the admin..."></textarea>
        </label>
        <div class="support-attachment-toolbar">
          <label class="support-attachment-trigger" aria-label="Attach file">
            <input type="file" data-support-thread-file hidden />
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8.5 12.5v-5a3.5 3.5 0 1 1 7 0v8a5 5 0 1 1-10 0V8.8" />
            </svg>
            <span>Attach file</span>
          </label>
          <div class="support-attachment-selected" data-support-thread-file-bar hidden>
            <span data-support-thread-file-name></span>
            <button class="support-attachment-clear" type="button" data-support-thread-file-clear>Remove</button>
          </div>
        </div>
        <p class="support-request-status" data-support-thread-status aria-live="polite"></p>
        <div class="account-modal-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-support-thread-close>Close</button>
          <button class="btn btn-primary btn-sm" type="submit" data-support-thread-submit>Send Reply</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(supportConversationModal);

  const supportForm = supportModal.querySelector("#support-request-form");
  const supportStatus = supportModal.querySelector("#support-request-status");
  const supportSubmitButton = supportModal.querySelector("#support-submit-button");
  const supportClosers = supportModal.querySelectorAll("[data-support-close]");
  const supportContactInput = supportModal.querySelector("#support-request-contact");
  const supportEmailInput = supportModal.querySelector("#support-request-email");
  const supportCategoryInput = supportModal.querySelector("#support-request-category");
  const supportPriorityInput = supportModal.querySelector("#support-request-priority");
  const supportFileInput = supportModal.querySelector("#support-request-file");
  const supportMessageInput = supportModal.querySelector('.support-textarea');

  const syncSupportIdentity = () => {
    const sessionUser = getDoctorSession()?.user || doctorSession?.user || {};
    if (supportContactInput) supportContactInput.value = sessionUser.name || "Doctor account";
    if (supportEmailInput) supportEmailInput.value = sessionUser.email || "";
    if (supportAccessUpgradeShell) {
      const shouldShowAccessUpgrade = getDoctorAccountType(sessionUser) === "standard";
      supportAccessUpgradeShell.hidden = !shouldShowAccessUpgrade;
      supportAccessUpgradeShell.toggleAttribute("hidden", !shouldShowAccessUpgrade);
      supportAccessUpgradeShell.style.display = shouldShowAccessUpgrade ? "" : "none";
    }
    if (supportCategoryInput) {
      const upgradeOption = supportCategoryInput.querySelector('option[value="Access upgrade request"]');
      const shouldShowUpgradeOption = getDoctorAccountType(sessionUser) === "standard";
      if (upgradeOption) {
        upgradeOption.hidden = !shouldShowUpgradeOption;
        upgradeOption.disabled = !shouldShowUpgradeOption;
      }
      if (!shouldShowUpgradeOption && supportCategoryInput.value === "Access upgrade request") {
        supportCategoryInput.value = "";
      }
    }
  };

  syncSupportIdentity();

  const closeSupportModal = () => {
    supportModal.hidden = true;
  };

  const openSupportModal = (preset = {}) => {
    supportModal.hidden = false;
    if (supportStatus) {
      supportStatus.textContent = "";
      supportStatus.className = "support-request-status";
    }
    syncSupportIdentity();
    const subjectInput = supportForm?.querySelector('input[placeholder="Briefly describe your request"]');
    if (supportCategoryInput && preset.category) {
      supportCategoryInput.value = preset.category;
    } else if (supportCategoryInput) {
      supportCategoryInput.value = "";
    }
    if (supportPriorityInput && preset.priority) {
      supportPriorityInput.value = preset.priority;
    } else if (supportPriorityInput) {
      supportPriorityInput.value = "";
    }
    if (subjectInput && preset.subject) {
      subjectInput.value = preset.subject;
    } else if (subjectInput) {
      subjectInput.value = "";
    }
    if (supportMessageInput && preset.message) {
      supportMessageInput.value = preset.message;
    } else if (supportMessageInput) {
      supportMessageInput.value = "";
    }
    if (supportFileInput) {
      supportFileInput.value = "";
    }
    syncSupportRequestAttachmentState();
    supportMessageInput?.focus();
  };

  window.openNoufarSupportModal = (preset = {}) => {
    openSupportModal(preset);
  };

  const syncSupportRequestAttachmentState = () => {
    const selectedFile = supportFileInput?.files?.[0] || null;
    const attachmentBar = supportModal.querySelector("#support-request-file-bar");
    const attachmentName = supportModal.querySelector("#support-request-file-name");
    if (attachmentBar) attachmentBar.hidden = !selectedFile;
    if (attachmentName) {
      attachmentName.textContent = selectedFile ? selectedFile.name : "No file attached";
    }
  };

  supportFileInput?.addEventListener("change", syncSupportRequestAttachmentState);
  supportModal
    .querySelector("#support-request-file-clear")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      if (supportFileInput) supportFileInput.value = "";
      syncSupportRequestAttachmentState();
    });

  supportTriggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      if (profileMenu && !profileMenu.hidden) {
        profileMenu.hidden = true;
        if (profileToggle) profileToggle.setAttribute("aria-expanded", "false");
      }
      openSupportModal();
    });
  });

  supportAccessUpgradeTrigger?.addEventListener("click", (event) => {
    event.preventDefault();
    openSupportModal({
      category: "Access upgrade request",
      priority: "High",
      subject: "Request upgrade to Doctor with prediction",
      message:
        "Hello admin, I would like to request an upgrade from Standard doctor to Doctor with prediction so I can run medical predictions in addition to managing patient clinical entries.",
    });
  });

  supportClosers.forEach((closer) => {
    closer.addEventListener("click", closeSupportModal);
  });

  supportConversationModal.querySelectorAll("[data-support-thread-close]").forEach((closer) => {
    closer.addEventListener("click", closeDoctorSupportConversation);
  });

  supportConversationModal
    .querySelector("[data-support-thread-reply]")
    ?.addEventListener("input", () => {
      syncSupportReplyComposerState(supportConversationModal, {
        textSelector: "[data-support-thread-reply]",
        fileSelector: "[data-support-thread-file]",
        submitSelector: "[data-support-thread-submit]",
        attachmentBarSelector: "[data-support-thread-file-bar]",
        attachmentNameSelector: "[data-support-thread-file-name]",
      });
    });

  supportConversationModal
    .querySelector("[data-support-thread-file]")
    ?.addEventListener("change", () => {
      syncSupportReplyComposerState(supportConversationModal, {
        textSelector: "[data-support-thread-reply]",
        fileSelector: "[data-support-thread-file]",
        submitSelector: "[data-support-thread-submit]",
        attachmentBarSelector: "[data-support-thread-file-bar]",
        attachmentNameSelector: "[data-support-thread-file-name]",
      });
    });

  supportConversationModal
    .querySelector("[data-support-thread-file-clear]")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      clearSupportReplyAttachment(supportConversationModal, {
        textSelector: "[data-support-thread-reply]",
        fileSelector: "[data-support-thread-file]",
        submitSelector: "[data-support-thread-submit]",
        attachmentBarSelector: "[data-support-thread-file-bar]",
        attachmentNameSelector: "[data-support-thread-file-name]",
      });
    });

  supportConversationModal
    .querySelector("[data-support-thread-form]")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!activeSupportConversationId) return;

      const replyInput = supportConversationModal.querySelector("[data-support-thread-reply]");
      const fileInput = supportConversationModal.querySelector("[data-support-thread-file]");
      const replyStatus = supportConversationModal.querySelector("[data-support-thread-status]");
      const replySubmit = supportConversationModal.querySelector("[data-support-thread-submit]");
      const replyBody = replyInput.value.trim();
      const replyFile = fileInput?.files?.[0] || null;

      if (!replyBody && !replyFile) return;

      replySubmit.disabled = true;
      replySubmit.textContent = "Sending...";

      try {
        const payload = buildSupportReplyFormData({ text: replyBody, file: replyFile });
        const response = await requestDoctorJson(`/support/tickets/${activeSupportConversationId}/reply`, {
          method: "POST",
          body: payload,
        });

        if (response?.ticket) {
          doctorSupportThreadsCache = doctorSupportThreadsCache.map((ticket) =>
            ticket.id === response.ticket.id ? response.ticket : ticket
          );
          await fetchDoctorNotifications().catch(() => {});
          renderNotificationButtonState();
          renderNotificationPanel();
          await openDoctorSupportConversation(response.ticket.id);
        }

        replyInput.value = "";
        clearSupportReplyAttachment(supportConversationModal, {
          textSelector: "[data-support-thread-reply]",
          fileSelector: "[data-support-thread-file]",
          submitSelector: "[data-support-thread-submit]",
          attachmentBarSelector: "[data-support-thread-file-bar]",
          attachmentNameSelector: "[data-support-thread-file-name]",
        });
        replyStatus.textContent = "Your reply has been sent successfully.";
        replyStatus.className = "support-request-status is-success";
      } catch (error) {
        const handled = await handleDoctorThreadUnavailableError(
          error,
          activeSupportConversationId,
          replyStatus
        );
        if (handled) {
          return;
        }
        replyStatus.textContent = error.message || "Unable to send your reply right now.";
        replyStatus.className = "support-request-status is-error";
      } finally {
        replySubmit.disabled = false;
        replySubmit.textContent = "Send Reply";
        syncSupportReplyComposerState(supportConversationModal, {
          textSelector: "[data-support-thread-reply]",
          fileSelector: "[data-support-thread-file]",
          submitSelector: "[data-support-thread-submit]",
          attachmentBarSelector: "[data-support-thread-file-bar]",
          attachmentNameSelector: "[data-support-thread-file-name]",
        });
      }
    });

  if (supportForm) {
    supportForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!supportForm.reportValidity()) return;

      const supportCategory = supportCategoryInput?.value || "Support";
      const supportPriority = supportPriorityInput?.value || "Routine";
      const supportSubject = supportForm.querySelector('input[placeholder="Briefly describe your request"]')?.value.trim() || "Support request";
      const supportMessage =
        supportForm.querySelector('.support-textarea')?.value.trim() || "No additional details provided.";
      const supportFile = supportFileInput?.files?.[0] || null;

      if (supportSubmitButton) {
        supportSubmitButton.textContent = "Sending...";
        supportSubmitButton.disabled = true;
      }

      try {
        const payload = new FormData();
        payload.append("category", supportCategory);
        payload.append("priority", supportPriority);
        payload.append("subject", supportSubject);
        payload.append("message", supportMessage);
        if (supportFile) {
          payload.append("attachment", supportFile);
        }

        const response = await requestDoctorJson("/support/tickets", {
          method: "POST",
          body: payload,
        });

        if (response?.ticket) {
          doctorSupportThreadsCache = [
            response.ticket,
            ...doctorSupportThreadsCache.filter((ticket) => ticket.id !== response.ticket.id),
          ];
        }
        renderNotificationButtonState();
        renderNotificationPanel();

        if (supportStatus) {
          supportStatus.textContent = "Your message has been sent successfully.";
          supportStatus.className = "support-request-status is-success";
        }

        if (supportSubmitButton) {
          supportSubmitButton.textContent = "Request Sent";
        }

        window.setTimeout(() => {
          supportForm.reset();
          syncSupportIdentity();
          if (supportSubmitButton) {
            supportSubmitButton.textContent = "Send Request";
            supportSubmitButton.disabled = false;
          }
          if (supportFileInput) {
            supportFileInput.value = "";
          }
          syncSupportRequestAttachmentState();
          closeSupportModal();
        }, 1200);
      } catch (error) {
        if (supportStatus) {
          supportStatus.textContent = error.message || "Unable to send your support request right now.";
          supportStatus.className = "support-request-status is-error";
        }
        if (supportSubmitButton) {
          supportSubmitButton.textContent = "Send Request";
          supportSubmitButton.disabled = false;
        }
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!supportModal.hidden) closeSupportModal();
    if (supportConversationModal && !supportConversationModal.hidden) closeDoctorSupportConversation();
  });
}

if (comingSoonModal && comingSoonTriggers.length) {
  const closeComingSoonModal = () => {
    comingSoonModal.hidden = true;
  };

  const openComingSoonModal = (moduleName) => {
    if (comingSoonTitle) {
      comingSoonTitle.textContent = `${moduleName} Module`;
    }

    if (comingSoonCopy) {
      comingSoonCopy.textContent = `${moduleName} is coming soon in NOUFAR CDSS. Stay tuned for the next workspace update.`;
    }

    comingSoonModal.hidden = false;
  };

  comingSoonTriggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      openComingSoonModal(trigger.dataset.comingSoonTrigger || trigger.textContent.trim() || "Module");
    });
  });

  comingSoonClosers.forEach((closer) => {
    closer.addEventListener("click", closeComingSoonModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || comingSoonModal.hidden) return;
    closeComingSoonModal();
  });
}

ensureDoctorInboxNavigation();
initializeDoctorInboxPage().catch(() => {});

if (profileToggle && profileMenu) {
  const closeProfileMenu = () => {
    profileMenu.hidden = true;
    profileToggle.setAttribute("aria-expanded", "false");
  };

  const openProfileMenu = () => {
    profileMenu.hidden = false;
    profileToggle.setAttribute("aria-expanded", "true");
  };

  profileToggle.addEventListener("click", () => {
    if (profileMenu.hidden) {
      openProfileMenu();
      return;
    }

    closeProfileMenu();
  });

  document.addEventListener("click", (event) => {
    if (profileMenu.hidden) return;
    if (profileMenu.contains(event.target) || profileToggle.contains(event.target)) return;
    closeProfileMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeProfileMenu();
  });
}

// ── Scroll to top button ──────────────────────────────
const scrollTopBtn = document.createElement("button");
scrollTopBtn.className = "scroll-top-btn";
scrollTopBtn.setAttribute("aria-label", "Scroll to top");
scrollTopBtn.setAttribute("title", "Back to top");
scrollTopBtn.innerHTML = `<img src="assets/up.png" alt="" class="scroll-top-img"/>`;
document.body.appendChild(scrollTopBtn);

window.addEventListener("scroll", () => {
  if (window.scrollY > 300) {
    scrollTopBtn.classList.add("visible");
  } else {
    scrollTopBtn.classList.remove("visible");
  }
}, { passive: true });

scrollTopBtn.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
