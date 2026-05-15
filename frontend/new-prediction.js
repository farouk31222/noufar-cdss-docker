const predictionSidebar = document.querySelector(".sidebar");
const predictionMobileButton = document.querySelector(".mobile-nav-button");
const predictionForm = document.querySelector("#prediction-form");
const runPredictionButton = document.querySelector("#run-prediction-button");
const predictionFormNote = document.querySelector("#prediction-form-note");
const outcomeCard = document.querySelector(".outcome-card");
const outcomeState = document.querySelector("#outcome-state");
const outcomeHeading = document.querySelector("#outcome-heading");
const outcomeText = document.querySelector("#outcome-text");
const outcomeBadge = document.querySelector("#outcome-badge");
const outcomeProbability = document.querySelector("#outcome-probability");
const outcomeBar = document.querySelector("#outcome-bar");
const outcomeSummary = document.querySelector("#outcome-summary");
const printReportButton = document.querySelector("#print-report-button");
const viewPredictionDetailsButton = document.querySelector("#view-prediction-details-button");
const impactList = document.querySelector("#impact-list");
const impactEmpty = document.querySelector("#impact-empty");
const datasetFile = document.querySelector("#dataset-file");
const fileName = document.querySelector("#file-name");
const uploadDropzone = document.querySelector("#upload-dropzone");
const uploadDropHint = document.querySelector("#upload-drop-hint");
const uploadButtonLabel = document.querySelector("#upload-button-label");
const uploadError = document.querySelector("#upload-error");
const uploadSuccess = document.querySelector("#upload-success");
const uploadSuccessText = document.querySelector("#upload-success-text");
const choosePatientButton = document.querySelector("#choose-patient-button");
const recentUploadSearch = document.querySelector("#recent-upload-search");
const recentUploadList = document.querySelector("#recent-upload-list");
const allUploadsModal = document.querySelector("#all-uploads-modal");
const allUploadsList = document.querySelector("#all-uploads-list");
const allUploadsMeta = document.querySelector("#all-uploads-meta");
const allUploadsSearch = document.querySelector("#all-uploads-search");
const allUploadsCloseButtons = document.querySelectorAll("[data-close-all-uploads]");
const viewAllUploadsBtn = document.querySelector("#view-all-uploads-btn");
const consultModal = document.querySelector("#consult-modal");
const consultTitle = document.querySelector("#consult-title");
const consultMeta = document.querySelector("#consult-meta");
const consultHead = document.querySelector("#consult-head");
const consultBody = document.querySelector("#consult-body");
const consultPagination = document.querySelector("#consult-pagination");
const deleteModal = document.querySelector("#delete-modal");
const confirmDeleteButton = document.querySelector("#confirm-delete-button");
const deleteFileCopy = document.querySelector("#delete-file-copy");
const consultCloseButtons = document.querySelectorAll("[data-close-consult]");
const deleteCloseButtons = document.querySelectorAll("[data-close-delete]");
const duplicatePredictionModal = document.querySelector("#duplicate-prediction-modal");
const duplicatePredictionCopy = document.querySelector("#duplicate-prediction-copy");
const duplicatePredictionViewButton = document.querySelector("#duplicate-prediction-view");
const duplicatePredictionOkButton = document.querySelector("#duplicate-prediction-ok");
const duplicateCloseButtons = document.querySelectorAll("[data-close-duplicate]");
const serviceErrorModal = document.querySelector("#service-error-modal");
const serviceErrorCopy = document.querySelector("#service-error-copy");
const serviceErrorOkButton = document.querySelector("#service-error-ok");
const serviceErrorSupportButton = document.querySelector("#service-error-support");
const serviceErrorCloseButtons = document.querySelectorAll("[data-close-service-error]");
const predictionToggleInputs = Array.from(document.querySelectorAll(".toggle-switch-input"));
const predictionRangeInputs = Array.from(document.querySelectorAll(".range-input"));
const predictionChipSelectGroups = Array.from(document.querySelectorAll(".chip-select-group"));

const initPredictionNotMeasuredOptions = () => {
  predictionRangeInputs.forEach((input) => {
    const shell = input.closest(".range-field-shell");
    const field = input.closest(".slider-field");
    const fieldLabel = field?.querySelector(":scope > span");
    if (!shell || !fieldLabel || fieldLabel.querySelector(".range-not-measured")) return;

    const wrapper = document.createElement("span");
    wrapper.className = "range-not-measured range-not-measured-inline";
    wrapper.innerHTML = `
      <input type="checkbox" data-range-not-measured="${input.name}" />
      <span class="range-not-measured-text">Not measured</span>
    `;
    fieldLabel.appendChild(wrapper);

    const toggleButton = wrapper.querySelector(".range-not-measured-text");
    const toggleInput = wrapper.querySelector(`[data-range-not-measured="${input.name}"]`);
    const applyNotMeasuredState = (enabled) => {
      input.dataset.notMeasured = enabled ? "true" : "false";
      if (toggleInput instanceof HTMLInputElement) {
        toggleInput.checked = enabled;
      }
      const target = document.getElementById(input.dataset.rangeTarget || "");
      if (enabled) {
        input.dataset.lastMeasuredValue = input.value;
        input.disabled = true;
        input.classList.add("is-not-measured");
        if (target) target.textContent = "Not measured";
      } else {
        input.disabled = false;
        input.classList.remove("is-not-measured");
        if (input.dataset.lastMeasuredValue) {
          input.value = input.dataset.lastMeasuredValue;
        }
        updateRangePresentation(input);
      }
    };

    toggleButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const enabled = input.dataset.notMeasured !== "true";
      applyNotMeasuredState(enabled);
    });
    toggleInput?.addEventListener("change", () => {
      applyNotMeasuredState(Boolean(toggleInput.checked));
    });

    applyNotMeasuredState(false);
  });
};

const commitPredictionRangeManualValue = (input, rawValue) => {
  if (!input) return;

  if (input.dataset.notMeasured === "true") {
    showManualPredictionToast("Uncheck Not measured first to edit this value.", "danger");
    return;
  }

  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const step = Number(input.step || 1);
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return;

  const clamped = Math.min(max, Math.max(min, parsed));
  const precision = String(step).includes(".") ? String(step).split(".")[1].length : 0;
  const snapped = Number((Math.round(clamped / step) * step).toFixed(precision));
  input.value = String(snapped);
  input.dataset.touched = "true";
  updateRangePresentation(input);
  syncPredictionFieldState(input);
  updatePredictionSubmitState();
};

const initPredictionManualRangeEditors = () => {
  predictionRangeInputs.forEach((input) => {
    const target = document.getElementById(input.dataset.rangeTarget || "");
    if (!target || target.dataset.manualEditorBound === "true") return;

    target.dataset.manualEditorBound = "true";
    target.classList.add("range-value-display");
    target.title = "Click to edit value";

    target.addEventListener("click", () => {
      if (input.dataset.notMeasured === "true") return;

      const editor = document.createElement("input");
      editor.type = "number";
      editor.className = "range-value-editor";
      editor.min = input.min || "0";
      editor.max = input.max || "100";
      editor.step = input.step || "1";
      editor.value = String(input.value || target.textContent?.trim() || "");

      target.replaceWith(editor);
      editor.focus();
      editor.select();

      const finish = (accept) => {
        editor.replaceWith(target);
        if (accept) {
          commitPredictionRangeManualValue(input, editor.value);
        }
      };

      editor.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      });

      editor.addEventListener("blur", () => finish(true), { once: true });
    });
  });
};

const {
  formatFileSize,
  parseWorkbookFile,
  predictionBadge,
} = window.NoufarApp;

const predictionDoctorAuthStorageKey = "noufar-doctor-auth-v1";
const predictionApiBaseUrl = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
const patientPredictionDraftStorageKey = "noufar-patient-clinical-draft-v1";
const TRI_TOGGLE_STATES = ["Yes", "Not measured", "No"];
const predictionDoctorSessionBridge = window.NoufarDoctorSessionBridge || null;

let latestUploadId = null;
let recentSearchTerm = "";
let recentSortTerm = "newest";
let consultUploadId = null;
let consultPage = 1;
let deleteTargetId = null;
let latestPredictionResult = null;
let latestPredictionDetailsId = "";
let duplicatePredictionId = "";
let aiServiceWasUnavailable = false;
const allowedUploadExtensions = [".csv", ".xlsx", ".xls"];
const DATASET_UPLOAD_CHUNK_SIZE = 250;
let recentUploadsCache = [];

const showManualPredictionToast = (message, variant = "success") => {
  if (typeof window.showNoufarToast === "function") {
    window.showNoufarToast(message, variant);
  }
};

