(function () {
  const STORAGE_KEY = "noufar-admin-dashboard-state-v1";
  const AUTH_KEY = "noufar-admin-auth-v1";
  const UI_KEY = "noufar-admin-ui-v1";
  const API_BASE_URL = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
  const ADMIN_SUPPORT_AVATAR_URL = "../assets/Admin profileee.png";
  const DEFAULT_SYSTEM_MODEL = "Logistic Regression";
  const DEFAULT_SELECTION_POLICY = "manual";
  const SYSTEM_MODEL_OPTIONS = [
    {
      key: "logistic_regression",
      label: "Logistic Regression",
      description: "Fast linear baseline for structured relapse scoring."
    },
    {
      key: "random_forest",
      label: "Random Forest",
      description: "Tree-based ensemble that captures non-linear feature patterns."
    },
    {
      key: "deep_neural_network",
      label: "Deep Neural Network",
      description: "High-capacity model for complex signal interactions in the review layer."
    }
  ];
  const SECURITY_EVENT_ACTION_OPTIONS = [
    "",
    "auth.login.success",
    "auth.login.failed",
    "auth.login.account_locked",
    "auth.login.2fa_challenge_issued",
    "auth.login.2fa_success",
    "auth.login.2fa_failed",
    "auth.login.2fa_account_locked",
    "auth.refresh",
    "auth.refresh_failed",
    "auth.logout",
    "auth.logout_failed",
    "auth.password_reset.request",
    "auth.password_reset.request_failed",
    "auth.password_reset.complete",
    "auth.password_reset.complete_failed",
    "admin.create_additional_admin",
    "admin.create_additional_admin_failed",
    "doctor_account.approve",
    "doctor_account.approve_failed",
    "doctor_account.reject",
    "doctor_account.reject_failed",
    "doctor_account.deactivate",
    "doctor_account.deactivate_failed",
    "doctor_account.activate",
    "doctor_account.activate_failed",
    "doctor_account.delete",
    "doctor_account.delete_failed",
    "doctor_document.download",
    "doctor_document.download_failed",
    "support_attachment.download",
    "support_attachment.download_failed",
    "dataset_import.create",
    "dataset_import.create_failed",
    "dataset_import.delete",
    "dataset_import.delete_failed",
    "doctor_directory.export",
    "doctor_directory.export_failed",
    "security_events.export",
    "security_events.export_failed"
  ];
  const SECURITY_EVENT_TARGET_TYPE_OPTIONS = [
    "",
    "account",
    "session",
    "admin-account",
    "doctor-account",
    "doctor-document",
    "support-attachment",
    "dataset-import",
    "doctor-directory",
    "audit-log-report"
  ];
  const seed = window.NoufarAdminSeed || { doctors: [], tickets: [], predictions: [], auditLog: [], registrationSeries: [] };
  let state = loadState();
  let pendingConfirmation = null;
  let adminUi = loadUiState();
  let adminNotificationsCache = [];
  let previousUnreadNotificationCount = null;
  let adminNotificationPollingStarted = false;
  let adminNotificationAudioArmed = false;
  let adminNotificationAudio = null;
  let activeNotificationTab = "approval";
  let adminRealtimeSource = null;
  let adminRealtimeConnected = false;
  const ADMIN_FALLBACK_POLL_INTERVAL = 15000;
  let adminRealtimeRefreshTimer = null;
  let adminRealtimeRefreshInFlight = false;
  let adminRealtimeRefreshQueued = false;
  let lastAdminRealtimeToken = "";
  let activeDocumentPreviewBlobUrl = "";
  let activeAdminAttachmentBlobUrl = "";
  let systemPredictionsCache = [];
  let systemModelOptionsCache = SYSTEM_MODEL_OPTIONS.map((option) => ({ ...option, deployed: option.key === "logistic_regression" }));
  let createAdminSubmissionInFlight = false;
  let adminRefreshPromise = null;
  const ADMIN_REFRESH_SKEW_MS = 60 * 1000;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return clone(seed);
      const parsed = JSON.parse(saved);
      return {
        doctors: parsed.doctors || clone(seed.doctors),
        predictions: parsed.predictions || clone(seed.predictions || []),
        tickets: clone(seed.tickets),
        auditLog: parsed.auditLog || clone(seed.auditLog),
        registrationSeries: clone(seed.registrationSeries),
        readNotifications: []
      };
    } catch (error) {
      return {
        doctors: clone(seed.doctors),
        predictions: clone(seed.predictions || []),
        tickets: clone(seed.tickets),
        auditLog: clone(seed.auditLog),
        registrationSeries: clone(seed.registrationSeries),
        readNotifications: []
      };
    }
  }

  function persistState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        predictions: state.predictions || [],
        tickets: [],
        readNotifications: [],
      })
    );
    document.dispatchEvent(new CustomEvent("noufar-admin-state-updated"));
  }

  function loadUiState() {
    try {
      const saved = localStorage.getItem(UI_KEY);
      const parsed = saved ? JSON.parse(saved) : {};
      const selectedModel = SYSTEM_MODEL_OPTIONS.some((option) => option.label === parsed.systemModel)
        ? parsed.systemModel
        : DEFAULT_SYSTEM_MODEL;
      return {
        sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
        systemModel: selectedModel,
        predictionSelectionPolicy:
          parsed.predictionSelectionPolicy === "auto_by_completeness"
            ? "auto_by_completeness"
            : DEFAULT_SELECTION_POLICY,
      };
    } catch (error) {
      return {
        sidebarCollapsed: false,
        systemModel: DEFAULT_SYSTEM_MODEL,
        predictionSelectionPolicy: DEFAULT_SELECTION_POLICY,
      };
    }
  }

  function persistUiState() {
    localStorage.setItem(UI_KEY, JSON.stringify(adminUi));
  }

  function getAuthSession() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function setAuthSession(session) {
    if (!session) {
      localStorage.removeItem(AUTH_KEY);
    } else {
      localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    }

    window.dispatchEvent(
      new CustomEvent("noufar:admin-session-updated", {
        detail: session,
      })
    );
  }

  function persistAuthSession(payload) {
    const existing = getAuthSession();
    const session = {
      authenticated: true,
      token: payload.accessToken || payload.token || existing?.token || "",
      accessToken: payload.accessToken || payload.token || existing?.accessToken || existing?.token || "",
      refreshToken: payload.refreshToken || existing?.refreshToken || "",
      sessionId: payload.sessionId || existing?.sessionId || "",
      accessTokenExpiresAt: payload.accessTokenExpiresAt || existing?.accessTokenExpiresAt || "",
      refreshTokenExpiresAt: payload.refreshTokenExpiresAt || existing?.refreshTokenExpiresAt || "",
      user: {
        ...(existing?.user || {}),
        _id: payload._id ?? payload.user?._id ?? existing?.user?._id,
        name: payload.name ?? payload.user?.name ?? existing?.user?.name,
        email: payload.email ?? payload.user?.email ?? existing?.user?.email,
        role: payload.role ?? payload.user?.role ?? existing?.user?.role,
        specialty: payload.specialty ?? payload.user?.specialty ?? existing?.user?.specialty,
        hospital: payload.hospital ?? payload.user?.hospital ?? existing?.user?.hospital,
        approvalStatus: payload.approvalStatus ?? payload.user?.approvalStatus ?? existing?.user?.approvalStatus,
      },
      loggedAt: existing?.loggedAt || new Date().toISOString()
    };

    setAuthSession(session);
    return session;
  }

  async function requestAdminSessionRefresh() {
    if (adminRefreshPromise) {
      return adminRefreshPromise;
    }

    adminRefreshPromise = (async () => {
      const session = getAuthSession();
      const refreshToken = session?.refreshToken;

      if (!refreshToken) {
        setAuthSession(null);
        throw new Error("Admin refresh token is missing.");
      }

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setAuthSession(null);
        const error = new Error(data.message || "Unable to refresh your admin session.");
        error.status = response.status;
        error.payload = data;
        throw error;
      }

      return persistAuthSession(data);
    })();

    try {
      return await adminRefreshPromise;
    } finally {
      adminRefreshPromise = null;
    }
  }

  async function ensureFreshAdminSession() {
    const session = getAuthSession();

    if (!session?.authenticated || !session?.token) {
      throw new Error("Admin session token is missing");
    }

    const expiresAt = Date.parse(session.accessTokenExpiresAt || "");
    if (Number.isFinite(expiresAt) && expiresAt - Date.now() <= ADMIN_REFRESH_SKEW_MS) {
      return requestAdminSessionRefresh();
    }

    return session;
  }

  function isAuthenticated() {
    const session = getAuthSession();
    return Boolean(session?.authenticated && session?.token && session?.user?.role === "admin");
  }

  function requireAuth() {
    if (isAuthenticated()) return true;
    localStorage.removeItem(AUTH_KEY);
    window.location.href = "login.html";
    return false;
  }

  async function logoutAdmin() {
    let session = getAuthSession();

    try {
      if (session?.refreshToken) {
        session = await ensureFreshAdminSession().catch(() => requestAdminSessionRefresh());
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
      // Ignore transport failures and continue logout locally.
    }

    setAuthSession(null);
    window.location.href = "login.html";
  }

  async function requestAdminJson(path, options = {}) {
    const session = await ensureFreshAdminSession();
    if (!session?.token) {
      throw new Error("Admin session token is missing");
    }

    const isFormData =
      typeof FormData !== "undefined" && options.body instanceof FormData;

    const makeRequest = async (token) =>
      fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
          ...(!isFormData ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
          ...(options.headers || {})
        }
      });

    let response = await makeRequest(session.token);

    if (response.status === 401) {
      try {
        const refreshedSession = await requestAdminSessionRefresh();
        response = await makeRequest(refreshedSession.token);
      } catch (refreshError) {
        window.location.href = "login.html?expired=1";
        throw refreshError;
      }
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.message || "Admin request failed");
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  }

  async function requestAdminBlob(path, options = {}) {
    const session = await ensureFreshAdminSession();
    if (!session?.token) {
      throw new Error("Admin session token is missing");
    }

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
      const refreshedSession = await requestAdminSessionRefresh();
      response = await makeRequest(refreshedSession.token);
    }

    if (!response.ok) {
      let message = "Unable to load the requested document.";
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
  }

  async function createAdditionalAdminAccount(payload) {
    return requestAdminJson("/auth/admin/admins", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  window.addEventListener("noufar:admin-session-updated", (event) => {
    const nextSession = event.detail || null;
    if (!nextSession?.token) {
      stopAdminRealtimeStream();
      return;
    }
    if (lastAdminRealtimeToken && lastAdminRealtimeToken !== nextSession.token) {
      stopAdminRealtimeStream();
      startAdminRealtimeStream().catch(() => {});
    }
  });

  function revokeAdminAttachmentBlobUrl() {
    if (activeAdminAttachmentBlobUrl) {
      URL.revokeObjectURL(activeAdminAttachmentBlobUrl);
      activeAdminAttachmentBlobUrl = "";
    }
  }

  async function openAdminSupportAttachment(url, mode = "open", fileName = "attachment") {
    try {
      const blob = await requestAdminBlob(url);
      revokeAdminAttachmentBlobUrl();
      activeAdminAttachmentBlobUrl = URL.createObjectURL(blob);

      if (mode === "download") {
        const anchor = document.createElement("a");
        anchor.href = activeAdminAttachmentBlobUrl;
        anchor.download = fileName || "attachment";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(revokeAdminAttachmentBlobUrl, 1000);
        return;
      }

      window.open(activeAdminAttachmentBlobUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      showToast(error?.message || "Unable to open this attachment.", "danger");
    }
  }

  async function downloadAdminFile(url, fileName = "download.csv") {
    const blob = await requestAdminBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  async function fetchAdminNotifications() {
    const notifications = await requestAdminJson("/notifications");
    adminNotificationsCache = Array.isArray(notifications) ? notifications : [];
    return adminNotificationsCache;
  }

  function getCurrentAdminPage() {
    return document.body.dataset.page || "overview";
  }

  function adminPageNeedsSupportTickets(page = getCurrentAdminPage()) {
    return page === "overview" || page === "support" || page === "doctor-details";
  }

  function adminPageNeedsPredictions(page = getCurrentAdminPage()) {
    return page === "system";
  }

  async function runAdminRealtimeRefresh() {
    if (adminRealtimeRefreshInFlight) {
      adminRealtimeRefreshQueued = true;
      return;
    }

    adminRealtimeRefreshInFlight = true;

    try {
      const refreshTasks = [syncDoctorsFromBackend()];
      if (adminPageNeedsPredictions()) {
        refreshTasks.push(syncPredictionsFromBackend());
      }
      if (adminPageNeedsSupportTickets()) {
        refreshTasks.push(syncSupportTicketsFromBackend());
      }

      await Promise.allSettled(refreshTasks);

      document.dispatchEvent(new CustomEvent("noufar-admin-state-updated"));
      renderCurrentAdminPage();
    } finally {
      adminRealtimeRefreshInFlight = false;

      if (adminRealtimeRefreshQueued) {
        adminRealtimeRefreshQueued = false;
        runAdminRealtimeRefresh().catch(() => {});
      }
    }
  }

  function scheduleAdminRealtimeRefresh() {
    if (adminRealtimeRefreshTimer) {
      clearTimeout(adminRealtimeRefreshTimer);
    }

    adminRealtimeRefreshTimer = setTimeout(() => {
      adminRealtimeRefreshTimer = null;
      runAdminRealtimeRefresh().catch(() => {});
    }, 250);
  }

  function stopAdminRealtimeStream() {
    adminRealtimeConnected = false;
    lastAdminRealtimeToken = "";
    adminRealtimeSource?.close();
    adminRealtimeSource = null;
  }

  async function startAdminRealtimeStream() {
    if (adminRealtimeSource || !isAuthenticated() || typeof EventSource === "undefined") return;

    let session;
    try {
      session = await ensureFreshAdminSession();
    } catch (error) {
      return;
    }

    if (!session?.token) return;

    lastAdminRealtimeToken = session.token;
    const streamUrl = `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(session.token)}`;
    adminRealtimeSource = new EventSource(streamUrl);
    adminRealtimeSource.addEventListener("open", () => {
      adminRealtimeConnected = true;
    });

    adminRealtimeSource.addEventListener("notification:new", () => {
      scheduleAdminRealtimeRefresh();
    });

    adminRealtimeSource.addEventListener("support:ticket-updated", () => {
      scheduleAdminRealtimeRefresh();
    });

    adminRealtimeSource.addEventListener("doctor:registration", () => {
      scheduleAdminRealtimeRefresh();
    });

    adminRealtimeSource.addEventListener("error", () => {
      adminRealtimeConnected = false;
      stopAdminRealtimeStream();
      if (!isAuthenticated()) return;
      requestAdminSessionRefresh()
        .then(() => {
          startAdminRealtimeStream().catch(() => {});
        })
        .catch(() => {
          setAuthSession(null);
          window.location.href = "login.html?expired=1";
        });
    });
  }

  function armAdminNotificationAudio() {
    adminNotificationAudioArmed = true;
  }

  function getAdminNotificationAudio() {
    if (!adminNotificationAudio) {
      adminNotificationAudio = new Audio("assets/admin%20sound.mp3");
      adminNotificationAudio.preload = "auto";
    }
    return adminNotificationAudio;
  }

  async function playAdminNotificationSound() {
    if (!adminNotificationAudioArmed || document.hidden) return;
    const audio = getAdminNotificationAudio();
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      // Ignore autoplay or transient playback errors.
    }
  }

  async function markAdminNotificationAsRead(notificationId) {
    const response = await requestAdminJson(`/notifications/${notificationId}/read`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    if (response?.notification) {
      adminNotificationsCache = adminNotificationsCache.map((notification) =>
        notification.id === response.notification.id ? response.notification : notification
      );
    }

    return response?.notification;
  }

  async function markAllAdminNotificationsAsRead() {
    await requestAdminJson("/notifications/read-all", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    adminNotificationsCache = adminNotificationsCache.map((notification) => ({
      ...notification,
      isRead: true,
      readAt: notification.readAt || new Date().toISOString(),
    }));
  }

  async function openAdminNotificationTarget(notificationId) {
    const response = await requestAdminJson(`/notifications/${notificationId}/open`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    if (response?.notification) {
      adminNotificationsCache = adminNotificationsCache.map((notification) =>
        notification.id === response.notification.id ? response.notification : notification
      );
    }

    return response?.target || null;
  }

  function buildDoctorInitials(name = "") {
    return String(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  function mapBackendUserToDoctor(user) {
    const nameParts = String(user.name || "").trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "Doctor";
    const lastName = nameParts.slice(1).join(" ") || "Account";
    const isApproved = user.approvalStatus === "Approved";
    const registrationDate = user.createdAt || new Date().toISOString();

    return {
      id: user._id,
      firstName,
      lastName,
      name: user.name || `${firstName} ${lastName}`.trim(),
      email: user.email || "",
      doctorAccountType: user.doctorAccountType === "standard" ? "standard" : "prediction",
      phone: user.phone || "Not provided",
      specialty: user.specialty || "Not specified",
      hospital: user.hospital || "Not provided",
      city: user.city || "",
      country: user.country || "",
      registrationDate,
      approvalStatus: user.approvalStatus || "Pending",
      accountStatus: user.accountStatus || (isApproved ? "Active" : "Inactive"),
      assignedAdmin: user.assignedAdmin || "Unassigned",
      licenseNumber: user.licenseNumber || "",
      yearsPractice: Number(user.yearsPractice || 0),
      deactivationReason: user.deactivationReason || "",
      submittedDocuments: Array.isArray(user.submittedDocuments)
        ? user.submittedDocuments.map((document) => ({
            id: document.id || "",
            label: document.label,
            file: document.file || document.fileName || "",
            downloadUrl: document.downloadUrl || "",
            mimeType: document.mimeType || "",
            fileSize: document.fileSize || 0,
            verified: Boolean(document.verified),
          }))
        : [],
      notes: user.notes || "Registered through the doctor signup form.",
      supportTicketIds: Array.isArray(user.supportTicketIds) ? user.supportTicketIds : [],
      rejectionReason: user.rejectionReason || "",
      deletionReason: user.deletionReason || "",
      profilePhoto: user.profilePhoto || "",
      avatarInitials: buildDoctorInitials(user.name),
      statusHistory:
        Array.isArray(user.statusHistory) && user.statusHistory.length
          ? user.statusHistory
          : [
              {
                date: registrationDate,
                label: "Doctor registration submitted",
                by: "System",
              },
              ...(user.approvalStatus === "Pending"
                ? [
                    {
                      date: registrationDate,
                      label: "Waiting for admin approval",
                      by: "System",
                    },
                  ]
                : []),
            ],
    };
  }

  async function syncDoctorsFromBackend() {
    try {
      const users = await requestAdminJson("/auth/admin/users");
      const backendDoctors = users
        .filter((user) => user.role === "doctor")
        .map((user) => mapBackendUserToDoctor(user));

      if (!backendDoctors.length) return;

      state.doctors = backendDoctors;
    } catch (error) {
      console.warn("Unable to load doctors from backend:", error.message);
    }
  }

  function formatModelName(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return DEFAULT_SYSTEM_MODEL;
    if (normalized === "logisticregression" || normalized === "logistic regression") {
      return "Logistic Regression";
    }
    if (normalized === "randomforest" || normalized === "random forest") {
      return "Random Forest";
    }
    if (
      normalized === "deepneuralnetwork" ||
      normalized === "deep neural network" ||
      normalized === "dnn"
    ) {
      return "Deep Neural Network";
    }
    return String(value);
  }

  function mapBackendPredictionToSystemRecord(entry) {
    const runDate = entry.createdAt || entry.analyzedAt || entry.updatedAt || new Date().toISOString();
    return {
      id: String(entry._id || entry.id || ""),
      doctorId: String(entry.predictedBy || ""),
      doctorName: entry.predictedByName || entry.doctorName || "Unknown doctor",
      source: entry.source || "Manual",
      result:
        entry.result ||
        (Number(entry.prediction) === 1 ? "Relapse" : "No Relapse"),
      actualOutcome: entry.actualOutcome || "",
      validationStatus: entry.validationStatus || "Pending",
      validationRecordedAt: entry.validationRecordedAt || "",
      modelName: formatModelName(entry.modelName),
      runDate,
      analyzedAt: runDate,
      updatedAt: entry.updatedAt || runDate,
      validatedByName: entry.validatedByName || "",
    };
  }

  async function syncPredictionsFromBackend() {
    try {
      const predictions = await requestAdminJson("/predictions");
      systemPredictionsCache = Array.isArray(predictions)
        ? predictions.map((entry) => mapBackendPredictionToSystemRecord(entry))
        : [];
      state.predictions = clone(systemPredictionsCache);
      persistState();
    } catch (error) {
      console.warn("Unable to load predictions from backend:", error.message);
      systemPredictionsCache = Array.isArray(state.predictions)
        ? clone(state.predictions)
        : [];
    }
  }

  function mapBackendTicketToTicket(ticket) {
    return {
      id: ticket.id,
      doctorId: ticket.doctorId,
      doctorName: ticket.doctorName || ticket.contactRequest?.name || "Public contact",
      doctorEmail: ticket.doctorEmail || ticket.contactRequest?.email || "",
      contactRequest: ticket.contactRequest || null,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      assignedAdmin: ticket.assignedAdmin || "Unassigned",
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      unreadByAdmin: Boolean(ticket.unreadByAdmin),
      unreadByDoctor: Boolean(ticket.unreadByDoctor),
      accessUpgradeRequest: ticket.accessUpgradeRequest
        ? {
            decision: ticket.accessUpgradeRequest.decision || "pending",
            reviewedAt: ticket.accessUpgradeRequest.reviewedAt || "",
            reviewedBy: ticket.accessUpgradeRequest.reviewedBy || "",
            reviewedReason: ticket.accessUpgradeRequest.reviewedReason || "",
          }
        : null,
      unlockAccountRequest: ticket.unlockAccountRequest
        ? {
            decision: ticket.unlockAccountRequest.decision || "pending",
            reviewedAt: ticket.unlockAccountRequest.reviewedAt || "",
            reviewedBy: ticket.unlockAccountRequest.reviewedBy || "",
            reviewedReason: ticket.unlockAccountRequest.reviewedReason || "",
          }
        : null,
      lastDoctorMessageAt: ticket.lastDoctorMessageAt,
      lastAdminMessageAt: ticket.lastAdminMessageAt,
      messages: Array.isArray(ticket.messages)
        ? ticket.messages.map((message) => ({
            id: message.id,
            author: message.senderName,
            role: message.senderRole,
            body: message.body,
            preview: message.preview || message.body || "",
            attachment: message.attachment || null,
            date: message.createdAt,
            readByAdmin: message.readByAdmin,
            readByDoctor: message.readByDoctor,
          }))
        : [],
    };
  }

  function escapeAdminHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatSupportFileSize(size) {
    const fileSize = Number(size || 0);
    if (!fileSize) return "";
    if (fileSize < 1024) return `${fileSize} B`;
    if (fileSize < 1024 * 1024) return `${(fileSize / 1024).toFixed(1)} KB`;
    return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getTicketMessagePreview(message, fallbackText) {
    return (
      String(message?.body || "").trim() ||
      (message?.attachment?.originalName
        ? `Shared file: ${message.attachment.originalName}`
        : fallbackText)
    );
  }

  function buildSupportAttachmentMarkup(attachment, role) {
    if (!attachment?.downloadUrl && !attachment?.fileUrl && !attachment?.filePath) return "";

    const fileUrl = attachment.downloadUrl || attachment.fileUrl || attachment.filePath;
    const fileName = attachment.originalName || attachment.fileName || "Attachment";
    const metaParts = [
      attachment.mimeType ? attachment.mimeType.split("/").pop()?.toUpperCase() : "",
      formatSupportFileSize(attachment.fileSize),
    ].filter(Boolean);

    return `
      <div class="support-attachment-card support-attachment-card-${role}">
        <div class="support-attachment-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8.5 12.5v-5a3.5 3.5 0 1 1 7 0v8a5 5 0 1 1-10 0V8.8"></path></svg>
        </div>
        <div class="support-attachment-copy">
          <strong>${escapeAdminHtml(fileName)}</strong>
          ${metaParts.length ? `<span>${escapeAdminHtml(metaParts.join(" • "))}</span>` : ""}
        </div>
        <div class="support-attachment-actions">
          <button class="support-attachment-action support-attachment-action-open" type="button" data-admin-support-attachment-open="${escapeAdminHtml(fileUrl)}" data-admin-support-attachment-name="${escapeAdminHtml(fileName)}" aria-label="Open file" title="Open file">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3.5h5.5L19 9v10.5A1.5 1.5 0 0 1 17.5 21h-9A1.5 1.5 0 0 1 7 19.5v-14A1.5 1.5 0 0 1 8.5 4h4.5"></path><path d="M13 4v5h5"></path><path d="M10 13h4"></path><path d="M10 16h4"></path></svg>
          </button>
          <button class="support-attachment-action support-attachment-action-download" type="button" data-admin-support-attachment-download="${escapeAdminHtml(fileUrl)}" data-admin-support-attachment-name="${escapeAdminHtml(fileName)}" aria-label="Download file" title="Download file">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10"></path><path d="m8 10 4 4 4-4"></path><path d="M5 19h14"></path></svg>
          </button>
        </div>
      </div>
    `;
  }

  function buildSupportReplyFormData(body, file) {
    const formData = new FormData();
    if (body) formData.append("body", body);
    if (file) formData.append("attachment", file);
    return formData;
  }

  document.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-admin-support-attachment-open]");
    if (openButton) {
      event.preventDefault();
      openAdminSupportAttachment(
        openButton.getAttribute("data-admin-support-attachment-open") || "",
        "open",
        openButton.getAttribute("data-admin-support-attachment-name") || "attachment"
      );
      return;
    }

    const downloadButton = event.target.closest("[data-admin-support-attachment-download]");
    if (downloadButton) {
      event.preventDefault();
      openAdminSupportAttachment(
        downloadButton.getAttribute("data-admin-support-attachment-download") || "",
        "download",
        downloadButton.getAttribute("data-admin-support-attachment-name") || "attachment"
      );
    }
  });

  async function syncSupportTicketsFromBackend() {
    try {
      const tickets = await requestAdminJson("/support/admin/tickets");
      state.tickets = Array.isArray(tickets) ? tickets.map((ticket) => mapBackendTicketToTicket(ticket)) : [];
      return state.tickets;
    } catch (error) {
      console.warn("Unable to load support tickets from backend:", error.message);
      return state.tickets;
    }
  }

  async function markAdminSupportTicketsRead() {
    try {
      await requestAdminJson("/support/admin/tickets/read", {
        method: "PATCH",
        body: JSON.stringify({}),
      });

      state.tickets = state.tickets.map((ticket) => ({
        ...ticket,
        unreadByAdmin: false,
        messages: Array.isArray(ticket.messages)
          ? ticket.messages.map((message) =>
              message.role === "doctor" ? { ...message, readByAdmin: true } : message
            )
          : [],
      }));
      persistState();
    } catch (error) {
      console.warn("Unable to mark admin support notifications as read:", error.message);
    }
  }

  function showAdminThreadUnavailablePopup(message) {
    openConfirmation({
      title: "Thread unavailable",
      message,
      confirmLabel: "Understood",
      variant: "danger",
      hideCancel: true,
      onConfirm: () => {}
    });
  }

  function formatDate(value, withTime = false) {
    const date = new Date(value);
    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
    });
  }

  function slugifyBadge(value) {
    return value.toLowerCase().replace(/\s+/g, "-");
  }

  function createBadge(value, neutralFallback = false) {
    const span = document.createElement("span");
    span.className = `badge ${slugifyBadge(value)}${neutralFallback ? " neutral" : ""}`;
    span.textContent = value;
    return span;
  }

  function getSelectedSystemModel() {
    return systemModelOptionsCache.some((option) => option.label === adminUi.systemModel)
      ? adminUi.systemModel
      : DEFAULT_SYSTEM_MODEL;
  }

  function getSystemModelOptionByKey(key) {
    return systemModelOptionsCache.find((option) => option.key === key) || null;
  }

  function buildSystemModelOptions() {
    const selectedModel = getSelectedSystemModel();
    const isManualPolicy =
      (adminUi.predictionSelectionPolicy || DEFAULT_SELECTION_POLICY) === "manual";

    if (!isManualPolicy) {
      return `
        <div class="system-model-auto-note">
          <strong>Auto mode enabled</strong>
          <p>
            The system selects LR / RF / DNN automatically from form completeness.
            Switch to <b>Manual</b> to choose one fixed active model.
          </p>
        </div>
      `;
    }

    return systemModelOptionsCache.map((option) => {
      const isActive = option.label === selectedModel;
      const isUnavailable = option.deployed === false;
      return `
        <button class="system-model-option${isActive ? " is-active" : ""}${isUnavailable ? " is-unavailable" : ""}" type="button" data-system-model="${option.label}" data-system-model-key="${option.key || ""}" ${isUnavailable ? "disabled" : ""}>
          <div>
            <strong>${option.label}</strong>
            <p>${option.description}</p>
          </div>
          <span class="system-model-option-state">${isActive ? "Selected" : isUnavailable ? "Unavailable" : "Select"}</span>
        </button>
      `;
    }).join("");
  }

  function getSelectionPolicyLabel(policy) {
    return policy === "auto_by_completeness" ? "Auto by completeness" : "Manual";
  }

  function getSelectionPolicyDescription(policy) {
    return policy === "auto_by_completeness"
      ? "Model is selected automatically from clinical form completeness."
      : "Admin-selected active model is used for all predictions.";
  }

  function buildSystemSelectionPolicyOptions() {
    const selectedPolicy =
      adminUi.predictionSelectionPolicy === "auto_by_completeness"
        ? "auto_by_completeness"
        : "manual";

    return [
      {
        key: "manual",
        label: "Manual",
        description: "Use the active model selected by admin.",
      },
      {
        key: "auto_by_completeness",
        label: "Auto by completeness",
        description: "Auto-select LR / RF / DNN by form completeness.",
      },
    ]
      .map((option) => {
        const isActive = selectedPolicy === option.key;
        return `
          <button class="system-policy-option${isActive ? " is-active" : ""}" type="button" data-selection-policy="${option.key}">
            <div>
              <strong>${option.label}</strong>
              <p>${option.description}</p>
            </div>
            <span class="system-model-option-state">${isActive ? "Selected" : "Select"}</span>
          </button>
        `;
      })
      .join("");
  }

  function syncSystemModelUi() {
    const selectedModel = getSelectedSystemModel();
    const selectedPolicy =
      adminUi.predictionSelectionPolicy === "auto_by_completeness"
        ? "auto_by_completeness"
        : "manual";
    const triggerDisplayLabel = selectedPolicy === "auto_by_completeness" ? "Auto" : selectedModel;
    const triggerLabel = document.getElementById("system-model-trigger-label");
    const activeModel = document.getElementById("system-active-model");
    const policyPill = document.getElementById("system-selection-policy");
    const trigger = document.getElementById("system-model-trigger");
    const popover = document.getElementById("system-model-popover");
    const list = popover?.querySelector(".system-model-options");
    const policyList = popover?.querySelector(".system-policy-options");
    const policySummary = popover?.querySelector(".system-policy-summary");

    if (triggerLabel) triggerLabel.textContent = triggerDisplayLabel;
    if (activeModel) activeModel.textContent = triggerDisplayLabel;
    if (policyPill) policyPill.textContent = getSelectionPolicyLabel(selectedPolicy);
    if (trigger) trigger.setAttribute("aria-label", `Change model. Current mode: ${triggerDisplayLabel}`);
    if (list) list.innerHTML = buildSystemModelOptions();
    if (policyList) policyList.innerHTML = buildSystemSelectionPolicyOptions();
    if (policySummary) policySummary.textContent = getSelectionPolicyDescription(selectedPolicy);
  }

  async function syncSystemModelFromBackend() {
    const payload = await requestAdminJson("/predictions/models");
    const options = Array.isArray(payload?.options) && payload.options.length ? payload.options : SYSTEM_MODEL_OPTIONS;

    systemModelOptionsCache = options.map((option) => ({
      key: option.key || "",
      label: option.label || DEFAULT_SYSTEM_MODEL,
      description: option.description || "",
      deployed: option.deployed !== false,
    }));

    adminUi.systemModel = payload?.activeModelLabel || DEFAULT_SYSTEM_MODEL;
    adminUi.predictionSelectionPolicy =
      payload?.selectionPolicy === "auto_by_completeness"
        ? "auto_by_completeness"
        : DEFAULT_SELECTION_POLICY;
    persistUiState();
    syncSystemModelUi();
    return payload;
  }

  function getDoctorById(id) {
    return state.doctors.find((doctor) => doctor.id === id);
  }

  function getTicketById(id) {
    return state.tickets.find((ticket) => ticket.id === id);
  }

  function getDoctorTickets(doctorId) {
    return state.tickets.filter((ticket) => ticket.doctorId === doctorId);
  }

  function getNotificationFeed() {
    return adminNotificationsCache
      .map((notification) => ({
        key: notification.id,
        type: notification.type === "doctor-registration" ? "approval" : "support",
        title: notification.title,
        description: notification.message,
        date: notification.createdAt,
        href:
          notification.targetType === "doctor-profile"
            ? `doctor-details.html?id=${notification.targetId}`
            : `support-center.html?ticket=${notification.targetId}`,
        read: Boolean(notification.isRead),
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function getUnreadNotificationCount() {
    return getNotificationFeed().filter((item) => !item.read).length;
  }

  function addAuditLog(action, target) {
    state.auditLog.unshift({
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: "Admin Sarah M.",
      action,
      target
    });
    state.auditLog = state.auditLog.slice(0, 12);
  }

  async function approveDoctor(id) {
    const doctor = getDoctorById(id);
    if (!doctor) return false;

    try {
      const response = await requestAdminJson(`/auth/admin/users/${id}/approve`, {
        method: "PATCH",
      });

      const updatedDoctor = response?.user ? mapBackendUserToDoctor(response.user) : null;

      if (updatedDoctor) {
        const index = state.doctors.findIndex((entry) => entry.id === id);
        if (index > -1) {
          state.doctors[index] = {
            ...state.doctors[index],
            ...updatedDoctor,
            accountStatus: "Active",
            rejectionReason: "",
            statusHistory: [
              {
                date: new Date().toISOString(),
                label: "Doctor approved and account activated",
                by: "Admin Sarah M."
              },
              ...(state.doctors[index].statusHistory || []),
            ],
          };
        }
      } else {
        doctor.approvalStatus = "Approved";
        doctor.accountStatus = "Active";
        doctor.rejectionReason = "";
      }

      addAuditLog("Approved doctor registration", id);
      persistState();

      if (response?.emailStatus === "sent") {
        showToast(`${doctor.name} approved and email sent.`);
      } else if (response?.emailStatus === "skipped") {
        showToast(`${doctor.name} approved. Configure SMTP to send the email.`, "danger");
      } else if (response?.emailStatus === "failed") {
        showToast(`${doctor.name} approved, but the email could not be delivered.`, "danger");
      } else {
        showToast(`${doctor.name} approved successfully.`);
      }

      return true;
    } catch (error) {
      showToast(error.message || "Unable to approve this doctor right now.", "danger");
      return false;
    }
  }

  async function rejectDoctor(id, reason) {
    const doctor = getDoctorById(id);
    if (!doctor) return false;

    try {
      const finalReason = String(reason || "").trim() || "No rejection reason was provided.";
      const response = await requestAdminJson(`/auth/admin/users/${id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason: finalReason }),
      });

      const updatedDoctor = response?.user ? mapBackendUserToDoctor(response.user) : null;
      if (updatedDoctor) {
        const index = state.doctors.findIndex((entry) => entry.id === id);
        if (index > -1) {
          state.doctors[index] = {
            ...state.doctors[index],
            ...updatedDoctor,
            approvalStatus: "Rejected",
            accountStatus: "Inactive",
            rejectionReason: finalReason,
          };
        }
      }

      addAuditLog("Rejected doctor registration", id);
      persistState();

      if (response?.emailStatus === "sent") {
        showToast(`${doctor.name} rejected and email sent.`, "danger");
      } else if (response?.emailStatus === "skipped") {
        showToast(`${doctor.name} rejected. Configure SMTP to send the email.`, "danger");
      } else if (response?.emailStatus === "failed") {
        showToast(`${doctor.name} rejected, but the email could not be delivered.`, "danger");
      } else {
        showToast(`${doctor.name} was rejected.`, "danger");
      }

      return true;
    } catch (error) {
      showToast(error.message || "Unable to reject this doctor right now.", "danger");
      return false;
    }
  }

  async function deactivateDoctor(id, reason) {
    const doctor = getDoctorById(id);
    if (!doctor) return false;

    try {
      const finalReason = String(reason || "").trim() || "No deactivation reason was provided.";
      const response = await requestAdminJson(`/auth/admin/users/${id}/deactivate`, {
        method: "PATCH",
        body: JSON.stringify({ reason: finalReason }),
      });

      const updatedDoctor = response?.user ? mapBackendUserToDoctor(response.user) : null;
      if (updatedDoctor) {
        const index = state.doctors.findIndex((entry) => entry.id === id);
        if (index > -1) {
          state.doctors[index] = {
            ...state.doctors[index],
            ...updatedDoctor,
            accountStatus: "Inactive",
            deactivationReason: finalReason,
            statusHistory: [
              {
                date: new Date().toISOString(),
                label: `Doctor account deactivated: ${finalReason}`,
                by: "Admin Sarah M."
              },
              ...(state.doctors[index].statusHistory || []),
            ],
          };
        }
      }

      addAuditLog("Deactivated doctor account", id);
      persistState();
      showToast(`${doctor.name} deactivated.`);
      return true;
    } catch (error) {
      showToast(error.message || "Unable to deactivate this doctor right now.", "danger");
      return false;
    }
  }

  async function reactivateDoctor(id) {
    const doctor = getDoctorById(id);
    if (!doctor) return false;
    const wasBlocked = doctor.accountStatus === "Deleted";

    try {
      const response = await requestAdminJson(`/auth/admin/users/${id}/activate`, {
        method: "PATCH",
      });

      const updatedDoctor = response?.user ? mapBackendUserToDoctor(response.user) : null;
      if (updatedDoctor) {
        const index = state.doctors.findIndex((entry) => entry.id === id);
        if (index > -1) {
          state.doctors[index] = {
            ...state.doctors[index],
            ...updatedDoctor,
            accountStatus: "Active",
            deactivationReason: "",
            statusHistory: [
              {
                date: new Date().toISOString(),
                label: wasBlocked ? "Doctor account unblocked" : "Doctor account activated",
                by: "Admin Sarah M."
              },
              ...(state.doctors[index].statusHistory || []),
            ],
          };
        }
      }

      addAuditLog(wasBlocked ? "Unblocked doctor account" : "Activated doctor account", id);
      persistState();

      if (response?.emailStatus === "sent") {
        showToast(`${doctor.name} ${wasBlocked ? "unblocked" : "activated"} and email sent.`);
      } else if (response?.emailStatus === "skipped") {
        showToast(`${doctor.name} ${wasBlocked ? "unblocked" : "activated"}. Configure SMTP to send the email.`, "danger");
      } else if (response?.emailStatus === "failed") {
        showToast(`${doctor.name} ${wasBlocked ? "unblocked" : "activated"}, but the email could not be delivered.`, "danger");
      } else {
        showToast(`${doctor.name} ${wasBlocked ? "unblocked" : "activated"}.`);
      }

      return true;
    } catch (error) {
      showToast(error.message || `Unable to ${wasBlocked ? "unblock" : "activate"} this doctor right now.`, "danger");
      return false;
    }
  }

  async function updateDoctorAccessType(id, doctorAccountType) {
    const doctor = getDoctorById(id);
    if (!doctor) return false;

    try {
      const response = await requestAdminJson(`/auth/admin/users/${id}/access-type`, {
        method: "PATCH",
        body: JSON.stringify({ doctorAccountType }),
      });

      const updatedDoctor = response?.user ? mapBackendUserToDoctor(response.user) : null;
      if (updatedDoctor) {
        const index = state.doctors.findIndex((entry) => entry.id === id);
        if (index > -1) {
          state.doctors[index] = {
            ...state.doctors[index],
            ...updatedDoctor,
          };
        }
      }

      addAuditLog(
        doctorAccountType === "prediction"
          ? "Granted Doctor with prediction access"
          : "Changed access to Standard doctor",
        id
      );
      persistState();
      showToast(
        response?.message ||
          (doctorAccountType === "prediction"
            ? `${doctor.name} can now run predictions.`
            : `${doctor.name} is now a Standard doctor.`)
      );
      return true;
    } catch (error) {
      showToast(error.message || "Unable to update this doctor's access.", "danger");
      return false;
    }
  }

  async function deleteDoctor(id, reason) {
    const doctor = getDoctorById(id);
    if (!doctor) return false;

    try {
      const finalReason = String(reason || "").trim() || "No block reason was provided.";
      const response = await requestAdminJson(`/auth/admin/users/${id}/delete`, {
        method: "PATCH",
        body: JSON.stringify({ reason: finalReason }),
      });

      const updatedDoctor = response?.user ? mapBackendUserToDoctor(response.user) : null;
      if (updatedDoctor) {
        const index = state.doctors.findIndex((entry) => entry.id === id);
        if (index > -1) {
          state.doctors[index] = {
            ...state.doctors[index],
            ...updatedDoctor,
            accountStatus: "Deleted",
            deletionReason: finalReason,
            statusHistory: [
              {
                date: new Date().toISOString(),
                label: `Doctor account blocked: ${finalReason}`,
                by: "Admin Sarah M."
              },
              ...(state.doctors[index].statusHistory || []),
            ],
          };
        }
      }

      addAuditLog("Blocked doctor account", id);
      persistState();

      if (response?.emailStatus === "sent") {
        showToast(`${doctor.name} blocked and email sent.`, "danger");
      } else if (response?.emailStatus === "skipped") {
        showToast(`${doctor.name} blocked. Configure SMTP to send the email.`, "danger");
      } else if (response?.emailStatus === "failed") {
        showToast(`${doctor.name} blocked, but the email could not be delivered.`, "danger");
      } else {
        showToast(`${doctor.name} blocked.`, "danger");
      }

      return true;
    } catch (error) {
      showToast(error.message || "Unable to block this doctor account right now.", "danger");
      return false;
    }
  }

  async function updateTicketStatus(id, status) {
    const response = await requestAdminJson(`/support/admin/tickets/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });

    if (response?.ticket) {
      const nextTicket = mapBackendTicketToTicket(response.ticket);
      const index = state.tickets.findIndex((ticket) => ticket.id === id);
      if (index > -1) {
        state.tickets[index] = nextTicket;
      } else {
        state.tickets.unshift(nextTicket);
      }
      addAuditLog(`Updated support ticket status to ${status}`, id);
      persistState();
      return nextTicket;
    }

    throw new Error("Support ticket status could not be updated.");
  }

  async function replyToTicket(id, body, file = null) {
    const response = await requestAdminJson(`/support/tickets/${id}/reply`, {
      method: "POST",
      body: buildSupportReplyFormData(body, file),
    });

    if (response?.ticket) {
      const nextTicket = mapBackendTicketToTicket(response.ticket);
      const index = state.tickets.findIndex((ticket) => ticket.id === id);
      if (index > -1) {
        state.tickets[index] = nextTicket;
      } else {
        state.tickets.unshift(nextTicket);
      }
      addAuditLog("Replied to doctor support ticket", id);
      persistState();
      showToast(
        response?.message || "Support reply sent.",
        response?.emailStatus === "failed" || response?.emailStatus === "skipped" ? "warning" : "success"
      );
      return nextTicket;
    }

    throw new Error("Support reply could not be sent.");
  }

  async function reviewAccessUpgrade(id, decision, reason = "") {
    const response = await requestAdminJson(`/support/admin/tickets/${id}/access-upgrade`, {
      method: "PATCH",
      body: JSON.stringify({ decision, reason }),
    });

    if (response?.ticket) {
      const nextTicket = mapBackendTicketToTicket(response.ticket);
      const ticketIndex = state.tickets.findIndex((ticket) => ticket.id === id);
      if (ticketIndex > -1) {
        state.tickets[ticketIndex] = nextTicket;
      } else {
        state.tickets.unshift(nextTicket);
      }

      if (response?.doctor?.id) {
        const doctorIndex = state.doctors.findIndex((doctor) => doctor.id === response.doctor.id);
        if (doctorIndex > -1) {
          state.doctors[doctorIndex] = {
            ...state.doctors[doctorIndex],
            doctorAccountType:
              response.doctor.doctorAccountType === "standard" ? "standard" : "prediction",
          };
        }
      }

      addAuditLog(
        decision === "approve" ? "Approved doctor prediction access request" : "Refused doctor prediction access request",
        id
      );
      persistState();
      showToast(
        response?.message ||
          (decision === "approve"
            ? "Doctor access upgraded successfully."
            : "Doctor access upgrade request refused."),
        decision === "approve" ? "success" : "warning"
      );
      return nextTicket;
    }

    throw new Error("Access upgrade request could not be reviewed.");
  }

  async function reviewUnlockAccount(id, decision, reason = "") {
    const response = await requestAdminJson(`/support/admin/tickets/${id}/unlock-account`, {
      method: "PATCH",
      body: JSON.stringify({ decision, reason }),
    });

    if (response?.ticket) {
      const nextTicket = mapBackendTicketToTicket(response.ticket);
      const ticketIndex = state.tickets.findIndex((ticket) => ticket.id === id);
      if (ticketIndex > -1) {
        state.tickets[ticketIndex] = nextTicket;
      } else {
        state.tickets.unshift(nextTicket);
      }

      if (response?.doctor?.id) {
        const doctorIndex = state.doctors.findIndex((doctor) => doctor.id === response.doctor.id);
        if (doctorIndex > -1) {
          state.doctors[doctorIndex] = {
            ...state.doctors[doctorIndex],
            accountStatus: response.doctor.accountStatus || state.doctors[doctorIndex].accountStatus,
            deletionReason: decision === "approve" ? "" : state.doctors[doctorIndex].deletionReason,
            deactivationReason: decision === "approve" ? "" : state.doctors[doctorIndex].deactivationReason,
          };
        }
      }

      addAuditLog(
        decision === "approve" ? "Approved doctor account unblock request" : "Refused doctor account unblock request",
        id
      );
      persistState();
      showToast(
        response?.message ||
          (decision === "approve"
            ? "Doctor account unblocked successfully."
            : "Doctor account unblock request refused."),
        decision === "approve" ? "success" : "warning"
      );
      return nextTicket;
    }

    throw new Error("Account unblock request could not be reviewed.");
  }

  async function deleteSupportThread(id) {
    const response = await requestAdminJson(`/support/tickets/${id}`, {
      method: "DELETE",
      body: JSON.stringify({}),
    });

    state.tickets = state.tickets.filter((ticket) => ticket.id !== id);
    addAuditLog("Deleted support thread", id);
    persistState();
    showToast(response?.message || "Support thread deleted.", "danger");
    return response;
  }

  async function deleteSupportThreadsBulk({ ticketIds = [], deleteAll = false } = {}) {
    const response = await requestAdminJson("/support/tickets", {
      method: "DELETE",
      body: JSON.stringify({ ticketIds, deleteAll }),
    });

    const deletedIds = new Set((response?.deletedIds || []).map((value) => String(value)));
    state.tickets = deleteAll
      ? []
      : state.tickets.filter((ticket) => !deletedIds.has(String(ticket.id)));

    addAuditLog(deleteAll ? "Deleted all support threads" : "Deleted selected support threads", deleteAll ? "All tickets" : ticketIds.join(", "));
    persistState();
    showToast(response?.message || "Support threads deleted.", "danger");
    return response;
  }

  function deleteTicketMessage(ticketId, messageIndex) {
    const ticket = getTicketById(ticketId);
    if (!ticket) return;
    const message = ticket.messages[messageIndex];
    if (!message || message.role !== "admin") return;
    ticket.messages.splice(messageIndex, 1);
    ticket.updatedAt = new Date().toISOString();
    addAuditLog("Deleted admin support reply", `${ticketId} / message ${messageIndex + 1}`);
    persistState();
    showToast("Sent message deleted.", "danger");
  }

  function getDoctorDocument(doctor, identifier) {
    if (!doctor?.submittedDocuments?.length) return null;

    if (typeof identifier === "number" && Number.isInteger(identifier)) {
      return doctor.submittedDocuments[identifier] || null;
    }

    if (typeof identifier === "string" && /^\d+$/.test(identifier)) {
      return doctor.submittedDocuments[Number(identifier)] || null;
    }

    if (identifier === "medical-license") {
      return doctor.submittedDocuments.find((document) => /medical license/i.test(document.label)) || null;
    }

    if (identifier === "national-id") {
      return doctor.submittedDocuments.find((document) => /national id|identity document/i.test(document.label)) || null;
    }

    return null;
  }

  function buildDocumentPreviewMarkup(doctor, document) {
    if (!document) {
      return `<div class="empty-state">This document is not available.</div>`;
    }

    const fileName = document.file || document.fileName || "Unknown file";
    const fileUrl = document.downloadUrl || "";
    const isPdf = /pdf/i.test(document.mimeType) || /\.pdf$/i.test(fileName);
    const isImage = /^image\//i.test(document.mimeType) || /\.(png|jpe?g|webp)$/i.test(fileName);
    const previewClassName = `document-preview document-preview-clean${isImage ? " document-preview-image-layout" : ""}`;
    const previewMarkup = isPdf
      ? `<iframe class="document-preview-embed" src="${fileUrl}" title="${document.label} preview"></iframe>`
      : isImage
        ? `<img class="document-preview-image" src="${fileUrl}" alt="${document.label} preview" />`
        : `<div class="empty-state">Preview is not available for this file type.</div>`;

    return `
      <article class="${previewClassName}">
        <div class="document-preview-clean-body">
          <div class="document-preview-visual">
            ${fileUrl ? previewMarkup : '<div class="empty-state">Secure file access is not available for this document.</div>'}
          </div>
          <div class="document-preview-clean-footer">
            <strong>${document.label}</strong>
            <span>${fileName}</span>
          </div>
        </div>
      </article>
    `;
  }

  function setupDocumentPreviewModal() {
    const modal = document.getElementById("document-preview-modal");
    if (!modal || modal.dataset.ready === "true") return;
    modal.dataset.ready = "true";

    modal.addEventListener("click", (event) => {
      if (event.target.hasAttribute("data-close-document-modal")) {
        setDocumentPreviewModalState(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setDocumentPreviewModalState(false);
      }
    });
  }

  function setDocumentPreviewModalState(isOpen) {
    const modal = document.getElementById("document-preview-modal");
    if (!modal) return;

    if (isOpen) {
      modal.hidden = false;
      modal.removeAttribute("hidden");
      modal.style.display = "grid";
      modal.setAttribute("aria-hidden", "false");
      return;
    }

    if (activeDocumentPreviewBlobUrl) {
      URL.revokeObjectURL(activeDocumentPreviewBlobUrl);
      activeDocumentPreviewBlobUrl = "";
    }

    modal.hidden = true;
    modal.setAttribute("hidden", "");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }

  async function openDocumentPreview(doctor, type) {
    setupDocumentPreviewModal();
    const modal = document.getElementById("document-preview-modal");
    const title = document.getElementById("document-preview-title");
    const subtitle = document.getElementById("document-preview-subtitle");
    const frame = document.getElementById("document-preview-frame");
    if (!modal || !title || !subtitle || !frame) return;

    const selectedDocument = getDoctorDocument(doctor, type);
    title.textContent = selectedDocument?.label || "Document";
    setDocumentPreviewModalState(true);
    subtitle.textContent = "";
    frame.innerHTML = `<div class="empty-state">Loading secure document preview...</div>`;

    if (!selectedDocument?.downloadUrl) {
      frame.innerHTML = buildDocumentPreviewMarkup(doctor, selectedDocument);
      return;
    }

    try {
      const blob = await requestAdminBlob(selectedDocument.downloadUrl);
      if (activeDocumentPreviewBlobUrl) {
        URL.revokeObjectURL(activeDocumentPreviewBlobUrl);
      }
      activeDocumentPreviewBlobUrl = URL.createObjectURL(blob);
      frame.innerHTML = buildDocumentPreviewMarkup(doctor, {
        ...selectedDocument,
        downloadUrl: activeDocumentPreviewBlobUrl,
      });
    } catch (error) {
      frame.innerHTML = `
        <div class="empty-state">
          ${escapeAdminHtml(error?.message || "Unable to open this secure document.")}
        </div>
      `;
    }
  }

  function buildRegistrationSeries(doctors) {
    const validDates = doctors
      .map((doctor) => new Date(doctor.registrationDate))
      .filter((date) => Number.isFinite(date.getTime()));

    const latestDoctorDate = validDates.length
      ? new Date(Math.max(...validDates.map((date) => date.getTime())))
      : new Date();

    const anchorDate = latestDoctorDate > new Date() ? latestDoctorDate : new Date();
    const monthStarts = [];

    for (let offset = 5; offset >= 0; offset -= 1) {
      monthStarts.push(new Date(anchorDate.getFullYear(), anchorDate.getMonth() - offset, 1));
    }

    return monthStarts.map((monthStart) => {
      const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
      const value = validDates.filter(
        (date) => date >= monthStart && date < nextMonth
      ).length;

      return {
        label: new Intl.DateTimeFormat("en-GB", { month: "short" }).format(monthStart),
        value
      };
    });
  }

  function calculateRegistrationAnalytics(points = []) {
    if (!points.length) {
      return {
        total: 0,
        average: 0,
        peakLabel: "--",
        peakValue: 0,
        growthPercent: 0,
        growthCaption: "No trend available",
        deltaPercent: 0,
        footnote: "Waiting for live registrations...",
      };
    }

    const total = points.reduce((sum, point) => sum + point.value, 0);
    const average = Math.round(total / points.length);
    const peakPoint = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
    const previousPoint = points[points.length - 2] || null;
    const latestPoint = points[points.length - 1];
    const previousTotal = points.slice(0, 3).reduce((sum, point) => sum + point.value, 0);
    const currentTotal = points.slice(-3).reduce((sum, point) => sum + point.value, 0);
    const deltaBase = previousTotal || 1;
    const deltaPercent = previousTotal ? Math.round(((currentTotal - previousTotal) / deltaBase) * 100) : 0;
    const growthPercent = previousPoint?.value
      ? Math.round(((latestPoint.value - previousPoint.value) / previousPoint.value) * 100)
      : latestPoint.value > 0
        ? 100
        : 0;
    const trendDirection =
      growthPercent > 0 ? "increase" : growthPercent < 0 ? "slowdown" : "steady volume";

    return {
      total,
      average,
      peakLabel: peakPoint.label,
      peakValue: peakPoint.value,
      growthPercent,
      growthCaption: previousPoint ? `From ${previousPoint.label} to ${latestPoint.label}` : "First tracked month",
      deltaPercent,
      footnote: `Registration ${trendDirection} detected. ${peakPoint.label} is currently the highest month with ${peakPoint.value} signup${peakPoint.value === 1 ? "" : "s"}.`,
    };
  }

  function buildOverviewAuditEntries(doctors, tickets) {
    const doctorEntries = doctors.flatMap((doctor) =>
      Array.isArray(doctor.statusHistory)
        ? doctor.statusHistory
            .filter((entry) => entry?.date && entry?.label)
            .map((entry) => ({
              id: `doctor-${doctor.id}-${entry.date}-${entry.label}`,
              timestamp: entry.date,
              actor: entry.by || "System",
              action: entry.label,
              target: doctor.name,
            }))
        : []
    );

    const ticketEntries = tickets.flatMap((ticket) => {
      const entries = [];

      if (ticket.deletedByAdmin && ticket.deletedByAdminAt) {
        entries.push({
          id: `ticket-${ticket.id}-deleted-admin`,
          timestamp: ticket.deletedByAdminAt,
          actor: ticket.assignedAdmin || "Admin",
          action: "Deleted support thread",
          target: ticket.id,
        });
      }

      if (Array.isArray(ticket.messages)) {
        ticket.messages.forEach((message) => {
          if (message.role !== "admin" || !message.date) return;
          entries.push({
            id: `ticket-${ticket.id}-message-${message.id || message.date}`,
            timestamp: message.date,
            actor: message.author || ticket.assignedAdmin || "Admin",
            action: message.attachment?.fileName
              ? "Sent support reply with file"
              : "Replied to doctor support ticket",
            target: ticket.id,
          });
        });
      }

      return entries;
    });

    return [...doctorEntries, ...ticketEntries]
      .filter((entry) => Number.isFinite(new Date(entry.timestamp).getTime()))
      .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp));
  }

  function calculateAverageReplyHours(tickets) {
    const responseWindows = [];

    tickets.forEach((ticket) => {
      const messages = Array.isArray(ticket.messages)
        ? [...ticket.messages]
            .filter((message) => message?.date)
            .sort((left, right) => new Date(left.date) - new Date(right.date))
        : [];

      for (let index = 0; index < messages.length; index += 1) {
        const currentMessage = messages[index];
        if (currentMessage.role !== "doctor") continue;

        const nextAdminMessage = messages.slice(index + 1).find((message) => message.role === "admin");
        if (!nextAdminMessage) continue;

        const diffHours =
          (new Date(nextAdminMessage.date).getTime() - new Date(currentMessage.date).getTime()) /
          (1000 * 60 * 60);

        if (Number.isFinite(diffHours) && diffHours >= 0) {
          responseWindows.push(diffHours);
        }
      }
    });

    if (!responseWindows.length) {
      return null;
    }

    const average = responseWindows.reduce((sum, value) => sum + value, 0) / responseWindows.length;
    return Number(average.toFixed(1));
  }

  function renderLineChart(host, points = []) {
    if (!host) return;
    if (!points.length) return;
    const max = Math.max(...points.map((entry) => entry.value), 1);
    const width = 900;
    const height = 320;
    const chartLeft = 72;
    const chartRight = width - 32;
    const chartTop = 40;
    const chartBottom = height - 40;
    const chartWidth = chartRight - chartLeft;
    const step = chartWidth / (points.length - 1 || 1);

    const chartPoints = points
      .map((entry, index) => {
        const x = chartLeft + step * index;
        const y = chartBottom - (entry.value / max) * (chartBottom - chartTop);
        return { ...entry, x, y };
      });

    // Monotone cubic interpolation (Fritsch-Carlson) — prevents overshoot below 0
    const buildMonotonePath = (pts) => {
      if (pts.length < 2) return "";
      const n = pts.length;
      const dx = new Array(n - 1);
      const dy = new Array(n - 1);
      const m = new Array(n - 1); // segment slopes

      for (let i = 0; i < n - 1; i++) {
        dx[i] = pts[i + 1].x - pts[i].x;
        dy[i] = pts[i + 1].y - pts[i].y;
        m[i] = dx[i] === 0 ? 0 : dy[i] / dx[i];
      }

      // Initial tangents at each point
      const tangents = new Array(n);
      tangents[0] = m[0];
      tangents[n - 1] = m[n - 2];
      for (let i = 1; i < n - 1; i++) {
        if (m[i - 1] * m[i] <= 0) {
          tangents[i] = 0; // local extremum or flat → no slope
        } else {
          tangents[i] = (m[i - 1] + m[i]) / 2;
        }
      }

      // Adjust tangents to ensure monotonicity (no overshoot)
      for (let i = 0; i < n - 1; i++) {
        if (m[i] === 0) {
          tangents[i] = 0;
          tangents[i + 1] = 0;
        } else {
          const a = tangents[i] / m[i];
          const b = tangents[i + 1] / m[i];
          const r = a * a + b * b;
          if (r > 9) {
            const factor = 3 / Math.sqrt(r);
            tangents[i] = factor * a * m[i];
            tangents[i + 1] = factor * b * m[i];
          }
        }
      }

      // Build cubic Bezier path from Hermite tangents
      let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
      for (let i = 0; i < n - 1; i++) {
        const x0 = pts[i].x;
        const y0 = pts[i].y;
        const x1 = pts[i + 1].x;
        const y1 = pts[i + 1].y;
        const m0 = tangents[i];
        const m1 = tangents[i + 1];
        const h = (x1 - x0) / 3;
        const cp1x = x0 + h;
        const cp1y = y0 + m0 * h;
        const cp2x = x1 - h;
        const cp2y = y1 - m1 * h;
        d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)}`;
      }
      return d;
    };

    const smoothPath = buildMonotonePath(chartPoints);
    const areaPath = `${smoothPath} L ${chartPoints[chartPoints.length - 1].x.toFixed(2)} ${chartBottom} L ${chartPoints[0].x.toFixed(2)} ${chartBottom} Z`;
    const maxLabel = Math.max(...points.map((entry) => entry.value), 0);
    const gridLabels = [0, 0.25, 0.5, 0.75, 1]
      .map((ratio) => Math.round(maxLabel * ratio))
      .filter((value, index, array) => array.indexOf(value) === index);
    const peakValue = Math.max(...points.map((entry) => entry.value), 0);
    const latestNonZeroIndex = [...chartPoints].reverse().findIndex((entry) => entry.value > 0);
    const latestNonZeroPoint =
      latestNonZeroIndex === -1 ? null : chartPoints[chartPoints.length - 1 - latestNonZeroIndex];

    host.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="pro-line-chart" role="img" aria-label="Registration activity chart">
        <defs>
          <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#76ebff"></stop>
            <stop offset="50%" stop-color="#4ba0ff"></stop>
            <stop offset="100%" stop-color="#3a6ff5"></stop>
          </linearGradient>
          <linearGradient id="line-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="rgba(118, 235, 255, 0.32)"></stop>
            <stop offset="60%" stop-color="rgba(75, 160, 255, 0.12)"></stop>
            <stop offset="100%" stop-color="rgba(75, 160, 255, 0)"></stop>
          </linearGradient>
          <radialGradient id="point-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(118, 235, 255, 0.85)"></stop>
            <stop offset="100%" stop-color="rgba(118, 235, 255, 0)"></stop>
          </radialGradient>
          <filter id="chartGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>
        <g class="chart-grid">
          ${gridLabels
            .map((label, index) => {
              const ratio = maxLabel ? label / maxLabel : index / (gridLabels.length - 1 || 1);
              const y = chartBottom - ratio * (chartBottom - chartTop);
              return `
                <line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" stroke="rgba(134, 154, 196, 0.1)" stroke-dasharray="4 6"></line>
                <text x="${chartLeft - 14}" y="${y + 4}" fill="#7f90b4" font-size="13" font-weight="600" text-anchor="end">${label}</text>
              `;
            })
            .join("")}
        </g>
        <path d="${areaPath}" fill="url(#line-fill)" class="chart-area"></path>
        <path d="${smoothPath}" fill="none" stroke="url(#line-gradient)" filter="url(#chartGlow)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="chart-line"></path>
        <g class="chart-points">
          ${chartPoints
            .map((entry) => {
              const isPeak = entry.value > 0 && entry.value === peakValue;
              const isLatest = entry === latestNonZeroPoint;
              const showLabel = isPeak || isLatest;
              const labelY = entry.y - 22;
              return `
                <g class="chart-point${isPeak ? " is-peak" : ""}${isLatest ? " is-latest" : ""}">
                  ${isPeak || isLatest ? `<circle cx="${entry.x}" cy="${entry.y}" r="16" fill="url(#point-glow)" opacity="0.55"></circle>` : ""}
                  <circle cx="${entry.x}" cy="${entry.y}" r="6" fill="#0f1524" stroke="#76ebff" stroke-width="2.5"></circle>
                  ${showLabel ? `
                    <g transform="translate(${entry.x}, ${labelY})">
                      <rect x="-22" y="-13" width="44" height="22" rx="11" fill="rgba(15, 21, 36, 0.95)" stroke="rgba(118, 235, 255, 0.4)" stroke-width="1"></rect>
                      <text x="0" y="3" text-anchor="middle" fill="#ffffff" font-size="13" font-weight="800">${entry.value}</text>
                    </g>
                  ` : ""}
                </g>
              `;
            })
            .join("")}
        </g>
      </svg>
    `;

    const labels = document.getElementById("registration-labels");
    if (labels) {
      labels.innerHTML = chartPoints
        .map(
          (entry) =>
            `<span style="left:${((entry.x / width) * 100).toFixed(2)}%">${entry.label}</span>`
        )
        .join("");
    }
  }

  function populateOverview() {
    const doctors = state.doctors;
    const pending = doctors.filter((doctor) => doctor.approvalStatus === "Pending");
    const approved = doctors.filter((doctor) => doctor.approvalStatus === "Approved");
    const rejected = doctors.filter((doctor) => doctor.approvalStatus === "Rejected");
    const active = doctors.filter((doctor) => doctor.accountStatus === "Active");
    const inactive = doctors.filter((doctor) => doctor.accountStatus === "Inactive");
    const values = {
      "metric-total": doctors.length,
      "metric-pending": pending.length,
      "metric-active": active.length,
      "metric-approved": approved.length,
      "metric-inactive": inactive.length,
      "metric-rejected": rejected.length
    };

    Object.entries(values).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = String(value);
    });

    const recentRegistrations = [...doctors]
      .sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate))
      .slice(0, 5);
    const registrationsBody = document.getElementById("recent-registrations");
    if (registrationsBody) {
      registrationsBody.innerHTML = recentRegistrations
        .map(
          (doctor) => `
            <tr>
              <td>
                <div class="table-meta">
                  <strong>${doctor.name}</strong>
                  <span>${doctor.id}</span>
                </div>
              </td>
              <td>${doctor.specialty}</td>
              <td>${formatDate(doctor.registrationDate)}</td>
              <td>${createBadgeMarkup(doctor.approvalStatus)}</td>
              <td>${createBadgeMarkup(doctor.accountStatus)}</td>
            </tr>
          `
        )
        .join("");
    }

    const recentMessages = [...state.tickets]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 4);
    const messagesList = document.getElementById("recent-messages");
    if (messagesList) {
      messagesList.innerHTML = recentMessages
        .map((ticket) => {
          const doctor = getDoctorById(ticket.doctorId);
          return `
            <article class="list-row">
              <div class="list-row-head">
                <strong>${ticket.subject}</strong>
                ${createBadgeMarkup(ticket.priority)}
              </div>
              <p>${doctor ? doctor.name : "Unknown doctor"} - ${ticket.category}</p>
              <div class="list-row-head">
                ${createBadgeMarkup(ticket.status)}
                <span class="link-action">${formatDate(ticket.updatedAt, true)}</span>
              </div>
            </article>
          `;
        })
        .join("");
    }

    const auditEntries = buildOverviewAuditEntries(doctors, state.tickets);

    const auditList = document.getElementById("audit-log-list");
    if (auditList) {
      auditList.innerHTML = auditEntries
        .slice(0, 4)
        .map(
          (entry) => `
            <article class="list-row">
              <div class="list-row-head">
                <strong>${entry.action}</strong>
                <span class="link-action">${formatDate(entry.timestamp, true)}</span>
              </div>
              <p>${entry.actor} - ${entry.target}</p>
            </article>
          `
        )
        .join("");
    }

    const approvalRate = doctors.length ? Math.round((approved.length / doctors.length) * 100) : 0;
    const activationRate = approved.length ? Math.round((active.length / approved.length) * 100) : 0;
    const avgResponseHours = calculateAverageReplyHours(state.tickets);
    const registrationSeries = buildRegistrationSeries(doctors);
    const registrationAnalytics = calculateRegistrationAnalytics(registrationSeries);

    const approvalNode = document.getElementById("insight-approval-rate");
    const activationNode = document.getElementById("insight-activation-rate");
    const responseNode = document.getElementById("insight-response-time");
    const auditEntriesNode = document.getElementById("insight-audit-entries");
    if (approvalNode) approvalNode.textContent = `${approvalRate}%`;
    if (activationNode) activationNode.textContent = `${activationRate}%`;
    if (responseNode) responseNode.textContent = avgResponseHours === null ? "--" : `${avgResponseHours}h`;
    if (auditEntriesNode) auditEntriesNode.textContent = String(auditEntries.length);

    const registrationTotalNode = document.getElementById("registration-kpi-total");
    const registrationDeltaNode = document.getElementById("registration-kpi-delta");
    const registrationAverageNode = document.getElementById("registration-kpi-average");
    const registrationPeakLabelNode = document.getElementById("registration-kpi-peak-label");
    const registrationPeakValueNode = document.getElementById("registration-kpi-peak-value");
    const registrationGrowthNode = document.getElementById("registration-kpi-growth");
    const registrationGrowthCaptionNode = document.getElementById("registration-kpi-growth-caption");
    const registrationFootnoteNode = document.getElementById("registration-analytics-footnote");
    const registrationCaptionNode = document.getElementById("registration-chart-caption");

    if (registrationTotalNode) registrationTotalNode.textContent = registrationAnalytics.total.toLocaleString("en-GB");
    if (registrationDeltaNode) {
      const deltaPrefix = registrationAnalytics.deltaPercent > 0 ? "+" : "";
      registrationDeltaNode.textContent = `${deltaPrefix}${registrationAnalytics.deltaPercent}% vs previous 3 months`;
    }
    if (registrationAverageNode) registrationAverageNode.textContent = String(registrationAnalytics.average);
    if (registrationPeakLabelNode) registrationPeakLabelNode.textContent = registrationAnalytics.peakLabel;
    if (registrationPeakValueNode) {
      registrationPeakValueNode.textContent = `${registrationAnalytics.peakValue} registration${registrationAnalytics.peakValue === 1 ? "" : "s"}`;
    }
    if (registrationGrowthNode) {
      const growthPrefix = registrationAnalytics.growthPercent > 0 ? "+" : "";
      registrationGrowthNode.textContent = `${growthPrefix}${registrationAnalytics.growthPercent}%`;
    }
    if (registrationGrowthCaptionNode) registrationGrowthCaptionNode.textContent = registrationAnalytics.growthCaption;
    if (registrationFootnoteNode) {
      registrationFootnoteNode.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.25h.01"></path><path d="M11 12h1v4h1"></path><path d="M12 3.75a8.25 8.25 0 1 1 0 16.5 8.25 8.25 0 0 1 0-16.5Z"></path></svg>
        <p>${registrationAnalytics.footnote}</p>
      `;
    }
    if (registrationCaptionNode) {
      registrationCaptionNode.textContent = `Live onboarding activity across the latest ${registrationSeries.length}-month window.`;
    }

    const specialtyList = document.getElementById("specialty-breakdown");
    if (specialtyList) {
      const specialtyCounts = doctors.reduce((acc, doctor) => {
        acc[doctor.specialty] = (acc[doctor.specialty] || 0) + 1;
        return acc;
      }, {});
      const entries = Object.entries(specialtyCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
      specialtyList.innerHTML = entries
        .map(([specialty, count]) => {
          const share = Math.round((count / doctors.length) * 100);
          return `
            <article class="mini-stat">
              <div>
                <strong>${specialty}</strong>
                <span>${share}% of doctor base</span>
              </div>
              <b>${count}</b>
            </article>
          `;
        })
        .join("");
    }

    renderLineChart(document.getElementById("registration-line-chart"), registrationSeries);
  }

  function createBadgeMarkup(value, neutralFallback = false) {
    const label = value === "Deleted" ? "Blocked" : value;
    return `<span class="badge ${slugifyBadge(value)}${neutralFallback ? " neutral" : ""}">${label}</span>`;
  }

  function formatSecurityEventAction(action = "") {
    return String(action || "")
      .split(".")
      .filter(Boolean)
      .map((part) =>
        part
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase())
      )
      .join(" / ") || "Unspecified action";
  }

  function formatSecurityEventTarget(targetType = "", targetId = "") {
    if (!targetType && !targetId) return "—";
    if (!targetId) return targetType;
    return `${targetType} / ${targetId}`;
  }

  function truncateMiddle(value = "", maxLength = 28) {
    const normalized = String(value || "");
    if (normalized.length <= maxLength) return normalized;
    const head = Math.max(8, Math.floor((maxLength - 1) / 2));
    const tail = Math.max(6, maxLength - head - 1);
    return `${normalized.slice(0, head)}…${normalized.slice(-tail)}`;
  }

  function prettifyMetadataKey(key = "") {
    return String(key || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function buildSecurityEventSelectOptions(options = [], allLabel = "All") {
    return options
      .map((value) => {
        if (!value) {
          return `<option value="">${allLabel}</option>`;
        }

        return `<option value="${escapeAdminHtml(value)}">${escapeAdminHtml(formatSecurityEventAction(value))}</option>`;
      })
      .join("");
  }

  function buildSecurityTargetTypeOptions(options = [], allLabel = "All target types") {
    return options
      .map((value) => {
        if (!value) {
          return `<option value="">${allLabel}</option>`;
        }

        return `<option value="${escapeAdminHtml(value)}">${escapeAdminHtml(prettifyMetadataKey(value))}</option>`;
      })
      .join("");
  }

  function buildSecurityPaginationSequence(totalPages, currentPage) {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
    if (currentPage <= 3) {
      pages.add(2);
      pages.add(3);
      pages.add(4);
    }
    if (currentPage >= totalPages - 2) {
      pages.add(totalPages - 1);
      pages.add(totalPages - 2);
      pages.add(totalPages - 3);
    }

    const sorted = [...pages]
      .filter((page) => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);

    const sequence = [];
    sorted.forEach((page, index) => {
      if (index > 0 && page - sorted[index - 1] > 1) {
        sequence.push("ellipsis");
      }
      sequence.push(page);
    });

    return sequence;
  }

  function getDoctorRoleLabel(doctor) {
    return doctor?.doctorAccountType === "standard"
      ? "Standard"
      : "Advanced";
  }

  function getSystemPredictionRecords() {
    const records =
      (systemPredictionsCache.length
        ? systemPredictionsCache.map((entry) => ({ ...entry }))
        : Array.isArray(state.predictions) && state.predictions.length
          ? state.predictions.map((entry) => ({ ...entry }))
          : window.NoufarPredictionStore?.getRecords?.() ||
            (typeof patientPredictions !== "undefined" ? patientPredictions.map((entry) => ({ ...entry })) : []));

    return records
      .map((entry) => {
        const doctorFromState =
          (entry.doctorId && getDoctorById(entry.doctorId)) ||
          state.doctors.find((doctor) => doctor.name === entry.doctorName) ||
          null;

        return {
          ...entry,
          doctorId: entry.doctorId || doctorFromState?.id || "",
          doctorName: entry.doctorName || doctorFromState?.name || entry.predictedByName || "Unknown doctor",
          actualOutcome: entry.actualOutcome || "",
          validationStatus: entry.validationStatus || "Pending",
          source: entry.source || "Manual",
          modelName: formatModelName(entry.modelName),
          runDate: entry.runDate || entry.createdAt || entry.analyzedAt || entry.updatedAt || "",
          correctionDate: entry.validationRecordedAt || "",
          validatedByName: entry.validatedByName || "",
          probability: Number(entry.probability || 0),
        };
      })
      .sort((a, b) => new Date(b.runDate || b.analyzedAt) - new Date(a.runDate || a.analyzedAt));
  }

  function renderSystemComparison(records) {
    const summaryStack = document.getElementById("system-summary-stack");
    if (!summaryStack) return;

    const validatedRecords = records.filter((entry) => entry.actualOutcome && entry.validationStatus !== "Pending");
    const correctCount = validatedRecords.filter((entry) => entry.validationStatus === "Correct").length;
    const incorrectCount = validatedRecords.filter((entry) => entry.validationStatus === "Incorrect").length;
    const pendingCount = records.filter((entry) => !entry.actualOutcome || entry.validationStatus === "Pending").length;
    const accuracy = validatedRecords.length ? Math.round((correctCount / validatedRecords.length) * 100) : 0;

    summaryStack.innerHTML = `
      <article class="system-summary-item">
        <div class="system-summary-top">
          <strong>${correctCount}</strong>
          ${createBadgeMarkup("Correct")}
        </div>
        <p>Validated predictions where the real doctor outcome matched the system output.</p>
      </article>
      <article class="system-summary-item">
        <div class="system-summary-top">
          <strong>${incorrectCount}</strong>
          ${createBadgeMarkup("Incorrect")}
        </div>
        <p>Validated predictions where the real doctor correction differs from the system output.</p>
      </article>
      <article class="system-summary-item">
        <div class="system-summary-top">
          <strong>${pendingCount}</strong>
          ${createBadgeMarkup("Pending")}
        </div>
        <p>Predictions still waiting for the doctor to record the real outcome after follow-up.</p>
      </article>
      <article class="system-summary-item">
        <div class="system-summary-top">
          <strong>${accuracy}%</strong>
          <span class="badge neutral">Accuracy</span>
        </div>
        <p>Current validation accuracy across the predictions that already have a doctor correction.</p>
      </article>
    `;
  }

  function getReadinessIconMarkup(type) {
    const icons = {
      validated: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3.75h8M9 2.75h6a1 1 0 0 1 1 1v1H8v-1a1 1 0 0 1 1-1Zm-1 4h8.5a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2V8.75a2 2 0 0 1 2-2Zm2.5 4.25h5m-5 4h5" /></svg>`,
      accuracy: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.75a7.25 7.25 0 1 0 7.25 7.25" /><path d="M12 12l4.15-4.15" /><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" /></svg>`,
      coverage: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 14.5h3l2-6 3.5 10 2-6h4.5" /></svg>`,
      sensitivity: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4 4 10-10" /></svg>`,
      specificity: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14l-5.5 6.5v5L10.5 18v-6.5Z" /></svg>`,
      pending: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" /></svg>`,
      tp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12.5 3.2 3.2L17 9" /></svg>`,
      fp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5v5m0 4h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" /></svg>`,
      fn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12h8" /></svg>`,
      tn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.25 12h9.5" /><path d="M9.25 8.9h5.5M9.25 15.1h5.5" opacity="0.35" /></svg>`,
    };

    return icons[type] || icons.coverage;
  }

  function renderSystemReadiness(records) {
    const readinessModel = document.getElementById("system-readiness-model");
    const readinessBanner = document.getElementById("system-readiness-banner");
    const evidenceMetrics = document.getElementById("system-evidence-metrics");
    const matrixGrid = document.getElementById("system-matrix-grid");

    if (readinessModel) {
      readinessModel.textContent = adminUi.systemModel || DEFAULT_SYSTEM_MODEL;
    }

    if (!readinessBanner || !evidenceMetrics || !matrixGrid) return;

    const activeModel = adminUi.systemModel || DEFAULT_SYSTEM_MODEL;
    const modelScopedRecords = records.filter((entry) => formatModelName(entry.modelName) === activeModel);
    const validatedRecords = modelScopedRecords.filter(
      (entry) => entry.actualOutcome && entry.validationStatus !== "Pending"
    );
    const totalCount = modelScopedRecords.length;
    const validatedCount = validatedRecords.length;
    const pendingCount = totalCount - validatedCount;
    const coverage = totalCount ? Math.round((validatedCount / totalCount) * 100) : 0;

    const tp = validatedRecords.filter(
      (entry) => entry.result === "Relapse" && entry.actualOutcome === "Relapse"
    ).length;
    const fp = validatedRecords.filter(
      (entry) => entry.result === "Relapse" && entry.actualOutcome === "No Relapse"
    ).length;
    const fn = validatedRecords.filter(
      (entry) => entry.result === "No Relapse" && entry.actualOutcome === "Relapse"
    ).length;
    const tn = validatedRecords.filter(
      (entry) => entry.result === "No Relapse" && entry.actualOutcome === "No Relapse"
    ).length;

    const accuracy = validatedCount ? Math.round(((tp + tn) / validatedCount) * 100) : 0;
    const sensitivity = tp + fn ? Math.round((tp / (tp + fn)) * 100) : 0;
    const specificity = tn + fp ? Math.round((tn / (tn + fp)) * 100) : 0;

    let recommendationTone = "neutral";
    let recommendationTitle = "Insufficient evidence";
    let recommendationCopy =
      "This model does not yet have enough doctor-confirmed evidence to justify a production change.";

    if (validatedCount >= 20 && accuracy >= 80 && sensitivity >= 75) {
      recommendationTone = "good";
      recommendationTitle = "Model is stable for review";
      recommendationCopy =
        "Validated performance looks consistent enough for an admin review before deciding whether to switch the production model.";
    } else if (validatedCount >= 10 && accuracy >= 65) {
      recommendationTone = "warning";
      recommendationTitle = "Model needs closer review";
      recommendationCopy =
        "The model has partial evidence, but the validation base is still moderate. Review risky cases before any switch.";
    }

    readinessBanner.className = `system-readiness-banner tone-${recommendationTone}`;
    readinessBanner.innerHTML = `
      <div class="system-readiness-banner-copy">
        <span class="system-readiness-kicker">Recommendation</span>
        <strong>${recommendationTitle}</strong>
        <p>${recommendationCopy}</p>
      </div>
      <div class="system-readiness-stats">
        <div class="system-readiness-stat-card icon-validated">
          <span class="system-readiness-stat-icon">${getReadinessIconMarkup("validated")}</span>
          <div class="system-readiness-stat-copy">
            <span>Validated cases</span>
            <b>${validatedCount}</b>
          </div>
        </div>
        <div class="system-readiness-stat-card icon-accuracy">
          <span class="system-readiness-stat-icon">${getReadinessIconMarkup("accuracy")}</span>
          <div class="system-readiness-stat-copy">
            <span>Observed accuracy</span>
            <b>${accuracy}%</b>
          </div>
        </div>
      </div>
    `;

    evidenceMetrics.innerHTML = `
      <article class="system-evidence-metric icon-coverage">
        <span class="system-metric-icon">${getReadinessIconMarkup("coverage")}</span>
        <div class="system-metric-copy">
          <span>Coverage</span>
          <strong>${coverage}%</strong>
          <small>${validatedCount} of ${totalCount || 0} predictions doctor-validated</small>
        </div>
      </article>
      <article class="system-evidence-metric icon-sensitivity">
        <span class="system-metric-icon">${getReadinessIconMarkup("sensitivity")}</span>
        <div class="system-metric-copy">
          <span>Sensitivity</span>
          <strong>${sensitivity}%</strong>
          <small>Relapse cases correctly identified</small>
        </div>
      </article>
      <article class="system-evidence-metric icon-specificity">
        <span class="system-metric-icon">${getReadinessIconMarkup("specificity")}</span>
        <div class="system-metric-copy">
          <span>Specificity</span>
          <strong>${specificity}%</strong>
          <small>No-relapse cases correctly excluded</small>
        </div>
      </article>
      <article class="system-evidence-metric icon-pending">
        <span class="system-metric-icon">${getReadinessIconMarkup("pending")}</span>
        <div class="system-metric-copy">
          <span>Pending follow-up</span>
          <strong>${pendingCount}</strong>
          <small>Predictions still waiting for correction</small>
        </div>
      </article>
    `;

    matrixGrid.innerHTML = `
      <article class="system-matrix-cell icon-tp">
        <span class="system-matrix-icon">${getReadinessIconMarkup("tp")}</span>
        <div class="system-matrix-copy">
          <span>True Positive</span>
          <strong>${tp}</strong>
          <small>Predicted relapse and confirmed relapse</small>
        </div>
      </article>
      <article class="system-matrix-cell icon-fp">
        <span class="system-matrix-icon">${getReadinessIconMarkup("fp")}</span>
        <div class="system-matrix-copy">
          <span>False Positive</span>
          <strong>${fp}</strong>
          <small>Predicted relapse but doctor confirmed no relapse</small>
        </div>
      </article>
      <article class="system-matrix-cell icon-fn">
        <span class="system-matrix-icon">${getReadinessIconMarkup("fn")}</span>
        <div class="system-matrix-copy">
          <span>False Negative</span>
          <strong>${fn}</strong>
          <small>Predicted no relapse but doctor confirmed relapse</small>
        </div>
      </article>
      <article class="system-matrix-cell icon-tn">
        <span class="system-matrix-icon">${getReadinessIconMarkup("tn")}</span>
        <div class="system-matrix-copy">
          <span>True Negative</span>
          <strong>${tn}</strong>
          <small>Predicted no relapse and doctor confirmed no relapse</small>
        </div>
      </article>
    `;

  }

  function renderModelComparison(records) {
    const host = document.getElementById("system-comparison-grid");
    if (!host) return;

    const activeModel = adminUi.systemModel || DEFAULT_SYSTEM_MODEL;
    const modelColorMap = {
      "Logistic Regression": "blue",
      "Random Forest": "green",
      "Deep Neural Network": "violet",
    };

    const computeMetrics = (modelLabel) => {
      const modelRecords = records.filter(
        (entry) => formatModelName(entry.modelName) === modelLabel
      );
      const validated = modelRecords.filter(
        (entry) => entry.actualOutcome && entry.validationStatus !== "Pending"
      );
      const totalCount = modelRecords.length;
      const validatedCount = validated.length;

      const tp = validated.filter(
        (e) => e.result === "Relapse" && e.actualOutcome === "Relapse"
      ).length;
      const fp = validated.filter(
        (e) => e.result === "Relapse" && e.actualOutcome === "No Relapse"
      ).length;
      const fn = validated.filter(
        (e) => e.result === "No Relapse" && e.actualOutcome === "Relapse"
      ).length;
      const tn = validated.filter(
        (e) => e.result === "No Relapse" && e.actualOutcome === "No Relapse"
      ).length;

      // Accuracy = (TP + TN) / (TP + TN + FP + FN)
      const accuracy = validatedCount ? Math.round(((tp + tn) / validatedCount) * 100) : 0;
      // Precision = TP / (TP + FP)
      const precisionRaw = tp + fp > 0 ? tp / (tp + fp) : 0;
      const precision = tp + fp > 0 ? Math.round(precisionRaw * 100) : 0;
      // Recall (Sensitivity) = TP / (TP + FN)
      const recallRaw = tp + fn > 0 ? tp / (tp + fn) : 0;
      const recall = tp + fn > 0 ? Math.round(recallRaw * 100) : 0;
      // Specificity = TN / (TN + FP)
      const specificity = tn + fp > 0 ? Math.round((tn / (tn + fp)) * 100) : 0;
      // F1 Score = 2 * (precision * recall) / (precision + recall)
      const f1Raw = precisionRaw + recallRaw > 0
        ? (2 * precisionRaw * recallRaw) / (precisionRaw + recallRaw)
        : 0;
      const f1Score = Math.round(f1Raw * 100);

      return {
        label: modelLabel,
        totalCount,
        validatedCount,
        accuracy,
        precision,
        recall,
        specificity,
        f1Score,
      };
    };

    const stats = SYSTEM_MODEL_OPTIONS.map((option) => computeMetrics(option.label));

    const bestOf = (key) => {
      const max = Math.max(...stats.map((s) => s[key]));
      return max > 0 ? max : -1;
    };
    const bestAccuracy = bestOf("accuracy");
    const bestPrecision = bestOf("precision");
    const bestRecall = bestOf("recall");
    const bestSpecificity = bestOf("specificity");
    const bestF1 = bestOf("f1Score");

    const buildRow = (label, value, isBest, isPrimary) => `
      <div class="comparison-row${isBest ? " is-best" : ""}${isPrimary ? " is-primary" : ""}">
        <span class="comparison-row-label">${label}</span>
        <strong>${value}%</strong>
        ${isBest ? '<span class="comparison-row-badge">Top</span>' : ""}
      </div>
    `;

    host.innerHTML = stats
      .map((s) => {
        const colorClass = modelColorMap[s.label] || "blue";
        const isActive = s.label === activeModel;
        return `
          <article class="comparison-card comparison-card-${colorClass}${isActive ? " is-active" : ""}">
            <header class="comparison-card-head">
              <div>
                <span class="comparison-card-kicker">${isActive ? "Active model" : "Available model"}</span>
                <strong>${escapeAdminHtml(s.label)}</strong>
              </div>
              ${isActive ? '<span class="comparison-card-badge">In production</span>' : ""}
            </header>
            <div class="comparison-card-body">
              ${buildRow("Accuracy", s.accuracy, s.accuracy === bestAccuracy && s.accuracy > 0, true)}
              ${buildRow("Precision", s.precision, s.precision === bestPrecision && s.precision > 0)}
              ${buildRow("Recall", s.recall, s.recall === bestRecall && s.recall > 0)}
              ${buildRow("Specificity", s.specificity, s.specificity === bestSpecificity && s.specificity > 0)}
              ${buildRow("F1 Score", s.f1Score, s.f1Score === bestF1 && s.f1Score > 0)}
            </div>
            <footer class="comparison-card-foot">
              <span><b>${s.validatedCount}</b> validated</span>
              <span><b>${s.totalCount}</b> total</span>
            </footer>
          </article>
        `;
      })
      .join("");
  }

  function populateSystemPage() {
    const tableBody = document.getElementById("system-table-body");
    if (!tableBody) return;

    syncSystemModelUi();

    const search = document.getElementById("system-search");
    const validationFilter = document.getElementById("system-validation-filter");
    const resultFilter = document.getElementById("system-result-filter");
    const summary = document.getElementById("system-table-summary");
    const pagination = document.getElementById("system-pagination");
    let currentPage = 1;
    const pageSize = 10;

    const updateMetrics = (records) => {
      const validatedCount = records.filter((entry) => entry.actualOutcome && entry.validationStatus !== "Pending").length;
      const correctCount = records.filter((entry) => entry.validationStatus === "Correct").length;
      const incorrectCount = records.filter((entry) => entry.validationStatus === "Incorrect").length;
      const pendingCount = records.filter((entry) => !entry.actualOutcome || entry.validationStatus === "Pending").length;
      const accuracy = validatedCount ? Math.round((correctCount / validatedCount) * 100) : 0;

      const metricTotal = document.getElementById("system-total-predictions");
      const metricPending = document.getElementById("system-pending-corrections");
      const metricCorrect = document.getElementById("system-correct-predictions");
      const metricIncorrect = document.getElementById("system-incorrect-predictions");
      const metricAccuracy = document.getElementById("system-validation-accuracy");

      if (metricTotal) metricTotal.textContent = String(records.length);
      if (metricPending) metricPending.textContent = String(pendingCount);
      if (metricCorrect) metricCorrect.textContent = String(correctCount);
      if (metricIncorrect) metricIncorrect.textContent = String(incorrectCount);
      if (metricAccuracy) metricAccuracy.textContent = `${accuracy}%`;
    };

    const renderPagination = (totalItems) => {
      if (!pagination) return;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const pages = [];

      for (let page = 1; page <= totalPages; page += 1) {
        pages.push(`
          <button class="pagination-button${page === currentPage ? " active" : ""}" type="button" data-page="${page}">
            ${page}
          </button>
        `);
      }

      pagination.innerHTML = `
        <button class="pagination-button pagination-nav" type="button" data-page="${Math.max(1, currentPage - 1)}" ${currentPage === 1 ? "disabled" : ""}>
          Prev
        </button>
        ${pages.join("")}
        <button class="pagination-button pagination-nav" type="button" data-page="${Math.min(totalPages, currentPage + 1)}" ${currentPage === totalPages ? "disabled" : ""}>
          Next
        </button>
      `;
      pagination.hidden = totalItems <= pageSize;
    };

    const renderTable = (records) => {
      if (!records.length) {
        tableBody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No predictions match the current system filters.</div></td></tr>`;
        if (summary) summary.textContent = "Showing 0 predictions";
        if (pagination) {
          pagination.hidden = true;
          pagination.innerHTML = "";
        }
        return;
      }

      const totalItems = records.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      currentPage = Math.min(currentPage, totalPages);
      const start = (currentPage - 1) * pageSize;
      const visibleRecords = records.slice(start, start + pageSize);

      tableBody.innerHTML = visibleRecords
        .map(
          (entry) => `
            <tr class="${
              entry.validationStatus === "Incorrect"
                ? "system-row-incorrect"
                : entry.validationStatus === "Correct"
                  ? "system-row-correct"
                  : "system-row-pending"
            }">
              <td>
                <div class="table-meta">
                  <strong>${entry.id}</strong>
                  <span>${formatDate(entry.runDate || entry.analyzedAt, true)}</span>
                </div>
              </td>
              <td>${escapeAdminHtml(entry.doctorName)}</td>
              <td>${escapeAdminHtml(entry.modelName || DEFAULT_SYSTEM_MODEL)}</td>
              <td>${escapeAdminHtml(entry.source)}</td>
              <td>${createBadgeMarkup(entry.result)}</td>
              <td>
                <div class="table-meta">
                  ${createBadgeMarkup(entry.actualOutcome || "Pending", !entry.actualOutcome)}
                  <span>${entry.validatedByName ? `Recorded by ${escapeAdminHtml(entry.validatedByName)}` : "Awaiting doctor correction"}</span>
                </div>
              </td>
              <td>${createBadgeMarkup(entry.validationStatus)}</td>
              <td>${entry.correctionDate ? formatDate(entry.correctionDate, true) : "/"}</td>
            </tr>
          `
        )
        .join("");

      if (summary) {
        const startItem = start + 1;
        const endItem = Math.min(start + pageSize, totalItems);
        summary.textContent = `Showing ${startItem}-${endItem} of ${totalItems} prediction${totalItems > 1 ? "s" : ""}`;
      }

      renderPagination(totalItems);
    };

    const applyFilters = (resetPage = false) => {
      if (resetPage) currentPage = 1;
      const keyword = (search?.value || "").trim().toLowerCase();
      const validation = validationFilter?.value || "all";
      const predictedResult = resultFilter?.value || "all";

      const filtered = getSystemPredictionRecords().filter((entry) => {
        const matchesKeyword =
          !keyword ||
          [entry.id, entry.doctorName, entry.source, entry.result, entry.actualOutcome, entry.validationStatus]
            .join(" ")
            .toLowerCase()
            .includes(keyword);
        const matchesValidation = validation === "all" || entry.validationStatus === validation;
        const matchesResult = predictedResult === "all" || entry.result === predictedResult;
        return matchesKeyword && matchesValidation && matchesResult;
      });

      updateMetrics(filtered);
      renderSystemComparison(filtered);
      renderSystemReadiness(filtered);
      renderModelComparison(getSystemPredictionRecords());
      renderTable(filtered);
    };

    [search, validationFilter, resultFilter].forEach((element) => {
      if (!element) return;
      element.addEventListener("input", () => applyFilters(true));
      element.addEventListener("change", () => applyFilters(true));
    });

    pagination?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button) return;
      const nextPage = Number(button.dataset.page || currentPage);
      if (!Number.isFinite(nextPage) || nextPage === currentPage) return;
      currentPage = nextPage;
      applyFilters(false);
    });

    applyFilters(true);
  }

  function populateSecurityEventsPage() {
    const body = document.getElementById("security-events-table-body");
    if (!body) return;

    const search = document.getElementById("security-events-search");
    const actionFilter = document.getElementById("security-events-action-filter");
    const outcomeFilter = document.getElementById("security-events-outcome-filter");
    const actorRoleFilter = document.getElementById("security-events-actor-role-filter");
    const targetTypeFilter = document.getElementById("security-events-target-type-filter");
    const dateRangeFilter = document.getElementById("security-events-date-range-filter");
    const pageSizeSelect = document.getElementById("security-events-page-size");
    const resetButton = document.getElementById("security-events-reset");
    const exportButton = document.getElementById("security-events-export");
    const summary = document.getElementById("security-events-table-summary");
    const pagination = document.getElementById("security-events-pagination");
    const drawerBody = document.getElementById("security-events-drawer-body");
    const errorBanner = document.getElementById("security-events-error");
    const modal = document.getElementById("security-event-modal");
    const modalBody = document.getElementById("security-event-modal-body");
    const modalCloseTargets = document.querySelectorAll("[data-close-security-event-modal]");

    if (actionFilter && !actionFilter.options.length) {
      actionFilter.innerHTML = buildSecurityEventSelectOptions(
        SECURITY_EVENT_ACTION_OPTIONS,
        "All actions"
      );
    }

    if (targetTypeFilter && !targetTypeFilter.options.length) {
      targetTypeFilter.innerHTML = buildSecurityTargetTypeOptions(
        SECURITY_EVENT_TARGET_TYPE_OPTIONS,
        "All target types"
      );
    }

    let currentPage = 1;
    let pageSize = Number(pageSizeSelect?.value || 12);
    let selectedEventId = "";
    let currentItems = [];

    const renderEmptyState = (target, message = "Select an event to inspect its details.") => {
      if (!target) return;
      target.innerHTML = `<div class="empty-state">${escapeAdminHtml(message)}</div>`;
    };

    const serializeSecurityMetadata = (metadata) => {
      if (!metadata || !Object.keys(metadata).length) {
        return `<div class="empty-state">No extra metadata was recorded for this event.</div>`;
      }

      return Object.entries(metadata)
        .map(([key, value]) => `
          <div class="security-events-meta-row">
            <span>${escapeAdminHtml(prettifyMetadataKey(key))}</span>
            <strong>${escapeAdminHtml(
              typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "-")
            )}</strong>
          </div>
        `)
        .join("");
    };

    const renderPagination = (paginationData = {}) => {
      if (!pagination) return;
      const totalPages = Math.max(1, Number(paginationData.totalPages || 1));
      const totalItems = Number(paginationData.totalItems || 0);
      const sequence = buildSecurityPaginationSequence(totalPages, currentPage);

      pagination.innerHTML = `
        <button class="pagination-button pagination-nav" type="button" data-page="${Math.max(1, currentPage - 1)}" ${currentPage === 1 ? "disabled" : ""}>
          Previous
        </button>
        ${sequence
          .map((item) =>
            item === "ellipsis"
              ? `<span class="pagination-ellipsis" aria-hidden="true">...</span>`
              : `
                <button class="pagination-button${item === currentPage ? " active" : ""}" type="button" data-page="${item}" aria-current="${item === currentPage ? "page" : "false"}">
                  ${item}
                </button>
              `
          )
          .join("")}
        <button class="pagination-button pagination-nav" type="button" data-page="${Math.min(totalPages, currentPage + 1)}" ${currentPage === totalPages ? "disabled" : ""}>
          Next
        </button>
      `;
      pagination.hidden = totalItems <= pageSize;
    };

    const renderLoadingRows = () => {
      body.innerHTML = Array.from({ length: 10 }, () => `
        <tr class="security-events-row is-loading">
          <td><span class="security-skeleton security-skeleton-sm"></span></td>
          <td><span class="security-skeleton"></span></td>
          <td><span class="security-skeleton security-skeleton-xs"></span></td>
          <td><span class="security-skeleton"></span></td>
          <td><span class="security-skeleton security-skeleton-xs"></span></td>
          <td><span class="security-skeleton"></span></td>
          <td><span class="security-skeleton"></span></td>
          <td><span class="security-skeleton"></span></td>
        </tr>
      `).join("");
      if (summary) summary.textContent = "Loading security events…";
      if (pagination) {
        pagination.hidden = true;
        pagination.innerHTML = "";
      }
    };

    const getSelectedSecurityEvent = () =>
      currentItems.find((entry) => entry.id === selectedEventId);

    const renderDrawer = (entry) => {
      if (!drawerBody) return;
      if (!entry) {
        renderEmptyState(drawerBody);
        return;
      }

      const metadata = entry.metadata && Object.keys(entry.metadata).length
        ? Object.entries(entry.metadata)
            .map(([key, value]) => `
              <div class="security-events-meta-row">
                <span>${escapeAdminHtml(prettifyMetadataKey(key))}</span>
                <strong>${escapeAdminHtml(
                  typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "—")
                )}</strong>
              </div>
            `)
            .join("")
        : `<div class="empty-state">No extra metadata was recorded for this event.</div>`;

      drawerBody.innerHTML = `
        <div class="security-events-detail-stack">
          <section class="security-events-detail-block">
            <div class="security-events-detail-head">
              <div>
                <span class="hero-kicker">Event snapshot</span>
                <h4>${escapeAdminHtml(formatSecurityEventAction(entry.action))}</h4>
              </div>
              ${createBadgeMarkup(entry.outcome || "neutral", !entry.outcome)}
            </div>
            <div class="security-events-detail-grid">
              <div class="security-events-detail-item">
                <span>Event ID</span>
                <strong>${escapeAdminHtml(entry.id || "—")}</strong>
              </div>
              <div class="security-events-detail-item">
                <span>Timestamp</span>
                <strong>${escapeAdminHtml(formatDate(entry.createdAt, true))}</strong>
              </div>
            </div>
          </section>

          <section class="security-events-detail-block">
            <div class="security-events-section-title">Actor</div>
            <div class="security-events-detail-grid">
              <div class="security-events-detail-item">
                <span>Name</span>
                <strong>${escapeAdminHtml(entry.actorName || "Unknown actor")}</strong>
              </div>
              <div class="security-events-detail-item">
                <span>Email</span>
                <strong>${escapeAdminHtml(entry.actorEmail || "—")}</strong>
              </div>
              <div class="security-events-detail-item">
                <span>Role</span>
                <strong>${escapeAdminHtml(entry.actorRole || "—")}</strong>
              </div>
              <div class="security-events-detail-item">
                <span>Actor ID</span>
                <strong>${escapeAdminHtml(entry.actorId || "—")}</strong>
              </div>
            </div>
          </section>

          <section class="security-events-detail-block">
            <div class="security-events-section-title">Target</div>
            <div class="security-events-detail-grid">
              <div class="security-events-detail-item">
                <span>Target type</span>
                <strong>${escapeAdminHtml(entry.targetType || "—")}</strong>
              </div>
              <div class="security-events-detail-item">
                <span>Target ID</span>
                <strong>${escapeAdminHtml(entry.targetId || "—")}</strong>
              </div>
            </div>
          </section>

          <section class="security-events-detail-block">
            <div class="security-events-section-title">Request context</div>
            <div class="security-events-detail-grid">
              <div class="security-events-detail-item">
                <span>IP address</span>
                <strong>${escapeAdminHtml(entry.ipAddress || "—")}</strong>
              </div>
              <div class="security-events-detail-item">
                <span>Session ID</span>
                <strong>${escapeAdminHtml(entry.sessionId || "—")}</strong>
              </div>
              <div class="security-events-detail-item security-events-detail-item-wide">
                <span>User agent</span>
                <strong>${escapeAdminHtml(entry.userAgent || "—")}</strong>
              </div>
            </div>
          </section>

          <section class="security-events-detail-block">
            <div class="security-events-section-title">Metadata</div>
            <div class="security-events-meta-list">
              ${metadata}
            </div>
          </section>
        </div>
      `;
    };

    const openEventModal = (entry) => {
      if (!modal || !modalBody || !entry) return;
      renderDrawer(entry);
      modalBody.innerHTML = drawerBody?.innerHTML || "";
      modal.hidden = false;
      document.body.classList.add("modal-open");
    };

    const closeEventModal = () => {
      if (!modal || modal.hidden) return;
      modal.hidden = true;
      document.body.classList.remove("modal-open");
    };

    const buildQuery = () => {
      const query = new URLSearchParams();
      const keyword = (search?.value || "").trim();
      const action = actionFilter?.value || "";
      const outcome = outcomeFilter?.value || "";
      const actorRole = actorRoleFilter?.value || "";
      const targetType = targetTypeFilter?.value || "";
      const dateRange = dateRangeFilter?.value || "7";

      query.set("page", String(currentPage));
      query.set("pageSize", String(pageSize));

      if (keyword) query.set("search", keyword);
      if (action) query.set("action", action);
      if (outcome) query.set("outcome", outcome);
      if (actorRole) query.set("actorRole", actorRole);
      if (targetType) query.set("targetType", targetType);

      if (dateRange && dateRange !== "all") {
        const days = Number(dateRange);
        if (Number.isFinite(days) && days > 0) {
          const dateFrom = new Date();
          dateFrom.setDate(dateFrom.getDate() - days);
          query.set("dateFrom", dateFrom.toISOString());
        }
      }

      return query;
    };

    const renderRows = (items = [], paginationData = {}) => {
      currentItems = Array.isArray(items) ? items : [];
      const totalItems = Number(paginationData.totalItems || 0);
      const startIndex = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
      const endIndex = totalItems ? Math.min(startIndex + currentItems.length - 1, totalItems) : 0;

      if (!currentItems.length) {
        body.innerHTML = `<tr><td colspan="8"><div class="empty-state">${totalItems ? "No security events match the current filters." : "No security events recorded yet."}</div></td></tr>`;
        if (summary) summary.textContent = "Showing 0 events";
        if (pagination) {
          pagination.hidden = true;
          pagination.innerHTML = "";
        }
        renderEmptyState(
          drawerBody,
          totalItems ? "No selected event for the current filtered result." : "No security events recorded yet."
        );
        closeEventModal();
        return;
      }

      body.innerHTML = currentItems
        .map((entry) => `
          <tr class="security-events-row${selectedEventId === entry.id ? " is-selected" : ""}" data-security-event-id="${escapeAdminHtml(entry.id)}">
            <td>
              <div class="table-meta">
                <strong>${escapeAdminHtml(formatDate(entry.createdAt, true))}</strong>
                <span>${escapeAdminHtml(entry.id || "")}</span>
              </div>
            </td>
            <td class="security-events-cell-wide" title="${escapeAdminHtml(entry.action || "")}">
              <div class="table-meta">
                <strong>${escapeAdminHtml(formatSecurityEventAction(entry.action))}</strong>
                <span>${escapeAdminHtml(truncateMiddle(entry.action || "", 44))}</span>
              </div>
            </td>
            <td>${createBadgeMarkup(entry.outcome || "neutral", !entry.outcome)}</td>
            <td class="security-events-cell-wide" title="${escapeAdminHtml(entry.actorEmail || entry.actorName || "")}">
              <div class="table-meta">
                <strong>${escapeAdminHtml(entry.actorName || "Unknown actor")}</strong>
                <span>${escapeAdminHtml(truncateMiddle(entry.actorEmail || "—", 32))}</span>
              </div>
            </td>
            <td>${createBadgeMarkup(entry.actorRole || "neutral", true)}</td>
            <td class="security-events-cell-wide" title="${escapeAdminHtml(formatSecurityEventTarget(entry.targetType, entry.targetId))}">
              <div class="table-meta">
                <strong>${escapeAdminHtml(entry.targetType || "—")}</strong>
                <span>${escapeAdminHtml(truncateMiddle(entry.targetId || "—", 28))}</span>
              </div>
            </td>
            <td title="${escapeAdminHtml(entry.ipAddress || "—")}">${escapeAdminHtml(truncateMiddle(entry.ipAddress || "—", 24))}</td>
            <td title="${escapeAdminHtml(entry.sessionId || "—")}">${escapeAdminHtml(truncateMiddle(entry.sessionId || "—", 24))}</td>
          </tr>
        `)
        .join("");

      if (summary) {
        summary.textContent = `Showing ${startIndex}-${endIndex} of ${totalItems} event${totalItems === 1 ? "" : "s"}`;
      }

      if (!selectedEventId || !currentItems.some((entry) => entry.id === selectedEventId)) {
        selectedEventId = currentItems[0]?.id || "";
      }

      renderDrawer(getSelectedSecurityEvent());
      renderPagination(paginationData);
    };

    const loadSecurityEvents = async (resetPage = false) => {
      if (resetPage) currentPage = 1;
      closeEventModal();
      renderLoadingRows();
      if (errorBanner) {
        errorBanner.hidden = true;
        errorBanner.textContent = "";
      }

      try {
        const query = buildQuery();
        const payload = await requestAdminJson(`/security-events?${query.toString()}`);
        currentPage = Number(payload?.pagination?.page || currentPage);
        renderRows(payload?.items || [], payload?.pagination || {});
      } catch (error) {
        body.innerHTML = `<tr><td colspan="8"><div class="empty-state">Unable to load the security events right now.</div></td></tr>`;
        if (summary) summary.textContent = "Security events unavailable";
        renderEmptyState(drawerBody, "Unable to load the selected event details right now.");
        closeEventModal();
        if (pagination) {
          pagination.hidden = true;
          pagination.innerHTML = "";
        }
        if (errorBanner) {
          errorBanner.hidden = false;
          errorBanner.textContent = error?.message || "Unable to load the security events right now.";
        }
      }
    };

    [search, actionFilter, outcomeFilter, actorRoleFilter, targetTypeFilter, dateRangeFilter].forEach((element) => {
      if (!element) return;
      element.addEventListener("input", () => {
        loadSecurityEvents(true);
      });
      element.addEventListener("change", () => {
        loadSecurityEvents(true);
      });
    });

    pageSizeSelect?.addEventListener("change", () => {
      const nextPageSize = Number(pageSizeSelect.value || 12);
      if (!Number.isFinite(nextPageSize) || nextPageSize === pageSize) return;
      pageSize = nextPageSize;
      loadSecurityEvents(true);
    });

    resetButton?.addEventListener("click", () => {
      if (search) search.value = "";
      if (actionFilter) actionFilter.value = "";
      if (outcomeFilter) outcomeFilter.value = "";
      if (actorRoleFilter) actorRoleFilter.value = "";
      if (targetTypeFilter) targetTypeFilter.value = "";
      if (dateRangeFilter) dateRangeFilter.value = "7";
      if (pageSizeSelect) pageSizeSelect.value = "12";
      pageSize = Number(pageSizeSelect?.value || 12);
      selectedEventId = "";
      closeEventModal();
      loadSecurityEvents(true);
    });

    pagination?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;
      const nextPage = Number(button.dataset.page || currentPage);
      if (!Number.isFinite(nextPage) || nextPage === currentPage) return;
      currentPage = nextPage;
      loadSecurityEvents(false);
    });

    body.addEventListener("click", (event) => {
      const row = event.target.closest("[data-security-event-id]");
      if (!row) return;
      selectedEventId = row.getAttribute("data-security-event-id") || "";
      body.querySelectorAll(".security-events-row.is-selected").forEach((entry) => {
        entry.classList.remove("is-selected");
      });
      row.classList.add("is-selected");
      renderDrawer(getSelectedSecurityEvent());
    });

    body.addEventListener("dblclick", (event) => {
      const row = event.target.closest("[data-security-event-id]");
      if (!row) return;
      selectedEventId = row.getAttribute("data-security-event-id") || "";
      renderDrawer(getSelectedSecurityEvent());
      openEventModal(getSelectedSecurityEvent());
    });

    modalCloseTargets.forEach((target) => {
      target.addEventListener("click", () => {
        closeEventModal();
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeEventModal();
      }
    });

    exportButton?.addEventListener("click", async () => {
      try {
        const query = buildQuery();
        query.delete("page");
        query.delete("pageSize");
        await downloadAdminFile(
          `/security-events/export${query.toString() ? `?${query.toString()}` : ""}`,
          "security-events.csv"
        );
        showToast("Security events exported successfully.");
      } catch (error) {
        showToast(error?.message || "Unable to export the security events.", "danger");
      }
    });

    loadSecurityEvents(true);
  }

  function populateDoctorsPage() {
    const body = document.getElementById("doctor-table-body");
    if (!body) return;

    const search = document.getElementById("doctor-search");
    const approvalFilter = document.getElementById("approval-filter");
    const accountFilter = document.getElementById("account-filter");
    const specialtyFilter = document.getElementById("specialty-filter");
    const accessFilter = document.getElementById("access-filter");
    const dateFilter = document.getElementById("date-filter");
    const exportButton = document.getElementById("export-doctors");
    const summary = document.getElementById("doctor-table-summary");
    const pagination = document.getElementById("doctor-pagination");
    const params = new URLSearchParams(window.location.search);
    let currentPage = 1;
    const pageSize = 5;

    const specialties = [...new Set(state.doctors.map((doctor) => doctor.specialty))];
    if (specialtyFilter) {
      specialtyFilter.innerHTML += specialties.map((specialty) => `<option value="${specialty}">${specialty}</option>`).join("");
    }

    const queryApproval = params.get("approval");
    if (queryApproval && approvalFilter) {
      approvalFilter.value = queryApproval;
    }

    const renderPagination = (totalItems) => {
      if (!pagination) return;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const pages = [];

      for (let page = 1; page <= totalPages; page += 1) {
        pages.push(`
          <button class="pagination-button${page === currentPage ? " active" : ""}" type="button" data-page="${page}">
            ${page}
          </button>
        `);
      }

      pagination.innerHTML = `
        <button class="pagination-button pagination-nav" type="button" data-page="${Math.max(1, currentPage - 1)}" ${currentPage === 1 ? "disabled" : ""}>
          Prev
        </button>
        ${pages.join("")}
        <button class="pagination-button pagination-nav" type="button" data-page="${Math.min(totalPages, currentPage + 1)}" ${currentPage === totalPages ? "disabled" : ""}>
          Next
        </button>
      `;
      pagination.hidden = totalItems <= pageSize;
    };

    const applyFilters = (resetPage = false) => {
      if (resetPage) currentPage = 1;
      const keyword = (search?.value || "").trim().toLowerCase();
      const approval = approvalFilter?.value || "all";
      const account = accountFilter?.value || "all";
      const specialty = specialtyFilter?.value || "all";
      const access = accessFilter?.value || "all";
      const dateRange = dateFilter?.value || "all";
      const now = new Date("2026-04-20T12:00:00");

      const filtered = state.doctors.filter((doctor) => {
        const matchesKeyword =
          !keyword ||
          [doctor.name, doctor.email, doctor.id, doctor.phone, doctor.hospital].join(" ").toLowerCase().includes(keyword);
        const matchesApproval = approval === "all" || doctor.approvalStatus === approval;
        const matchesAccount = account === "all" || doctor.accountStatus === account;
        const matchesSpecialty = specialty === "all" || doctor.specialty === specialty;
        const matchesAccess = access === "all" || doctor.doctorAccountType === access;
        let matchesDate = true;
        if (dateRange !== "all") {
          const registrationDate = new Date(doctor.registrationDate);
          const diff = (now - registrationDate) / (1000 * 60 * 60 * 24);
          if (dateRange === "7") matchesDate = diff <= 7;
          if (dateRange === "30") matchesDate = diff <= 30;
          if (dateRange === "90") matchesDate = diff <= 90;
        }
        return matchesKeyword && matchesApproval && matchesAccount && matchesSpecialty && matchesAccess && matchesDate;
      });

      const totalItems = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      currentPage = Math.min(currentPage, totalPages);
      const startIndex = (currentPage - 1) * pageSize;
      const pagedDoctors = filtered.slice(startIndex, startIndex + pageSize);

      body.innerHTML = pagedDoctors
        .map((doctor) => `
          <tr class="ctx-row" data-doctor-id="${doctor.id}">
            <td>
              <div class="table-meta">
                <strong>${doctor.name}</strong>
                <span>${doctor.id}</span>
              </div>
            </td>
            <td>${doctor.email}</td>
            <td>${doctor.specialty}</td>
            <td>${createBadgeMarkup(getDoctorRoleLabel(doctor), true)}</td>
            <td>${formatDate(doctor.registrationDate)}</td>
            <td>${createBadgeMarkup(doctor.approvalStatus)}</td>
            <td>${createBadgeMarkup(doctor.accountStatus)}</td>
            <td class="ctx-action-cell">
              <button class="ctx-trigger" type="button" data-ctx-id="${doctor.id}" aria-label="Open actions">
                <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
                  <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
                  <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                  <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
                </svg>
              </button>
            </td>
          </tr>
        `)
        .join("");

      if (!filtered.length) {
        body.innerHTML = `<tr><td colspan="8"><div class="empty-state">No doctors match the current filters.</div></td></tr>`;
      }

      if (summary) {
        if (!filtered.length) {
          summary.textContent = "Showing 0 doctors";
        } else {
          const visibleFrom = startIndex + 1;
          const visibleTo = startIndex + pagedDoctors.length;
          summary.textContent = `Showing ${visibleFrom}-${visibleTo} of ${filtered.length} doctors`;
        }
      }

      renderPagination(filtered.length);
    };

    [search, approvalFilter, accountFilter, specialtyFilter, accessFilter, dateFilter].forEach((element) => {
      if (!element) return;
      element.addEventListener("input", () => applyFilters(true));
      element.addEventListener("change", () => applyFilters(true));
    });

    pagination?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;
      currentPage = Number(button.dataset.page);
      applyFilters();
    });

    if (exportButton) {
      exportButton.addEventListener("click", async () => {
        const query = new URLSearchParams();
        const keyword = (search?.value || "").trim();
        const approval = approvalFilter?.value || "all";
        const account = accountFilter?.value || "all";
        const specialty = specialtyFilter?.value || "all";
        const access = accessFilter?.value || "all";
        const dateRange = dateFilter?.value || "all";

        if (keyword) query.set("search", keyword);
        if (approval && approval !== "all") query.set("approvalStatus", approval);
        if (account && account !== "all") query.set("accountStatus", account);
        if (specialty && specialty !== "all") query.set("specialty", specialty);
        if (access && access !== "all") query.set("doctorAccountType", access);
        if (dateRange && dateRange !== "all") query.set("dateRange", dateRange);

        try {
          await downloadAdminFile(
            `/auth/admin/users/export${query.toString() ? `?${query.toString()}` : ""}`,
            "doctors-directory.csv"
          );
          showToast("Doctors directory exported successfully.");
        } catch (error) {
          showToast(error?.message || "Unable to export the doctors directory.", "danger");
        }
      });
    }

    // Left-click on row → navigate to doctor details
    body.addEventListener("dblclick", (event) => {
      if (event.target.closest(".ctx-trigger")) return;
      const row = event.target.closest("tr[data-doctor-id]");
      if (!row) return;
      window.location.href = `doctor-details.html?id=${encodeURIComponent(row.dataset.doctorId)}`;
    });

    // Kebab (⋮) click → open context menu (right-anchored)
    body.addEventListener("click", (event) => {
      const trigger = event.target.closest(".ctx-trigger");
      if (!trigger) return;
      event.stopPropagation();
      const doctor = getDoctorById(trigger.dataset.ctxId);
      if (!doctor) return;
      const rect = trigger.getBoundingClientRect();
      openContextMenu(doctor, rect.right, rect.bottom + 6, true);
    });

    // Right-click on row → open context menu at cursor
    body.addEventListener("contextmenu", (event) => {
      const row = event.target.closest("tr[data-doctor-id]");
      if (!row) return;
      event.preventDefault();
      const doctor = getDoctorById(row.dataset.doctorId);
      if (!doctor) return;
      openContextMenu(doctor, event.clientX + 2, event.clientY + 2, false);
    });

    function openContextMenu(doctor, x, y, anchorRight = false) {
      document.getElementById("doctor-ctx-menu")?.remove();

      const isDeleted  = doctor.accountStatus === "Deleted";
      const isApproved = doctor.approvalStatus === "Approved";
      const isPending  = doctor.approvalStatus === "Pending";
      const isActive   = doctor.accountStatus === "Active";

      const items = [];

      items.push(`<button class="ctx-item" data-ctx-action="view">
        <span class="ctx-icon ctx-icon-white">
          <svg viewBox="0 0 24 24"><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" fill="currentColor"/><path d="M2.46 12.5a.75.75 0 0 1 0-1C3.7 9.52 7.37 5.25 12 5.25s8.3 4.27 9.54 6.25a.75.75 0 0 1 0 1C20.3 14.48 16.63 18.75 12 18.75S3.7 14.48 2.46 12.5Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
        </span>
        <span class="ctx-label">View details</span>
      </button>`);

      if (isPending && !isDeleted) {
        items.push(`<button class="ctx-item" data-ctx-action="approve">
          <span class="ctx-icon ctx-icon-success">
            <svg viewBox="0 0 24 24"><path d="M9.55 17.05 4.5 12l1.4-1.4 3.65 3.65 8.55-8.55L19.5 7.1l-9.95 9.95Z" fill="currentColor"/></svg>
          </span>
          <span class="ctx-label ctx-label-success">Approve</span>
        </button>`);
        items.push(`<button class="ctx-item" data-ctx-action="reject">
          <span class="ctx-icon ctx-icon-danger">
            <svg viewBox="0 0 24 24"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4Z" fill="currentColor"/></svg>
          </span>
          <span class="ctx-label ctx-label-danger">Reject</span>
        </button>`);
      }

      if (isApproved && !isDeleted) {
        if (isActive) {
          items.push(`<button class="ctx-item" data-ctx-action="deactivate">
            <span class="ctx-icon ctx-icon-warning">
              <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 0 1-6.32-12.9l11.22 11.22A7.94 7.94 0 0 1 12 20Zm6.32-3.1L7.1 5.68A8 8 0 0 1 18.32 16.9Z" fill="currentColor"/></svg>
            </span>
            <span class="ctx-label ctx-label-warning">Deactivate</span>
          </button>`);
        } else {
          items.push(`<button class="ctx-item" data-ctx-action="reactivate">
            <span class="ctx-icon ctx-icon-success">
              <svg viewBox="0 0 24 24"><path d="M9.55 17.05 4.5 12l1.4-1.4 3.65 3.65 8.55-8.55L19.5 7.1l-9.95 9.95Z" fill="currentColor"/></svg>
            </span>
            <span class="ctx-label ctx-label-success">Activate</span>
          </button>`);
        }
        const isStandard = doctor.doctorAccountType === "standard";
        const accessLabel = isStandard ? "Grant prediction access" : "Set standard access";
        const accessIconClass = isStandard ? "ctx-icon-purple" : "ctx-icon-blue";
        const accessLabelClass = isStandard ? "ctx-label-purple" : "ctx-label-blue";
        const accessIcon = isStandard
          ? `<svg viewBox="0 0 24 24"><path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" fill="currentColor"/></svg>`
          : `<svg viewBox="0 0 24 24"><path d="M12 2 4 6v6c0 5 3.5 9.4 8 10 4.5-.6 8-5 8-10V6l-8-4Zm0 6.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-3.5 8.5c0-1.7 1.6-3 3.5-3s3.5 1.3 3.5 3v.5h-7V17Z" fill="currentColor"/></svg>`;
        items.push(`<button class="ctx-item" data-ctx-action="toggle-access">
          <span class="ctx-icon ${accessIconClass}">
            ${accessIcon}
          </span>
          <span class="ctx-label ${accessLabelClass}">${accessLabel}</span>
        </button>`);
        items.push(`<div class="ctx-sep"></div>`);
        items.push(`<button class="ctx-item" data-ctx-action="delete">
          <span class="ctx-icon ctx-icon-danger">
            <svg viewBox="0 0 24 24"><path d="M9 3.75h6a1 1 0 0 1 1 1v1.25h3a.75.75 0 0 1 0 1.5h-1.05l-.82 11.04A2.25 2.25 0 0 1 14.89 20.75H9.11a2.25 2.25 0 0 1-2.24-2.21L6.05 7.5H5a.75.75 0 0 1 0-1.5h3V4.75a1 1 0 0 1 1-1Z" fill="currentColor"/></svg>
          </span>
          <span class="ctx-label ctx-label-danger">Block account</span>
        </button>`);
      }

      if (isApproved && isDeleted) {
        items.push(`<button class="ctx-item" data-ctx-action="reactivate">
          <span class="ctx-icon ctx-icon-success">
            <svg viewBox="0 0 24 24"><path d="M9.55 17.05 4.5 12l1.4-1.4 3.65 3.65 8.55-8.55L19.5 7.1l-9.95 9.95Z" fill="currentColor"/></svg>
          </span>
          <span class="ctx-label ctx-label-success">Unblock account</span>
        </button>`);
      }

      const menu = document.createElement("div");
      menu.id = "doctor-ctx-menu";
      menu.className = "ctx-menu";
      menu.innerHTML = `<div class="ctx-items">${items.join("")}</div>`;
      document.body.appendChild(menu);

      // Smart positioning
      const mw = menu.offsetWidth || 240;
      const mh = menu.offsetHeight || 180;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = anchorRight ? x - mw : x;
      let top  = y;
      if (left < 8) left = 8;
      if (left + mw > vw - 8) left = vw - mw - 8;
      if (top + mh > vh - 8) top = y - mh - 8;
      if (top < 8) top = 8;
      menu.style.left = `${left}px`;
      menu.style.top  = `${top}px`;

      // Action handler
      menu.addEventListener("click", async (event) => {
        const item = event.target.closest("[data-ctx-action]");
        if (!item) return;
        event.stopPropagation();
        menu.remove();
        const action = item.dataset.ctxAction;

        if (action === "view") {
          window.location.href = `doctor-details.html?id=${encodeURIComponent(doctor.id)}`;
          return;
        }
        if (action === "approve") {
          const ok = await approveDoctor(doctor.id);
          if (ok) applyFilters();
          return;
        }
        if (action === "reactivate") {
          if (doctor.accountStatus === "Deleted") {
            openConfirmation({
              title: "Unblock doctor account",
              message: "This will restore platform access for this doctor account.",
              confirmLabel: "Unblock account",
              variant: "success",
              onConfirm: async () => {
                const ok = await reactivateDoctor(doctor.id);
                if (ok) applyFilters();
              }
            });
          } else {
            const ok = await reactivateDoctor(doctor.id);
            if (ok) applyFilters();
          }
          return;
        }
        if (action === "toggle-access") {
          const nextAccess = doctor.doctorAccountType === "standard" ? "prediction" : "standard";
          openConfirmation({
            title: nextAccess === "prediction" ? "Grant prediction access" : "Set standard doctor access",
            message: nextAccess === "prediction"
              ? "This will allow the doctor to manage patients and launch predictions."
              : "This will keep the doctor in patient-management mode without prediction workflows.",
            confirmLabel: nextAccess === "prediction" ? "Grant access" : "Set standard access",
            variant: nextAccess === "prediction" ? "purple" : "blue",
            onConfirm: async () => {
              const ok = await updateDoctorAccessType(doctor.id, nextAccess);
              if (ok) applyFilters();
            }
          });
          return;
        }
        if (action === "reject") {
          openConfirmation({
            title: "Reject doctor registration",
            message: "You can add an optional rejection reason before rejecting this doctor.",
            confirmLabel: "Reject doctor",
            reasonField: true,
            variant: "danger",
            onConfirm: async (reason) => {
              const ok = await rejectDoctor(doctor.id, reason);
              if (ok) applyFilters();
            }
          });
          return;
        }
        if (action === "deactivate") {
          openConfirmation({
            title: "Deactivate doctor account",
            message: "Add the reason for deactivation. The doctor will see it when trying to log in.",
            confirmLabel: "Deactivate account",
            reasonField: true,
            variant: "warning",
            onConfirm: async (reason) => {
              const ok = await deactivateDoctor(doctor.id, reason);
              if (ok) applyFilters();
            }
          });
          return;
        }
        if (action === "delete") {
          openConfirmation({
            title: "Block doctor account",
            message: "Add the reason for blocking this account. The doctor will receive it by email and see it when trying to log in.",
            confirmLabel: "Block account",
            reasonField: true,
            variant: "danger",
            onConfirm: async (reason) => {
              const ok = await deleteDoctor(doctor.id, reason);
              if (ok) applyFilters();
            }
          });
        }
      });

      // Close on outside click
      const onOutside = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener("click", onOutside, true);
        }
      };
      setTimeout(() => document.addEventListener("click", onOutside, true), 0);
    }

    applyFilters(true);
  }

  function populateDoctorDetails() {
    const root = document.getElementById("doctor-detail-root");
    if (!root) return;
    setupDocumentPreviewModal();

    const params = new URLSearchParams(window.location.search);
    const selectedId = params.get("id") || state.doctors[0]?.id;
    const doctor = getDoctorById(selectedId);
    if (!doctor) return;

    const supportHistory = getDoctorTickets(doctor.id);
    document.getElementById("detail-name").textContent = doctor.name;
    document.getElementById("detail-subtitle").textContent = `${doctor.specialty} - ${doctor.hospital}`;
    document.getElementById("detail-approval").innerHTML = createBadgeMarkup(doctor.approvalStatus);
    document.getElementById("detail-account").innerHTML = createBadgeMarkup(doctor.accountStatus);
    document.getElementById("detail-email").textContent = doctor.email;
    document.getElementById("detail-specialty").textContent = doctor.specialty;
    document.getElementById("detail-institution").textContent = doctor.hospital;
    document.getElementById("detail-role").textContent = getDoctorRoleLabel(doctor);
    document.getElementById("detail-registration").textContent = formatDate(doctor.registrationDate);

    const documents = document.getElementById("detail-documents");
    if (!doctor.submittedDocuments?.length) {
      documents.innerHTML = `<div class="empty-state">No uploaded documents were found for this doctor.</div>`;
    } else {
      documents.innerHTML = doctor.submittedDocuments
        .map((document, index) => {
          const fileName = document.file || document.fileName || "Unknown file";
          const fileUrl = document.downloadUrl || "";
          const canCheck = Boolean(fileUrl);

          return `
            <article class="document-row">
              <div>
                <strong>${document.label}</strong>
                <small>${fileName}</small>
              </div>
              ${
                canCheck
                  ? `<a class="action-button secondary document-check-button" href="${fileUrl}" target="_blank" rel="noopener noreferrer" data-document-index="${index}">Check</a>`
                  : `<span class="badge neutral">Unavailable</span>`
              }
            </article>
          `;
        })
        .join("");
    }

    documents.onclick = (event) => {
      const trigger = event.target.closest("[data-document-index]");
      if (!trigger) return;
      event.preventDefault();
      openDocumentPreview(doctor, trigger.dataset.documentIndex);
    };

    const supportList = document.getElementById("detail-support-history");
    const supportCard = document.getElementById("detail-support-card");
    const canShowSupportHistory = doctor.approvalStatus === "Approved";
    if (supportCard) {
      supportCard.hidden = !canShowSupportHistory;
    }
    if (canShowSupportHistory && supportList) {
      supportList.innerHTML = supportHistory.length
        ? supportHistory
            .map(
              (ticket) => `
                <article class="list-row">
                  <div class="list-row-head">
                    <strong>${ticket.subject}</strong>
                    ${createBadgeMarkup(ticket.status)}
                  </div>
                  <p>${ticket.category} - ${formatDate(ticket.updatedAt, true)}</p>
                </article>
              `
            )
            .join("")
        : `<div class="empty-state">No support history recorded for this approved doctor.</div>`;
    }

    const actions = document.getElementById("detail-actions");
    const approveButton = actions.querySelector('[data-detail-action="approve"]');
    const rejectButton = actions.querySelector('[data-detail-action="reject"]');
    const deactivateButton = actions.querySelector('[data-detail-action="deactivate"]');
    const reactivateButton = actions.querySelector('[data-detail-action="reactivate"]');
    const toggleAccessButton = actions.querySelector('[data-detail-action="toggle-access"]');
    const deleteButton = actions.querySelector('[data-detail-action="delete"]');

    if (doctor.approvalStatus !== "Pending") {
      approveButton?.remove();
      rejectButton?.remove();
    }

    if (doctor.accountStatus === "Deleted") {
      approveButton?.remove();
      rejectButton?.remove();
      deactivateButton?.remove();
    }

    if (doctor.approvalStatus !== "Approved" || doctor.accountStatus !== "Active") {
      deactivateButton?.remove();
    }

    if (doctor.approvalStatus !== "Approved" || doctor.accountStatus === "Active") {
      reactivateButton?.remove();
    } else if (reactivateButton) {
      const strong = reactivateButton.querySelector("strong");
      const small = reactivateButton.querySelector("small");
      if (doctor.accountStatus === "Deleted") {
        if (strong) strong.textContent = "Unblock account";
        if (small) small.textContent = "Restore this doctor account access";
      } else {
        if (strong) strong.textContent = "Activate";
        if (small) small.textContent = "Restore this doctor account";
      }
    }

    if (doctor.approvalStatus !== "Approved" || doctor.accountStatus === "Deleted") {
      deleteButton?.remove();
    }

    if (doctor.approvalStatus !== "Approved" || doctor.accountStatus === "Deleted") {
      toggleAccessButton?.remove();
    } else if (toggleAccessButton) {
      toggleAccessButton.textContent =
        doctor.doctorAccountType === "standard" ? "Grant prediction access" : "Set standard access";
    }

    actions.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-detail-action]");
      if (!button) return;
      const action = button.dataset.detailAction;
      if (action === "approve") {
        const didApprove = await approveDoctor(doctor.id);
        if (didApprove) window.location.reload();
        return;
      }
      if (action === "reactivate") {
        if (doctor.accountStatus === "Deleted") {
          openConfirmation({
            title: "Unblock doctor account",
            message: "This will restore platform access for this doctor account.",
            confirmLabel: "Unblock account",
            variant: "success",
            onConfirm: async () => {
              const didActivate = await reactivateDoctor(doctor.id);
              if (didActivate) window.location.reload();
            }
          });
        } else {
          const didActivate = await reactivateDoctor(doctor.id);
          if (didActivate) window.location.reload();
        }
        return;
      }
      if (action === "toggle-access") {
        const nextAccess = doctor.doctorAccountType === "standard" ? "prediction" : "standard";
        openConfirmation({
          title: nextAccess === "prediction" ? "Grant prediction access" : "Set standard doctor access",
          message:
            nextAccess === "prediction"
              ? "This will allow the doctor to manage patients and launch predictions."
              : "This will keep the doctor in patient-management mode without prediction workflows.",
          confirmLabel: nextAccess === "prediction" ? "Grant access" : "Set standard access",
          variant: nextAccess === "prediction" ? "purple" : "blue",
          onConfirm: async () => {
            const didUpdate = await updateDoctorAccessType(doctor.id, nextAccess);
            if (didUpdate) window.location.reload();
          }
        });
        return;
      }
      if (action === "reject") {
        openConfirmation({
          title: "Reject doctor registration",
          message: "Add an optional rejection reason before saving this decision.",
          confirmLabel: "Reject doctor",
          reasonField: true,
          variant: "danger",
          onConfirm: async (reason) => {
            const didReject = await rejectDoctor(doctor.id, reason);
            if (didReject) window.location.reload();
          }
        });
        return;
      }
        if (action === "deactivate") {
          openConfirmation({
            title: "Deactivate doctor account",
            message: "Add the reason for deactivation. The doctor will see it when trying to log in.",
            confirmLabel: "Deactivate account",
            reasonField: true,
            variant: "warning",
            onConfirm: async (reason) => {
              const didDeactivate = await deactivateDoctor(doctor.id, reason);
              if (didDeactivate) window.location.reload();
            }
        });
        return;
      }
      if (action === "delete") {
        openConfirmation({
          title: "Block doctor account",
          message: "Add the reason for blocking this account. The doctor will receive it by email and see it when trying to log in.",
          confirmLabel: "Block account",
          reasonField: true,
          variant: "danger",
          onConfirm: async (reason) => {
            const didDelete = await deleteDoctor(doctor.id, reason);
            if (didDelete) window.location.reload();
          }
        });
      }
    });
  }

  function populateSupportCenter() {
    const list = document.getElementById("support-ticket-list");
    if (!list) return;

    const search = document.getElementById("ticket-search");
    const statusFilter = document.getElementById("ticket-status-filter");
    const priorityFilter = document.getElementById("ticket-priority-filter");
    const dateFilter = document.getElementById("ticket-date-filter");
    const selectAllToggle = document.getElementById("admin-ticket-select-all");
    const deleteSelectedButton = document.getElementById("admin-delete-selected");
    const deleteAllButton = document.getElementById("admin-delete-all");
    const replyForm = document.getElementById("reply-form");
    const replyInput = document.getElementById("reply-message");
    const replyFileInput = document.getElementById("reply-file");
    const replyFileBar = document.getElementById("reply-file-bar");
    const replyFileName = document.getElementById("reply-file-name");
    const replyFileClear = document.getElementById("reply-file-clear");
    const replyActionRow = document.getElementById("reply-action-row");
    const statusSelect = document.getElementById("ticket-status-select");
    const resolveButton = document.getElementById("resolve-toggle");
    const workflowControlPanel = statusSelect?.closest(".ticket-control-panel") || null;
    const deleteTicketButton = document.getElementById("delete-ticket-button");
    const accessUpgradePanel = document.getElementById("access-upgrade-panel");
    const accessUpgradeReason = document.getElementById("access-upgrade-reason");
    const accessUpgradeApprove = document.getElementById("access-upgrade-approve");
    const accessUpgradeRefuse = document.getElementById("access-upgrade-refuse");
    const accessUpgradeState = document.getElementById("access-upgrade-state");
    const unlockAccountPanel = document.getElementById("unlock-account-panel");
    const unlockAccountReason = document.getElementById("unlock-account-reason");
    const unlockAccountApprove = document.getElementById("unlock-account-approve");
    const unlockAccountRefuse = document.getElementById("unlock-account-refuse");
    const unlockAccountState = document.getElementById("unlock-account-state");
    const params = new URLSearchParams(window.location.search);
    let currentTicketId = params.get("ticket") || null;
    let selectedTicketIds = new Set();

    if (deleteTicketButton) {
      deleteTicketButton.hidden = true;
    }

    const syncReplyAction = () => {
      if (!replyActionRow) return;
      const hasFile = Boolean(replyFileInput?.files?.length);
      replyActionRow.hidden = !(replyInput.value.trim() || hasFile);
      if (replyFileBar) {
        replyFileBar.hidden = !hasFile;
      }
      if (replyFileName) {
        replyFileName.textContent = hasFile ? replyFileInput.files[0].name : "";
      }
    };

    const scrollConversationToBottom = () => {
      const conversation = document.getElementById("conversation-thread");
      if (!conversation) return;
      requestAnimationFrame(() => {
        conversation.scrollTop = conversation.scrollHeight;
      });
    };

    const queryStatus = params.get("status");
    if (queryStatus && statusFilter) {
      statusFilter.value = queryStatus;
    }

    const getFilteredTickets = () => {
      const keyword = (search?.value || "").trim().toLowerCase();
      const status = statusFilter?.value || "all";
      const priority = priorityFilter?.value || "all";
      const dateRange = dateFilter?.value || "all";
      const now = new Date();

      return state.tickets.filter((ticket) => {
        const doctor = getDoctorById(ticket.doctorId);
        const haystack = [ticket.subject, doctor?.name || "", ticket.id, ticket.category].join(" ").toLowerCase();
        const matchesKeyword = !keyword || haystack.includes(keyword);
        const matchesStatus = status === "all" || ticket.status === status;
        const matchesPriority = priority === "all" || ticket.priority === priority;
        let matchesDate = true;
        if (dateRange !== "all") {
          const diff = (now - new Date(ticket.updatedAt)) / (1000 * 60 * 60 * 24);
          if (dateRange === "7") matchesDate = diff <= 7;
          if (dateRange === "30") matchesDate = diff <= 30;
        }
        return matchesKeyword && matchesStatus && matchesPriority && matchesDate;
      });
    };

    const syncBulkActions = (filteredTickets = getFilteredTickets()) => {
      const visibleIds = filteredTickets.map((ticket) => String(ticket.id));
      selectedTicketIds = new Set(
        [...selectedTicketIds].filter((id) => state.tickets.some((ticket) => String(ticket.id) === id))
      );

      const visibleSelectedCount = visibleIds.filter((id) => selectedTicketIds.has(id)).length;
      const hasVisibleTickets = visibleIds.length > 0;

      if (selectAllToggle) {
        selectAllToggle.checked = hasVisibleTickets && visibleSelectedCount === visibleIds.length;
        selectAllToggle.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visibleIds.length;
      }

      if (deleteSelectedButton) {
        deleteSelectedButton.disabled = visibleSelectedCount === 0;
      }

      if (deleteAllButton) {
        deleteAllButton.disabled = state.tickets.length === 0;
      }
    };

    const isAccessUpgradeCategory = (category) =>
      String(category || "")
        .trim()
        .toLowerCase() === "access upgrade request";

    const isUnlockAccountCategory = (category) =>
      String(category || "")
        .trim()
        .toLowerCase() === "unlock account";

    const isPredictionAccessRequestTicket = (ticket) =>
      Boolean(ticket?.doctorId) &&
      Boolean(ticket?.accessUpgradeRequest) &&
      isAccessUpgradeCategory(ticket.category);

    const isUnlockAccountRequestTicket = (ticket) =>
      Boolean(ticket?.unlockAccountRequest) && isUnlockAccountCategory(ticket.category);

    const getTicketRequesterName = (ticket) => {
      const doctor = getDoctorById(ticket.doctorId);
      return doctor?.name || ticket.doctorName || ticket.contactRequest?.name || "Public contact";
    };

    const renderDetail = (ticket) => {
      if (!ticket) return;
      currentTicketId = ticket.id;
      const doctor = getDoctorById(ticket.doctorId);
      const requesterName = getTicketRequesterName(ticket);
      document.getElementById("ticket-subject").textContent = ticket.subject;
      document.getElementById("ticket-meta").textContent = `${requesterName} - ${ticket.category}`;
      document.getElementById("ticket-status-badge").innerHTML = createBadgeMarkup(ticket.status);
      document.getElementById("ticket-priority-badge").innerHTML = createBadgeMarkup(ticket.priority);
      document.getElementById("ticket-assigned").textContent = ticket.assignedAdmin;
      document.getElementById("ticket-created").textContent = formatDate(ticket.createdAt, true);
      document.getElementById("ticket-updated").textContent = formatDate(ticket.updatedAt, true);
      statusSelect.value = ticket.status;
      resolveButton.textContent = ticket.status === "Resolved" ? "Mark unresolved" : "Mark resolved";

      const isAccessUpgradeTicket = isPredictionAccessRequestTicket(ticket);
      const isUnlockAccountTicket = isUnlockAccountRequestTicket(ticket);
      const upgradeDecision = ticket.accessUpgradeRequest?.decision || "pending";
      const unlockDecision = ticket.unlockAccountRequest?.decision || "pending";
      const shouldShowAccessUpgradePanel = isAccessUpgradeTicket && upgradeDecision === "pending";
      const shouldShowUnlockAccountPanel = isUnlockAccountTicket && unlockDecision === "pending";
      if (workflowControlPanel) {
        workflowControlPanel.hidden = shouldShowAccessUpgradePanel || shouldShowUnlockAccountPanel;
      }
      if (accessUpgradePanel) {
        accessUpgradePanel.hidden = !shouldShowAccessUpgradePanel;
      }
      if (accessUpgradeReason) {
        accessUpgradeReason.value = ticket.accessUpgradeRequest?.reviewedReason || "";
        accessUpgradeReason.disabled = !shouldShowAccessUpgradePanel;
      }
      if (accessUpgradeApprove) {
        accessUpgradeApprove.hidden = !shouldShowAccessUpgradePanel;
        accessUpgradeApprove.disabled = upgradeDecision !== "pending";
      }
      if (accessUpgradeRefuse) {
        accessUpgradeRefuse.hidden = !shouldShowAccessUpgradePanel;
        accessUpgradeRefuse.disabled = upgradeDecision !== "pending";
      }
      if (accessUpgradeState) {
        accessUpgradeState.hidden = !shouldShowAccessUpgradePanel;
        if (isAccessUpgradeTicket) {
          if (upgradeDecision === "approved") {
            accessUpgradeState.textContent = `Approved by ${ticket.accessUpgradeRequest?.reviewedBy || "Admin"} on ${formatDate(ticket.accessUpgradeRequest?.reviewedAt, true)}.`;
          } else if (upgradeDecision === "refused") {
            accessUpgradeState.textContent = `Refused by ${ticket.accessUpgradeRequest?.reviewedBy || "Admin"} on ${formatDate(ticket.accessUpgradeRequest?.reviewedAt, true)}.`;
          } else {
            accessUpgradeState.textContent = "Pending admin decision.";
          }
        }
      }
      if (unlockAccountPanel) {
        unlockAccountPanel.hidden = !shouldShowUnlockAccountPanel;
      }
      if (unlockAccountReason) {
        unlockAccountReason.value = ticket.unlockAccountRequest?.reviewedReason || "";
        unlockAccountReason.disabled = !shouldShowUnlockAccountPanel;
      }
      if (unlockAccountApprove) {
        unlockAccountApprove.hidden = !shouldShowUnlockAccountPanel;
        unlockAccountApprove.disabled = unlockDecision !== "pending";
      }
      if (unlockAccountRefuse) {
        unlockAccountRefuse.hidden = !shouldShowUnlockAccountPanel;
        unlockAccountRefuse.disabled = unlockDecision !== "pending";
      }
      if (unlockAccountState) {
        unlockAccountState.hidden = !shouldShowUnlockAccountPanel;
        if (isUnlockAccountTicket) {
          if (unlockDecision === "approved") {
            unlockAccountState.textContent = `Unblocked by ${ticket.unlockAccountRequest?.reviewedBy || "Admin"} on ${formatDate(ticket.unlockAccountRequest?.reviewedAt, true)}.`;
          } else if (unlockDecision === "refused") {
            unlockAccountState.textContent = `Unblock refused by ${ticket.unlockAccountRequest?.reviewedBy || "Admin"} on ${formatDate(ticket.unlockAccountRequest?.reviewedAt, true)}.`;
          } else {
            unlockAccountState.textContent = "Pending admin decision.";
          }
        }
      }

      const conversation = document.getElementById("conversation-thread");
      const conversationDoctor = getDoctorById(ticket.doctorId);
      const doctorPhoto = conversationDoctor?.profilePhoto || "";
      const getInitials = (name) => {
        if (!name) return "?";
        const parts = String(name).trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return "?";
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      };
      const buildAvatarMarkup = (isAdmin, message, hidden) => {
        const photoUrl = isAdmin ? ADMIN_SUPPORT_AVATAR_URL : doctorPhoto;
        const initials = getInitials(message.author);
        if (photoUrl) {
          return `<span class="message-bubble-avatar has-photo${hidden ? " is-hidden" : ""}" aria-hidden="true" data-avatar-photo="${encodeURIComponent(photoUrl)}"></span>`;
        }
        return `<span class="message-bubble-avatar${hidden ? " is-hidden" : ""}" aria-hidden="true">${escapeAdminHtml(initials)}</span>`;
      };
      conversation.innerHTML = ticket.messages
        .map((message, idx, arr) => {
          const isAdmin = message.role === "admin";
          const prev = arr[idx - 1];
          const isGrouped =
            prev && (prev.role === "admin") === isAdmin &&
            (new Date(message.date) - new Date(prev.date)) < 5 * 60 * 1000;
          const avatarHtml = buildAvatarMarkup(isAdmin, message, isGrouped);
          return `
            <article class="message-bubble ${isAdmin ? "admin" : "doctor"}${isGrouped ? " is-grouped" : ""}">
              ${!isAdmin ? avatarHtml : ""}
              <div class="message-bubble-card">
                ${!isGrouped ? `
                <div class="message-bubble-head">
                  <strong>${escapeAdminHtml(message.author)}</strong>
                  <time>${formatDate(message.date, true)}</time>
                </div>` : ""}
                ${message.body ? `<p>${escapeAdminHtml(message.body)}</p>` : ""}
                ${buildSupportAttachmentMarkup(message.attachment, isAdmin ? "admin" : "doctor")}
                ${isGrouped ? `<time class="message-bubble-foot-time">${formatDate(message.date, true)}</time>` : ""}
              </div>
              ${isAdmin ? avatarHtml : ""}
            </article>
          `;
        })
        .join("");

      // Apply photo backgrounds via JS (data URLs are too long for inline style attribute)
      conversation.querySelectorAll("[data-avatar-photo]").forEach((node) => {
        const photo = node.getAttribute("data-avatar-photo");
        if (!photo) return;
        try {
          const decoded = decodeURIComponent(photo);
          node.style.backgroundImage = `url("${decoded.replace(/"/g, '\\"')}")`;
          node.style.backgroundSize = "cover";
          node.style.backgroundPosition = "center";
          node.style.backgroundRepeat = "no-repeat";
        } catch (e) {
          // Ignore decoding errors
        }
      });

      scrollConversationToBottom();

      list.querySelectorAll(".ticket-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.ticketId === ticket.id);
      });
    };

    const getDoctorInitialsFromName = (name) => {
      const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return "?";
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const renderTickets = () => {
      const filtered = getFilteredTickets();
      syncBulkActions(filtered);

      list.innerHTML = filtered.length
        ? filtered
            .map((ticket) => {
              const doctor = getDoctorById(ticket.doctorId);
              const requesterName = getTicketRequesterName(ticket);
              const ticketId = String(ticket.id);
              const isSelected = selectedTicketIds.has(ticketId);
              const isActive = ticket.id === currentTicketId;
              const latestMessage = ticket.messages?.[ticket.messages.length - 1];
              const previewText = getTicketMessagePreview(
                latestMessage,
                `${requesterName} needs support follow-up.`
              );
              const priorityTone = String(ticket.priority || "Routine").toLowerCase().replace(/\s+/g, "-");
              const doctorPhoto = doctor?.profilePhoto || "";
              const initials = getDoctorInitialsFromName(requesterName);
              const avatarMarkup = doctorPhoto
                ? `<span class="admin-inbox-thread-avatar has-photo" aria-hidden="true" data-avatar-photo="${encodeURIComponent(doctorPhoto)}"></span>`
                : `<span class="admin-inbox-thread-avatar" aria-hidden="true">${escapeAdminHtml(initials)}</span>`;
              return `
                <article class="ticket-item admin-inbox-thread${isActive ? " active" : ""}" data-ticket-id="${ticketId}" data-priority-tone="${priorityTone}">
                  <div class="admin-inbox-thread-head">
                    ${avatarMarkup}
                    <div class="admin-inbox-thread-headline">
                      <div class="admin-inbox-thread-headline-row">
                        <strong class="admin-inbox-thread-doctor">${escapeAdminHtml(requesterName)}</strong>
                        <time class="admin-inbox-thread-date">${formatDate(ticket.updatedAt, true)}</time>
                      </div>
                      <span class="admin-inbox-thread-subject">${ticket.subject}</span>
                    </div>
                    <label class="admin-inbox-thread-checkbox-wrap" for="ticket-select-${ticketId}" title="Select ticket">
                      <input
                        id="ticket-select-${ticketId}"
                        class="ticket-thread-checkbox admin-inbox-thread-checkbox"
                        type="checkbox"
                        data-ticket-select-id="${ticketId}"
                        ${isSelected ? "checked" : ""}
                      />
                    </label>
                  </div>

                  <button class="ticket-item-main admin-inbox-thread-main" type="button" data-open-ticket="${ticketId}">
                    <p class="admin-inbox-thread-preview">${previewText}</p>
                  </button>

                  <div class="admin-inbox-thread-footer">
                    <div class="admin-inbox-thread-meta">
                      <span class="admin-inbox-thread-pill admin-inbox-thread-category">${ticket.category}</span>
                      <span class="admin-inbox-thread-pill admin-inbox-thread-priority admin-inbox-thread-priority-${priorityTone}">${ticket.priority}</span>
                      <span class="admin-inbox-thread-pill admin-inbox-thread-status admin-inbox-thread-status-${String(ticket.status).toLowerCase().replace(/\s+/g, "-")}">${ticket.status}</span>
                    </div>
                    <button class="ticket-icon-button ticket-delete admin-inbox-thread-icon" type="button" data-delete-ticket="${ticketId}" aria-label="Delete support thread" title="Delete">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M8 10v8"></path><path d="M12 10v8"></path><path d="M16 10v8"></path><path d="M6 7l1 13h10l1-13"></path></svg>
                    </button>
                  </div>
                </article>
              `;
            })
            .join("")
        : `<div class="empty-state">No support tickets match the current filters.</div>`;

      // Apply photo backgrounds via JS (data URLs are too long for inline style)
      list.querySelectorAll(".admin-inbox-thread-avatar[data-avatar-photo]").forEach((node) => {
        const photo = node.getAttribute("data-avatar-photo");
        if (!photo) return;
        try {
          const decoded = decodeURIComponent(photo);
          node.style.backgroundImage = `url("${decoded.replace(/"/g, '\\"')}")`;
          node.style.backgroundSize = "cover";
          node.style.backgroundPosition = "center";
          node.style.backgroundRepeat = "no-repeat";
        } catch (e) {
          // Ignore decoding errors
        }
      });

      const candidate = filtered.find((ticket) => ticket.id === currentTicketId) || filtered[0];
      if (candidate) {
        renderDetail(candidate);
      } else {
        currentTicketId = null;
        document.getElementById("ticket-subject").textContent = "No ticket selected";
        document.getElementById("ticket-meta").textContent = "Adjust filters to view a support conversation.";
        document.getElementById("ticket-status-badge").innerHTML = createBadgeMarkup("Open", true);
        document.getElementById("ticket-priority-badge").innerHTML = createBadgeMarkup("Routine", true);
        document.getElementById("conversation-thread").innerHTML = `<div class="empty-state">No messages available.</div>`;
        if (workflowControlPanel) workflowControlPanel.hidden = false;
        if (accessUpgradePanel) accessUpgradePanel.hidden = true;
        if (unlockAccountPanel) unlockAccountPanel.hidden = true;
      }
    };

    [search, statusFilter, priorityFilter, dateFilter].forEach((element) => {
      if (!element) return;
      element.addEventListener("input", renderTickets);
      element.addEventListener("change", renderTickets);
    });

    replyInput.addEventListener("input", syncReplyAction);
    replyFileInput?.addEventListener("change", syncReplyAction);
    replyFileClear?.addEventListener("click", (event) => {
      event.preventDefault();
      if (replyFileInput) {
        replyFileInput.value = "";
      }
      syncReplyAction();
    });
    replyInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!currentTicketId || (!replyInput.value.trim() && !(replyFileInput?.files?.length))) return;
        replyForm.requestSubmit();
      }
    });

    list.addEventListener("change", (event) => {
      const checkbox = event.target.closest("[data-ticket-select-id]");
      if (!checkbox) return;
      const ticketId = checkbox.dataset.ticketSelectId;
      if (!ticketId) return;
      if (checkbox.checked) {
        selectedTicketIds.add(ticketId);
      } else {
        selectedTicketIds.delete(ticketId);
      }
      syncBulkActions();
    });

    list.addEventListener("click", (event) => {
      if (event.target.closest(".ticket-thread-select")) {
        return;
      }

      const deleteButton = event.target.closest("[data-delete-ticket]");
      if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        const ticketId = deleteButton.dataset.deleteTicket;
        if (!ticketId) return;
        openConfirmation({
          title: "Delete support thread",
          message: "This will delete the selected support thread only from the admin inbox.",
          confirmLabel: "Delete thread",
          variant: "danger",
          onConfirm: async () => {
            try {
              await deleteSupportThread(ticketId);
              selectedTicketIds.delete(ticketId);
              if (currentTicketId === ticketId) {
                currentTicketId = null;
              }
              renderTickets();
            } catch (error) {
              showToast(error.message || "Unable to delete this support thread.", "danger");
            }
          }
        });
        return;
      }

      const openButton = event.target.closest("[data-open-ticket]");
      const card = event.target.closest("[data-ticket-id]");
      const targetId = openButton?.dataset.openTicket || card?.dataset.ticketId;
      if (!targetId) return;
      const ticket = getTicketById(targetId);
      if (ticket) renderDetail(ticket);
    });

    selectAllToggle?.addEventListener("change", () => {
      const filtered = getFilteredTickets();
      const visibleIds = filtered.map((ticket) => String(ticket.id));
      if (selectAllToggle.checked) {
        visibleIds.forEach((id) => selectedTicketIds.add(id));
      } else {
        visibleIds.forEach((id) => selectedTicketIds.delete(id));
      }
      renderTickets();
    });

    deleteSelectedButton?.addEventListener("click", () => {
      const filtered = getFilteredTickets();
      const visibleIds = filtered.map((ticket) => String(ticket.id)).filter((id) => selectedTicketIds.has(id));
      if (!visibleIds.length) return;

      openConfirmation({
        title: "Delete selected support threads",
        message: `This will delete ${visibleIds.length} selected support ${visibleIds.length === 1 ? "thread" : "threads"} only from the admin inbox.`,
        confirmLabel: "Delete selected",
        variant: "danger",
        onConfirm: async () => {
          try {
            await deleteSupportThreadsBulk({ ticketIds: visibleIds });
            visibleIds.forEach((id) => selectedTicketIds.delete(id));
            if (currentTicketId && visibleIds.includes(String(currentTicketId))) {
              currentTicketId = null;
            }
            renderTickets();
          } catch (error) {
            showToast(error.message || "Unable to delete the selected support threads.", "danger");
          }
        }
      });
    });

    deleteAllButton?.addEventListener("click", () => {
      if (!state.tickets.length) return;
      openConfirmation({
        title: "Delete all support threads",
        message: "This will delete every support thread only from the admin inbox.",
        confirmLabel: "Delete all",
        variant: "danger",
        onConfirm: async () => {
          try {
            await deleteSupportThreadsBulk({ deleteAll: true });
            selectedTicketIds = new Set();
            currentTicketId = null;
            renderTickets();
          } catch (error) {
            showToast(error.message || "Unable to delete all support threads.", "danger");
          }
        }
      });
    });

    statusSelect.addEventListener("change", async () => {
      if (!currentTicketId) return;
      try {
        const updatedTicket = await updateTicketStatus(currentTicketId, statusSelect.value);
        showToast(`Ticket status updated to ${statusSelect.value}.`);
        renderTickets();
        if (updatedTicket) renderDetail(updatedTicket);
      } catch (error) {
        showToast(error.message || "Unable to update the support ticket status.", "danger");
      }
    });

    resolveButton.addEventListener("click", async () => {
      if (!currentTicketId) return;
      const ticket = getTicketById(currentTicketId);
      const nextStatus = ticket.status === "Resolved" ? "In Progress" : "Resolved";
      try {
        const updatedTicket = await updateTicketStatus(currentTicketId, nextStatus);
        showToast(`Ticket marked ${nextStatus}.`);
        renderTickets();
        if (updatedTicket) renderDetail(updatedTicket);
      } catch (error) {
        showToast(error.message || "Unable to update the support ticket status.", "danger");
      }
    });

    accessUpgradeApprove?.addEventListener("click", async () => {
      if (!currentTicketId) return;
      try {
        const updatedTicket = await reviewAccessUpgrade(
          currentTicketId,
          "approve",
          accessUpgradeReason?.value?.trim() || ""
        );
        renderTickets();
        if (updatedTicket) renderDetail(updatedTicket);
      } catch (error) {
        showToast(error.message || "Unable to approve this access request.", "danger");
      }
    });

    accessUpgradeRefuse?.addEventListener("click", async () => {
      if (!currentTicketId) return;
      openConfirmation({
        title: "Refuse prediction access",
        message: "Add the reason that explains why this doctor will remain in Standard doctor mode. This reason will be sent automatically by email.",
        confirmLabel: "Refuse access",
        reasonField: true,
        variant: "danger",
        onConfirm: async (reason) => {
          try {
            const updatedTicket = await reviewAccessUpgrade(
              currentTicketId,
              "refuse",
              reason
            );
            renderTickets();
            if (updatedTicket) renderDetail(updatedTicket);
          } catch (error) {
            showToast(error.message || "Unable to refuse this access request.", "danger");
          }
        }
      });
    });

    unlockAccountApprove?.addEventListener("click", async () => {
      if (!currentTicketId) return;
      try {
        const updatedTicket = await reviewUnlockAccount(
          currentTicketId,
          "approve",
          unlockAccountReason?.value?.trim() || ""
        );
        renderTickets();
        if (updatedTicket) renderDetail(updatedTicket);
      } catch (error) {
        showToast(error.message || "Unable to unblock this account.", "danger");
      }
    });

    unlockAccountRefuse?.addEventListener("click", async () => {
      if (!currentTicketId) return;
      openConfirmation({
        title: "Refuse account unblock",
        message: "Add the reason that explains why this doctor account will remain blocked.",
        confirmLabel: "Refuse unblock",
        reasonField: true,
        reasonRequired: true,
        variant: "danger",
        onConfirm: async (reason) => {
          try {
            const updatedTicket = await reviewUnlockAccount(
              currentTicketId,
              "refuse",
              reason
            );
            renderTickets();
            if (updatedTicket) renderDetail(updatedTicket);
          } catch (error) {
            showToast(error.message || "Unable to refuse this unblock request.", "danger");
          }
        }
      });
    });

    deleteTicketButton?.addEventListener("click", () => {
      if (!currentTicketId) return;
      openConfirmation({
        title: "Delete support conversation",
        message: "This will remove the entire support conversation from the admin inbox.",
        confirmLabel: "Delete conversation",
        variant: "danger",
        onConfirm: () => {
          deleteTicket(currentTicketId);
          currentTicketId = null;
          renderTickets();
        }
      });
    });

    replyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const replyFile = replyFileInput?.files?.[0] || null;
      if (!currentTicketId || (!replyInput.value.trim() && !replyFile)) return;
      try {
        const updatedTicket = await replyToTicket(currentTicketId, replyInput.value.trim(), replyFile);
        replyInput.value = "";
        if (replyFileInput) {
          replyFileInput.value = "";
        }
        syncReplyAction();
        renderTickets();
        if (updatedTicket) renderDetail(updatedTicket);
      } catch (error) {
        const isUnavailableError =
          error?.status === 410 &&
          (error?.payload?.code === "THREAD_DELETED_BY_DOCTOR" ||
            error?.payload?.code === "THREAD_DELETED_BY_ADMIN");

        if (isUnavailableError) {
          state.tickets = state.tickets.filter((ticket) => String(ticket.id) !== String(currentTicketId));
          currentTicketId = null;
          persistState();
          renderTickets();
          showAdminThreadUnavailablePopup(
            error.message || "This thread is no longer available."
          );
          return;
        }

        showToast(error.message || "Unable to send the support reply right now.", "danger");
      }
    });

    syncReplyAction();
    syncSupportTicketsFromBackend()
      .then(() => markAdminSupportTicketsRead())
      .then(() => syncSupportTicketsFromBackend())
      .finally(() => {
        renderTickets();
      });

    window.NoufarAdminSupportCenterRefresh = () => {
      if (currentTicketId && !getTicketById(currentTicketId)) {
        currentTicketId = null;
      }
      renderTickets();
    };
  }

  function renderCurrentAdminPage() {
    const page = document.body.dataset.page;

    if (page === "overview") populateOverview();
    if (page === "doctors") populateDoctorsPage();
    if (page === "doctor-details") populateDoctorDetails();
    if (page === "support") {
      if (typeof window.NoufarAdminSupportCenterRefresh === "function") {
        window.NoufarAdminSupportCenterRefresh();
      } else {
        populateSupportCenter();
      }
    }
    if (page === "security-events") populateSecurityEventsPage();
    if (page === "system") populateSystemPage();
  }

  function createModal() {
    if (document.getElementById("confirmation-modal")) return;
    const modal = document.createElement("section");
    modal.className = "modal-shell";
    modal.id = "confirmation-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal-backdrop" data-close-modal></div>
      <div class="modal-card" id="confirmation-card">
        <div class="modal-head">
          <div>
            <h3 id="confirmation-title">Confirm action</h3>
            <p id="confirmation-message">Are you sure you want to continue?</p>
          </div>
          <button class="modal-close" type="button" aria-label="Close confirmation" data-close-modal>X</button>
        </div>
        <form class="modal-form" id="confirmation-form">
          <div id="confirmation-reason-wrap" hidden>
            <label class="filter-label" for="confirmation-reason">Optional rejection reason</label>
            <textarea class="control" id="confirmation-reason" rows="4" placeholder="Add an optional reason for this action..."></textarea>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" id="confirmation-cancel" data-close-modal>Cancel</button>
            <button class="btn btn-danger" type="submit" id="confirmation-submit">Confirm</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target.hasAttribute("data-close-modal")) closeConfirmation();
    });

    document.getElementById("confirmation-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const reason = document.getElementById("confirmation-reason").value.trim();
      if (pendingConfirmation?.reasonRequired && !reason) {
        showToast("Please provide a reason before confirming.", "danger");
        return;
      }
      if (pendingConfirmation?.onConfirm) pendingConfirmation.onConfirm(reason);
      closeConfirmation();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeConfirmation();
    });
  }

  function createAdminCreationModal() {
    if (document.getElementById("create-admin-modal")) return;
    const modal = document.createElement("section");
    modal.className = "modal-shell";
    modal.id = "create-admin-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal-backdrop" data-close-create-admin></div>
      <div class="modal-card modal-card-wide modal-card-admin-create" id="create-admin-card">
        <div class="modal-head">
          <div>
            <h3>Create Additional Admin</h3>
            <p>
              Provision a second secured admin account. This action is reserved for authenticated admins and requires your current password.
            </p>
          </div>
          <button class="modal-close" type="button" aria-label="Close create admin form" data-close-create-admin>X</button>
        </div>
        <form class="modal-form" id="create-admin-form">
          <div class="admin-create-grid">
            <div>
              <label class="filter-label" for="create-admin-name">Full name</label>
              <input class="control" id="create-admin-name" type="text" placeholder="Clinical Platform Administrator" required />
            </div>
            <div>
              <label class="filter-label" for="create-admin-email">Email address</label>
              <input class="control" id="create-admin-email" type="email" placeholder="admin@clinic.org" required />
            </div>
            <div>
              <label class="filter-label" for="create-admin-password">New admin password</label>
              <input class="control" id="create-admin-password" type="password" placeholder="Strong password" required />
            </div>
            <div>
              <label class="filter-label" for="create-admin-confirm-password">Confirm password</label>
              <input class="control" id="create-admin-confirm-password" type="password" placeholder="Repeat the password" required />
            </div>
          </div>
          <div>
            <label class="filter-label" for="create-admin-current-password">Your current admin password</label>
            <input class="control" id="create-admin-current-password" type="password" placeholder="Required to confirm this action" required />
          </div>
          <div class="admin-create-note">
            <strong>Security rules</strong>
            <p>The new admin password must be at least 12 characters and include uppercase, lowercase, numeric, and special characters.</p>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" type="button" id="create-admin-cancel" data-close-create-admin>Cancel</button>
            <button class="btn btn-primary" type="submit" id="create-admin-submit">Create Admin</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target.hasAttribute("data-close-create-admin")) {
        closeAdminCreationModal();
      }
    });

    document.getElementById("create-admin-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (createAdminSubmissionInFlight) return;

      const submitButton = document.getElementById("create-admin-submit");
      const name = document.getElementById("create-admin-name").value.trim();
      const email = document.getElementById("create-admin-email").value.trim();
      const password = document.getElementById("create-admin-password").value;
      const confirmPassword = document.getElementById("create-admin-confirm-password").value;
      const currentPassword = document.getElementById("create-admin-current-password").value;

      createAdminSubmissionInFlight = true;
      submitButton.disabled = true;
      submitButton.textContent = "Creating...";

      try {
        const response = await createAdditionalAdminAccount({
          name,
          email,
          password,
          confirmPassword,
          currentPassword,
        });
        closeAdminCreationModal();
        showToast(response?.message || "Additional admin created successfully.");
      } catch (error) {
        showToast(error?.message || "Unable to create the additional admin right now.", "danger");
      } finally {
        createAdminSubmissionInFlight = false;
        submitButton.disabled = false;
        submitButton.textContent = "Create Admin";
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAdminCreationModal();
    });
  }

  function openAdminCreationModal() {
    createAdminCreationModal();
    const modal = document.getElementById("create-admin-modal");
    const form = document.getElementById("create-admin-form");
    if (form) form.reset();
    if (modal) modal.hidden = false;
  }

  function closeAdminCreationModal() {
    const modal = document.getElementById("create-admin-modal");
    if (modal) modal.hidden = true;
    const submitButton = document.getElementById("create-admin-submit");
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Create Admin";
    }
    createAdminSubmissionInFlight = false;
  }

  function openConfirmation(options) {
    createModal();
    pendingConfirmation = options;
    const modal = document.getElementById("confirmation-modal");
    const card = document.getElementById("confirmation-card");
    const reasonWrap = document.getElementById("confirmation-reason-wrap");
    const reasonInput = document.getElementById("confirmation-reason");
    const submitButton = document.getElementById("confirmation-submit");
    const cancelButton = document.getElementById("confirmation-cancel");
    document.getElementById("confirmation-title").textContent = options.title;
    document.getElementById("confirmation-message").textContent = options.message;
    submitButton.textContent = options.confirmLabel || "Confirm";
    card.classList.toggle("danger", options.variant === "danger");
    card.classList.toggle("warning", options.variant === "warning");
    submitButton.classList.toggle("btn-warning", options.variant === "warning");
    submitButton.classList.toggle("btn-success", options.variant === "success");
    submitButton.classList.toggle("btn-purple", options.variant === "purple");
    submitButton.classList.toggle("btn-blue", options.variant === "blue");
    submitButton.classList.toggle(
      "btn-danger",
      options.variant !== "warning" && options.variant !== "success" && options.variant !== "purple" && options.variant !== "blue"
    );
    reasonWrap.hidden = !options.reasonField;
    reasonInput.value = "";
    cancelButton.hidden = Boolean(options.hideCancel);
    modal.hidden = false;
  }

  function closeConfirmation() {
    const modal = document.getElementById("confirmation-modal");
    if (modal) modal.hidden = true;
    pendingConfirmation = null;
  }

  function showToast(message, variant = "success") {
    let stack = document.getElementById("toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.id = "toast-stack";
      document.body.appendChild(stack);
    }
    const toast = document.createElement("div");
    toast.className = `toast ${variant}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function buildNotificationItems() {
    const pendingDoctors = [...state.doctors]
      .filter((doctor) => doctor.approvalStatus === "Pending")
      .sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate))
      .slice(0, 2)
      .map(
        (doctor) => `
          <article class="topbar-popover-item">
            <div>
              <strong>${doctor.name}</strong>
              <p>Pending approval · ${doctor.specialty}</p>
            </div>
            <span>${formatDate(doctor.registrationDate)}</span>
          </article>
        `
      );

    const openTickets = [...state.tickets]
      .filter((ticket) => ["Open", "In Progress"].includes(ticket.status))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 2)
      .map((ticket) => {
        const doctor = getDoctorById(ticket.doctorId);
        return `
          <article class="topbar-popover-item">
            <div>
              <strong>${ticket.subject}</strong>
              <p>${doctor ? doctor.name : "Unknown doctor"} · ${ticket.status}</p>
            </div>
            <span>${formatDate(ticket.updatedAt, true)}</span>
          </article>
        `;
      });

    return [...pendingDoctors, ...openTickets].join("");
  }

  function buildNotificationItems() {
    const pendingDoctors = [...state.doctors]
      .filter((doctor) => doctor.approvalStatus === "Pending")
      .sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate))
      .slice(0, 2);

    const supportMessages = [...state.tickets]
      .filter((ticket) => ["Open", "In Progress"].includes(ticket.status))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 3);

    const sections = [];

    if (pendingDoctors.length) {
      sections.push(`
        <section class="topbar-popover-section">
          <div class="topbar-popover-section-head">
            <strong>Pending doctor approvals</strong>
            <span>${pendingDoctors.length}</span>
          </div>
          <div class="topbar-popover-list">
            ${pendingDoctors
              .map(
                (doctor) => `
                  <article class="topbar-popover-item">
                    <div>
                      <strong>${doctor.name}</strong>
                      <p>Pending approval · ${doctor.specialty}</p>
                    </div>
                    <span>${formatDate(doctor.registrationDate)}</span>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      `);
    }

    if (supportMessages.length) {
      sections.push(`
        <section class="topbar-popover-section">
          <div class="topbar-popover-section-head">
            <strong>Support message notifications</strong>
            <span>${supportMessages.length}</span>
          </div>
          <div class="topbar-popover-list">
            ${supportMessages
              .map((ticket) => {
                const doctor = getDoctorById(ticket.doctorId);
                return `
                  <article class="topbar-popover-item">
                    <div>
                      <strong>${ticket.subject}</strong>
                      <p>${doctor ? doctor.name : "Unknown doctor"} · ${ticket.status}</p>
                    </div>
                    <span>${formatDate(ticket.updatedAt, true)}</span>
                  </article>
                `;
              })
              .join("")}
          </div>
        </section>
      `);
    }

    if (!sections.length) {
      return `
        <section class="topbar-popover-section">
          <div class="topbar-popover-empty">
            <strong>No new alerts</strong>
            <p>Doctor approvals and support message notifications will appear here.</p>
          </div>
        </section>
      `;
    }

    return sections.join("").replace(/Â·/g, " - ");
  }

  function buildNotificationSections() {
    const feed = getNotificationFeed().filter((item) => !item.read);

    const tabs = [
      { label: "Pending doctor", type: "approval" },
      { label: "Support message", type: "support" },
    ];
    const counts = {
      approval: feed.filter((i) => i.type === "approval").length,
      support:  feed.filter((i) => i.type === "support").length,
    };

    const tabsHtml = `
      <div class="notif-tabs">
        ${tabs.map((t) => `
          <button
            class="notif-tab${activeNotificationTab === t.type ? " is-active" : ""}"
            type="button"
            data-notification-tab="${t.type}"
          >
            <span class="notif-tab-label">${t.label}</span>
            <span class="notif-tab-count">${counts[t.type]}</span>
          </button>
        `).join("")}
      </div>
    `;

    const activeItems = feed.filter((item) => item.type === activeNotificationTab);

    const cardsHtml = activeItems.length
      ? activeItems.map((item) => `
          <article class="notif-card${item.read ? "" : " unread"}">
            <a class="notif-card-link" href="${item.href || "#"}" data-notification-target="${item.key}">
              <div class="notif-card-header">
                <strong class="notif-card-title">
                  <span class="notif-dot" aria-hidden="true"></span>
                  ${item.title}
                </strong>
                <span class="notif-card-date">${formatDate(item.date, true)}</span>
              </div>
              <p class="notif-card-body">${item.description}</p>
            </a>
            <button class="notif-read-btn" type="button" data-mark-read="${item.key}" aria-label="Mark as read">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </button>
          </article>
        `).join("")
      : `<div class="notif-empty">
           <strong>All clear</strong>
           <p>No unread ${activeNotificationTab === "approval" ? "doctor approvals" : "support messages"}.</p>
         </div>`;

    return tabsHtml + `<div class="notif-card-list">${cardsHtml}</div>`;
  }

  function setupTopbarMenus() {
    const actions = document.querySelector(".topbar-actions");
    if (!actions) return;

    const modelTrigger = actions.querySelector("#system-model-trigger");
    const modelSwitcher = actions.querySelector(".topbar-model-switcher");
    const notificationTrigger = actions.querySelector(".notification-trigger");
    const profileTrigger = actions.querySelector(".profile-trigger");
    const setProfileExpanded = (isExpanded) => {
      if (profileTrigger) profileTrigger.setAttribute("aria-expanded", String(isExpanded));
    };
    const setModelExpanded = (isExpanded) => {
      if (modelTrigger) modelTrigger.setAttribute("aria-expanded", String(isExpanded));
    };
    const closeModelMenu = () => {
      const modelPopover = document.getElementById("system-model-popover");
      if (modelPopover) modelPopover.hidden = true;
      setModelExpanded(false);
    };

    if (modelTrigger && modelSwitcher && !modelSwitcher.querySelector("#system-model-popover")) {
      const modelPopover = document.createElement("div");
      modelPopover.className = "topbar-popover topbar-model-popover";
      modelPopover.id = "system-model-popover";
      modelPopover.hidden = true;
      modelPopover.innerHTML = `
        <div class="topbar-popover-head">
          <div>
            <strong>Change model</strong>
            <p>Select the prediction model used in the system review workspace.</p>
          </div>
        </div>
        <div class="system-policy-block">
          <div class="system-policy-head">
            <strong>Selection mode</strong>
            <span class="system-policy-summary"></span>
          </div>
          <div class="system-policy-options">${buildSystemSelectionPolicyOptions()}</div>
        </div>
        <div class="system-model-options">${buildSystemModelOptions()}</div>
      `;
      modelSwitcher.appendChild(modelPopover);
      syncSystemModelUi();

      modelTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpening = modelPopover.hidden;
        modelPopover.hidden = !isOpening;
        setModelExpanded(isOpening);
        const notificationPopover = document.getElementById("admin-notification-popover");
        const profilePopover = document.getElementById("admin-profile-popover");
        if (notificationPopover) notificationPopover.hidden = true;
        if (profilePopover) profilePopover.hidden = true;
      });

      modelPopover.addEventListener("click", (event) => {
        const nextPolicyButton = event.target.closest("[data-selection-policy]");
        if (nextPolicyButton) {
          const nextPolicy = nextPolicyButton.dataset.selectionPolicy;
          if (!nextPolicy) return;
          if (nextPolicy === adminUi.predictionSelectionPolicy) return;

          nextPolicyButton.disabled = true;
          requestAdminJson("/predictions/models/active", {
            method: "PUT",
            body: JSON.stringify({ selectionPolicy: nextPolicy }),
          })
            .then((payload) => {
              systemModelOptionsCache = Array.isArray(payload?.options) && payload.options.length
                ? payload.options.map((model) => ({
                    key: model.key || "",
                    label: model.label || DEFAULT_SYSTEM_MODEL,
                    description: model.description || "",
                    deployed: model.deployed !== false,
                  }))
                : systemModelOptionsCache;

              adminUi.systemModel = payload?.activeModelLabel || adminUi.systemModel || DEFAULT_SYSTEM_MODEL;
              adminUi.predictionSelectionPolicy =
                payload?.selectionPolicy === "auto_by_completeness"
                  ? "auto_by_completeness"
                  : DEFAULT_SELECTION_POLICY;
              persistUiState();
              syncSystemModelUi();
              renderCurrentAdminPage();
              showToast(
                `Selection mode set to ${getSelectionPolicyLabel(adminUi.predictionSelectionPolicy)}.`
              );
            })
            .catch((error) => {
              showToast(error?.message || "Unable to update selection mode.", "danger");
            })
            .finally(() => {
              nextPolicyButton.disabled = false;
            });
          return;
        }

        const option = event.target.closest("[data-system-model]");
        if (!option) return;
        if ((adminUi.predictionSelectionPolicy || DEFAULT_SELECTION_POLICY) !== "manual") {
          showToast("Switch to Manual mode to select a fixed model.", "warning");
          return;
        }
        const nextModel = option.dataset.systemModel;
        const nextModelKey = option.dataset.systemModelKey;
        if (!nextModel || !nextModelKey) return;
        if (nextModel === getSelectedSystemModel()) {
          closeModelMenu();
          return;
        }

        option.disabled = true;
        requestAdminJson("/predictions/models/active", {
          method: "PUT",
          body: JSON.stringify({
            modelKey: nextModelKey,
            selectionPolicy: adminUi.predictionSelectionPolicy || DEFAULT_SELECTION_POLICY,
          }),
        })
          .then((payload) => {
            systemModelOptionsCache = Array.isArray(payload?.options) && payload.options.length
              ? payload.options.map((model) => ({
                  key: model.key || "",
                  label: model.label || DEFAULT_SYSTEM_MODEL,
                  description: model.description || "",
                  deployed: model.deployed !== false,
                }))
              : systemModelOptionsCache;

            adminUi.systemModel = payload?.activeModelLabel || nextModel;
            adminUi.predictionSelectionPolicy =
              payload?.selectionPolicy === "auto_by_completeness"
                ? "auto_by_completeness"
                : DEFAULT_SELECTION_POLICY;
            persistUiState();
            syncSystemModelUi();
            renderCurrentAdminPage();
            closeModelMenu();
            showToast(payload?.message || `${nextModel} is now the active system model.`);
          })
          .catch((error) => {
            showToast(error?.message || "Unable to change the active prediction model.", "danger");
          })
          .finally(() => {
            option.disabled = false;
          });
      });
    }

    if (notificationTrigger && !actions.querySelector("#admin-notification-popover")) {
      const notificationDot = notificationTrigger.querySelector(".notification-dot");

      const notificationPopover = document.createElement("div");
      notificationPopover.className = "topbar-popover";
      notificationPopover.id = "admin-notification-popover";
      notificationPopover.hidden = true;
      notificationPopover.innerHTML = `
        <div class="notif-panel-head">
          <div class="notif-panel-copy">
            <strong class="notif-panel-title">Notifications</strong>
            <p class="notif-panel-sub">Unread doctor approval and support message updates.</p>
          </div>
          <button class="notif-mark-all-btn" type="button" id="mark-all-notifications">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="13" height="13"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            Mark all as read
          </button>
        </div>
        <div class="notif-panel-scroll">
          <div id="admin-notification-list">${buildNotificationSections()}</div>
        </div>
      `;
      actions.appendChild(notificationPopover);

      const refreshNotifications = async () => {
        await fetchAdminNotifications().catch(() => {});
        const notificationCount = getUnreadNotificationCount();
        if (
          previousUnreadNotificationCount !== null &&
          notificationCount > previousUnreadNotificationCount
        ) {
          playAdminNotificationSound().catch(() => {});
        }
        previousUnreadNotificationCount = notificationCount;
        if (notificationDot) {
          notificationDot.textContent = String(notificationCount);
          notificationDot.hidden = notificationCount === 0;
        }
        const list = notificationPopover.querySelector("#admin-notification-list");
        if (list) list.innerHTML = buildNotificationSections();
        const markAllButton = notificationPopover.querySelector("#mark-all-notifications");
        if (markAllButton) {
          const total = getNotificationFeed().filter((i) => !i.read).length;
          markAllButton.disabled = total === 0;
          markAllButton.setAttribute("aria-disabled", String(total === 0));
        }
      };

      refreshNotifications();
      document.addEventListener("noufar-admin-state-updated", () => {
        refreshNotifications();
      });

      if (!adminNotificationPollingStarted) {
        adminNotificationPollingStarted = true;
        window.setInterval(() => {
          if (!isAuthenticated() || document.hidden || adminRealtimeConnected) return;
          refreshNotifications();
        }, ADMIN_FALLBACK_POLL_INTERVAL);
      }

      const toggleNotifications = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await refreshNotifications();
        const isOpening = notificationPopover.hidden;
        notificationPopover.hidden = !isOpening;
        const profilePopover = document.getElementById("admin-profile-popover");
        if (profilePopover) profilePopover.hidden = true;
        setProfileExpanded(false);
        closeModelMenu();
      };

      notificationTrigger.addEventListener("click", toggleNotifications);

      notificationPopover.addEventListener("click", async (event) => {
        event.stopPropagation();

        const tabButton = event.target.closest("[data-notification-tab]");
        if (tabButton) {
          event.preventDefault();
          const nextTab = tabButton.dataset.notificationTab;
          if (nextTab && nextTab !== activeNotificationTab) {
            activeNotificationTab = nextTab;
            const list = notificationPopover.querySelector("#admin-notification-list");
            if (list) list.innerHTML = buildNotificationSections();
          }
          return;
        }

        const markReadButton = event.target.closest("[data-mark-read]");
        if (markReadButton) {
          event.preventDefault();
          await markAdminNotificationAsRead(markReadButton.dataset.markRead).catch(() => {});
          await refreshNotifications();
          return;
        }

        const markAllButton = event.target.closest("#mark-all-notifications");
        if (markAllButton) {
          event.preventDefault();
          await markAllAdminNotificationsAsRead().catch(() => {});
          await refreshNotifications();
          return;
        }

        const notificationLink = event.target.closest(".notif-card-link");
        if (notificationLink) {
          event.preventDefault();
          const notificationId = notificationLink.dataset.notificationTarget;
          if (!notificationId) return;
          const target = await openAdminNotificationTarget(notificationId).catch(() => null);
          await refreshNotifications();
          if (target?.url) window.location.href = target.url;
        }
      });
    }

    if (profileTrigger && !actions.querySelector("#admin-profile-popover")) {
      const session = getAuthSession();
      const profileName = session?.user?.name || "Admin";
      const profileEmail = session?.user?.email || "Admin account";
      const getProfileInitials = (n) => {
        const p = String(n || "").trim().split(/\s+/).filter(Boolean);
        if (!p.length) return "A";
        if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
        return (p[0][0] + p[p.length - 1][0]).toUpperCase();
      };
      setProfileExpanded(false);

      const profilePopover = document.createElement("div");
      profilePopover.className = "topbar-popover topbar-popover-profile";
      profilePopover.id = "admin-profile-popover";
      profilePopover.hidden = true;
      profilePopover.innerHTML = `
        <div class="topbar-popover-head topbar-popover-head-rich">
          <span class="topbar-popover-avatar" aria-hidden="true">
            <img src="${ADMIN_SUPPORT_AVATAR_URL}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';" />
            <span class="topbar-popover-avatar-fallback" style="display:none">${escapeAdminHtml(getProfileInitials(profileName))}</span>
          </span>
          <div class="topbar-popover-profile-copy">
            <strong>${escapeAdminHtml(profileName)}</strong>
            <p>${escapeAdminHtml(profileEmail)}</p>
            <span class="topbar-popover-role-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><polyline points="9 12 11 14 15 10"/></svg>
              <span>Administrator</span>
            </span>
          </div>
        </div>
        <div class="topbar-popover-actions">
          <button class="topbar-popover-action topbar-popover-action-primary topbar-create-admin-button" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M3 21v-1.5A5.5 5.5 0 0 1 8.5 14h1A5.5 5.5 0 0 1 15 19.5V21"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>
            <span>Create Admin</span>
          </button>
          <button class="topbar-popover-action topbar-popover-action-logout topbar-logout-button" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Logout</span>
          </button>
        </div>
      `;
      actions.appendChild(profilePopover);

      const toggleProfileMenu = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const isOpening = profilePopover.hidden;
        profilePopover.hidden = !isOpening;
        setProfileExpanded(isOpening);
        const notificationPopover = document.getElementById("admin-notification-popover");
        if (notificationPopover) notificationPopover.hidden = true;
        closeModelMenu();
      };

      profileTrigger.addEventListener("click", toggleProfileMenu);

      profilePopover.querySelector(".topbar-logout-button").addEventListener("click", () => {
        logoutAdmin();
      });
      profilePopover.querySelector(".topbar-create-admin-button").addEventListener("click", () => {
        profilePopover.hidden = true;
        setProfileExpanded(false);
        openAdminCreationModal();
      });
    }

    document.addEventListener("click", (event) => {
      if (!actions.contains(event.target)) {
        const notificationPopover = document.getElementById("admin-notification-popover");
        const profilePopover = document.getElementById("admin-profile-popover");
        if (notificationPopover) notificationPopover.hidden = true;
        if (profilePopover) profilePopover.hidden = true;
        setProfileExpanded(false);
        closeModelMenu();
      }
    });
  }

  function setupSidebar() {
    const shell = document.querySelector(".admin-shell");
    const sidebar = document.querySelector(".admin-sidebar");
    const toggle = document.querySelector(".topbar-toggle");
    if (!shell || !sidebar || !toggle) return;
    let overlay = document.querySelector(".admin-sidebar-overlay");

    if (!overlay) {
      overlay = document.createElement("button");
      overlay.className = "admin-sidebar-overlay";
      overlay.type = "button";
      overlay.hidden = true;
      overlay.setAttribute("aria-label", "Close sidebar");
      shell.appendChild(overlay);
    }

    const syncSidebarState = () => {
      const isMobile = window.innerWidth <= 1040;
      shell.classList.toggle("is-collapsed", !isMobile && Boolean(adminUi.sidebarCollapsed));
      shell.classList.toggle("sidebar-open", isMobile && sidebar.classList.contains("is-open"));
      overlay.hidden = !(isMobile && sidebar.classList.contains("is-open"));
      toggle.setAttribute("aria-pressed", String((!isMobile && adminUi.sidebarCollapsed) || (isMobile && sidebar.classList.contains("is-open"))));
    };

    toggle.addEventListener("click", () => {
      const isMobile = window.innerWidth <= 1040;
      if (isMobile) {
        sidebar.classList.toggle("is-open");
      } else {
        adminUi.sidebarCollapsed = !adminUi.sidebarCollapsed;
        persistUiState();
      }
      syncSidebarState();
    });

    overlay.addEventListener("click", () => {
      sidebar.classList.remove("is-open");
      syncSidebarState();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 1040) {
        sidebar.classList.remove("is-open");
      }
      syncSidebarState();
    });

    syncSidebarState();
  }

  async function init() {
    if (!requireAuth()) return;
    document.addEventListener("pointerdown", armAdminNotificationAudio, { once: true });
    document.addEventListener("keydown", armAdminNotificationAudio, { once: true });
    await syncDoctorsFromBackend();
    if (adminPageNeedsPredictions()) {
      await syncSystemModelFromBackend().catch(() => {});
    }
    if (adminPageNeedsPredictions()) {
      await syncPredictionsFromBackend();
    }
    if (adminPageNeedsSupportTickets()) {
      await syncSupportTicketsFromBackend();
    }
    setupSidebar();
    setupTopbarMenus();
    startAdminRealtimeStream();
    createModal();
    createAdminCreationModal();
    renderCurrentAdminPage();
  }

  window.NoufarAdminApp = {
    openConfirmation,
    showToast
  };

  document.addEventListener("DOMContentLoaded", init);
})();
