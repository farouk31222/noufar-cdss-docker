(() => {
  const bridge = window.NoufarDoctorSessionBridge;
  const apiBaseUrl = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
  const authStorageKey = "noufar-doctor-auth-v1";
  const allowedUploadExtensions = [".csv", ".xlsx", ".xls"];
  const datasetUploadChunkSize = 250;

  const state = {
    imports: [],
    filtered: [],
    loading: true,
    deleteTargetId: "",
  };

  const elements = {
    total: document.getElementById("my-imports-total"),
    rows: document.getElementById("my-imports-rows"),
    latest: document.getElementById("my-imports-latest"),
    summary: document.getElementById("my-imports-summary"),
    search: document.getElementById("my-imports-search"),
    type: document.getElementById("my-imports-type"),
    sort: document.getElementById("my-imports-sort"),
    refresh: document.getElementById("my-imports-refresh"),
    error: document.getElementById("my-imports-error"),
    tableBody: document.getElementById("my-imports-table-body"),
    empty: document.getElementById("my-imports-empty"),
    deleteModal: document.getElementById("my-imports-delete-modal"),
    deleteSummary: document.getElementById("my-imports-delete-summary"),
    confirmDelete: document.getElementById("my-imports-confirm-delete"),
    dropzone: document.querySelector(".my-imports-upload-zone"),
    fileInput: document.getElementById("my-imports-dataset-file"),
    fileName: document.getElementById("my-imports-file-name"),
    uploadError: document.getElementById("my-imports-upload-error"),
    uploadSuccess: document.getElementById("my-imports-upload-success"),
    uploadSuccessText: document.getElementById("my-imports-upload-success-text"),
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const loadSession = () => {
    try {
      const raw = window.localStorage.getItem(authStorageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  };

  const requestDatasetImportsJson = async (path = "", options = {}) => {
    const normalizedPath = `/dataset-imports${path}`;
    if (bridge?.requestJson) {
      return bridge.requestJson(normalizedPath, options);
    }

    const session = loadSession();
    const token = session?.accessToken || session?.token;
    if (!token) {
      window.location.href = "index.html";
      throw new Error("Doctor session is required.");
    }

    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const response = await fetch(`${apiBaseUrl}${normalizedPath}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(!isFormData && options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "Dataset import request failed.");
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  };

  const listPrivateDatasetImports = async () => {
    const payload = await requestDatasetImportsJson("");
    return Array.isArray(payload) ? payload : [];
  };

  const deletePrivateDatasetImport = (datasetImportId) =>
    requestDatasetImportsJson(`/${encodeURIComponent(datasetImportId)}`, {
      method: "DELETE",
    });

  const uploadPrivateDatasetImport = async (file, dataset) => {
    const formData = new FormData();
    formData.append("datasetFile", file);
    formData.append("name", file.name);
    formData.append("sheetName", dataset.sheetName || "Dataset");
    formData.append("columns", JSON.stringify(dataset.columns || []));
    formData.append("totalRows", String(dataset.rows.length || 0));
    formData.append("consultationReasons", JSON.stringify(dataset.consultationReasons || []));
    formData.append("ultrasoundValues", JSON.stringify(dataset.ultrasoundValues || []));
    formData.append("tsiValues", JSON.stringify(dataset.tsiValues || []));

    const createdPayload = await requestDatasetImportsJson("", {
      method: "POST",
      body: formData,
    });
    const datasetImport = createdPayload?.datasetImport;
    if (!datasetImport?.id) {
      throw new Error("Imported dataset could not be initialized.");
    }

    try {
      for (let index = 0; index < dataset.rows.length; index += datasetUploadChunkSize) {
        const rowsChunk = dataset.rows.slice(index, index + datasetUploadChunkSize);
        await requestDatasetImportsJson(`/${encodeURIComponent(datasetImport.id)}/rows`, {
          method: "POST",
          body: JSON.stringify({ rows: rowsChunk }),
        });
      }
    } catch (error) {
      await deletePrivateDatasetImport(datasetImport.id).catch(() => {});
      throw error;
    }

    return datasetImport;
  };

  const formatNumber = (value) => new Intl.NumberFormat("en").format(Number(value) || 0);

  const formatFileSize = (bytes) => {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    const units = ["KB", "MB", "GB"];
    let value = size / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return new Intl.DateTimeFormat("en", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatRelativeDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Never";
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.max(1, Math.round(diffMs / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  };

  const getFileType = (item) => {
    const name = `${item?.fileName || item?.name || ""}`.toLowerCase();
    const mimeType = `${item?.mimeType || ""}`.toLowerCase();
    if (name.endsWith(".csv") || mimeType.includes("csv")) return "csv";
    if (name.endsWith(".xls") || name.endsWith(".xlsx") || mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
      return "excel";
    }
    return "other";
  };

  const getDatasetTitle = (item) => item?.name || item?.fileName || "Untitled import";

  const setError = (message = "") => {
    if (!elements.error) return;
    elements.error.textContent = message;
    elements.error.hidden = !message;
  };

  const showUploadError = (message) => {
    if (elements.fileName) elements.fileName.textContent = "No file selected";
    if (elements.uploadSuccess) elements.uploadSuccess.hidden = true;
    if (elements.uploadError) {
      elements.uploadError.textContent = message;
      elements.uploadError.hidden = false;
    }
    elements.dropzone?.classList.remove("is-ready");
    elements.dropzone?.classList.remove("has-selection");
  };

  const showUploadSuccess = (upload) => {
    if (elements.fileName) elements.fileName.textContent = upload?.name || upload?.fileName || "Imported dataset";
    if (elements.uploadError) elements.uploadError.hidden = true;
    if (elements.uploadSuccess) elements.uploadSuccess.hidden = false;
    if (elements.uploadSuccessText) {
      elements.uploadSuccessText.textContent = `${upload?.rowCount || 0} patient records imported successfully.`;
    }
    elements.dropzone?.classList.add("is-ready");
    elements.dropzone?.classList.add("has-selection");
  };

  const getFileExtension = (fileName) => {
    const normalizedName = String(fileName || "").toLowerCase();
    const dotIndex = normalizedName.lastIndexOf(".");
    return dotIndex >= 0 ? normalizedName.slice(dotIndex) : "";
  };

  const isValidUploadFile = (file) => allowedUploadExtensions.includes(getFileExtension(file?.name));

  const setLoadingState = () => {
    state.loading = true;
    setError("");
    if (elements.summary) elements.summary.textContent = "Loading imports...";
    if (elements.empty) elements.empty.hidden = true;
    if (elements.tableBody) {
      elements.tableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="my-imports-loading">Loading your imported datasets...</div>
          </td>
        </tr>
      `;
    }
  };

  const applyFilters = () => {
    const searchTerm = elements.search?.value.trim().toLowerCase() || "";
    const typeFilter = elements.type?.value || "all";
    const sortMode = elements.sort?.value || "newest";

    state.filtered = state.imports.filter((item) => {
      const haystack = [
        item.name,
        item.fileName,
        item.sheetName,
        ...(Array.isArray(item.columns) ? item.columns : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !searchTerm || haystack.includes(searchTerm);
      const itemType = getFileType(item);
      const matchesType = typeFilter === "all" || itemType === typeFilter;
      return matchesSearch && matchesType;
    });

    state.filtered.sort((left, right) => {
      if (sortMode === "oldest") {
        return new Date(left.uploadedAt || left.updatedAt || 0) - new Date(right.uploadedAt || right.updatedAt || 0);
      }
      if (sortMode === "largest") {
        return (Number(right.rowCount) || 0) - (Number(left.rowCount) || 0);
      }
      if (sortMode === "name") {
        return getDatasetTitle(left).localeCompare(getDatasetTitle(right));
      }
      return new Date(right.uploadedAt || right.updatedAt || 0) - new Date(left.uploadedAt || left.updatedAt || 0);
    });
  };

  const renderMetrics = () => {
    const totalRows = state.imports.reduce((sum, item) => sum + (Number(item.rowCount) || 0), 0);
    const latest = [...state.imports].sort(
      (left, right) => new Date(right.uploadedAt || right.updatedAt || 0) - new Date(left.uploadedAt || left.updatedAt || 0)
    )[0];

    if (elements.total) elements.total.textContent = formatNumber(state.imports.length);
    if (elements.rows) elements.rows.textContent = formatNumber(totalRows);
    if (elements.latest) elements.latest.textContent = latest ? formatRelativeDate(latest.uploadedAt || latest.updatedAt) : "Never";
    if (elements.summary) {
      elements.summary.textContent =
        state.filtered.length === state.imports.length
          ? `${formatNumber(state.imports.length)} imports`
          : `${formatNumber(state.filtered.length)} of ${formatNumber(state.imports.length)} imports`;
    }
  };

  const renderTable = () => {
    if (!elements.tableBody || !elements.empty) return;

    elements.empty.hidden = state.imports.length !== 0 || state.loading;

    if (!state.imports.length) {
      elements.tableBody.innerHTML = "";
      if (elements.summary) elements.summary.textContent = "0 imports";
      return;
    }

    if (!state.filtered.length) {
      elements.tableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="my-imports-loading">No imported datasets match the current filters.</div>
          </td>
        </tr>
      `;
      return;
    }

    elements.tableBody.innerHTML = state.filtered
      .map((item) => {
        const title = getDatasetTitle(item);
        const fileName = item.fileName && item.fileName !== title ? item.fileName : "";
        const status = item.status || "ready";
        const statusClass = String(status).toLowerCase().replace(/[^a-z0-9_-]/g, "");
        const itemType = getFileType(item);
        const openUrl = `dataset-selection.html?upload=${encodeURIComponent(item.id)}`;

        return `
          <tr>
            <td>
              <div class="my-imports-file-cell">
                <span class="my-imports-file-type my-imports-file-type-image ${itemType}">
                  <img src="${itemType === "csv" ? "assets/csv-icon.png" : itemType === "excel" ? "assets/excel-icon.png" : "assets/file.png"}" alt="${itemType === "csv" ? "CSV file" : itemType === "excel" ? "Excel file" : "Data file"}" />
                </span>
                <div>
                  <strong>${escapeHtml(title)}</strong>
                  ${fileName ? `<small>${escapeHtml(fileName)}</small>` : ""}
                </div>
              </div>
            </td>
            <td><strong>${formatNumber(item.rowCount)}</strong></td>
            <td>${escapeHtml(formatDate(item.uploadedAt || item.updatedAt))}</td>
            <td>${escapeHtml(item.sheetName || "Default sheet")}</td>
            <td>${escapeHtml(formatFileSize(item.fileSize))}</td>
            <td><span class="my-imports-status ${escapeHtml(statusClass)}">${escapeHtml(status)}</span></td>
            <td>
              <div class="my-imports-actions">
                <a class="btn btn-primary btn-sm" href="${openUrl}">Open</a>
                <button class="btn btn-secondary btn-sm" type="button" data-delete-import="${escapeHtml(item.id)}">Delete</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  };

  const render = () => {
    applyFilters();
    renderMetrics();
    renderTable();
  };

  const openDeleteModal = (datasetImportId) => {
    const target = state.imports.find((item) => item.id === datasetImportId);
    if (!target || !elements.deleteModal) return;
    state.deleteTargetId = datasetImportId;
    if (elements.deleteSummary) {
      elements.deleteSummary.textContent = `This will remove "${getDatasetTitle(target)}" and its imported rows from your private import registry.`;
    }
    elements.deleteModal.hidden = false;
    elements.deleteModal.classList.add("is-visible");
  };

  const closeDeleteModal = () => {
    state.deleteTargetId = "";
    if (!elements.deleteModal) return;
    elements.deleteModal.classList.remove("is-visible");
    elements.deleteModal.hidden = true;
  };

  const confirmDelete = async () => {
    if (!state.deleteTargetId || !elements.confirmDelete) return;
    const originalText = elements.confirmDelete.textContent;
    elements.confirmDelete.disabled = true;
    elements.confirmDelete.textContent = "Deleting...";

    try {
      await deletePrivateDatasetImport(state.deleteTargetId);
      state.imports = state.imports.filter((item) => item.id !== state.deleteTargetId);
      closeDeleteModal();
      render();
    } catch (error) {
      setError(error.message || "Could not delete this imported dataset.");
    } finally {
      elements.confirmDelete.disabled = false;
      elements.confirmDelete.textContent = originalText;
    }
  };

  const loadImports = async () => {
    setLoadingState();
    if (elements.refresh) elements.refresh.disabled = true;

    try {
      state.imports = await listPrivateDatasetImports();
      state.loading = false;
      render();
    } catch (error) {
      state.loading = false;
      state.imports = [];
      state.filtered = [];
      renderMetrics();
      if (elements.tableBody) {
        elements.tableBody.innerHTML = `
          <tr>
            <td colspan="7">
              <div class="my-imports-loading">Unable to load imported datasets.</div>
            </td>
          </tr>
        `;
      }
      setError(error.message || "Unable to load imported datasets.");
    } finally {
      if (elements.refresh) elements.refresh.disabled = false;
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;

    if (!isValidUploadFile(file)) {
      showUploadError("Only `.csv`, `.xlsx`, or `.xls` files are accepted.");
      return;
    }

    if (!window.NoufarApp?.parseWorkbookFile) {
      showUploadError("Spreadsheet parser is unavailable. Please retry the upload.");
      return;
    }

    if (elements.fileName) elements.fileName.textContent = `${file.name} - Processing...`;
    if (elements.uploadError) elements.uploadError.hidden = true;
    if (elements.uploadSuccess) elements.uploadSuccess.hidden = true;

    try {
      const isDuplicate = state.imports.some(
        (upload) => String(upload.name || upload.fileName || "").toLowerCase() === file.name.toLowerCase()
      );
      if (isDuplicate) {
        throw new Error("This file already exists in your private imports.");
      }

      const dataset = await window.NoufarApp.parseWorkbookFile(file);
      if (!Array.isArray(dataset.rows) || !dataset.rows.length) {
        throw new Error("The imported file does not contain any patient rows.");
      }

      const upload = await uploadPrivateDatasetImport(file, dataset);
      showUploadSuccess(upload);
      await loadImports();
      if (typeof window.showNoufarToast === "function") {
        window.showNoufarToast("Dataset imported successfully.", "success");
      }
    } catch (error) {
      showUploadError(
        error instanceof Error
          ? error.message
          : "Unable to read this file. Please upload a valid Excel or CSV dataset."
      );
    } finally {
      if (elements.fileInput) elements.fileInput.value = "";
    }
  };

  elements.search?.addEventListener("input", render);
  elements.type?.addEventListener("change", render);
  elements.sort?.addEventListener("change", render);
  elements.refresh?.addEventListener("click", loadImports);
  elements.fileInput?.addEventListener("change", (event) => {
    handleUpload(event.target.files?.[0]).catch(() => {});
  });
  elements.dropzone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    elements.dropzone?.classList.add("is-dragging");
  });
  elements.dropzone?.addEventListener("dragleave", () => {
    elements.dropzone?.classList.remove("is-dragging");
  });
  elements.dropzone?.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.dropzone?.classList.remove("is-dragging");
    handleUpload(event.dataTransfer?.files?.[0]).catch(() => {});
  });
  elements.tableBody?.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-import]");
    if (!deleteButton) return;
    openDeleteModal(deleteButton.dataset.deleteImport);
  });
  elements.confirmDelete?.addEventListener("click", confirmDelete);
  document.querySelectorAll("[data-close-my-imports-delete]").forEach((button) => {
    button.addEventListener("click", closeDeleteModal);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.deleteModal && !elements.deleteModal.hidden) {
      closeDeleteModal();
    }
  });

  loadImports();
})();