const showUploadDeleteToast = (message, variant = "success") => {
  if (typeof window.showNoufarToast === "function") {
    window.showNoufarToast(message, variant);
  }
};

const normalizeImportedColumnKey = (value) =>
  String(value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");

const IMPORT_CONSULTATION_REASON_OPTIONS = ["DYSTHYROIDIE", "Compression signs", "Tumefaction", "Other"];
const IMPORT_CONSULTATION_REASON_ERROR =
  "Consultation reason must be DYSTHYROIDIE, Compression signs, Tumefaction, or Other.";

const getImportedRowValue = (row, aliases = []) => {
  const normalizedAliases = aliases.map(normalizeImportedColumnKey);
  for (const [key, value] of Object.entries(row || {})) {
    if (
      normalizedAliases.includes(normalizeImportedColumnKey(key)) &&
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }
  return "";
};

const normalizeImportedUploadConsultationReason = (value) => {
  const normalized = normalizeImportedColumnKey(value);
  if (!normalized || ["-", "not measured", "not mesured", "not messured", "not available", "na", "n a"].includes(normalized)) {
    return "";
  }
  return (
    IMPORT_CONSULTATION_REASON_OPTIONS.find((option) => normalizeImportedColumnKey(option) === normalized) ||
    String(value ?? "").trim()
  );
};

const isAllowedImportedConsultationReason = (value) =>
  IMPORT_CONSULTATION_REASON_OPTIONS.some(
    (option) => normalizeImportedColumnKey(option) === normalizeImportedColumnKey(value)
  );

const normalizeImportedUploadStatus = (value) => {
  const normalized = normalizeImportedColumnKey(value);
  if (["", "-", "not measured", "not available", "na", "n a", "missing", "unknown"].includes(normalized)) {
    return "";
  }
  if (["yes", "true", "1", "positive", "positif", "positifs", "positives", "present"].includes(normalized)) {
    return "Positive";
  }
  if (["no", "false", "0", "negative", "negatif", "negatifs", "negatives", "absent"].includes(normalized)) {
    return "Negative";
  }
  return String(value ?? "").trim();
};

const normalizeImportedUploadUltrasound = (value) => {
  const normalized = normalizeImportedColumnKey(value);
  if (["goiter", "goitre"].includes(normalized)) return "Goiter";
  if (["normal volume", "volume normal"].includes(normalized)) return "Normal volume";
  if (["goiter nodules", "goitre nodules", "goiter nodule", "goitre nodule"].includes(normalized)) {
    return "Goiter + nodules";
  }
  return String(value ?? "").trim();
};

const getPredictionDoctorSession = () => {
  try {
    const raw = window.localStorage.getItem(predictionDoctorAuthStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const getRecentUploadById = (uploadId) =>
  recentUploadsCache.find((entry) => String(entry.id) === String(uploadId)) || null;

const requestDatasetImportsJson = async (path, options = {}) => {
  if (predictionDoctorSessionBridge?.requestJson) {
    return predictionDoctorSessionBridge.requestJson(`/dataset-imports${path}`, options);
  }

  const session = getPredictionDoctorSession();
  const token = session?.token;
  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`${predictionApiBaseUrl}/dataset-imports${path}`, {
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

const getDatasetImportRowsPage = async (datasetImportId, page = 1, pageSize = 7) => {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return requestDatasetImportsJson(`/${encodeURIComponent(datasetImportId)}/rows?${query.toString()}`);
};

const deletePrivateDatasetImport = async (datasetImportId) => {
  return requestDatasetImportsJson(`/${encodeURIComponent(datasetImportId)}`, {
    method: "DELETE",
  });
};

const uploadPrivateDatasetImport = async (file, dataset) => {
  // Note: Files containing empty or invalid values are accepted.
  // Validation errors are flagged visually on each row in the dataset table
  // and enforced only at inline-edit save time.

  const consultationReasons = IMPORT_CONSULTATION_REASON_OPTIONS;
  const ultrasoundValues = [
    ...new Set(
      dataset.rows
        .map((row) => normalizeImportedUploadUltrasound(getImportedRowValue(row, ["Ultrasound", "Echographie"])))
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
  const tsiValues = [
    ...new Set(
      dataset.rows
        .map((row) => normalizeImportedUploadStatus(getImportedRowValue(row, ["TSI", "TSI status"])))
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const formData = new FormData();
  formData.append("datasetFile", file);
  formData.append("name", file.name);
  formData.append("sheetName", dataset.sheetName || "Dataset");
  formData.append("columns", JSON.stringify(dataset.columns || []));
  formData.append("totalRows", String(dataset.rows.length || 0));
  formData.append("consultationReasons", JSON.stringify(consultationReasons));
  formData.append("ultrasoundValues", JSON.stringify(ultrasoundValues));
  formData.append("tsiValues", JSON.stringify(tsiValues));

  const createdPayload = await requestDatasetImportsJson("", {
    method: "POST",
    body: formData,
  });

  const datasetImport = createdPayload?.datasetImport;
  if (!datasetImport?.id) {
    throw new Error("Dataset import could not be created.");
  }

  try {
    for (let index = 0; index < dataset.rows.length; index += DATASET_UPLOAD_CHUNK_SIZE) {
      const rowsChunk = dataset.rows.slice(index, index + DATASET_UPLOAD_CHUNK_SIZE);
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

const buildManualPredictionPayload = () => Object.fromEntries(buildPredictionFormData().entries());

const normalizeTriToggleValue = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No";
  return "Not measured";
};

const setPredictionTriToggleState = (input, nextState) => {
  const state = normalizeTriToggleValue(nextState);
  input.dataset.triState = state;
  input.value = state;
  input.checked = state === "Yes";

  const field = input.closest(".toggle-switch-field");
  if (!field) return;

  field.querySelectorAll(".tri-toggle-btn").forEach((button) => {
    const isActive = button.dataset.stateValue === state;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
};

const initPredictionTriStateToggles = () => {
  predictionToggleInputs.forEach((input) => {
    const field = input.closest(".toggle-switch-field");
    const control = input.closest(".toggle-switch-control");
    if (!field || !control || field.querySelector(".tri-toggle")) return;

    field.classList.add("tri-toggle-field");

    const tri = document.createElement("div");
    tri.className = "tri-toggle";
    tri.setAttribute("role", "group");
    tri.innerHTML = `
      <button type="button" class="tri-toggle-btn" data-state-value="Yes" aria-pressed="false">Yes</button>
      <button type="button" class="tri-toggle-btn" data-state-value="Not measured" aria-pressed="false">Not measured</button>
      <button type="button" class="tri-toggle-btn" data-state-value="No" aria-pressed="false">No</button>
    `;
    control.appendChild(tri);

    tri.addEventListener("click", (event) => {
      const button = event.target.closest(".tri-toggle-btn");
      if (!button) return;
      input.dataset.touched = "true";
      setPredictionTriToggleState(input, button.dataset.stateValue);
      syncPredictionFieldState(input);
      updatePredictionSubmitState();
    });

    setPredictionTriToggleState(input, input.checked ? "Yes" : "Not measured");
  });
};

const consumePatientPredictionDraft = () => {
  try {
    const raw = window.sessionStorage.getItem(patientPredictionDraftStorageKey);
    if (!raw) return null;
    window.sessionStorage.removeItem(patientPredictionDraftStorageKey);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
};

const setPredictionLoadingState = (isLoading) => {
  if (runPredictionButton) {
    runPredictionButton.disabled = isLoading;
    runPredictionButton.textContent = isLoading ? "Running..." : "Run Prediction";
  }

  if (!predictionFormNote || !isLoading) return;

  predictionFormNote.classList.remove("is-error", "is-ready");
  predictionFormNote.textContent = "Prediction in progress. The backend is contacting the AI service...";
};

const revealPredictionOutcome = () => {
  if (!outcomeCard) return;

  window.requestAnimationFrame(() => {
    outcomeCard.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  });
};

const requestManualPrediction = async () => {
  if (predictionDoctorSessionBridge?.requestJson) {
    return predictionDoctorSessionBridge.requestJson("/predictions", {
      method: "POST",
      body: JSON.stringify(buildManualPredictionPayload()),
    });
  }

  const session = getPredictionDoctorSession();
  const token = session?.token;

  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  const response = await fetch(`${predictionApiBaseUrl}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildManualPredictionPayload()),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Unable to run the AI prediction.");
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
};

const predictionReportSections = [
  {
    title: "Patient Information",
    fields: [
      ["name", "Patient name"],
      ["age", "Age"],
      ["sex", "Sex"],
    ],
  },
  {
    title: "Symptoms and Clinical",
    fields: [
      ["consultationReason", "Consultation reason"],
      ["stress", "Stress"],
      ["palpitations", "Palpitations"],
      ["spp", "SPP"],
      ["amg", "AMG"],
      ["diarrhea", "Diarrhea"],
      ["tremors", "Tremors"],
      ["agitation", "Agitation"],
      ["moodDisorder", "Mood disorder"],
      ["sleepDisorder", "Sleep disorder"],
      ["sweating", "Excess sweating"],
      ["heatIntolerance", "Heat intolerance"],
      ["muscleWeakness", "Muscle weakness"],
    ],
  },
  {
    title: "Thyroid Examination",
    fields: [
      ["goiter", "Goiter"],
      ["goiterClassification", "Goiter classification"],
    ],
  },
  {
    title: "Biology",
    fields: [
      ["tsh", "TSH"],
      ["ft4", "FT4"],
      ["antiTpo", "Anti-TPO"],
      ["antiTpoTotal", "Anti-TPO total"],
      ["antiTg", "Anti-Tg"],
      ["tsi", "TSI"],
      ["tsiLevel", "TSI level"],
    ],
  },
  {
    title: "Imaging",
    fields: [
      ["ultrasound", "Ultrasound"],
      ["scintigraphy", "Scintigraphy"],
    ],
  },
  {
    title: "Treatment",
    fields: [
      ["therapy", "Therapy"],
      ["blockReplace", "Block and replace"],
      ["duration", "Duration of treatment"],
      ["surgery", "Surgery"],
      ["radioactiveIodine", "Radioactive iodine"],
    ],
  },
];

const getEmbeddedReportLogo = () => {
  const logoImage = document.querySelector(".sidebar-logo-image");
  if (!(logoImage instanceof HTMLImageElement) || !logoImage.complete || !logoImage.naturalWidth) {
    return "";
  }

  try {
    const canvas = document.createElement("canvas");
    const size = Math.max(logoImage.naturalWidth, logoImage.naturalHeight);
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");

    if (!context) return "";

    const drawWidth = logoImage.naturalWidth;
    const drawHeight = logoImage.naturalHeight;
    const offsetX = (size - drawWidth) / 2;
    const offsetY = (size - drawHeight) / 2;

    context.clearRect(0, 0, size, size);
    context.drawImage(logoImage, offsetX, offsetY, drawWidth, drawHeight);
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
};

const escapeReportHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getPredictionReportData = () => {
  if (!predictionForm) return [];

  const formData = buildPredictionFormData();
  return predictionReportSections
    .map((section) => ({
      title: section.title,
      rows: section.fields.map(([name, label]) => {
        const rawValue = formData.get(name);
        const value =
          rawValue === null || rawValue === "" ? "Not provided" : `${rawValue}${name === "duration" ? " months" : ""}`;
        return { label, value };
      }),
    }))
    .filter((section) => section.rows.length);
};

const buildPredictionReportMarkup = (result) => {
  const badge = predictionBadge(result);
  const generatedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  const sections = getPredictionReportData();
  const logoSrc = getEmbeddedReportLogo();
  const impactsMarkup = result.contributions.length
    ? result.contributions
        .map(
          (item) => `
            <tr>
              <td>${escapeReportHtml(item.label)}</td>
              <td>${escapeReportHtml(item.amount > 0 ? "Higher relapse risk" : "Lower relapse risk")}</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="2">No strong explanatory drivers were detected from the current inputs.</td>
      </tr>
    `;

  const sectionMarkup = sections
    .map(
      (section) => `
        <section class="report-section">
          <div class="report-section-head">${escapeReportHtml(section.title)}</div>
          <table class="report-table">
            <tbody>
              ${section.rows
                .map(
                  (row) => `
                    <tr>
                      <th>${escapeReportHtml(row.label)}</th>
                      <td>${escapeReportHtml(row.value)}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </section>
      `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>NOUFAR CDSS | Prediction Report</title>
        <style>
          :root {
            color-scheme: light;
            --ink: #16345b;
            --muted: #6580a0;
            --line: #dce6f3;
            --panel: #f7fbff;
            --blue: #2d71d3;
            --red: #de5147;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 32px;
            font-family: Arial, Helvetica, sans-serif;
            color: var(--ink);
            background: #ffffff;
          }
          .report-shell {
            max-width: 960px;
            margin: 0 auto;
          }
          .report-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 24px;
            padding-bottom: 24px;
            border-bottom: 2px solid #eef3fb;
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 16px;
          }
          .brand img {
            width: 58px;
            height: 58px;
            object-fit: contain;
          }
          .brand strong {
            display: block;
            font-size: 24px;
            line-height: 1.1;
          }
          .brand span,
          .report-meta span {
            display: block;
            color: var(--muted);
            font-size: 13px;
            line-height: 1.6;
          }
          .report-summary {
            display: grid;
            grid-template-columns: 1.25fr 0.85fr;
            gap: 20px;
            margin: 28px 0 24px;
          }
          .summary-card,
          .result-card {
            padding: 20px 22px;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: linear-gradient(180deg, #ffffff 0%, var(--panel) 100%);
          }
          .summary-card h1 {
            margin: 0 0 10px;
            font-size: 28px;
            line-height: 1.15;
          }
          .summary-card p,
          .result-copy,
          .report-note {
            margin: 0;
            color: var(--muted);
            line-height: 1.7;
            font-size: 14px;
          }
          .result-badge {
            display: inline-flex;
            align-items: center;
            min-height: 34px;
            padding: 0 14px;
            border-radius: 999px;
            color: #fff;
            font-weight: 700;
            font-size: 13px;
            background: ${result.relapse ? "var(--red)" : "var(--blue)"};
          }
          .result-score {
            margin: 14px 0 8px;
            font-size: 42px;
            font-weight: 800;
            letter-spacing: -0.03em;
          }
          .report-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px;
          }
          .report-section {
            border: 1px solid var(--line);
            border-radius: 18px;
            overflow: hidden;
            background: #fff;
          }
          .report-section-head {
            padding: 14px 18px;
            background: #f5f9ff;
            border-bottom: 1px solid var(--line);
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--blue);
          }
          .report-table {
            width: 100%;
            border-collapse: collapse;
          }
          .report-table th,
          .report-table td {
            padding: 12px 18px;
            border-bottom: 1px solid #edf2f8;
            text-align: left;
            vertical-align: top;
            font-size: 14px;
          }
          .report-table th {
            width: 42%;
            color: #456483;
            font-weight: 700;
          }
          .report-table tr:last-child th,
          .report-table tr:last-child td {
            border-bottom: none;
          }
          .impact-wrapper {
            margin-top: 18px;
            border: 1px solid var(--line);
            border-radius: 18px;
            overflow: hidden;
          }
          .impact-head {
            padding: 14px 18px;
            background: #f5f9ff;
            border-bottom: 1px solid var(--line);
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--blue);
          }
          @media print {
            body { padding: 16px; }
            .report-shell { max-width: none; }
          }
        </style>
      </head>
      <body>
        <div class="report-shell">
          <header class="report-head">
            <div class="brand">
              ${logoSrc ? `<img src="${logoSrc}" alt="NOUFAR CDSS logo" />` : ""}
              <div>
                <strong>NOUFAR CDSS</strong>
                <span>Clinical prediction report</span>
                <span>Hyperthyroid relapse decision support</span>
              </div>
            </div>
            <div class="report-meta">
              <span><strong>Generated:</strong> ${escapeReportHtml(generatedAt)}</span>
              <span><strong>Patient:</strong> ${escapeReportHtml(result.patientName)}</span>
              <span><strong>Consultation reason:</strong> ${escapeReportHtml(result.consultationReason)}</span>
            </div>
          </header>

          <section class="report-summary">
            <article class="summary-card">
              <h1>Clinical prediction report</h1>
              <p>
                This report summarizes the submitted manual clinical entry, the resulting relapse
                prediction, and the most influential explanatory variables identified by NOUFAR CDSS.
              </p>
            </article>
            <article class="result-card">
              <span class="result-badge">${escapeReportHtml(badge.label)}</span>
              <div class="result-score">${escapeReportHtml(result.probability)}%</div>
              <p class="result-copy">
                Estimated relapse probability based on the entered clinical, biological, imaging,
                and treatment variables.
              </p>
            </article>
          </section>

          <section class="report-grid">
            ${sectionMarkup}
          </section>

          <section class="impact-wrapper">
            <div class="impact-head">Most impactful variables</div>
            <table class="report-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Effect on prediction</th>
                </tr>
              </thead>
              <tbody>
                ${impactsMarkup}
              </tbody>
            </table>
          </section>
        </div>
      </body>
    </html>
  `;
};

const printPredictionReport = () => {
  if (!latestPredictionResult) return;

  const reportMarkup = buildPredictionReportMarkup(latestPredictionResult);
  const reportBlob = new Blob([reportMarkup], { type: "text/html" });
  const reportUrl = URL.createObjectURL(reportBlob);
  const printWindow = window.open(reportUrl, "_blank", "width=1100,height=900");

  if (!printWindow) {
    URL.revokeObjectURL(reportUrl);
    return;
  }

  const cleanup = () => {
    setTimeout(() => URL.revokeObjectURL(reportUrl), 1000);
  };

  printWindow.addEventListener(
    "load",
    () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        cleanup();
      }, 180);
    },
    { once: true }
  );
};

const initializePredictionChipSelect = (group) => {
  if (!(group instanceof HTMLElement)) return;

  const field = group.closest(".chip-select-field");
  const hiddenInput = field?.querySelector('input[type="hidden"]');
  const options = Array.from(group.querySelectorAll(".chip-select-option"));
  if (!hiddenInput || !options.length) return;

  const syncSelectedOption = (value) => {
    hiddenInput.value = value;
    options.forEach((option) => {
      const isSelected = option.dataset.chipValue === value;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  };

  syncSelectedOption(hiddenInput.value || options[0].dataset.chipValue || "");

  const handleOptionSelection = (option) => {
    if (!(option instanceof HTMLElement)) return;
    syncSelectedOption(option.dataset.chipValue || "");
    hiddenInput.dataset.touched = "true";
    updatePredictionSubmitState();
  };

  group.addEventListener("click", (event) => {
    const option = event.target.closest(".chip-select-option");
    if (!option) return;
    event.preventDefault();
    handleOptionSelection(option);
  });

  options.forEach((option) => {
    option.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      handleOptionSelection(option);
    });
  });
};

const isPredictionValidatableField = (field) =>
  (field instanceof HTMLInputElement ||
    field instanceof HTMLSelectElement ||
    field instanceof HTMLTextAreaElement) &&
  typeof field.checkValidity === "function" &&
  field.type !== "submit" &&
  field.type !== "button" &&
  field.type !== "reset" &&
  field.type !== "hidden" &&
  !field.disabled;

const getPredictionValidatableFields = () => {
  if (!predictionForm) return [];
  return Array.from(predictionForm.elements).filter(isPredictionValidatableField);
};

const getPredictionRequiredFields = () => {
  if (!predictionForm) return [];
  return Array.from(predictionForm.querySelectorAll("input[required], select[required], textarea[required]")).filter(
    (field) => field instanceof HTMLElement && typeof field.checkValidity === "function" && !field.disabled
  );
};

const getPredictionFieldContainer = (field) => field?.closest(".field, .toggle-switch-field") ?? null;

const ensurePredictionErrorElement = (field) => {
  const container = getPredictionFieldContainer(field);
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

const getPredictionFieldErrorMessage = (field) => {
  if (!(field instanceof HTMLElement) || typeof field.checkValidity !== "function") return "";

  if (field.validity.valueMissing) {
    return "This field is required.";
  }

  if (field.validity.badInput) {
    return "Please enter a valid number.";
  }

  if (field.validity.rangeUnderflow || field.validity.rangeOverflow) {
    if (field.name === "age") return "Age must be between 17 and 100.";
    if (field.name === "duration") return "Duration must be between 3 and 96 months.";
    return "Please enter a valid value.";
  }

  if (field.validity.customError) {
    return field.validationMessage;
  }

  return "Please review this field.";
};

const shouldShowPredictionFieldError = (field, force = false) => {
  if (!field) return false;
  if (force) return true;
  return predictionForm?.dataset.submitAttempted === "true" || field.dataset.touched === "true";
};

const syncPredictionFieldState = (field, force = false) => {
  if (!(field instanceof HTMLElement) || typeof field.checkValidity !== "function") return;

  const container = getPredictionFieldContainer(field);
  const errorElement = ensurePredictionErrorElement(field);
  const isInvalid = shouldShowPredictionFieldError(field, force) && !field.checkValidity();

  container?.classList.toggle("is-invalid", isInvalid);

  if (errorElement) {
    errorElement.textContent = isInvalid ? getPredictionFieldErrorMessage(field) : "";
    errorElement.hidden = !isInvalid;
  }
};

const updateTogglePresentation = (input) => {
  if (!input) return;
  if (input.dataset.triState) return;
  const valueLabel = input.closest(".toggle-switch-control")?.querySelector(".toggle-switch-value");
  if (valueLabel) {
    valueLabel.textContent = input.checked ? "Yes" : "No";
  }
};

const CLINICAL_REFERENCES = {
  tsh: { normalMin: 0.4, normalMax: 4.0, highAbove: 10, unit: "mIU/L" },
  ft4: { normalMin: 0.8, normalMax: 1.8, highAbove: 3, unit: "ng/dL" },
  antiTpoTotal: { normalMin: 0, normalMax: 35, highAbove: 500, unit: "IU/mL" },
  tsiLevel: { normalMin: 0, normalMax: 1.75, highAbove: 7, unit: "index" },
};

const THUMB_GRADIENTS = {
  default: "linear-gradient(180deg, #2d71d3 0%, #174f9d 100%)",
  low: "linear-gradient(180deg, #4a93d8 0%, #1b5b9a 100%)",
  normal: "linear-gradient(180deg, #2cb578 0%, #1b7a52 100%)",
  elevated: "linear-gradient(180deg, #e2a223 0%, #a8690a 100%)",
  high: "linear-gradient(180deg, #e54c46 0%, #a91e1a 100%)",
};

const THUMB_SHADOWS = {
  default: "0 10px 18px rgba(36, 96, 173, 0.24)",
  low: "0 10px 18px rgba(36, 96, 173, 0.24)",
  normal: "0 10px 18px rgba(27, 122, 82, 0.28)",
  elevated: "0 10px 18px rgba(168, 105, 10, 0.28)",
  high: "0 10px 18px rgba(169, 30, 26, 0.3)",
};

const DEFAULT_TRACK_BG = "linear-gradient(90deg, rgba(68, 121, 196, 0.22) 0%, rgba(150, 187, 239, 0.24) 100%)";

const buildClinicalTrackGradient = (normalMinPct, normalMaxPct) => {
  const nMin = Math.max(0, Math.min(100, normalMinPct));
  const nMax = Math.max(nMin, Math.min(100, normalMaxPct));
  return `linear-gradient(90deg, rgba(155, 174, 196, 0.28) 0%, rgba(155, 174, 196, 0.28) ${nMin}%, rgba(34, 160, 107, 0.42) ${nMin}%, rgba(34, 160, 107, 0.42) ${nMax}%, rgba(155, 174, 196, 0.28) ${nMax}%, rgba(155, 174, 196, 0.28) 100%)`;
};

const formatTickValue = (value) => {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
};

const getClinicalKey = (input) => {
  if (!input) return null;
  if (input.name && CLINICAL_REFERENCES[input.name]) return input.name;
  const id = (input.id || "").toLowerCase();
  if (id.includes("anti-tpo-total")) return "antiTpoTotal";
  if (id.includes("tsi-level")) return "tsiLevel";
  if (id.includes("tsh")) return "tsh";
  if (id.includes("ft4")) return "ft4";
  return null;
};

const computeClinicalStatus = (value, ref) => {
  if (!Number.isFinite(value)) return { label: "—", tone: "default" };
  if (value < ref.normalMin) return { label: "Low", tone: "low" };
  if (value <= ref.normalMax) return { label: "Normal", tone: "normal" };
  if (value < ref.highAbove) return { label: "Elevated", tone: "elevated" };
  return { label: "High", tone: "high" };
};

const ensureClinicalSliderHeader = (input) => {
  const label = input.closest("label.slider-field");
  if (!label) return null;
  let header = label.querySelector(":scope > .slider-field-header");
  if (header) return header;
  const titleSpan = label.querySelector(":scope > span");
  if (!titleSpan) return null;
  header = document.createElement("div");
  header.className = "slider-field-header";
  titleSpan.parentNode.insertBefore(header, titleSpan);
  header.appendChild(titleSpan);
  const badge = document.createElement("span");
  badge.className = "range-status-badge";
  badge.dataset.tone = "default";
  header.appendChild(badge);
  return header;
};

const renderClinicalEnhancements = (input, value) => {
  const key = getClinicalKey(input);
  if (!key) return null;
  const ref = CLINICAL_REFERENCES[key];
  const status = computeClinicalStatus(value, ref);

  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const span = max > min ? max - min : 1;
  const normalMinPct = ((ref.normalMin - min) / span) * 100;
  const normalMaxPct = ((ref.normalMax - min) / span) * 100;

  // Mark label as clinical
  const label = input.closest("label.slider-field");
  if (label) label.classList.add("is-clinical");

  // Header badge
  const header = ensureClinicalSliderHeader(input);
  if (header) {
    const badge = header.querySelector(".range-status-badge");
    if (badge) {
      badge.textContent = status.label;
      badge.dataset.tone = status.tone;
      badge.hidden = false;
    }
  }

  return { status, normalMinPct, normalMaxPct };
};

const clearClinicalEnhancements = (input) => {
  const shell = input.closest(".range-field-shell");
  const row = shell?.querySelector(".range-reference-row");
  if (row) row.hidden = true;
  const scale = shell?.querySelector(".range-scale");
  if (scale) scale.hidden = true;
  const label = input.closest("label.slider-field");
  const badge = label?.querySelector(".range-status-badge");
  if (badge) badge.hidden = true;
  const target = document.getElementById(input.dataset.rangeTarget || "");
  if (target) target.dataset.clinicalTone = "default";
  input.style.removeProperty("--range-track-bg");
  input.style.removeProperty("--range-thumb-bg");
  input.style.removeProperty("--range-thumb-shadow");
};

const updateRangePresentation = (input) => {
  if (!input) return;
  const target = document.getElementById(input.dataset.rangeTarget || "");

  if (input.dataset.notMeasured === "true") {
    input.disabled = true;
    input.classList.add("is-not-measured");
    if (target) target.textContent = "Not measured";
    clearClinicalEnhancements(input);
    return;
  }

  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || min);
  const decimals = Number(input.dataset.rangeDecimals || 0);
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const result = renderClinicalEnhancements(input, value);
  if (result) {
    const tone = result.status.tone;
    const trackBg = buildClinicalTrackGradient(result.normalMinPct, result.normalMaxPct);
    input.style.setProperty("--range-track-bg", trackBg);
    input.style.setProperty("--range-thumb-bg", THUMB_GRADIENTS[tone] || THUMB_GRADIENTS.default);
    input.style.setProperty("--range-thumb-shadow", THUMB_SHADOWS[tone] || THUMB_SHADOWS.default);
    input.style.background = trackBg;
  } else {
    input.style.setProperty("--range-track-bg", `linear-gradient(90deg, #2d71d3 0%, #63a8ff ${progress}%, rgba(68, 121, 196, 0.18) ${progress}%, rgba(150, 187, 239, 0.24) 100%)`);
    input.style.removeProperty("--range-thumb-bg");
    input.style.removeProperty("--range-thumb-shadow");
    input.style.background = `linear-gradient(90deg, #2d71d3 0%, #63a8ff ${progress}%, rgba(68, 121, 196, 0.18) ${progress}%, rgba(150, 187, 239, 0.24) 100%)`;
  }

  if (target) {
    target.textContent = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  }
};

const updatePredictionSubmitState = () => {
  if (!predictionForm || !runPredictionButton) return;

  const requiredFields = getPredictionRequiredFields();
  const isFormValid = requiredFields.every((field) => field.checkValidity());
  runPredictionButton.disabled = !isFormValid;

  if (!predictionFormNote) return;

  predictionFormNote.classList.remove("is-error", "is-ready");

  if (isFormValid) {
    predictionFormNote.textContent = "All required fields are ready. You can run the prediction.";
    predictionFormNote.classList.add("is-ready");
    return;
  }

  if (predictionForm.dataset.submitAttempted === "true") {
    predictionFormNote.textContent = "Complete the required fields highlighted below before running the prediction.";
    predictionFormNote.classList.add("is-error");
    return;
  }

  predictionFormNote.textContent = "Complete all required fields to enable prediction.";
};

const buildPredictionFormData = () => {
  const formData = new FormData(predictionForm);
  predictionToggleInputs.forEach((input) => {
    formData.set(input.name, normalizeTriToggleValue(input.dataset.triState || input.value));
  });
  return formData;
};

const applyPatientPredictionDraft = (draft) => {
  if (!predictionForm || !draft || typeof draft !== "object") return;

  Object.entries(draft).forEach(([name, rawValue]) => {
    const field = predictionForm.elements.namedItem(name);
    if (!field) return;

    const value = rawValue ?? "";

    if (field instanceof RadioNodeList) {
      Array.from(field).forEach((input) => {
        if (input instanceof HTMLInputElement) {
          input.checked = String(input.value) === String(value);
        }
      });
      return;
    }

    if (field instanceof HTMLInputElement) {
      if (field.type === "checkbox") {
        setPredictionTriToggleState(field, value);
      } else {
        field.value = String(value);
      }
      return;
    }

    if (field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
      field.value = String(value);
    }
  });

  predictionToggleInputs.forEach((input) => {
    updateTogglePresentation(input);
    syncPredictionFieldState(input);
  });

  predictionRangeInputs.forEach((input) => {
    const markedNotMeasured = String(draft[input.name] ?? "").trim().toLowerCase() === "not measured";
    const notMeasuredButton = predictionForm.querySelector(`[data-range-not-measured="${input.name}"]`);
    if (notMeasuredButton instanceof HTMLInputElement) {
      notMeasuredButton.checked = markedNotMeasured;
      input.dataset.notMeasured = markedNotMeasured ? "true" : "false";
      if (markedNotMeasured) {
        input.disabled = true;
        input.classList.add("is-not-measured");
      } else {
        input.disabled = false;
        input.classList.remove("is-not-measured");
      }
    }
    updateRangePresentation(input);
    syncPredictionFieldState(input);
  });

  predictionChipSelectGroups.forEach((group) => {
    const field = group.closest(".chip-select-field");
    const hiddenInput = field?.querySelector('input[type="hidden"]');
    const selectedValue = hiddenInput?.value;

    Array.from(group.querySelectorAll(".chip-select-option")).forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.chipValue === selectedValue);
    });
  });

  getPredictionValidatableFields().forEach((field) => {
    syncPredictionFieldState(field);
  });

  updatePredictionSubmitState();
  if (predictionFormNote) {
    predictionFormNote.classList.remove("is-error");
    predictionFormNote.textContent = "Patient clinical entry loaded. Review the data and run prediction when ready.";
    predictionFormNote.classList.add("is-ready");
  }
};

const buildPaginationItems = (currentPage, totalPages) => {
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

const renderPagination = (container, currentPage, totalPages, onPageChange) => {
  if (!container) return;

  const items = buildPaginationItems(currentPage, totalPages);
  const nextDisabled = currentPage >= totalPages;

  container.innerHTML = `
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
      <button
        class="pagination-button pagination-button-nav"
        type="button"
        data-page="${Math.min(currentPage + 1, totalPages)}"
        aria-label="Go to next page"
        ${nextDisabled ? "disabled" : ""}
      >
        &#8250;
      </button>
    </div>
  `;

  container.querySelectorAll(".pagination-button[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number(button.dataset.page);
      if (!nextPage || nextPage === currentPage) return;
      onPageChange(nextPage);
    });
  });
};

const resetUploadSelectionState = () => {
  latestUploadId = null;
  fileName.textContent = "No file selected";
  uploadDropzone?.classList.remove("is-ready");
  uploadDropzone?.classList.remove("has-selection");
  uploadSuccess.hidden = true;
  uploadError.hidden = true;
  choosePatientButton.hidden = true;
  if (uploadButtonLabel) {
    uploadButtonLabel.textContent = "Browse Files";
  }
};

const hydrateRecentUploads = async () => {
  recentUploadsCache = await listPrivateDatasetImports();
  renderRecentUploads();
};

const selectRecentUpload = (uploadId) => {
  const upload = getRecentUploadById(uploadId);
  if (!upload) return;

  renderUploadSuccess(upload);
};

const setOutcomeIcon = (mode = "pending") => {
  if (!outcomeState) return;

  const iconSlot = outcomeState.querySelector(".outcome-icon");
  if (!iconSlot) return;

  const iconMap = {
    relapse: "assets/Relapce.png",
    stable: "assets/NotRelapce.png",
    pending: "assets/Ia awaiting.png",
  };

  const src = iconMap[mode] || iconMap.pending;
  const awaitingClass = mode === "pending" ? " outcome-status-image-awaiting" : "";
  iconSlot.innerHTML = `<img class="outcome-status-image${awaitingClass}" src="${src}" alt="" aria-hidden="true" />`;
};

const setOutcomePending = (message) => {
  if (!outcomeState) return;
  latestPredictionResult = null;
  latestPredictionDetailsId = "";

  outcomeState.classList.remove("relapse", "stable");
  outcomeState.classList.add("awaiting");
  setOutcomeIcon();
  outcomeHeading.textContent = "Awaiting Data Input";
  outcomeText.textContent =
    message ||
    "Enter clinical parameters manually or upload a dataset to run the prediction model.";

  if (outcomeBadge) {
    outcomeBadge.textContent = "Pending";
    outcomeBadge.className = "prediction-badge";
  }

  if (outcomeProbability) {
    outcomeProbability.textContent = "0%";
  }

  if (outcomeBar) {
    outcomeBar.style.width = "0%";
  }

  if (outcomeSummary) {
    outcomeSummary.innerHTML = `
      <strong>Pending analysis</strong>
      <span>Complete the clinical form or import a dataset to generate a patient-specific prediction.</span>
      <span>Estimated relapse probability will appear here after model execution.</span>
    `;
  }

  if (impactList) {
    impactList.innerHTML = `
      <div class="impact-empty" id="impact-empty">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#9bb3d0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-bottom:4px"><path d="M12 20V10"/><path d="M6 20v-4"/><path d="M18 20v-8"/></svg>
        Run the prediction to view the most influential variables for this patient.
      </div>
    `;
  }

  if (printReportButton) {
    printReportButton.hidden = true;
    printReportButton.style.display = "none";
  }

  if (viewPredictionDetailsButton) {
    viewPredictionDetailsButton.hidden = true;
    viewPredictionDetailsButton.style.display = "none";
  }
};

const renderOutcome = (result) => {
  latestPredictionResult = result;
  const badge = predictionBadge(result);

  outcomeState.classList.remove("awaiting", "relapse", "stable");
  outcomeState.classList.add(result.relapse ? "relapse" : "stable");
  setOutcomeIcon(result.relapse ? "relapse" : "stable");
  if (outcomeCard) {
    outcomeCard.classList.remove("is-relapse", "is-stable");
    outcomeCard.classList.add(result.relapse ? "is-relapse" : "is-stable");
  }
  outcomeHeading.textContent = badge.label;
  outcomeText.textContent = result.relapse
    ? "The current profile suggests a higher probability of relapse and may require closer follow-up."
    : "The current profile suggests a lower probability of relapse under the entered conditions.";

  outcomeBadge.textContent = badge.label;
  outcomeBadge.className = `prediction-badge ${badge.tone}`;
  outcomeProbability.textContent = `${result.probability}%`;
  outcomeBar.style.width = `${result.probability}%`;
  outcomeSummary.innerHTML = `
    <strong>${result.patientName}</strong>
    <span>Consultation reason: ${result.consultationReason}</span>
    <span>Treatment duration: ${result.duration || 0} months</span>
    <span>Predicted outcome: ${badge.label}</span>
  `;

  impactList.innerHTML = "";

  if (!result.contributions.length) {
    impactList.innerHTML = `
      <div class="impact-empty">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#9bb3d0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-bottom:4px"><path d="M12 20V10"/><path d="M6 20v-4"/><path d="M18 20v-8"/></svg>
        No strong explanatory drivers were detected from the current inputs.
      </div>
    `;
    return;
  }

  const maxImpact = Math.max(
    ...result.contributions.map((item) => Math.abs(Number(item.amount) || 0)),
    0
  );

  result.contributions.forEach((item) => {
    const row = document.createElement("div");
    const itemImpact = Math.abs(Number(item.amount) || 0);
    const relativePercent = maxImpact > 0 ? Math.round((itemImpact / maxImpact) * 100) : 0;
    const influence = Math.max(18, Math.min(relativePercent, 100));
    const tone = item.amount > 0 ? "is-warm" : "is-cool";

    row.className = "impact-var";
    row.innerHTML = `
      <div class="impact-var-head">
        <span class="impact-var-label">
          <span class="impact-var-dot ${tone}"></span>
          ${item.label}
        </span>
        <span class="impact-var-meta">${item.amount > 0 ? "Higher relapse risk" : "Lower relapse risk"} · ${influence}%</span>
      </div>
      <div class="impact-var-track">
        <i class="${tone}" style="width:${influence}%; ${impactGradientStyle(influence)}"></i>
      </div>
    `;
    impactList.appendChild(row);
  });

  if (printReportButton) {
    printReportButton.hidden = false;
    printReportButton.style.display = "";
  }

  if (viewPredictionDetailsButton) {
    const shouldShowDetailsButton = Boolean(latestPredictionDetailsId);
    viewPredictionDetailsButton.hidden = !shouldShowDetailsButton;
    viewPredictionDetailsButton.style.display = shouldShowDetailsButton ? "" : "none";
  }
};

const openDuplicatePredictionModal = (
  message = "A manual prediction already exists for this patient. Duplicate predictions are not allowed.",
  predictionId = ""
) => {
  duplicatePredictionId = String(predictionId || "").trim();
  if (duplicatePredictionCopy) {
    duplicatePredictionCopy.textContent = message;
  }
  if (duplicatePredictionViewButton) {
    duplicatePredictionViewButton.hidden = !duplicatePredictionId;
  }
  openModal(duplicatePredictionModal);
};

const openServiceErrorModal = (
  message = "The AI prediction service is currently unavailable. Please try again later or contact the system administrator."
) => {
  if (serviceErrorCopy) {
    serviceErrorCopy.textContent = message;
  }
  openModal(serviceErrorModal);
};

const isAiServiceUnavailableError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.status || 0);

  return (
    status === 502 ||
    status === 503 ||
    message.includes("service unavailable") ||
    message.includes("ai server") ||
    message.includes("not deployed") ||
    message.includes("prediction service") ||
    message.includes("temporarily unavailable")
  );
};

const openModal = (modal) => {
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
};

const mixImpactColor = (from, to, ratio) =>
  from.map((component, index) => Math.round(component + (to[index] - component) * ratio));

const impactGradientStyle = (value) => {
  const normalized = Math.max(0, Math.min(1, value / 100));
  const base = mixImpactColor([43, 110, 216], [207, 75, 69], normalized);
  const start = mixImpactColor(base, [16, 43, 84], 0.16);
  const end = mixImpactColor(base, [255, 255, 255], 0.18);
  return `--impact-start: rgb(${start.join(", ")}); --impact-end: rgb(${end.join(", ")});`;
};

const closeModal = (modal) => {
  if (!modal) return;
  modal.hidden = true;

  if (modal === duplicatePredictionModal) {
    duplicatePredictionId = "";
    if (duplicatePredictionViewButton) {
      duplicatePredictionViewButton.hidden = true;
    }
  }

  if (consultModal?.hidden && deleteModal?.hidden) {
    document.body.style.overflow = "";
  }
};

const openDeleteUploadModal = (uploadId) => {
  const upload = getRecentUploadById(uploadId);
  deleteTargetId = uploadId;

  if (deleteFileCopy) {
    const fileNameToShow = upload?.name || "this imported file";
    deleteFileCopy.textContent = `Are you sure you want to permanently delete "${fileNameToShow}"?`;
  }

  openModal(deleteModal);
};

const renderUploadSuccess = (upload) => {
  latestUploadId = upload.id;
  fileName.textContent = upload.name;
  uploadDropzone?.classList.add("is-ready");
  uploadDropzone?.classList.add("has-selection");
  uploadError.hidden = true;
  uploadSuccess.hidden = false;
  uploadSuccessText.textContent = `${upload.rowCount || 0} patient records parsed successfully. File is ready.`;
  choosePatientButton.hidden = false;
  if (uploadButtonLabel) {
    uploadButtonLabel.textContent = "Browse Another File";
  }
};

const showUploadError = (message) => {
  latestUploadId = null;
  uploadDropzone?.classList.remove("is-ready");
  uploadDropzone?.classList.remove("has-selection");
  uploadSuccess.hidden = true;
  choosePatientButton.hidden = true;
  fileName.textContent = "No file selected";
  uploadError.textContent = message;
  uploadError.hidden = false;
  showManualPredictionToast(message, "danger");
  if (uploadButtonLabel) {
    uploadButtonLabel.textContent = "Browse Files";
  }
};

const isValidUploadFile = (file) => {
  const lowerName = file.name.toLowerCase();
  return allowedUploadExtensions.some((extension) => lowerName.endsWith(extension));
};

const timeAgo = (isoDate) => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const renderRecentUploads = () => {
  if (!recentUploadList) return;

  const filtered = recentSearchTerm
    ? recentUploadsCache.filter((upload) =>
        String(upload.name || "")
          .toLowerCase()
          .includes(String(recentSearchTerm || "").trim().toLowerCase())
      )
    : recentUploadsCache;
  const uploads = [...filtered].sort((a, b) => {
    if (recentSortTerm === "oldest") return new Date(a.uploadedAt) - new Date(b.uploadedAt);
    if (recentSortTerm === "name") return a.name.localeCompare(b.name);
    return new Date(b.uploadedAt) - new Date(a.uploadedAt);
  });

  if (!uploads.length) {
    recentUploadList.innerHTML = `
      <div class="recent-upload-empty">
        No matching uploads found. Import an Excel or CSV file to build a new prediction list.
      </div>
    `;
    return;
  }

  recentUploadList.innerHTML = uploads
    .map((upload) => {
      const isCsv = upload.name.toLowerCase().endsWith(".csv");
      const when = upload.uploadedAt ? `Uploaded ${timeAgo(upload.uploadedAt)}` : "";
      const fileIcon = isCsv
        ? `<img class="upload-file-img" src="assets/csv-icon.png" alt="CSV file" aria-label="CSV file"/>`
        : `<img class="upload-file-img" src="assets/excel-icon.png" alt="Excel file" aria-label="Excel file"/>`;
      return `
        <article class="upload-item ${upload.id === latestUploadId ? "is-selected" : ""}" data-upload-select="${upload.id}">
          ${fileIcon}
          <div class="upload-meta">
            <strong>${upload.name}</strong>
            <span>${formatFileSize(upload.fileSize || 0)} · ${upload.rowCount ?? "—"} patients${when ? ` · ${when}` : ""}</span>
          </div>
          <div class="upload-actions">
            <button class="upload-icon-btn" type="button" data-action="consult" data-upload-id="${upload.id}" title="Consult">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="upload-icon-btn upload-icon-btn-danger" type="button" data-action="delete" data-upload-id="${upload.id}" title="Delete">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
            </button>
          </div>
        </article>
      `;
    })
    .join("");
};

const renderConsultModal = async () => {
  const upload = getRecentUploadById(consultUploadId);

  if (!upload) {
    closeModal(consultModal);
    return;
  }

  const pageData = await getDatasetImportRowsPage(upload.id, consultPage, 7);
  const pagination = pageData?.pagination || {};
  const rows = Array.isArray(pageData?.rows) ? pageData.rows : [];
  consultPage = Number(pagination.page) || 1;
  consultTitle.textContent = upload.name;
  consultMeta.textContent = `${upload.rowCount || 0} patients - ${upload.columns.length} columns - ${upload.sheetName}`;
  consultHead.innerHTML = `
    <tr>
      ${upload.columns.map((column) => `<th>${column}</th>`).join("")}
    </tr>
  `;

  consultBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          ${upload.columns
            .map((column) => `<td>${row[column] === "" ? "-" : row[column]}</td>`)
            .join("")}
        </tr>
      `
    )
    .join("");

  renderPagination(consultPagination, consultPage, Number(pagination.totalPages) || 1, (nextPage) => {
    consultPage = nextPage;
    renderConsultModal().catch((error) => {
      showManualPredictionToast(
        error instanceof Error ? error.message : "Unable to load this imported dataset.",
        "danger"
      );
    });
  });
};

const handleUpload = async (file) => {
  if (!file) return;

  if (!isValidUploadFile(file)) {
    showUploadError("Only `.csv`, `.xlsx`, or `.xls` files are accepted.");
    return;
  }

  fileName.textContent = `${file.name} - Processing...`;
  uploadError.hidden = true;

  try {
    const isDuplicate = recentUploadsCache.some(
      (upload) => String(upload.name || "").toLowerCase() === file.name.toLowerCase()
    );
    if (isDuplicate) {
      throw new Error("This file already exists in your private imports.");
    }

    const dataset = await parseWorkbookFile(file);

    if (!dataset.rows.length) {
      throw new Error("The imported file does not contain any patient rows.");
    }

    const upload = await uploadPrivateDatasetImport(file, dataset);
    renderUploadSuccess(upload);
    await hydrateRecentUploads();
  } catch (error) {
    uploadDropzone?.classList.remove("is-ready");
    uploadDropzone?.classList.remove("has-selection");
    uploadSuccess.hidden = true;
    showUploadError(
      error instanceof Error
        ? error.message
        : "Unable to read this file. Please upload a valid Excel or CSV dataset."
    );
    choosePatientButton.hidden = true;
  }
};

if (predictionMobileButton && predictionSidebar) {
  predictionMobileButton.addEventListener("click", () => {
    const isOpen = predictionSidebar.classList.toggle("is-open");
    predictionMobileButton.setAttribute("aria-expanded", String(isOpen));
  });
}

setOutcomePending();
resetUploadSelectionState();

hydrateRecentUploads().catch((error) => {
  showManualPredictionToast(
    error instanceof Error ? error.message : "Unable to load your private dataset imports.",
    "danger"
  );
});

window.addEventListener("pageshow", () => {
  resetUploadSelectionState();
  hydrateRecentUploads().catch(() => {});
});

if (predictionForm) {
  const predictionFields = getPredictionValidatableFields();

  predictionFields.forEach((field) => {
    const eventName =
      field.classList.contains("range-input") ? "input" : field.type === "checkbox" || field.tagName === "SELECT" ? "change" : "input";

    field.addEventListener(eventName, () => {
      if (field.classList.contains("range-input")) {
        updateRangePresentation(field);
      }

      if (field.classList.contains("toggle-switch-input")) {
        updateTogglePresentation(field);
      }

      syncPredictionFieldState(field);
      updatePredictionSubmitState();
    });

    field.addEventListener("blur", () => {
      field.dataset.touched = "true";
      syncPredictionFieldState(field);
      updatePredictionSubmitState();
    });
  });

  predictionToggleInputs.forEach(updateTogglePresentation);
  initPredictionTriStateToggles();
  predictionRangeInputs.forEach((input) => {
    updateRangePresentation(input);
    input.addEventListener("input", () => updateRangePresentation(input));
    input.addEventListener("change", () => updateRangePresentation(input));
  });
  initPredictionManualRangeEditors();
  predictionChipSelectGroups.forEach(initializePredictionChipSelect);
  applyPatientPredictionDraft(consumePatientPredictionDraft());
  updatePredictionSubmitState();

  predictionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    predictionForm.dataset.submitAttempted = "true";

    predictionFields.forEach((field) => {
      syncPredictionFieldState(field, true);
    });

    updatePredictionSubmitState();

    if (!predictionForm.checkValidity()) {
      return;
    }

    const submitPrediction = async () => {
      let hasError = false;
      try {
        setPredictionLoadingState(true);
        const response = await requestManualPrediction();
        if (typeof upsertPatientPrediction === "function" && response?.prediction) {
          upsertPatientPrediction(response.prediction);
        }
          latestPredictionDetailsId = response?.prediction?.id || response?.prediction?._id || "";
          renderOutcome(response.displayResult);
          revealPredictionOutcome();
          if (aiServiceWasUnavailable) {
            showManualPredictionToast("AI prediction service is available again. Prediction generated successfully.");
            aiServiceWasUnavailable = false;
          } else {
            showManualPredictionToast("Prediction generated successfully.");
          }
        } catch (error) {
          hasError = true;
          const isDuplicateError = error?.status === 409;
          const isServiceError = isAiServiceUnavailableError(error);

        if (isDuplicateError) {
          openDuplicatePredictionModal(
            error instanceof Error
              ? error.message
              : "A manual prediction already exists for this patient. Duplicate predictions are not allowed.",
            error?.payload?.existingPredictionId || ""
          );
          }
          if (isServiceError) {
            aiServiceWasUnavailable = true;
            openServiceErrorModal(
              "The AI prediction service is currently unavailable. Please try again later or contact the system administrator."
            );
          }
        if (!isDuplicateError && !isServiceError) {
          showManualPredictionToast(
            error instanceof Error ? error.message : "Unable to run the AI prediction.",
            "danger"
          );
          predictionFormNote?.classList.remove("is-ready");
          predictionFormNote?.classList.add("is-error");
          if (predictionFormNote) {
            predictionFormNote.textContent =
              error instanceof Error ? error.message : "Unable to run the AI prediction.";
          }
          setOutcomePending(
            error instanceof Error
              ? error.message
              : "The prediction service is currently unavailable. Please try again."
          );
        }
      } finally {
        setPredictionLoadingState(false);
        if (!hasError) {
          updatePredictionSubmitState();
        }
      }
    };

    submitPrediction();
  });
}

if (datasetFile) {
  datasetFile.addEventListener("change", async () => {
    await handleUpload(datasetFile.files?.[0]);
  });
}

if (uploadDropzone) {
  ["dragenter", "dragover"].forEach((eventName) => {
    uploadDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadDropzone.classList.add("is-drag-over");
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    uploadDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadDropzone.classList.remove("is-drag-over");
    });
  });

  uploadDropzone.addEventListener("drop", async (event) => {
    const droppedFile = event.dataTransfer?.files?.[0];
    await handleUpload(droppedFile);
  });
}

if (recentUploadSearch) {
  recentUploadSearch.addEventListener("input", (event) => {
    recentSearchTerm = event.target.value;
    renderRecentUploads();
  });
}

const recentSortSelect = document.querySelector("#recent-sort-select");
if (recentSortSelect) {
  recentSortSelect.addEventListener("change", (event) => {
    recentSortTerm = event.target.value;
    renderRecentUploads();
  });
}

if (choosePatientButton) {
  choosePatientButton.addEventListener("click", () => {
    if (!latestUploadId) return;
    window.location.href = `dataset-selection.html?upload=${encodeURIComponent(latestUploadId)}`;
  });
}

if (printReportButton) {
  printReportButton.addEventListener("click", printPredictionReport);
}

if (viewPredictionDetailsButton) {
  viewPredictionDetailsButton.addEventListener("click", () => {
    if (!latestPredictionDetailsId) return;
    const returnTo = `${window.location.pathname.split("/").pop() || "new-prediction.html"}${window.location.search}`;
    window.location.href = `prediction-details.html?id=${encodeURIComponent(latestPredictionDetailsId)}&returnTo=${encodeURIComponent(returnTo)}`;
  });
}

duplicateCloseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    closeModal(duplicatePredictionModal);
  });
});

if (duplicatePredictionOkButton) {
  duplicatePredictionOkButton.addEventListener("click", () => {
    closeModal(duplicatePredictionModal);
  });
}

if (duplicatePredictionViewButton) {
  duplicatePredictionViewButton.addEventListener("click", () => {
    if (!duplicatePredictionId) {
      closeModal(duplicatePredictionModal);
      return;
    }

    const returnTo = `${window.location.pathname.split("/").pop() || "new-prediction.html"}${window.location.search}`;
    const targetId = duplicatePredictionId;
    closeModal(duplicatePredictionModal);
    window.location.href = `prediction-details.html?id=${encodeURIComponent(targetId)}&returnTo=${encodeURIComponent(returnTo)}`;
  });
}

serviceErrorCloseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    closeModal(serviceErrorModal);
  });
});

if (serviceErrorOkButton) {
  serviceErrorOkButton.addEventListener("click", () => {
    closeModal(serviceErrorModal);
  });
}

if (serviceErrorSupportButton) {
  serviceErrorSupportButton.addEventListener("click", () => {
    closeModal(serviceErrorModal);
    if (typeof window.openNoufarSupportModal === "function") {
      window.openNoufarSupportModal({
        category: "Technical issue",
        priority: "High",
        subject: "AI prediction service unavailable",
        message:
          "The AI prediction service is currently unavailable from the New Prediction workflow. Please review the Flask backend availability.",
      });
    }
  });
}

if (recentUploadList) {
  recentUploadList.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-upload-id]");

    if (!target) {
      const uploadRow = event.target.closest("[data-upload-select]");
      if (!uploadRow) return;
      selectRecentUpload(uploadRow.dataset.uploadSelect);
      renderRecentUploads();
      return;
    }

    const uploadId = target.dataset.uploadId;

    if (target.dataset.action === "consult") {
      consultUploadId = uploadId;
      consultPage = 1;
      openModal(consultModal);
      renderConsultModal().catch((error) => {
        closeModal(consultModal);
        showManualPredictionToast(
          error instanceof Error ? error.message : "Unable to open this imported dataset.",
          "danger"
        );
      });
      return;
    }

    if (target.dataset.action === "delete") {
      openDeleteUploadModal(uploadId);
    }
  });
}

consultCloseButtons.forEach((button) => {
  button.addEventListener("click", () => closeModal(consultModal));
});

let allUploadsSearchTerm = "";

const renderAllUploadsModal = () => {
  const all = recentUploadsCache;
  const filtered = allUploadsSearchTerm
    ? all.filter((u) => u.name.toLowerCase().includes(allUploadsSearchTerm.toLowerCase()))
    : all;

  if (allUploadsMeta) {
    allUploadsMeta.textContent = `${all.length} file${all.length !== 1 ? "s" : ""} imported`;
  }

  if (!allUploadsList) return;

  if (!filtered.length) {
    allUploadsList.innerHTML = `<p class="all-uploads-empty">${allUploadsSearchTerm ? "No files match your search." : "No uploads yet."}</p>`;
    return;
  }

  allUploadsList.innerHTML = filtered.map((upload) => {
    const isCsv = upload.name.toLowerCase().endsWith(".csv");
    const icon = isCsv
      ? `<img class="all-uploads-file-img" src="assets/csv-icon.png" alt="CSV"/>`
      : `<img class="all-uploads-file-img" src="assets/excel-icon.png" alt="Excel"/>`;
    const when = upload.uploadedAt ? timeAgo(upload.uploadedAt) : "";
    return `
      <div class="all-uploads-item" data-upload-select="${upload.id}">
        ${icon}
        <div class="all-uploads-meta">
          <strong>${upload.name}</strong>
          <span>${formatFileSize(upload.fileSize || 0)} · ${upload.rowCount ?? "—"} patients${when ? ` · ${when}` : ""}</span>
        </div>
        <span class="all-uploads-select-hint">Select</span>
        <div class="all-uploads-actions">
          <button class="upload-icon-btn" type="button" data-action="consult" data-upload-id="${upload.id}" title="Consult">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="upload-icon-btn upload-icon-btn-danger" type="button" data-action="delete" data-upload-id="${upload.id}" title="Delete">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </div>`;
  }).join("");
};

if (viewAllUploadsBtn) {
  viewAllUploadsBtn.addEventListener("click", () => {
    allUploadsSearchTerm = "";
    if (allUploadsSearch) allUploadsSearch.value = "";
    renderAllUploadsModal();
    openModal(allUploadsModal);
  });
}

if (allUploadsSearch) {
  allUploadsSearch.addEventListener("input", (e) => {
    allUploadsSearchTerm = e.target.value;
    renderAllUploadsModal();
  });
}

allUploadsCloseButtons.forEach((btn) => {
  btn.addEventListener("click", () => closeModal(allUploadsModal));
});

if (allUploadsList) {
  allUploadsList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-action]");
    if (btn) {
      const { action, uploadId } = btn.dataset;
      if (action === "consult") {
        consultUploadId = uploadId;
        consultPage = 1;
        closeModal(allUploadsModal);
        openModal(consultModal);
        renderConsultModal().catch((error) => {
          closeModal(consultModal);
          showManualPredictionToast(
            error instanceof Error ? error.message : "Unable to open this imported dataset.",
            "danger"
          );
        });
      } else if (action === "delete") {
        deleteTargetId = uploadId;
        const upload = getRecentUploadById(uploadId);
        if (deleteFileCopy) {
          deleteFileCopy.textContent = `Are you sure you want to permanently delete "${upload?.name || "this file"}"?`;
        }
        closeModal(allUploadsModal);
        openModal(deleteModal);
      }
      return;
    }

    const row = event.target.closest("[data-upload-select]");
    if (row) {
      selectRecentUpload(row.dataset.uploadSelect);
      renderRecentUploads();
      closeModal(allUploadsModal);
      showManualPredictionToast("File selected. You can now run the prediction.", "success");
    }
  });
}

deleteCloseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    deleteTargetId = null;
    closeModal(deleteModal);
  });
});

if (confirmDeleteButton) {
  confirmDeleteButton.addEventListener("click", async () => {
    if (!deleteTargetId) {
      showUploadDeleteToast("Unable to delete this file.", "danger");
      return;
    }

    try {
      const upload = getRecentUploadById(deleteTargetId);
      if (!upload) {
        throw new Error("Unable to find this imported file.");
      }

      const deletedFileName = upload.name || "Imported file";

      await deletePrivateDatasetImport(deleteTargetId);
      recentUploadsCache = recentUploadsCache.filter(
        (entry) => String(entry.id) !== String(deleteTargetId)
      );

      if (deleteTargetId === latestUploadId) {
        latestUploadId = null;
        choosePatientButton.hidden = true;
        uploadSuccess.hidden = true;
        uploadDropzone?.classList.remove("is-ready");
        fileName.textContent = "No file selected";
      }

      deleteTargetId = null;
      renderRecentUploads();
      closeModal(deleteModal);
      showUploadDeleteToast(`"${deletedFileName}" deleted successfully.`);
    } catch (error) {
      showUploadDeleteToast(
        error instanceof Error ? error.message : "Unable to delete this file.",
        "danger"
      );
    }
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (!consultModal?.hidden) {
    closeModal(consultModal);
  }

  if (!deleteModal?.hidden) {
    deleteTargetId = null;
    closeModal(deleteModal);
  }

  if (!allUploadsModal?.hidden) {
    closeModal(allUploadsModal);
  }
});
