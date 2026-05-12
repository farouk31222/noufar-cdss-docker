const historySidebar = document.querySelector(".sidebar");
const historyMobileButton = document.querySelector(".mobile-nav-button");
const historyTotal = document.querySelector("#history-total");
const historyRelapse = document.querySelector("#history-relapse");
const historyManual = document.querySelector("#history-manual");
const historyImported = document.querySelector("#history-imported");
const historyBody = document.querySelector("#history-body");
const historySearchShell = document.querySelector("#history-search-shell");
const historySearchToggle = document.querySelector("#history-search-toggle");
const historySearch = document.querySelector("#history-search");
const historySearchClear = document.querySelector("#history-search-clear");
const historyPagination = document.querySelector("#history-pagination");
const historyPaginationSummary = document.querySelector("#history-pagination-summary");
const historyDeleteModal = document.querySelector("#history-delete-modal");
const historyDeleteSummary = document.querySelector("#history-delete-summary");
const historyConfirmDeleteButton = document.querySelector("#history-confirm-delete");
const historyDeleteCloseControls = document.querySelectorAll("[data-close-history-delete]");

const historyDoctorAuthStorageKey = "noufar-doctor-auth-v1";
const historyApiBaseUrl = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
const HISTORY_PAGE_SIZE = 8;
const historyDoctorSessionBridge = window.NoufarDoctorSessionBridge || null;

let historyCurrentPage = 1;
let historyEntries = [];
let historyPendingDeleteEntry = null;

const showHistoryToast = (message, variant = "success") => {
  if (typeof window.showNoufarToast === "function") {
    window.showNoufarToast(message, variant);
  }
};

if (historyMobileButton && historySidebar) {
  historyMobileButton.addEventListener("click", () => {
    const isOpen = historySidebar.classList.toggle("is-open");
    historyMobileButton.setAttribute("aria-expanded", String(isOpen));
  });
}

const getHistoryDoctorSession = () => {
  try {
    const raw = window.localStorage.getItem(historyDoctorAuthStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const requestHistoryPredictions = async () => {
  if (historyDoctorSessionBridge?.requestJson) {
    const data = await historyDoctorSessionBridge.requestJson("/predictions");
    return Array.isArray(data) ? data : [];
  }

  const session = getHistoryDoctorSession();
  const token = session?.token;

  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  const response = await fetch(`${historyApiBaseUrl}/predictions`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data.message || "Unable to load prediction history.");
  }

  return Array.isArray(data) ? data : [];
};

const deleteHistoryPrediction = async (id) => {
  if (historyDoctorSessionBridge?.requestJson) {
    return historyDoctorSessionBridge.requestJson(`/predictions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  const session = getHistoryDoctorSession();
  const token = session?.token;

  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  const response = await fetch(`${historyApiBaseUrl}/predictions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "Unable to delete this prediction.");
  }

  return data;
};

const syncHistoryEntries = (entries) => {
  if (typeof replacePatientPredictions === "function") {
    historyEntries = replacePatientPredictions(entries);
    return;
  }

  historyEntries = Array.isArray(entries) ? entries : [];
};

const refreshHistoryStats = () => {
  const stats = typeof getDashboardStats === "function"
    ? getDashboardStats()
    : {
        total: historyEntries.length,
        relapse: historyEntries.filter((entry) => entry.result === "Relapse").length,
        noRelapse: historyEntries.filter((entry) => entry.result !== "Relapse").length,
      };

  if (historyTotal) historyTotal.textContent = stats.total.toLocaleString();
  if (historyRelapse) historyRelapse.textContent = stats.relapse.toLocaleString();
  if (historyManual) {
    historyManual.textContent = historyEntries
      .filter((entry) => entry.source === "Manual")
      .length.toLocaleString();
  }
  if (historyImported) {
    historyImported.textContent = historyEntries
      .filter((entry) => entry.source !== "Manual")
      .length.toLocaleString();
  }
};

const paginateHistoryEntries = (items, page = 1, pageSize = HISTORY_PAGE_SIZE) => {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    currentPage,
    totalPages,
    totalItems: items.length,
    start,
  };
};

const buildHistoryPaginationItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages];
};

