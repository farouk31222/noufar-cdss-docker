(() => {
  const bridge = window.NoufarDoctorSessionBridge;
  const PAGE_SIZE = 8;

  const state = {
    doctors: [],
    page: 1,
    loading: true,
    busyDoctorIds: new Set(),
    selectedDoctorId: "",
    pendingReasonAction: null,
    documentObjectUrl: "",
  };

  const elements = {
    body: document.querySelector("#chief-doctors-body"),
    empty: document.querySelector("#chief-doctors-empty"),
    loading: document.querySelector("#chief-doctors-loading"),
    search: document.querySelector("#chief-doctor-search"),
    approvalFilter: document.querySelector("#chief-approval-filter"),
    accountFilter: document.querySelector("#chief-account-filter"),
    accessFilter: document.querySelector("#chief-access-filter"),
    resultCount: document.querySelector("#chief-doctor-result-count"),
    pagination: document.querySelector("#chief-pagination"),
    paginationSummary: document.querySelector("#chief-pagination-summary"),
    totalMetric: document.querySelector("#chief-total-doctors"),
    pendingMetric: document.querySelector("#chief-pending-doctors"),
    activeMetric: document.querySelector("#chief-active-doctors"),
    blockedMetric: document.querySelector("#chief-blocked-doctors"),
    refreshButton: document.querySelector("#chief-refresh-doctors"),
    exportButton: document.querySelector("#chief-export-doctors"),
    detailsModal: document.querySelector("#chief-doctor-details-modal"),
    detailsTitle: document.querySelector("#chief-details-title"),
    detailsContent: document.querySelector("#chief-doctor-details-content"),
    reasonModal: document.querySelector("#chief-reason-modal"),
    reasonForm: document.querySelector("#chief-reason-form"),
    reasonTitle: document.querySelector("#chief-reason-title"),
    reasonCopy: document.querySelector("#chief-reason-copy"),
    reasonInput: document.querySelector("#chief-reason-input"),
    reasonSubmit: document.querySelector("#chief-reason-submit"),
    documentModal: document.querySelector("#chief-document-modal"),
    documentTitle: document.querySelector("#chief-document-title"),
    documentSubtitle: document.querySelector("#chief-document-subtitle"),
    documentFrame: document.querySelector("#chief-document-frame"),
    toastRegion: document.querySelector("#chief-toast-region"),
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const isPredictionChief = (sessionOrUser) => {
    const user = sessionOrUser?.user || sessionOrUser || {};
    return (
      String(user.predictionAccessScope || "").toLowerCase() === "global" ||
      String(user.email || "").trim().toLowerCase() === "zakifarouk78@gmail.com"
    );
  };

  const formatDate = (value, includeTime = false) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(date);
  };

  const doctorId = (doctor) => String(doctor?._id || doctor?.id || "");

  const getDoctorInitials = (name) =>
    String(name || "D")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();

  const showToast = (message, tone = "success") => {
    if (!elements.toastRegion) return;
    const toast = document.createElement("div");
    toast.className = `chief-toast ${tone}`;
    toast.textContent = message;
    elements.toastRegion.appendChild(toast);
    window.setTimeout(() => toast.classList.add("is-visible"), 10);
    window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => toast.remove(), 220);
    }, 3600);
  };

  const setModalState = (modal, isOpen) => {
    if (!modal) return;
    modal.hidden = !isOpen;
    modal.toggleAttribute("hidden", !isOpen);
    document.body.classList.toggle(
      "chief-management-modal-open",
      Boolean(
        isOpen ||
          !elements.detailsModal?.hidden ||
          !elements.reasonModal?.hidden ||
          !elements.documentModal?.hidden
      )
    );
  };

  const getStatusClass = (value) =>
    String(value || "unknown")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");

  const getFilteredDoctors = () => {
    const search = String(elements.search?.value || "").trim().toLowerCase();
    const approval = elements.approvalFilter?.value || "all";
    const account = elements.accountFilter?.value || "all";
    const access = elements.accessFilter?.value || "all";

    return state.doctors.filter((doctor) => {
      const haystack = [
        doctor.name,
        doctor.email,
        doctor.specialty,
        doctor.hospital,
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!search || haystack.includes(search)) &&
        (approval === "all" || doctor.approvalStatus === approval) &&
        (account === "all" || doctor.accountStatus === account) &&
        (access === "all" || doctor.doctorAccountType === access)
      );
    });
  };

  const renderMetrics = () => {
    const doctors = state.doctors;
    elements.totalMetric.textContent = String(doctors.length);
    elements.pendingMetric.textContent = String(
      doctors.filter((doctor) => doctor.approvalStatus === "Pending").length
    );
    elements.activeMetric.textContent = String(
      doctors.filter((doctor) => doctor.accountStatus === "Active").length
    );
    elements.blockedMetric.textContent = String(
      doctors.filter((doctor) => doctor.accountStatus === "Deleted").length
    );
  };

  const renderPagination = (total) => {
    if (!elements.pagination) return;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    elements.pagination.innerHTML = "";

    const makeButton = (label, page, options = {}) => {
      const button = document.createElement("button");
      const isPrevious = options.ariaLabel === "Previous page";
      const isNext = options.ariaLabel === "Next page";
      const isDirection = isPrevious || isNext;
      button.type = "button";
      button.className = `chief-pagination-button${options.active ? " active" : ""}${
        isDirection ? " direction" : ""
      }`;
      if (isDirection) {
        button.innerHTML = isPrevious
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 7-5 5 5 5" /></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 7 5 5-5 5" /></svg>';
      } else {
        button.textContent = label;
      }
      button.disabled = Boolean(options.disabled);
      button.setAttribute("aria-label", options.ariaLabel || `Page ${page}`);
      if (options.active) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => {
        state.page = page;
        renderDirectory();
      });
      return button;
    };

    elements.pagination.appendChild(
      makeButton("‹", Math.max(1, state.page - 1), {
        disabled: state.page === 1,
        ariaLabel: "Previous page",
      })
    );

    for (let page = 1; page <= totalPages; page += 1) {
      elements.pagination.appendChild(
        makeButton(String(page), page, { active: page === state.page })
      );
    }

    elements.pagination.appendChild(
      makeButton("›", Math.min(totalPages, state.page + 1), {
        disabled: state.page === totalPages,
        ariaLabel: "Next page",
      })
    );
  };

  const buildActionButtons = (doctor) => {
    const id = doctorId(doctor);
    const isBusy = state.busyDoctorIds.has(id);
    const detailsButton = `
      <button class="chief-table-action details" type="button" data-chief-action="details" data-doctor-id="${escapeHtml(id)}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2.8 12s3.35-5.5 9.2-5.5 9.2 5.5 9.2 5.5-3.35 5.5-9.2 5.5S2.8 12 2.8 12Z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
        <span>Details</span>
      </button>
    `;

    if (doctor.approvalStatus === "Pending") {
      return `
        <div class="chief-table-actions pending-actions${isBusy ? " is-busy" : ""}">
          ${detailsButton}
          <button class="chief-table-action approve" type="button" data-chief-action="approve" data-doctor-id="${escapeHtml(id)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" /></svg>
            <span>Approve</span>
          </button>
          <button class="chief-table-action reject" type="button" data-chief-action="reject" data-doctor-id="${escapeHtml(id)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
            <span>Reject</span>
          </button>
        </div>
      `;
    }

    const menuActions = [];
    if (doctor.approvalStatus === "Rejected") {
      menuActions.push(
        `<button type="button" data-chief-action="approve" data-doctor-id="${escapeHtml(id)}">
          <span class="chief-action-menu-icon success"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" /></svg></span>
          <span><strong>Approve registration</strong><small>Grant access to the clinical workspace</small></span>
        </button>`
      );
    } else if (doctor.accountStatus !== "Deleted") {
      menuActions.push(
        `<button type="button" data-chief-action="reject" data-doctor-id="${escapeHtml(id)}">
          <span class="chief-action-menu-icon warning"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg></span>
          <span><strong>Reject registration</strong><small>Withdraw the current approval</small></span>
        </button>`
      );
    }

    if (doctor.accountStatus === "Active") {
      menuActions.push(
        `<button type="button" data-chief-action="deactivate" data-doctor-id="${escapeHtml(id)}">
          <span class="chief-action-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg></span>
          <span><strong>Deactivate account</strong><small>Temporarily suspend sign-in access</small></span>
        </button>`
      );
    } else {
      menuActions.push(
        `<button type="button" data-chief-action="activate" data-doctor-id="${escapeHtml(id)}">
          <span class="chief-action-menu-icon success"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg></span>
          <span><strong>${doctor.accountStatus === "Deleted" ? "Unblock account" : "Activate account"}</strong><small>Restore access to the workspace</small></span>
        </button>`
      );
    }

    if (doctor.accountStatus !== "Deleted") {
      menuActions.push(
        `<button class="danger" type="button" data-chief-action="delete" data-doctor-id="${escapeHtml(id)}">
          <span class="chief-action-menu-icon danger"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5M14 11v5" /></svg></span>
          <span><strong>Block account</strong><small>Prevent all future access</small></span>
        </button>`
      );
    }

    return `
      <div class="chief-table-actions${isBusy ? " is-busy" : ""}">
        ${detailsButton}
        <div class="chief-action-menu-shell">
          <button
            class="chief-more-actions"
            type="button"
            data-chief-menu-toggle
            aria-expanded="false"
            aria-label="More actions for ${escapeHtml(doctor.name || "doctor")}"
          >
            <span>More</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>
          </button>
          <div class="chief-action-menu" data-chief-action-menu hidden>
            <span class="chief-action-menu-label">Account actions</span>
            ${menuActions.join("")}
          </div>
        </div>
      </div>
    `;
  };

  const renderDirectory = () => {
    if (!elements.body) return;
    const filtered = getFilteredDoctors();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);

    elements.loading.hidden = !state.loading;
    elements.empty.hidden = state.loading || visible.length > 0;
    elements.resultCount.textContent = `${filtered.length} doctor${filtered.length === 1 ? "" : "s"}`;

    elements.body.innerHTML = visible
      .map((doctor) => {
        const id = doctorId(doctor);
        const isDeleted = doctor.accountStatus === "Deleted";
        const accessType = doctor.doctorAccountType === "standard" ? "standard" : "prediction";
        const accessLabel = accessType === "prediction" ? "Prediction enabled" : "Standard access";
        const accessDescription =
          accessType === "prediction" ? "Can create AI predictions" : "Clinical records only";
        const initials = getDoctorInitials(doctor.name);
        const profilePhoto = String(doctor.profilePhoto || "").trim();
        return `
          <tr class="${isDeleted ? "is-blocked" : ""}">
            <td>
              <div class="chief-doctor-identity">
                <span class="chief-doctor-avatar${profilePhoto ? " has-photo" : ""}">
                  <span>${escapeHtml(initials)}</span>
                  ${
                    profilePhoto
                      ? `<img src="${escapeHtml(profilePhoto)}" alt="" data-chief-doctor-photo />`
                      : ""
                  }
                </span>
                <div>
                  <strong>${escapeHtml(doctor.name || "Unnamed doctor")}</strong>
                  <span>${escapeHtml(doctor.email || "No email")}</span>
                </div>
              </div>
            </td>
            <td>
              <div class="chief-doctor-meta">
                <strong>${escapeHtml(doctor.specialty || "Not specified")}</strong>
                <span>${escapeHtml(doctor.hospital || "Institution not specified")}</span>
              </div>
            </td>
            <td>
              <label class="chief-access-control ${accessType}${isDeleted ? " is-disabled" : ""}">
                <span class="chief-access-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    ${
                      accessType === "prediction"
                        ? '<path d="M12 3 5 6v5c0 4.5 2.9 8 7 10 4.1-2 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" />'
                        : '<path d="M12 3 5 6v5c0 4.5 2.9 8 7 10 4.1-2 7-5.5 7-10V6l-7-3Z" /><path d="M9 12h6" />'
                    }
                  </svg>
                </span>
                <span class="chief-access-copy">
                  <strong>${accessLabel}</strong>
                  <small>${accessDescription}</small>
                </span>
                <select
                  class="chief-access-select"
                  data-chief-access
                  data-doctor-id="${escapeHtml(id)}"
                  aria-label="Access level for ${escapeHtml(doctor.name || "doctor")}"
                  ${isDeleted || state.busyDoctorIds.has(id) ? "disabled" : ""}
                >
                  <option value="standard" ${accessType === "standard" ? "selected" : ""}>Standard access</option>
                  <option value="prediction" ${accessType === "prediction" ? "selected" : ""}>Prediction enabled</option>
                </select>
                <svg class="chief-access-chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m8 10 4 4 4-4" />
                </svg>
              </label>
            </td>
            <td>${escapeHtml(formatDate(doctor.createdAt))}</td>
            <td><span class="chief-status ${getStatusClass(doctor.approvalStatus)}">${escapeHtml(doctor.approvalStatus || "Pending")}</span></td>
            <td><span class="chief-status ${getStatusClass(doctor.accountStatus)}">${escapeHtml(isDeleted ? "Blocked" : doctor.accountStatus || "Inactive")}</span></td>
            <td>${buildActionButtons(doctor)}</td>
          </tr>
        `;
      })
      .join("");

    elements.body.querySelectorAll("[data-chief-doctor-photo]").forEach((image) => {
      const useInitialsFallback = () => {
        image.closest(".chief-doctor-avatar")?.classList.remove("has-photo");
        image.remove();
      };
      image.addEventListener("error", useInitialsFallback, { once: true });
      if (image.complete && image.naturalWidth === 0) useInitialsFallback();
    });

    const end = Math.min(start + visible.length, filtered.length);
    elements.paginationSummary.textContent =
      filtered.length === 0
        ? "Showing 0 to 0 of 0 doctors"
        : `Showing ${start + 1} to ${end} of ${filtered.length} doctors`;
    renderPagination(filtered.length);
  };

  const updateDoctorInState = (updatedDoctor) => {
    const id = doctorId(updatedDoctor);
    const index = state.doctors.findIndex((doctor) => doctorId(doctor) === id);
    if (index >= 0) {
      state.doctors[index] = { ...state.doctors[index], ...updatedDoctor };
    }
    renderMetrics();
    renderDirectory();
  };

  const requestAction = async (id, action, body) => {
    state.busyDoctorIds.add(id);
    renderDirectory();
    try {
      const response = await bridge.requestJson(`/auth/chief/doctors/${encodeURIComponent(id)}/${action}`, {
        method: "PATCH",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (response?.user) updateDoctorInState(response.user);
      showToast(response?.message || "Doctor account updated.");
      return true;
    } catch (error) {
      showToast(error.message || "Unable to update this doctor account.", "danger");
      return false;
    } finally {
      state.busyDoctorIds.delete(id);
      renderDirectory();
    }
  };

  const openReasonModal = (doctor, action) => {
    const labels = {
      reject: {
        title: "Reject doctor registration",
        copy: `Explain why ${doctor.name || "this doctor"} cannot be approved.`,
        submit: "Reject registration",
      },
      deactivate: {
        title: "Deactivate doctor account",
        copy: `Explain why ${doctor.name || "this doctor"} should temporarily lose access.`,
        submit: "Deactivate account",
      },
      delete: {
        title: "Block doctor account",
        copy: `Explain why ${doctor.name || "this doctor"} should be blocked.`,
        submit: "Block account",
      },
    };
    const content = labels[action];
    if (!content) return;
    state.pendingReasonAction = { doctorId: doctorId(doctor), action };
    elements.reasonTitle.textContent = content.title;
    elements.reasonCopy.textContent = content.copy;
    elements.reasonSubmit.textContent = content.submit;
    elements.reasonInput.value = "";
    setModalState(elements.reasonModal, true);
    window.setTimeout(() => elements.reasonInput.focus(), 30);
  };

  const getDoctorById = (id) =>
    state.doctors.find((doctor) => doctorId(doctor) === String(id || ""));

  const renderDoctorDetails = (doctor) => {
    const documents = Array.isArray(doctor.submittedDocuments) ? doctor.submittedDocuments : [];
    const history = Array.isArray(doctor.statusHistory) ? doctor.statusHistory : [];
    const recordedRegistrationAccountType =
      doctor.registrationAccountType === "standard" ||
      doctor.registrationAccountType === "prediction"
        ? doctor.registrationAccountType
        : "";
    const chronologicalHistory = history
      .slice()
      .sort(
        (left, right) =>
          new Date(left.date || left.createdAt || 0) -
          new Date(right.date || right.createdAt || 0)
      );
    const firstAccessChange = chronologicalHistory.find((entry) =>
      /access changed to standard doctor|access upgraded to doctor with prediction/i.test(
        String(entry.label || entry.action || "")
      )
    );
    const inferredRegistrationAccountType = /access changed to standard doctor/i.test(
      String(firstAccessChange?.label || firstAccessChange?.action || "")
    )
      ? "prediction"
      : /access upgraded to doctor with prediction/i.test(
            String(firstAccessChange?.label || firstAccessChange?.action || "")
          )
        ? "standard"
        : doctor.doctorAccountType === "standard"
          ? "standard"
          : "prediction";
    const registrationAccountType =
      recordedRegistrationAccountType || inferredRegistrationAccountType;
    const registrationAccessLabel =
      registrationAccountType === "prediction"
        ? "Prediction access"
        : registrationAccountType === "standard"
          ? "Standard doctor"
          : "Not recorded";
    elements.detailsTitle.innerHTML = `
      <span>${escapeHtml(doctor.name || "Doctor details")}</span>
      <span class="chief-details-access-badge ${registrationAccountType || "unknown"}">
        ${escapeHtml(registrationAccessLabel)}
      </span>
    `;
    elements.detailsContent.innerHTML = `
      <div class="chief-detail-grid">
        <article><span>Email</span><strong>${escapeHtml(doctor.email || "Not available")}</strong></article>
        <article><span>Specialty</span><strong>${escapeHtml(doctor.specialty || "Not specified")}</strong></article>
        <article><span>Institution</span><strong>${escapeHtml(doctor.hospital || "Not specified")}</strong></article>
        <article><span>Registered</span><strong>${escapeHtml(formatDate(doctor.createdAt, true))}</strong></article>
        <article><span>Approval</span><strong>${escapeHtml(doctor.approvalStatus || "Pending")}</strong></article>
        <article><span>Account</span><strong>${escapeHtml(doctor.accountStatus === "Deleted" ? "Blocked" : doctor.accountStatus || "Inactive")}</strong></article>
      </div>
      <section class="chief-detail-section">
        <div class="chief-detail-section-title">Submitted documents</div>
        ${
          documents.length
            ? `<div class="chief-document-list">${documents
                .map(
                  (document, index) => `
                    <button type="button" data-chief-document="${index}">
                      <span>
                        <strong>${escapeHtml(document.label || "Document")}</strong>
                        <small>${escapeHtml(document.fileName || "Secure file")}</small>
                      </span>
                      <em>${document.verified ? "Verified" : "Review"}</em>
                    </button>
                  `
                )
                .join("")}</div>`
            : '<div class="chief-detail-empty">No submitted documents.</div>'
        }
      </section>
      <section class="chief-detail-section">
        <div class="chief-detail-section-title">Account history</div>
        ${
          history.length
            ? `<div class="chief-history-list">${history
                .slice()
                .reverse()
                .slice(0, 8)
                .map(
                  (entry) => `
                    <article>
                      <span></span>
                      <div>
                        <strong>${escapeHtml(entry.label || entry.action || "Account updated")}</strong>
                        <small>${escapeHtml(formatDate(entry.date || entry.createdAt, true))}${entry.by ? ` by ${escapeHtml(entry.by)}` : ""}</small>
                      </div>
                    </article>
                  `
                )
                .join("")}</div>`
            : '<div class="chief-detail-empty">No account history is available.</div>'
        }
      </section>
    `;
  };

  const openDoctorDetails = (doctor) => {
    state.selectedDoctorId = doctorId(doctor);
    renderDoctorDetails(doctor);
    setModalState(elements.detailsModal, true);
  };

  const closeDocumentModal = () => {
    if (state.documentObjectUrl) {
      URL.revokeObjectURL(state.documentObjectUrl);
      state.documentObjectUrl = "";
    }
    elements.documentFrame.innerHTML = "";
    setModalState(elements.documentModal, false);
  };

  const openDocument = async (doctor, index) => {
    const documentRecord = doctor?.submittedDocuments?.[index];
    if (!documentRecord?.downloadUrl) {
      showToast("This document is not available.", "danger");
      return;
    }

    elements.documentTitle.textContent = documentRecord.label || "Submitted document";
    elements.documentSubtitle.textContent = documentRecord.fileName || "Secure document";
    elements.documentFrame.innerHTML = '<div class="chief-document-loading">Loading secure document...</div>';
    setModalState(elements.documentModal, true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 16000);

    try {
      const blob = await bridge.requestBlob(documentRecord.downloadUrl, {
        signal: controller.signal,
      });
      if (state.documentObjectUrl) URL.revokeObjectURL(state.documentObjectUrl);
      state.documentObjectUrl = URL.createObjectURL(blob);
      const fileName = documentRecord.fileName || "document";
      const isPdf = /pdf/i.test(documentRecord.mimeType || "") || /\.pdf$/i.test(fileName);
      const isImage =
        /^image\//i.test(documentRecord.mimeType || "") || /\.(png|jpe?g|webp)$/i.test(fileName);

      elements.documentFrame.innerHTML = isPdf
        ? `<iframe src="${state.documentObjectUrl}" title="${escapeHtml(documentRecord.label || "Document")}"></iframe>`
        : isImage
          ? `<img src="${state.documentObjectUrl}" alt="${escapeHtml(documentRecord.label || "Document")}" />`
          : `<div class="chief-document-download">
               <p>A browser preview is not available for this file type.</p>
               <a href="${state.documentObjectUrl}" download="${escapeHtml(fileName)}">Download document</a>
             </div>`;
    } catch (error) {
      const message =
        error?.name === "AbortError"
          ? "The document server took too long to respond. Check MinIO, then try again."
          : error.message || "Unable to open this document.";
      elements.documentFrame.innerHTML = `
        <div class="chief-document-error">
          <p>${escapeHtml(message)}</p>
          <button type="button" data-chief-document-retry="${index}">Try again</button>
        </div>
      `;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const loadDoctors = async () => {
    state.loading = true;
    renderDirectory();
    elements.refreshButton.disabled = true;
    try {
      const doctors = await bridge.requestJson("/auth/chief/doctors");
      state.doctors = Array.isArray(doctors) ? doctors : [];
      renderMetrics();
    } catch (error) {
      if (error.status === 403) {
        window.location.replace("dashboard.html");
        return;
      }
      showToast(error.message || "Unable to load doctor accounts.", "danger");
    } finally {
      state.loading = false;
      elements.refreshButton.disabled = false;
      renderDirectory();
    }
  };

  const exportDoctors = async () => {
    elements.exportButton.disabled = true;
    try {
      const params = new URLSearchParams();
      if (elements.search.value.trim()) params.set("search", elements.search.value.trim());
      if (elements.approvalFilter.value !== "all") params.set("approvalStatus", elements.approvalFilter.value);
      if (elements.accountFilter.value !== "all") params.set("accountStatus", elements.accountFilter.value);
      if (elements.accessFilter.value !== "all") params.set("doctorAccountType", elements.accessFilter.value);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const blob = await bridge.requestBlob(`/auth/chief/doctors/export${suffix}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `doctors-directory-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast("Doctor directory exported.");
    } catch (error) {
      showToast(error.message || "Unable to export the doctor directory.", "danger");
    } finally {
      elements.exportButton.disabled = false;
    }
  };

  const handleTableAction = async (button) => {
    const doctor = getDoctorById(button.dataset.doctorId);
    const action = button.dataset.chiefAction;
    if (!doctor || !action || state.busyDoctorIds.has(doctorId(doctor))) return;

    if (action === "details") {
      openDoctorDetails(doctor);
      return;
    }
    if (["reject", "deactivate", "delete"].includes(action)) {
      openReasonModal(doctor, action);
      return;
    }
    if (action === "approve" || action === "activate") {
      await requestAction(doctorId(doctor), action);
    }
  };

  const bindEvents = () => {
    [elements.search, elements.approvalFilter, elements.accountFilter, elements.accessFilter].forEach(
      (control) => {
        control?.addEventListener(control === elements.search ? "input" : "change", () => {
          state.page = 1;
          renderDirectory();
        });
      }
    );

    elements.refreshButton?.addEventListener("click", loadDoctors);
    elements.exportButton?.addEventListener("click", exportDoctors);

    elements.body?.addEventListener("click", (event) => {
      const menuToggle = event.target.closest("[data-chief-menu-toggle]");
      if (menuToggle) {
        const shell = menuToggle.closest(".chief-action-menu-shell");
        const menu = shell?.querySelector("[data-chief-action-menu]");
        const shouldOpen = Boolean(menu?.hidden);
        elements.body.querySelectorAll("[data-chief-action-menu]").forEach((otherMenu) => {
          otherMenu.hidden = true;
          otherMenu.closest(".chief-action-menu-shell")
            ?.querySelector("[data-chief-menu-toggle]")
            ?.setAttribute("aria-expanded", "false");
        });
        if (menu) {
          menu.hidden = !shouldOpen;
          menuToggle.setAttribute("aria-expanded", String(shouldOpen));
        }
        return;
      }

      const button = event.target.closest("[data-chief-action]");
      if (button) {
        button.closest("[data-chief-action-menu]")?.setAttribute("hidden", "");
        handleTableAction(button);
      }
    });

    document.addEventListener("click", (event) => {
      if (event.target.closest(".chief-action-menu-shell")) return;
      elements.body?.querySelectorAll("[data-chief-action-menu]").forEach((menu) => {
        menu.hidden = true;
        menu.closest(".chief-action-menu-shell")
          ?.querySelector("[data-chief-menu-toggle]")
          ?.setAttribute("aria-expanded", "false");
      });
    });

    elements.body?.addEventListener("change", async (event) => {
      const select = event.target.closest("[data-chief-access]");
      if (!select) return;
      const doctor = getDoctorById(select.dataset.doctorId);
      if (!doctor) return;
      const previousValue = doctor.doctorAccountType === "standard" ? "standard" : "prediction";
      const success = await requestAction(doctorId(doctor), "access-type", {
        doctorAccountType: select.value,
      });
      if (!success) select.value = previousValue;
    });

    document.querySelectorAll("[data-close-chief-details]").forEach((control) => {
      control.addEventListener("click", () => setModalState(elements.detailsModal, false));
    });
    document.querySelectorAll("[data-close-chief-reason]").forEach((control) => {
      control.addEventListener("click", () => {
        state.pendingReasonAction = null;
        setModalState(elements.reasonModal, false);
      });
    });
    document.querySelectorAll("[data-close-chief-document]").forEach((control) => {
      control.addEventListener("click", closeDocumentModal);
    });

    elements.detailsContent?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-chief-document]");
      if (!button) return;
      const doctor = getDoctorById(state.selectedDoctorId);
      openDocument(doctor, Number(button.dataset.chiefDocument));
    });

    elements.documentFrame?.addEventListener("click", (event) => {
      const retryButton = event.target.closest("[data-chief-document-retry]");
      if (!retryButton) return;
      const doctor = getDoctorById(state.selectedDoctorId);
      openDocument(doctor, Number(retryButton.dataset.chiefDocumentRetry));
    });

    elements.reasonForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const pending = state.pendingReasonAction;
      const reason = elements.reasonInput.value.trim();
      if (!pending || !reason) return;
      elements.reasonSubmit.disabled = true;
      const success = await requestAction(pending.doctorId, pending.action, { reason });
      elements.reasonSubmit.disabled = false;
      if (success) {
        state.pendingReasonAction = null;
        setModalState(elements.reasonModal, false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!elements.documentModal.hidden) closeDocumentModal();
      else if (!elements.reasonModal.hidden) setModalState(elements.reasonModal, false);
      else if (!elements.detailsModal.hidden) setModalState(elements.detailsModal, false);
    });
  };

  const initialize = async () => {
    if (!bridge?.ensureFreshSession || !bridge?.requestJson) {
      window.location.replace("index.html");
      return;
    }

    try {
      const session = await bridge.ensureFreshSession();
      if (!isPredictionChief(session)) {
        window.location.replace("dashboard.html");
        return;
      }
    } catch (error) {
      window.location.replace("index.html");
      return;
    }

    bindEvents();
    await loadDoctors();
  };

  initialize();
})();