const getHistoryValidationMeta = (entry) => {
  const actualOutcome = entry.actualOutcome || "";
  const savedStatus = entry.validationStatus || "Pending";
  const validationStatus =
    actualOutcome && savedStatus === "Pending"
      ? actualOutcome === entry.result
        ? "Correct"
        : "Incorrect"
      : savedStatus;

  if (!actualOutcome || validationStatus === "Pending") {
      return {
        actualOutcome: "Awaiting confirmation",
        tone: "pending",
        statusLabel: "Pending Review",
        metaLabel: "Confirmed outcome not recorded yet",
      };
  }

  return {
    actualOutcome,
    tone: validationStatus.toLowerCase(),
    statusLabel: validationStatus,
    metaLabel: entry.validationRecordedAt ? `Recorded ${formatDate(entry.validationRecordedAt, true)}` : "Outcome saved",
  };
};

const getFilteredHistoryEntries = (query = "") => {
  const normalizedQuery = query.trim().toLowerCase();
  const sortedEntries = [...historyEntries].sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt));

  return sortedEntries.filter((entry) => {
    if (!normalizedQuery) return true;

    const validation = getHistoryValidationMeta(entry);

    return [
      entry.patient,
      entry.id,
      entry.predictedByName || "",
      entry.source,
      entry.result,
      validation.actualOutcome,
      validation.statusLabel,
      `${entry.age}`,
      entry.sex,
      formatDate(entry.analyzedAt, true),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
};

const renderHistoryPagination = (currentPage, totalPages, totalItems) => {
  if (!historyPagination) return;

  if (!totalItems) {
    historyPagination.innerHTML = "";
    return;
  }

  const items = buildHistoryPaginationItems(currentPage, totalPages);
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  historyPagination.innerHTML = `
    <button
      class="pagination-button pagination-button-nav"
      type="button"
      data-page="${Math.max(currentPage - 1, 1)}"
      aria-label="Go to previous page"
      ${prevDisabled ? "disabled" : ""}
    >
      &#8249;
    </button>
    <div class="pagination-track">
      ${items
        .map((item) => {
          if (item === "ellipsis") {
            return '<span class="pagination-ellipsis" aria-hidden="true">...</span>';
          }

          return `
            <button
              class="pagination-button ${item === currentPage ? "active" : ""}"
              type="button"
              data-page="${item}"
              aria-label="Go to page ${item}"
              ${item === currentPage ? 'aria-current="page"' : ""}
            >
              ${item}
            </button>
          `;
        })
        .join("")}
    </div>
    <button
      class="pagination-button pagination-button-nav"
      type="button"
      data-page="${Math.min(currentPage + 1, totalPages)}"
      aria-label="Go to next page"
      ${nextDisabled ? "disabled" : ""}
    >
      &#8250;
    </button>
  `;

  historyPagination.querySelectorAll(".pagination-button[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number(button.dataset.page);
      if (!nextPage || nextPage === historyCurrentPage) return;
      historyCurrentPage = nextPage;
      renderHistoryRows();
    });
  });
};

const updateHistorySummary = (pageData, query = "") => {
  if (!historyPaginationSummary) return;

  if (!pageData.totalItems) {
    historyPaginationSummary.textContent = query.trim()
      ? "No predictions match the current search."
      : "No prediction records are available yet.";
    return;
  }

  const start = pageData.start + 1;
  const end = pageData.start + pageData.items.length;
  const noun = query.trim() ? "matching predictions" : "predictions";
  historyPaginationSummary.textContent = `Showing ${start} to ${end} of ${pageData.totalItems} ${noun}`;
};

const renderHistoryRows = () => {
  if (!historyBody) return;

  const query = historySearch?.value || "";
  const filteredEntries = getFilteredHistoryEntries(query);
  const pageData = paginateHistoryEntries(filteredEntries, historyCurrentPage, HISTORY_PAGE_SIZE);
  historyCurrentPage = pageData.currentPage;
  historyBody.innerHTML = "";

  if (!pageData.items.length) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `
      <td colspan="9">
        <div class="history-empty-state">
          <strong>No predictions found</strong>
          <span>Try another patient name, identifier, source, or validation status.</span>
        </div>
      </td>
    `;
    historyBody.appendChild(emptyRow);
    updateHistorySummary(pageData, query);
    renderHistoryPagination(pageData.currentPage, pageData.totalPages, pageData.totalItems);
    return;
  }

  pageData.items.forEach((entry) => {
    const badge = getPredictionBadge(entry);
    const validation = getHistoryValidationMeta(entry);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <div class="patient-meta">
          <strong>${entry.patient}</strong>
          <span>${entry.id}</span>
        </div>
      </td>
      <td>${entry.age} years / ${entry.sex}</td>
      <td>${formatDate(entry.analyzedAt, true)}</td>
      <td>${formatPredictedByDisplay(entry.predictedByName)}</td>
      <td>${entry.source}</td>
      <td><span class="prediction-badge ${badge.tone}">${badge.label}</span></td>
      <td>
        <span class="probability-cell ${entry.result === 'Relapse' ? 'prob-relapse' : 'prob-stable'}">
          <strong>${entry.probability}%</strong>
          <span class="probability-bar"><i style="width:${entry.probability}%"></i></span>
        </span>
      </td>
      <td>
        <div class="history-validation-cell">
          <strong>${validation.actualOutcome}</strong>
          <div class="history-validation-meta">
            <span class="history-validation-pill ${validation.tone}">${validation.statusLabel}</span>
            <span class="history-validation-note">${validation.metaLabel}</span>
          </div>
        </div>
      </td>
      <td>
        <div class="history-row-actions">
          <a class="table-action" href="prediction-details.html?id=${encodeURIComponent(entry.id)}">Details</a>
          <button
            class="history-delete-action"
            type="button"
            data-delete-prediction-id="${entry.id}"
            data-delete-patient-name="${entry.patient}"
            data-delete-probability="${entry.probability}"
            data-delete-result="${entry.result}"
            aria-label="Delete prediction for ${entry.patient}"
            title="Delete prediction"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-7 0 1 11a1.5 1.5 0 0 0 1.49 1.36h3.02A1.5 1.5 0 0 0 15 18l1-11M10 11.5v4.5M14 11.5v4.5" />
            </svg>
          </button>
        </div>
      </td>
    `;
    historyBody.appendChild(row);
  });

  updateHistorySummary(pageData, query);
  renderHistoryPagination(pageData.currentPage, pageData.totalPages, pageData.totalItems);
};

const closeHistoryDeleteModal = () => {
  if (historyDeleteModal) {
    historyDeleteModal.hidden = true;
  }
  historyPendingDeleteEntry = null;
  document.body.style.overflow = "";
  if (historyConfirmDeleteButton) {
    historyConfirmDeleteButton.disabled = false;
    historyConfirmDeleteButton.textContent = "Delete Prediction";
  }
};

const openHistoryDeleteModal = (entry) => {
  if (!historyDeleteModal || !historyDeleteSummary || !entry) return;

  historyPendingDeleteEntry = entry;
  historyDeleteSummary.innerHTML = `
    <strong>${entry.patient}</strong>
    <span>${entry.id} · ${entry.probability}% probability · ${entry.result}</span>
  `;
  historyDeleteModal.hidden = false;
  document.body.style.overflow = "hidden";
};

const removeHistoryEntryLocally = (id) => {
  historyEntries = historyEntries.filter((entry) => entry.id !== id);

  if (typeof deletePredictionRecordById === "function") {
    deletePredictionRecordById(id);
  }
};

const renderHistoryError = (message) => {
  if (!historyBody) return;

  historyBody.innerHTML = `
    <tr>
      <td colspan="8">
        <div class="history-empty-state">
          <strong>Unable to load prediction history</strong>
          <span>${message}</span>
        </div>
      </td>
    </tr>
  `;
  if (historyPaginationSummary) {
    historyPaginationSummary.textContent = "Prediction history is currently unavailable.";
  }
  if (historyPagination) {
    historyPagination.innerHTML = "";
  }
};

const closeHistorySearch = () => {
  if (!historySearchShell || !historySearchToggle || !historySearch) return;
  if (historySearch.value.trim()) return;
  historySearchShell.classList.remove("is-open");
  historySearchToggle.setAttribute("aria-expanded", "false");
};

const loadHistoryPage = async () => {
  try {
    const predictions = await requestHistoryPredictions();
    syncHistoryEntries(predictions);
    refreshHistoryStats();
    renderHistoryRows();
  } catch (error) {
    renderHistoryError(error instanceof Error ? error.message : "Unexpected history error.");
  }
};

if (historySearchShell && historySearchToggle && historySearch) {
  historySearchToggle.addEventListener("click", () => {
    const shouldOpen = !historySearchShell.classList.contains("is-open");
    historySearchShell.classList.toggle("is-open", shouldOpen);
    historySearchToggle.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) {
      window.setTimeout(() => historySearch.focus(), 40);
    }
  });

  historySearch.addEventListener("blur", () => {
    window.setTimeout(closeHistorySearch, 100);
  });
}

if (historySearch) {
  historySearch.addEventListener("input", () => {
    historyCurrentPage = 1;
    renderHistoryRows();
  });
}

if (historySearchClear && historySearch) {
  historySearchClear.addEventListener("click", () => {
    historySearch.value = "";
    historyCurrentPage = 1;
    renderHistoryRows();
    historySearch.focus();
    closeHistorySearch();
  });
}

historyBody?.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-prediction-id]");
  if (!deleteButton) return;

  const entry = historyEntries.find((item) => item.id === deleteButton.dataset.deletePredictionId);
  if (!entry) return;

  openHistoryDeleteModal(entry);
});

historyDeleteCloseControls.forEach((control) => {
  control.addEventListener("click", closeHistoryDeleteModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && historyDeleteModal && !historyDeleteModal.hidden) {
    closeHistoryDeleteModal();
  }
});

historyConfirmDeleteButton?.addEventListener("click", async () => {
  if (!historyPendingDeleteEntry) return;

  historyConfirmDeleteButton.disabled = true;
  historyConfirmDeleteButton.textContent = "Deleting...";

  try {
    await deleteHistoryPrediction(historyPendingDeleteEntry.id);
    removeHistoryEntryLocally(historyPendingDeleteEntry.id);
    refreshHistoryStats();

    const filteredEntries = getFilteredHistoryEntries(historySearch?.value || "");
    const totalPages = Math.max(1, Math.ceil(filteredEntries.length / HISTORY_PAGE_SIZE));
    historyCurrentPage = Math.min(historyCurrentPage, totalPages);

    closeHistoryDeleteModal();
    renderHistoryRows();
    showHistoryToast("Prediction deleted successfully.");
  } catch (error) {
    showHistoryToast(
      error instanceof Error ? error.message : "Unable to delete this prediction.",
      "danger"
    );
    if (historyDeleteSummary) {
      historyDeleteSummary.innerHTML = `
        <strong>Unable to delete this prediction</strong>
        <span>${error instanceof Error ? error.message : "Unexpected delete error."}</span>
      `;
    }
    historyConfirmDeleteButton.disabled = false;
    historyConfirmDeleteButton.textContent = "Delete Prediction";
  }
});

loadHistoryPage();
