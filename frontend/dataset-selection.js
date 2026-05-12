const datasetSidebar = document.querySelector(".sidebar");
const datasetMobileButton = document.querySelector(".mobile-nav-button");
const datasetName = document.querySelector("#dataset-name");
const datasetSubtitle = document.querySelector("#dataset-subtitle");
const datasetTotal = document.querySelector("#dataset-total");
const datasetColumns = document.querySelector("#dataset-columns");
const datasetSheet = document.querySelector("#dataset-sheet");
const datasetHead = document.querySelector("#dataset-head");
const datasetBody = document.querySelector("#dataset-body");
const datasetSearch = document.querySelector("#dataset-search");
const datasetTableCard = document.querySelector(".dataset-table-card");
const datasetExpandTableButton = document.querySelector("#dataset-expand-table");
const datasetPagination = document.querySelector("#dataset-pagination");
const datasetConsultationFilter = document.querySelector("#dataset-filter-consultation");
const datasetUltrasoundFilter = document.querySelector("#dataset-filter-ultrasound");
const datasetTsiFilter = document.querySelector("#dataset-filter-tsi");
const datasetFilterResetButton = document.querySelector("#dataset-filter-reset");
const datasetFilterStatus = document.querySelector("#dataset-filter-status");
const selectionSummary = document.querySelector("#selection-summary");
const editSelectedRowButton = document.querySelector("#edit-selected-row");
const runSelectedPredictionButton = document.querySelector("#run-selected-prediction");
const outcomeState = document.querySelector("#selection-outcome-state");
const outcomeHeading = document.querySelector("#selection-outcome-heading");
const outcomeText = document.querySelector("#selection-outcome-text");
const outcomeBadge = document.querySelector("#selection-outcome-badge");
const outcomeProbability = document.querySelector("#selection-outcome-probability");
const outcomeBar = document.querySelector("#selection-outcome-bar");
const outcomeSummary = document.querySelector("#selection-outcome-summary");
const impactList = document.querySelector("#selection-impact-list");
const printReportButton = document.querySelector("#selection-print-report-button");
const datasetDuplicateModal = document.querySelector("#dataset-duplicate-modal");
const datasetDuplicateCopy = document.querySelector("#dataset-duplicate-copy");
const datasetDuplicateViewButton = document.querySelector("#dataset-duplicate-view");
const datasetDuplicateOkButton = document.querySelector("#dataset-duplicate-ok");
const datasetDuplicateCloseButtons = document.querySelectorAll("[data-close-dataset-duplicate]");
const datasetServiceErrorModal = document.querySelector("#dataset-service-error-modal");
const datasetServiceErrorCopy = document.querySelector("#dataset-service-error-copy");
const datasetServiceErrorOkButton = document.querySelector("#dataset-service-error-ok");
const datasetServiceErrorSupportButton = document.querySelector("#dataset-service-error-support");
const datasetServiceErrorCloseButtons = document.querySelectorAll("[data-close-dataset-service-error]");

const { predictionBadge } = window.NoufarApp;

const datasetSelectionAuthStorageKey = "noufar-doctor-auth-v1";
const datasetSelectionApiBaseUrl = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
const datasetDoctorSessionBridge = window.NoufarDoctorSessionBridge || null;

const params = new URLSearchParams(window.location.search);

let dataset = null;
let currentPageRows = [];
let selectedRowId = "";
let currentPage = 1;
let searchTerm = "";
let latestSelectionResult = null;
let latestSelectedRow = null;
let editingRowId = "";
let inlineEditSaving = false;
let datasetTablePlaceholder = null;
let duplicatePredictionId = "";
let datasetAiServiceWasUnavailable = false;
let activeClinicalFilters = {
  consultationReason: "",
  ultrasound: "",
  tsi: "",
};

const requestDatasetImportsJson = async (path, options = {}) => {
  if (datasetDoctorSessionBridge?.requestJson) {
    return datasetDoctorSessionBridge.requestJson(`/dataset-imports${path}`, options);
  }

  const session = getDatasetSelectionDoctorSession();
  const token = session?.token;
  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  const response = await fetch(`${datasetSelectionApiBaseUrl}/dataset-imports${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
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

const getPrivateDatasetImport = async (datasetImportId) => {
  const payload = await requestDatasetImportsJson(`/${encodeURIComponent(datasetImportId)}`);
  return payload?.datasetImport || null;
};

const getPrivateDatasetImportRows = async (datasetImportId, options = {}) => {
  const query = new URLSearchParams();
  Object.entries(options || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestDatasetImportsJson(`/${encodeURIComponent(datasetImportId)}/rows${suffix}`);
};

const updatePrivateDatasetImportRow = async (datasetImportId, rowId, rowData) =>
  requestDatasetImportsJson(`/${encodeURIComponent(datasetImportId)}/rows/${encodeURIComponent(rowId)}`, {
    method: "PATCH",
    body: JSON.stringify({ rowData }),
  });

const setDatasetExpandButtonState = (isExpanded) => {
  if (!datasetExpandTableButton) return;

  datasetExpandTableButton.innerHTML = `
    <img
      class="dataset-expand-icon"
      src="assets/${isExpanded ? "reduire.png" : "agrandir.png"}?v=20260512"
      alt=""
      aria-hidden="true"
    />
  `;
  datasetExpandTableButton.setAttribute("aria-expanded", String(Boolean(isExpanded)));
  datasetExpandTableButton.setAttribute("aria-label", isExpanded ? "Réduire le tableau" : "Agrandir le tableau");
};

const setDatasetTableExpanded = (isExpanded) => {
  if (!datasetTableCard) return;

  if (isExpanded) {
    if (!datasetTablePlaceholder) {
      datasetTablePlaceholder = document.createComment("dataset-table-original-position");
      datasetTableCard.parentNode?.insertBefore(datasetTablePlaceholder, datasetTableCard);
    }
    document.body.appendChild(datasetTableCard);
  } else if (datasetTablePlaceholder?.parentNode) {
    datasetTablePlaceholder.parentNode.insertBefore(datasetTableCard, datasetTablePlaceholder);
    datasetTablePlaceholder.remove();
    datasetTablePlaceholder = null;
  }

  datasetTableCard.classList.toggle("is-expanded", Boolean(isExpanded));
  document.body.classList.toggle("dataset-table-expanded", Boolean(isExpanded));
  setDatasetExpandButtonState(Boolean(isExpanded));
};

const showDatasetSelectionToast = (message, variant = "success") => {
  if (typeof window.showNoufarToast === "function") {
    window.showNoufarToast(message, variant);
  }
};

const openDatasetDuplicateModal = (
  message = "A prediction already exists for this imported patient. Duplicate predictions are not allowed.",
  predictionId = ""
) => {
  duplicatePredictionId = String(predictionId || "").trim();

  if (datasetDuplicateCopy) {
    datasetDuplicateCopy.textContent = message;
  }
  if (datasetDuplicateViewButton) {
    datasetDuplicateViewButton.hidden = !duplicatePredictionId;
  }
  if (datasetDuplicateModal) {
    datasetDuplicateModal.hidden = false;
    document.body.style.overflow = "hidden";
  }
};

const openDatasetServiceErrorModal = (
  message = "The AI prediction service is currently unavailable. Please try again later or contact the system administrator."
) => {
  if (datasetServiceErrorCopy) {
    datasetServiceErrorCopy.textContent = message;
  }
  if (datasetServiceErrorModal) {
    datasetServiceErrorModal.hidden = false;
    document.body.style.overflow = "hidden";
  }
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

const closeDatasetDuplicateModal = () => {
  if (!datasetDuplicateModal) return;
  duplicatePredictionId = "";
  if (datasetDuplicateViewButton) {
    datasetDuplicateViewButton.hidden = true;
  }
  datasetDuplicateModal.hidden = true;
  document.body.style.overflow = "";
};

const closeDatasetServiceErrorModal = () => {
  if (!datasetServiceErrorModal) return;
  datasetServiceErrorModal.hidden = true;
  document.body.style.overflow = "";
};

const getDatasetSelectionDoctorSession = () => {
  try {
    const raw = window.localStorage.getItem(datasetSelectionAuthStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const normalizeDatasetKey = (value) =>
  String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");

const getDatasetRowValue = (row, aliases, fallback = "") => {
  const normalizedAliases = aliases.map(normalizeDatasetKey);

  for (const [key, value] of Object.entries(row || {})) {
    if (normalizedAliases.includes(normalizeDatasetKey(key)) && value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
};

const isTruthyDatasetMarker = (value) => {
  const normalized = normalizeDatasetKey(value);
  return ["1", "yes", "oui", "true", "positive", "positif", "positifs", "present", "x"].includes(normalized);
};

const getDatasetOneHotValue = (row, positiveAliases = [], negativeAliases = []) => {
  const positive = getDatasetRowValue(row, positiveAliases, "");
  if (isTruthyDatasetMarker(positive)) return "Positive";

  const negative = getDatasetRowValue(row, negativeAliases, "");
  if (isTruthyDatasetMarker(negative)) return "Negative";

  return "";
};

const getDatasetCategoricalOneHotValue = (row, options = []) => {
  for (const option of options) {
    const value = getDatasetRowValue(row, option.aliases, "");
    if (isTruthyDatasetMarker(value)) return option.value;
  }
  return "";
};

const escapeDatasetCellHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isDatasetBlank = (value) => value === undefined || value === null || String(value).trim() === "";

const isNotMeasuredValue = (value) => {
  const normalized = normalizeDatasetKey(value);
  return [
    "",
    "-",
    "not measured",
    "not mesured",
    "not messured",
    "not available",
    "na",
    "n a",
    "missing",
    "unknown",
    "non mesure",
  ].includes(normalized);
};

const parseImportedNumber = (value) => {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeImportedSex = (value) => {
  const normalized = normalizeDatasetKey(value);
  if (["m", "male", "h", "homme", "man"].includes(normalized)) return "Male";
  if (["f", "female", "femme", "famme", "woman"].includes(normalized)) return "Female";
  return String(value ?? "").trim();
};

const normalizeImportedClinicalStatus = (value) => {
  if (isDatasetBlank(value) || isNotMeasuredValue(value)) return "Not measured";
  const normalized = normalizeDatasetKey(value);
  if (["yes", "true", "1", "positive", "positif", "positifs", "positives", "present"].includes(normalized)) {
    return "Positive";
  }
  if (["no", "false", "0", "negative", "negatif", "negatifs", "negatives", "absent"].includes(normalized)) {
    return "Negative";
  }
  return String(value).trim();
};

const normalizeImportedUltrasound = (value) => {
  const normalized = normalizeDatasetKey(value);
  if (["goiter", "goitre"].includes(normalized)) return "Goiter";
  if (["normal volume", "volume normal"].includes(normalized)) return "Normal volume";
  if (["goiter nodules", "goitre nodules", "goiter nodule", "goitre nodule"].includes(normalized)) {
    return "Goiter + nodules";
  }
  return String(value ?? "").trim();
};

const normalizeImportedScintigraphy = (value) => {
  const normalized = normalizeDatasetKey(value);
  if (["normal uptake", "normocaptante", "normocaptation"].includes(normalized)) return "Normal uptake";
  if (["high uptake", "hypercaptante", "hypercaptation"].includes(normalized)) return "High uptake";
  if (["hot nodule", "nodule chaud"].includes(normalized)) return "Hot nodule";
  return String(value ?? "").trim();
};

const normalizeImportedTherapy = (value) => {
  const normalized = normalizeDatasetKey(value);
  if (["carbimazole", "ats", "therapie ats", "traitement ats"].includes(normalized)) return "Carbimazole";
  if (["benzylthiouracile", "benzyl thiouracile", "btu"].includes(normalized)) return "Benzylthiouracile";
  return String(value ?? "").trim();
};

const normalizeImportedToggleValue = (value) => {
  if (isDatasetBlank(value)) return "Not measured";
  const normalized = normalizeDatasetKey(value);
  if (["yes", "oui", "true", "1", "positive", "positif", "positifs", "present"].includes(normalized)) return "Yes";
  if (["no", "non", "false", "0", "negative", "negatif", "negatifs", "absent"].includes(normalized)) return "No";
  if (isNotMeasuredValue(value)) {
    return "Not measured";
  }
  return String(value).trim();
};

const normalizeImportedStatusValue = (value) => {
  return normalizeImportedClinicalStatus(value);
};

const normalizeImportedMeasuredNumber = (value) => {
  if (isDatasetBlank(value)) return "Not measured";
  if (isNotMeasuredValue(value)) return "Not measured";
  const parsed = parseImportedNumber(value);
  return Number.isFinite(parsed) ? parsed : String(value).trim();
};

const FIELD_ALIASES = {
  name: ["Full Name", "Patient Name", "Name"],
  age: ["Age", "Patient age", "AGE"],
  sex: ["Sex", "Gender", "Sexe"],
  consultationReason: ["Consultation reason", "Reason", "Motif consultation"],
  stress: ["Stress"],
  palpitations: ["Palpitations"],
  spp: ["SPP"],
  amg: ["AMG"],
  diarrhea: ["Diarrhea"],
  tremors: ["Tremors"],
  agitation: ["Agitation"],
  moodDisorder: ["Mood disorder", "MoodDisorder"],
  sleepDisorder: ["Sleep disorder", "SleepDisorder"],
  sweating: ["Excess sweating", "Sweating"],
  heatIntolerance: ["Heat intolerance", "HeatIntolerance"],
  muscleWeakness: ["Muscle weakness", "MuscleWeakness"],
  goiter: ["Goiter"],
  tsh: ["TSH", "TSH level", "Thyroid stimulating hormone"],
  ft4: ["FT4", "FT 4", "Free T4", "FreeT4", "Free thyroxine"],
  antiTpo: ["Anti-TPO", "Anti TPO", "AntiTpo", "AntiTPO"],
  antiTpoTotal: [
    "Anti-TPO total",
    "Anti TPO total",
    "AntiTpoTotal",
    "AntiTPO total",
    "anti_tpo_total",
    "Anti TPO taux",
    "Anti-TPO taux",
    "AntiTPO taux",
    "AntiTPOTAUX",
  ],
  antiTg: ["Anti-Tg", "Anti Tg", "AntiTg", "AntiTG"],
  tsi: ["TSI"],
  tsiLevel: ["TSI level", "TSI Level", "TsiLevel", "tsi_level", "TSI taux", "TSItaux", "TSI titer"],
  ultrasound: ["Ultrasound", "Echographie"],
  scintigraphy: ["Scintigraphy"],
  therapy: ["Therapy", "Treatment", "Treatment type"],
  blockReplace: ["Block and replace", "Block Replace"],
  duration: ["Duration of treatment", "Treatment duration", "Duration", "dureeATS", "Duree ATS"],
  surgery: ["Surgery"],
  radioactiveIodine: ["Radioactive iodine", "RadioactiveIodine"],
};

const normalizeDatasetFieldValue = (field, value) => {
  if (field === "sex") return normalizeImportedSex(value);
  if (["antiTpo", "antiTg", "tsi"].includes(field)) return normalizeImportedClinicalStatus(value);
  if (field === "ultrasound") return normalizeImportedUltrasound(value);
  if (field === "scintigraphy") return normalizeImportedScintigraphy(value);
  if (field === "therapy") return normalizeImportedTherapy(value);
  if (
    [
      "stress",
      "palpitations",
      "spp",
      "amg",
      "diarrhea",
      "tremors",
      "agitation",
      "moodDisorder",
      "sleepDisorder",
      "sweating",
      "heatIntolerance",
      "muscleWeakness",
      "goiter",
      "blockReplace",
      "surgery",
      "radioactiveIodine",
    ].includes(field)
  ) {
    return normalizeImportedToggleValue(value);
  }
  if (["tsh", "ft4", "antiTpoTotal", "tsiLevel"].includes(field)) {
    return normalizeImportedMeasuredNumber(value);
  }
  if (field === "duration") {
    const parsed = parseImportedNumber(value);
    return parsed === null ? String(value ?? "").trim() : parsed;
  }
  return String(value ?? "").trim();
};

const normalizeDatasetFieldForStorage = (field, value) => {
  if (field && isNotMeasuredValue(value)) {
    return "";
  }
  return normalizeDatasetFieldValue(field, value);
};

const normalizedFieldAliases = Object.fromEntries(
  Object.entries(FIELD_ALIASES).map(([field, aliases]) => [field, aliases.map(normalizeDatasetKey)])
);

const getFieldForDatasetColumn = (column) => {
  const normalized = normalizeDatasetKey(column);
  return (
    Object.entries(normalizedFieldAliases).find(([, aliases]) => aliases.includes(normalized))?.[0] || ""
  );
};

const validateDatasetFieldValue = (field, value) => {
  if (!field) return null;
  const normalizedValue = normalizeDatasetFieldValue(field, value);
  const raw = String(normalizedValue ?? "").trim();
  const normalized = normalizeDatasetKey(raw);

  if (!raw || isNotMeasuredValue(raw)) return null;

  if (field === "age") {
    const age = parseImportedNumber(raw);
    if (age === null) return "Age must be a number.";
    if (age < 17 || age > 100) return "Age must be between 17 and 100.";
    return null;
  }

  if (field === "duration") {
    const duration = parseImportedNumber(raw);
    if (duration === null) return "Duration must be a number.";
    if (duration < 3 || duration > 96) return "Duration must be between 3 and 96 months.";
    return null;
  }

  if (["tsh", "ft4", "antiTpoTotal", "tsiLevel"].includes(field)) {
    if (!raw || isNotMeasuredValue(raw)) return null;
    return parseImportedNumber(raw) === null ? "Value must be numeric or Not measured." : null;
  }

  if (field === "sex") {
    return ["male", "female"].includes(normalized) ? null : "Sex must be Male or Female.";
  }

  if (["antiTpo", "antiTg", "tsi"].includes(field)) {
    return ["positive", "negative", "not measured", "yes", "no"].includes(normalized)
      ? null
      : "Value must be Positive, Negative, or Not measured.";
  }

  if (
    [
      "stress",
      "palpitations",
      "spp",
      "amg",
      "diarrhea",
      "tremors",
      "agitation",
      "moodDisorder",
      "sleepDisorder",
      "sweating",
      "heatIntolerance",
      "muscleWeakness",
      "goiter",
      "blockReplace",
      "surgery",
      "radioactiveIodine",
    ].includes(field)
  ) {
    if (!raw || isNotMeasuredValue(raw)) return null;
    return ["yes", "no", "true", "false", "1", "0", "positive", "negative"].includes(normalized)
      ? null
      : "Value must be Yes, No, or Not measured.";
  }

  if (field === "ultrasound") {
    return ["goiter", "normal volume", "goiter nodules"].includes(normalized)
      ? null
      : "Ultrasound must match an allowed option.";
  }

  if (field === "scintigraphy") {
    return ["normal uptake", "high uptake", "hot nodule"].includes(normalized)
      ? null
      : "Scintigraphy must match an allowed option.";
  }

  if (field === "therapy") {
    return ["carbimazole", "benzylthiouracile"].includes(normalized)
      ? null
      : "Therapy must be Carbimazole or Benzylthiouracile.";
  }

  return null;
};

const getDatasetRowValidationErrors = (row) => {
  const errors = [];
  Object.entries(FIELD_ALIASES).forEach(([field, aliases]) => {
    const value = getDatasetRowValue(row, aliases, "");
    const message = validateDatasetFieldValue(field, value);
    if (message) {
      errors.push({ field, label: aliases[0], message });
    }
  });
  return errors;
};

const getDatasetCellValidationMessage = (column, value) =>
  validateDatasetFieldValue(getFieldForDatasetColumn(column), value);

const getInlineEditRowElement = (rowId = editingRowId) =>
  Array.from(datasetBody?.querySelectorAll(".selectable-row") || []).find(
    (rowElement) => String(rowElement.dataset.rowId) === String(rowId)
  ) || null;

const buildInlineEditableRowData = (rowId = editingRowId) => {
  const rowData = { __rowId: rowId };
  const rowElement = getInlineEditRowElement(rowId);

  dataset?.columns?.forEach((column) => {
    const input = Array.from(rowElement?.querySelectorAll("[data-inline-edit-column]") || []).find(
      (entry) => entry.dataset.inlineEditColumn === column
    );
    const rawValue = input ? input.value.trim() : "";
    rowData[column] = normalizeDatasetFieldForStorage(getFieldForDatasetColumn(column), rawValue);
  });

  return rowData;
};

const syncInlineEditValidation = (rowId = editingRowId) => {
  const rowElement = getInlineEditRowElement(rowId);
  const errors = [];

  rowElement?.querySelectorAll("[data-inline-edit-column]").forEach((input) => {
    const column = input.dataset.inlineEditColumn || "";
    const message = getDatasetCellValidationMessage(column, input.value);
    const cell = input.closest("td");
    const errorNode = cell?.querySelector(".dataset-inline-error");

    cell?.classList.toggle("dataset-cell-invalid", Boolean(message));
    if (cell) {
      cell.title = message || "";
    }
    if (errorNode) {
      errorNode.textContent = message || "";
    }
    if (message) {
      errors.push({ column, message });
    }
  });

  return errors.length ? errors : getDatasetRowValidationErrors(buildInlineEditableRowData(rowId));
};

const saveInlineEditRow = (rowId) => {
  if (!dataset?.id || !rowId) return;
  const validationErrors = syncInlineEditValidation(rowId);

  if (validationErrors.length) {
    const firstError = validationErrors[0];
    showDatasetSelectionToast(
      `${firstError.column || firstError.label}: ${firstError.message} Please correct it before saving.`,
      "danger"
    );
    return;
  }

  const rowData = buildInlineEditableRowData(rowId);
  inlineEditSaving = true;
  renderDatasetTable().catch(() => {});

  updatePrivateDatasetImportRow(dataset.id, rowId, rowData)
    .then(async (response) => {
      const updatedRow = response?.row || rowData;
      currentPageRows = currentPageRows.map((row) =>
        String(row.__rowId) === String(rowId) ? updatedRow : row
      );
      selectedRowId = String(updatedRow.__rowId || rowId);
      latestSelectedRow = updatedRow;
      if (response?.datasetImport) {
        dataset = response.datasetImport;
      }
      editingRowId = "";
      showDatasetSelectionToast("Dataset row updated successfully.");
      await renderDatasetTable();
    })
    .catch((error) => {
      showDatasetSelectionToast(
        error instanceof Error ? error.message : "Unable to save this dataset row.",
        "danger"
      );
    })
    .finally(() => {
      inlineEditSaving = false;
      renderDatasetTable().catch(() => {});
    });
};

const renderDatasetCell = (row, column) => {
  const value = row[column];
  const displayValue = value === "" || value === undefined || value === null ? "-" : value;
  const validationMessage = getDatasetCellValidationMessage(column, value);
  const isEditing = String(row.__rowId) === String(editingRowId);

  if (isEditing) {
    const field = getFieldForDatasetColumn(column);
    const inputMode = ["age", "duration", "tsh", "ft4", "antiTpoTotal", "tsiLevel"].includes(field)
      ? "decimal"
      : "text";

    return `
      <td class="${validationMessage ? "dataset-cell-invalid " : ""}dataset-cell-editing" title="${escapeDatasetCellHtml(validationMessage || "")}">
        <input
          class="dataset-inline-input"
          type="text"
          inputmode="${inputMode}"
          data-inline-edit-column="${escapeDatasetCellHtml(column)}"
          value="${escapeDatasetCellHtml(value ?? "")}"
          aria-label="Edit ${escapeDatasetCellHtml(column)}"
        />
        <small class="dataset-inline-error">${validationMessage ? escapeDatasetCellHtml(validationMessage) : ""}</small>
      </td>
    `;
  }

  if (!validationMessage) {
    return `<td>${escapeDatasetCellHtml(displayValue)}</td>`;
  }

  return `
    <td class="dataset-cell-invalid" title="${escapeDatasetCellHtml(validationMessage)}">
      <span class="dataset-cell-warning" aria-hidden="true">!</span>
      <span>${escapeDatasetCellHtml(displayValue)}</span>
    </td>
  `;
};

const populateDatasetFilterOptions = () => {
  if (!dataset) return;

  const buildOptions = (select, values, emptyLabel) => {
    if (!select) return;
    const previous = select.value;
    const uniqueValues = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = emptyLabel;
    select.append(defaultOption);

    uniqueValues.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    });

    select.value = uniqueValues.includes(previous) ? previous : "";
  };

  buildOptions(
    datasetConsultationFilter,
    dataset.consultationReasons || [],
    "All reasons"
  );
  buildOptions(
    datasetUltrasoundFilter,
    dataset.ultrasoundValues || [],
    "All ultrasound findings"
  );
  buildOptions(
    datasetTsiFilter,
    dataset.tsiValues || [],
    "All TSI profiles"
  );
};

const updateDatasetFilterStatus = (count) => {
  if (!datasetFilterStatus || !dataset) return;

  const activeCount = Object.values(activeClinicalFilters).filter(Boolean).length;
  if (!activeCount) {
    datasetFilterStatus.textContent = `Showing ${count} of ${dataset.rowCount} imported patient${dataset.rowCount > 1 ? "s" : ""}`;
    return;
  }

  datasetFilterStatus.textContent = `${count} patient${count > 1 ? "s" : ""} match ${activeCount} active clinical filter${activeCount > 1 ? "s" : ""}`;
};

const buildImportedPredictionPayload = (row) => {
  const patientId = String(
    getDatasetRowValue(row, ["Patient ID", "ID", "Patient Id"], "")
  ).trim();
  const patientName = String(
    getDatasetRowValue(row, ["Full Name", "Patient Name", "Name"], patientId || "Imported patient")
  ).trim();
  const antiTpoStatus =
    getDatasetRowValue(row, FIELD_ALIASES.antiTpo, "") ||
    getDatasetOneHotValue(row, ["AntiTPO_POSITIFS", "Anti-TPO positive", "Anti TPO positive"], ["AntiTPO_NEGATIFS", "Anti-TPO negative", "Anti TPO negative"]);
  const antiTgStatus =
    getDatasetRowValue(row, FIELD_ALIASES.antiTg, "") ||
    getDatasetOneHotValue(row, ["AntiTg_POSITIFS", "Anti-Tg positive", "Anti Tg positive"], ["AntiTg_NEGATIFS", "Anti-Tg negative", "Anti Tg negative"]);
  const tsiStatus =
    getDatasetRowValue(row, FIELD_ALIASES.tsi, "") ||
    getDatasetOneHotValue(row, ["TSI_POSITIFS", "TSI positive"], ["TSI_NEGATIFS", "TSI negative"]);
  const ultrasoundValue =
    getDatasetRowValue(row, FIELD_ALIASES.ultrasound, "") ||
    getDatasetCategoricalOneHotValue(row, [
      { value: "Goiter", aliases: ["Echographie_goitre", "Ultrasound_goiter", "Echographie goitre"] },
      {
        value: "Goiter + nodules",
        aliases: ["Echographie_goitre + nodules", "Echographie_goitre_nodules", "Ultrasound_goiter_nodules"],
      },
      { value: "Normal volume", aliases: ["Echographie_volume normal", "Echographie_volume_normal", "Ultrasound_normal_volume"] },
    ]);
  const scintigraphyValue =
    getDatasetRowValue(row, FIELD_ALIASES.scintigraphy, "") ||
    getDatasetCategoricalOneHotValue(row, [
      { value: "High uptake", aliases: ["Scintigraphie_hypercaptante", "Scintigraphy_high_uptake"] },
      { value: "Normal uptake", aliases: ["Scintigraphie_normocaptante", "Scintigraphy_normal_uptake"] },
      { value: "Hot nodule", aliases: ["Scintigraphie_nodule chaud", "Scintigraphie_nodule_chaud", "Scintigraphy_hot_nodule"] },
    ]);
  const therapyValue =
    getDatasetRowValue(row, FIELD_ALIASES.therapy, "") ||
    getDatasetCategoricalOneHotValue(row, [
      { value: "Carbimazole", aliases: ["Therapie_ATS", "Therapy_ATS", "Traitement_ATS"] },
      { value: "Benzylthiouracile", aliases: ["Therapie_BTU", "Therapy_BTU", "Traitement_BTU"] },
    ]);

  return {
    name: patientName || patientId || "Imported patient",
    age: Number(getDatasetRowValue(row, ["Age", "Patient age", "AGE"], 0)) || 0,
    sex: normalizeImportedSex(getDatasetRowValue(row, ["Sex", "Gender", "Sexe"], "")),
    consultationReason: String(
      getDatasetRowValue(row, ["Consultation reason", "Reason", "Motif consultation"], "")
    ).trim(),
    stress: normalizeImportedToggleValue(getDatasetRowValue(row, ["Stress"], "")),
    palpitations: normalizeImportedToggleValue(getDatasetRowValue(row, ["Palpitations"], "")),
    spp: normalizeImportedToggleValue(getDatasetRowValue(row, ["SPP"], "")),
    amg: normalizeImportedToggleValue(getDatasetRowValue(row, ["AMG"], "")),
    diarrhea: normalizeImportedToggleValue(getDatasetRowValue(row, ["Diarrhea"], "")),
    tremors: normalizeImportedToggleValue(getDatasetRowValue(row, ["Tremors"], "")),
    agitation: normalizeImportedToggleValue(getDatasetRowValue(row, ["Agitation"], "")),
    moodDisorder: normalizeImportedToggleValue(getDatasetRowValue(row, ["Mood disorder", "MoodDisorder"], "")),
    sleepDisorder: normalizeImportedToggleValue(getDatasetRowValue(row, ["Sleep disorder", "SleepDisorder"], "")),
    sweating: normalizeImportedToggleValue(getDatasetRowValue(row, ["Excess sweating", "Sweating"], "")),
    heatIntolerance: normalizeImportedToggleValue(getDatasetRowValue(row, ["Heat intolerance", "HeatIntolerance"], "")),
    muscleWeakness: normalizeImportedToggleValue(getDatasetRowValue(row, ["Muscle weakness", "MuscleWeakness"], "")),
    goiter: normalizeImportedToggleValue(getDatasetRowValue(row, ["Goiter"], "")),
    goiterClassification: String(
      getDatasetRowValue(row, ["Goiter classification"], "")
    ).trim(),
    tsh: normalizeImportedMeasuredNumber(getDatasetRowValue(row, FIELD_ALIASES.tsh, "")),
    ft4: normalizeImportedMeasuredNumber(getDatasetRowValue(row, FIELD_ALIASES.ft4, "")),
    antiTpo: normalizeImportedStatusValue(antiTpoStatus),
    antiTpoTotal: normalizeImportedMeasuredNumber(getDatasetRowValue(row, FIELD_ALIASES.antiTpoTotal, "")),
    antiTg: normalizeImportedStatusValue(antiTgStatus),
    tsi: normalizeImportedStatusValue(tsiStatus),
    tsiLevel: normalizeImportedMeasuredNumber(getDatasetRowValue(row, FIELD_ALIASES.tsiLevel, "")),
    ultrasound: normalizeImportedUltrasound(ultrasoundValue),
    scintigraphy: normalizeImportedScintigraphy(scintigraphyValue),
    therapy: normalizeImportedTherapy(therapyValue),
    blockReplace: normalizeImportedToggleValue(getDatasetRowValue(row, ["Block and replace", "Block Replace"], "")),
    duration: normalizeImportedMeasuredNumber(
      getDatasetRowValue(row, ["Duration of treatment", "Treatment duration", "Duration", "dureeATS", "Duree ATS"], "")
    ),
    surgery: normalizeImportedToggleValue(getDatasetRowValue(row, ["Surgery"], "")),
    radioactiveIodine: normalizeImportedToggleValue(getDatasetRowValue(row, ["Radioactive iodine", "RadioactiveIodine"], "")),
    source: "Data Import",
    importedPatientId: patientId,
    importedDatasetName: dataset?.name || "",
  };
};

const requestImportedPrediction = async (row) => {
  const payload = buildImportedPredictionPayload(row);

  if (!payload.sex) {
    throw new Error("Sex is required for imported patient predictions. Please make sure the dataset contains a Sex or Gender column.");
  }

  if (datasetDoctorSessionBridge?.requestJson) {
    return datasetDoctorSessionBridge.requestJson("/predictions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  const session = getDatasetSelectionDoctorSession();
  const token = session?.token;

  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  const response = await fetch(`${datasetSelectionApiBaseUrl}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Unable to run the imported patient prediction.");
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
};

const setSelectionPredictionLoadingState = (isLoading) => {
  if (!runSelectedPredictionButton) return;
  runSelectedPredictionButton.disabled = isLoading || !selectedRowId;
  runSelectedPredictionButton.textContent = isLoading ? "Running..." : "Run Prediction";
  if (editSelectedRowButton) {
    editSelectedRowButton.disabled = isLoading || !selectedRowId;
  }
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

const reportSections = [
  {
    title: "Patient Information",
    fields: [
      ["Patient ID", "Patient ID"],
      ["Full Name", "Patient name"],
      ["Name", "Patient name"],
      ["Age", "Age"],
      ["Sex", "Sex"],
      ["Gender", "Sex"],
    ],
  },
  {
    title: "Symptoms and Clinical",
    fields: [
      ["Consultation reason", "Consultation reason"],
      ["Stress", "Stress"],
      ["Palpitations", "Palpitations"],
      ["SPP", "SPP"],
      ["AMG", "AMG"],
      ["Diarrhea", "Diarrhea"],
      ["Tremors", "Tremors"],
      ["Agitation", "Agitation"],
      ["Mood disorder", "Mood disorder"],
      ["Sleep disorder", "Sleep disorder"],
      ["Excess sweating", "Excess sweating"],
      ["Heat intolerance", "Heat intolerance"],
      ["Muscle weakness", "Muscle weakness"],
    ],
  },
  {
    title: "Thyroid Examination",
    fields: [
      ["Goiter", "Goiter"],
      ["Goiter classification", "Goiter classification"],
    ],
  },
  {
    title: "Biology",
    fields: [
      ["TSH", "TSH"],
      ["FT4", "FT4"],
      ["Anti-TPO", "Anti-TPO"],
      ["Anti-TPO total", "Anti-TPO total"],
      ["Anti-Tg", "Anti-Tg"],
      ["TSI", "TSI"],
      ["TSI level", "TSI level"],
    ],
  },
  {
    title: "Imaging",
    fields: [
      ["Ultrasound", "Ultrasound"],
      ["Scintigraphy", "Scintigraphy"],
    ],
  },
  {
    title: "Treatment",
    fields: [
      ["Therapy", "Therapy"],
      ["Block and replace", "Block and replace"],
      ["Duration of treatment", "Duration of treatment"],
      ["Surgery", "Surgery"],
      ["Radioactive iodine", "Radioactive iodine"],
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

const getRowValue = (row, keys) => {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return "Not provided";
};

const buildDatasetReportMarkup = (row, result) => {
  const badge = predictionBadge(result);
  const generatedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  const logoSrc = getEmbeddedReportLogo();
  const sectionMarkup = reportSections
    .map((section) => {
      const rows = section.fields
        .map(([key, label]) => {
          const value = getRowValue(row, [key]);
          return { label, value };
        })
        .filter((entry, index, entries) => {
          if (entry.value === "Not provided" && entries.some((candidate) => candidate.label === entry.label && candidate.value !== "Not provided")) {
            return false;
          }
          return true;
        });

      return `
        <section class="report-section">
          <div class="report-section-head">${escapeReportHtml(section.title)}</div>
          <table class="report-table">
            <tbody>
              ${rows
                .map(
                  (item) => `
                    <tr>
                      <th>${escapeReportHtml(item.label)}</th>
                      <td>${escapeReportHtml(item.value)}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </section>
      `;
    })
    .join("");

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
        <td colspan="2">No strong explanatory drivers were detected from this patient row.</td>
      </tr>
    `;

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
          .report-shell { max-width: 960px; margin: 0 auto; }
          .report-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 24px;
            padding-bottom: 24px;
            border-bottom: 2px solid #eef3fb;
          }
          .brand { display: flex; align-items: center; gap: 16px; }
          .brand img { width: 58px; height: 58px; object-fit: contain; }
          .brand strong { display: block; font-size: 24px; line-height: 1.1; }
          .brand span, .report-meta span {
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
          .summary-card, .result-card {
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
          .summary-card p, .result-copy {
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
                <span>Selected patient dataset review</span>
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
                This report summarizes the selected patient row from the imported dataset, the
                resulting relapse prediction, and the most influential variables identified by
                NOUFAR CDSS.
              </p>
            </article>
            <article class="result-card">
              <span class="result-badge">${escapeReportHtml(badge.label)}</span>
              <div class="result-score">${escapeReportHtml(result.probability)}%</div>
              <p class="result-copy">
                Estimated relapse probability based on the imported clinical, biological,
                imaging, and treatment variables.
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

const printSelectionReport = () => {
  if (!latestSelectionResult || !latestSelectedRow) return;

  const reportMarkup = buildDatasetReportMarkup(latestSelectedRow, latestSelectionResult);
  const reportBlob = new Blob([reportMarkup], { type: "text/html" });
  const reportUrl = URL.createObjectURL(reportBlob);
  const printWindow = window.open(reportUrl, "_blank", "width=1100,height=900");

  if (!printWindow) {
    URL.revokeObjectURL(reportUrl);
    return;
  }

  printWindow.addEventListener(
    "load",
    () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        setTimeout(() => URL.revokeObjectURL(reportUrl), 1000);
      }, 180);
    },
    { once: true }
  );
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

const getDataset = async () => {
  const requestedId = params.get("upload");

  if (requestedId) {
    return getPrivateDatasetImport(requestedId);
  }

  const uploads = await listPrivateDatasetImports();
  return uploads[0] || null;
};

const setPendingOutcome = () => {
  latestSelectionResult = null;
  outcomeState.classList.remove("relapse", "stable");
  outcomeState.classList.add("awaiting");
  outcomeHeading.textContent = "Awaiting Data Input";
  outcomeText.textContent =
    "Select a patient from the uploaded dataset to generate the individualized prediction result.";
  outcomeBadge.textContent = "Pending";
  outcomeBadge.className = "prediction-badge";
  outcomeProbability.textContent = "0%";
  outcomeBar.style.width = "0%";
  outcomeSummary.innerHTML = `
    <strong>Pending analysis</strong>
    <span>Choose a patient row to activate the prediction workflow.</span>
    <span>Probability and explanatory variables will appear after model execution.</span>
  `;
  impactList.innerHTML =
    '<div class="impact-empty">Run the prediction to view the most influential variables for this patient.</div>';
  if (printReportButton) {
    printReportButton.hidden = true;
  }
  setSelectionPredictionLoadingState(false);
};

const renderSelectionSummary = (row) => {
  if (!row) {
    selectionSummary.innerHTML = `
      <span class="selection-summary-kicker">Selection pending</span>
      <strong>No patient selected</strong>
      <span>Select one row from the dataset table to prepare the patient-level prediction.</span>
    `;
    runSelectedPredictionButton.disabled = true;
    if (editSelectedRowButton) {
      editSelectedRowButton.disabled = true;
    }
    return;
  }

  const validationErrors = getDatasetRowValidationErrors(row);
  const hasValidationErrors = validationErrors.length > 0;
  const patientName = row["Full Name"] || row.Name || row["Patient Name"] || "Selected patient";
  const patientId = row["Patient ID"] || row.ID || row["Patient Id"] || "Unspecified ID";
  const patientAge = row.Age || "Not provided";
  const patientSex = row.Sex || row.Gender || "Not provided";
  const consultationReason =
    getDatasetRowValue(row, ["Consultation reason", "Reason", "Motif consultation"], "") || "Not specified";
  const ultrasound = row.Ultrasound || "Not specified";
  const tsiProfile = row.TSI || "Not specified";

  selectionSummary.innerHTML = `
      <span class="selection-summary-kicker">Selected profile</span>
      <strong>${patientName}</strong>
      <span>Patient ID: ${patientId}</span>
      <span>Age: ${patientAge}</span>
      <span>Sex: ${patientSex}</span>
      <div class="selection-summary-meta">
        <span>${consultationReason}</span>
        <span>${ultrasound}</span>
        <span>TSI: ${tsiProfile}</span>
      </div>
      ${
        hasValidationErrors
          ? `<span class="selection-summary-error">${validationErrors.length} invalid value${
              validationErrors.length > 1 ? "s" : ""
            } detected. Please correct the highlighted cells before running prediction.</span>`
          : ""
      }
    `;
  setSelectionPredictionLoadingState(false);
  runSelectedPredictionButton.disabled = hasValidationErrors;
  if (editSelectedRowButton) {
    editSelectedRowButton.disabled = false;
  }
};

const renderDatasetTable = async () => {
  const response = await getPrivateDatasetImportRows(dataset.id, {
    page: currentPage,
    pageSize: 8,
    search: searchTerm,
    consultationReason: activeClinicalFilters.consultationReason,
    ultrasound: activeClinicalFilters.ultrasound,
    tsi: activeClinicalFilters.tsi,
  });

  const pagination = response?.pagination || {};
  currentPageRows = Array.isArray(response?.rows) ? response.rows : [];
  currentPage = Number(pagination.page) || 1;
  updateDatasetFilterStatus(Number(pagination.totalItems) || 0);

  datasetHead.innerHTML = `
    <tr>
      <th class="radio-cell">Select</th>
      <th class="dataset-row-action-cell">Actions</th>
      ${dataset.columns.map((column) => `<th>${column}</th>`).join("")}
    </tr>
  `;

  if (!currentPageRows.length) {
    datasetBody.innerHTML = `
      <tr>
        <td colspan="${dataset.columns.length + 2}">
          <div class="dataset-empty">No patients match the current search.</div>
        </td>
      </tr>
    `;
  } else {
    datasetBody.innerHTML = currentPageRows
      .map((row) => {
        const checked = row.__rowId === selectedRowId ? "checked" : "";
        const selectedClass = row.__rowId === selectedRowId ? " is-selected" : "";
        const invalidClass = getDatasetRowValidationErrors(row).length ? " has-invalid-data" : "";
        const isEditing = String(row.__rowId) === String(editingRowId);
        return `
          <tr class="selectable-row${selectedClass}${invalidClass}${isEditing ? " is-editing" : ""}" data-row-id="${row.__rowId}">
            <td class="radio-cell">
              <input
                class="row-picker"
                type="radio"
                name="selected-patient"
                value="${row.__rowId}"
                ${checked}
                aria-label="Select patient row"
              />
            </td>
            <td class="dataset-row-action-cell">
              ${
                isEditing
                  ? `
                    <div class="dataset-inline-actions">
                      <button class="dataset-inline-save" type="button" data-inline-save="${row.__rowId}" ${inlineEditSaving ? "disabled" : ""}>Save</button>
                      <button class="dataset-inline-cancel" type="button" data-inline-cancel="${row.__rowId}" ${inlineEditSaving ? "disabled" : ""}>Cancel</button>
                    </div>
                  `
                  : `<button class="dataset-row-edit-button" type="button" data-inline-edit="${row.__rowId}">Edit</button>`
              }
            </td>
            ${dataset.columns
              .map((column) => renderDatasetCell(row, column))
              .join("")}
          </tr>
        `;
      })
      .join("");
  }

  renderPagination(datasetPagination, currentPage, Number(pagination.totalPages) || 1, (nextPage) => {
    currentPage = nextPage;
    editingRowId = "";
    renderDatasetTable().catch((error) => {
      showDatasetSelectionToast(
        error instanceof Error ? error.message : "Unable to load this private dataset.",
        "danger"
      );
    });
  });

  renderSelectionSummary(latestSelectedRow);
};

const renderOutcome = (result) => {
  latestSelectionResult = result;
  const badge = predictionBadge(result);

  outcomeState.classList.remove("awaiting", "relapse", "stable");
  outcomeState.classList.add(result.relapse ? "relapse" : "stable");
  const selOutcomeCard = outcomeState?.closest(".outcome-card");
  if (selOutcomeCard) {
    selOutcomeCard.classList.remove("is-relapse", "is-stable");
    selOutcomeCard.classList.add(result.relapse ? "is-relapse" : "is-stable");
  }
  outcomeHeading.textContent = badge.label;
  outcomeText.textContent = result.relapse
    ? "The selected patient profile indicates a higher probability of relapse and may require closer surveillance."
    : "The selected patient profile indicates a lower probability of relapse under the imported conditions.";
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
    impactList.innerHTML =
      '<div class="impact-empty">No strong explanatory drivers were detected from this patient row.</div>';
    return;
  }

  const maxImpact = Math.max(
    ...result.contributions.map((item) => Math.abs(Number(item.amount) || 0)),
    0
  );

  result.contributions.forEach((item) => {
    const itemImpact = Math.abs(Number(item.amount) || 0);
    const relativePercent = maxImpact > 0 ? Math.round((itemImpact / maxImpact) * 100) : 0;
    const influence = Math.max(18, Math.min(relativePercent, 100));
    const impactItem = document.createElement("div");

    const tone = item.amount > 0 ? "is-warm" : "is-cool";
    impactItem.className = "impact-var";
    impactItem.innerHTML = `
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

    impactList.appendChild(impactItem);
  });

  if (printReportButton) {
    printReportButton.hidden = false;
  }
};

if (datasetMobileButton && datasetSidebar) {
  datasetMobileButton.addEventListener("click", () => {
    const isOpen = datasetSidebar.classList.toggle("is-open");
    datasetMobileButton.setAttribute("aria-expanded", String(isOpen));
  });
}

getDataset()
  .then(async (loadedDataset) => {
    dataset = loadedDataset;

    if (!dataset) {
      datasetName.textContent = "No dataset available";
      datasetSubtitle.textContent = "Upload an Excel or CSV file from the New Prediction page to continue.";
      datasetBody.innerHTML = `
        <tr>
          <td colspan="2">
            <div class="dataset-empty">No private dataset is available yet.</div>
          </td>
        </tr>
      `;
      renderPagination(datasetPagination, 1, 1, () => {});
      runSelectedPredictionButton.disabled = true;
      setPendingOutcome();
      return;
    }

    datasetName.textContent = dataset.name;
    datasetSubtitle.textContent = `Uploaded ${new Date(dataset.uploadedAt).toLocaleString()} - Select a patient to continue`;
    datasetTotal.textContent = String(dataset.rowCount || 0);
    datasetColumns.textContent = String(dataset.columns.length);
    datasetSheet.textContent = dataset.sheetName || "Dataset";
    populateDatasetFilterOptions();
    setPendingOutcome();
    await renderDatasetTable();
  })
  .catch((error) => {
    datasetName.textContent = "Private dataset unavailable";
    datasetSubtitle.textContent = "We could not load your private doctor dataset.";
    datasetBody.innerHTML = `
      <tr>
        <td colspan="2">
          <div class="dataset-empty">${error instanceof Error ? error.message : "Unable to load this private dataset."}</div>
        </td>
      </tr>
    `;
    renderPagination(datasetPagination, 1, 1, () => {});
    runSelectedPredictionButton.disabled = true;
    setPendingOutcome();
  });

if (datasetSearch) {
  datasetSearch.addEventListener("input", (event) => {
    searchTerm = event.target.value;
    currentPage = 1;
    selectedRowId = "";
    latestSelectedRow = null;
    editingRowId = "";
    renderDatasetTable().catch(() => {});
  });
}

datasetConsultationFilter?.addEventListener("change", (event) => {
  activeClinicalFilters.consultationReason = event.target.value;
  currentPage = 1;
  selectedRowId = "";
  latestSelectedRow = null;
  editingRowId = "";
  renderDatasetTable().catch(() => {});
});

datasetUltrasoundFilter?.addEventListener("change", (event) => {
  activeClinicalFilters.ultrasound = event.target.value;
  currentPage = 1;
  selectedRowId = "";
  latestSelectedRow = null;
  editingRowId = "";
  renderDatasetTable().catch(() => {});
});

datasetTsiFilter?.addEventListener("change", (event) => {
  activeClinicalFilters.tsi = event.target.value;
  currentPage = 1;
  selectedRowId = "";
  latestSelectedRow = null;
  editingRowId = "";
  renderDatasetTable().catch(() => {});
});

datasetFilterResetButton?.addEventListener("click", () => {
  activeClinicalFilters = {
    consultationReason: "",
    ultrasound: "",
    tsi: "",
  };

  if (datasetConsultationFilter) datasetConsultationFilter.value = "";
  if (datasetUltrasoundFilter) datasetUltrasoundFilter.value = "";
  if (datasetTsiFilter) datasetTsiFilter.value = "";
  currentPage = 1;
  selectedRowId = "";
  latestSelectedRow = null;
  editingRowId = "";
  renderDatasetTable().catch(() => {});
});

datasetExpandTableButton?.addEventListener("click", () => {
  setDatasetTableExpanded(!datasetTableCard?.classList.contains("is-expanded"));
});

if (datasetBody) {
  datasetBody.addEventListener("click", (event) => {
    const inlineEditButton = event.target.closest("[data-inline-edit]");
    if (inlineEditButton) {
      selectedRowId = inlineEditButton.dataset.inlineEdit || "";
      latestSelectedRow =
        currentPageRows.find((entry) => String(entry.__rowId) === String(selectedRowId)) || null;
      editingRowId = selectedRowId;
      renderSelectionSummary(latestSelectedRow);
      renderDatasetTable()
        .then(() => {
          getInlineEditRowElement(editingRowId)?.querySelector(".dataset-inline-input")?.focus();
        })
        .catch(() => {});
      return;
    }

    const inlineCancelButton = event.target.closest("[data-inline-cancel]");
    if (inlineCancelButton) {
      editingRowId = "";
      renderDatasetTable().catch(() => {});
      return;
    }

    const inlineSaveButton = event.target.closest("[data-inline-save]");
    if (inlineSaveButton) {
      const rowId = inlineSaveButton.dataset.inlineSave || editingRowId;
      saveInlineEditRow(rowId);
      return;
    }

    if (event.target.closest("[data-inline-edit-column]")) {
      return;
    }

    const interactiveTarget = event.target.closest(".row-picker, a, button, input, select, textarea");
    if (interactiveTarget) return;

    const row = event.target.closest(".selectable-row[data-row-id]");
    if (!row) return;
    if (editingRowId && String(row.dataset.rowId) !== String(editingRowId)) {
      showDatasetSelectionToast("Save or cancel the current row edit before selecting another row.", "danger");
      return;
    }

    selectedRowId = row.dataset.rowId || "";
    latestSelectedRow =
      currentPageRows.find((entry) => String(entry.__rowId) === String(selectedRowId)) || null;
    renderSelectionSummary(latestSelectedRow);
    renderDatasetTable().catch(() => {});
  });

  datasetBody.addEventListener("change", (event) => {
    const picker = event.target.closest(".row-picker");
    if (!picker) return;
    if (editingRowId && String(picker.value) !== String(editingRowId)) {
      showDatasetSelectionToast("Save or cancel the current row edit before selecting another row.", "danger");
      picker.checked = false;
      return;
    }
    if (editingRowId && String(picker.value) === String(editingRowId)) {
      return;
    }

    selectedRowId = picker.value;
    latestSelectedRow =
      currentPageRows.find((entry) => String(entry.__rowId) === String(selectedRowId)) || null;
    renderSelectionSummary(latestSelectedRow);
    renderDatasetTable().catch(() => {});
  });

  datasetBody.addEventListener("input", (event) => {
    if (!event.target.closest("[data-inline-edit-column]")) return;
    syncInlineEditValidation(editingRowId);
  });

  datasetBody.addEventListener("keydown", (event) => {
    if (!event.target.closest("[data-inline-edit-column]")) return;
    if (event.key === "Enter") {
      event.preventDefault();
      saveInlineEditRow(editingRowId);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      editingRowId = "";
      renderDatasetTable().catch(() => {});
    }
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !datasetTableCard?.classList.contains("is-expanded")) return;
  setDatasetTableExpanded(false);
});

if (editSelectedRowButton) {
  editSelectedRowButton.addEventListener("click", () => {
    const selectedRow =
      latestSelectedRow ||
      currentPageRows.find((row) => String(row.__rowId) === String(selectedRowId)) ||
      null;

    if (!selectedRow) {
      showDatasetSelectionToast("Select a dataset row before editing.", "danger");
      return;
    }

    editingRowId = String(selectedRow.__rowId || selectedRowId);
    renderDatasetTable()
      .then(() => {
        getInlineEditRowElement(editingRowId)?.querySelector(".dataset-inline-input")?.focus();
      })
      .catch(() => {});
  });
}

if (runSelectedPredictionButton) {
  runSelectedPredictionButton.addEventListener("click", async () => {
    if (!dataset || !selectedRowId) return;
    if (editingRowId) {
      showDatasetSelectionToast("Save or cancel the current row edit before running prediction.", "danger");
      return;
    }

    const selectedRow =
      latestSelectedRow ||
      currentPageRows.find((row) => String(row.__rowId) === String(selectedRowId)) ||
      null;
    if (!selectedRow) return;

    const validationErrors = getDatasetRowValidationErrors(selectedRow);
    if (validationErrors.length) {
      const firstError = validationErrors[0];
      showDatasetSelectionToast(
        `${firstError.label}: ${firstError.message} Please correct the highlighted dataset cells.`,
        "danger"
      );
      renderSelectionSummary(selectedRow);
      return;
    }

    latestSelectedRow = selectedRow;
    setSelectionPredictionLoadingState(true);

      try {
        const response = await requestImportedPrediction(selectedRow);
        renderOutcome(response.displayResult);
        if (datasetAiServiceWasUnavailable) {
          showDatasetSelectionToast("AI prediction service is available again. Prediction generated successfully.");
          datasetAiServiceWasUnavailable = false;
        } else {
          showDatasetSelectionToast("Prediction generated successfully.");
        }
      } catch (error) {
        if (error?.status === 409) {
          openDatasetDuplicateModal(
            error instanceof Error
              ? error.message
              : "A prediction already exists for this imported patient. Duplicate predictions are not allowed.",
            error?.payload?.existingPredictionId || ""
          );
        } else if (isAiServiceUnavailableError(error)) {
          datasetAiServiceWasUnavailable = true;
          openDatasetServiceErrorModal(
            error instanceof Error
              ? error.message
              : "The AI prediction service is currently unavailable. Please try again later or contact the system administrator."
          );
        } else {
        showDatasetSelectionToast(
          error instanceof Error ? error.message : "Unable to run the imported patient prediction.",
          "danger"
        );
      }
      setPendingOutcome();
      outcomeText.textContent =
        error instanceof Error
          ? error.message
          : "The prediction service is currently unavailable. Please try again.";
    } finally {
      setSelectionPredictionLoadingState(false);
    }
  });
}

if (printReportButton) {
  printReportButton.addEventListener("click", printSelectionReport);
}

datasetDuplicateCloseButtons.forEach((button) => {
  button.addEventListener("click", closeDatasetDuplicateModal);
});

if (datasetDuplicateOkButton) {
  datasetDuplicateOkButton.addEventListener("click", closeDatasetDuplicateModal);
}

if (datasetDuplicateViewButton) {
  datasetDuplicateViewButton.addEventListener("click", () => {
    if (!duplicatePredictionId) {
      closeDatasetDuplicateModal();
      return;
    }

    const returnTo = `${window.location.pathname.split("/").pop() || "dataset-selection.html"}${window.location.search}`;
    const targetId = duplicatePredictionId;
    closeDatasetDuplicateModal();
    window.location.href = `prediction-details.html?id=${encodeURIComponent(targetId)}&returnTo=${encodeURIComponent(returnTo)}`;
  });
}

datasetServiceErrorCloseButtons.forEach((button) => {
  button.addEventListener("click", closeDatasetServiceErrorModal);
});

if (datasetServiceErrorOkButton) {
  datasetServiceErrorOkButton.addEventListener("click", closeDatasetServiceErrorModal);
}

if (datasetServiceErrorSupportButton) {
  datasetServiceErrorSupportButton.addEventListener("click", () => {
    closeDatasetServiceErrorModal();
    if (typeof window.openNoufarSupportModal === "function") {
      window.openNoufarSupportModal({
        category: "Technical issue",
        priority: "High",
        subject: "AI prediction service unavailable",
        message: "The AI prediction service is currently unavailable from the dataset selection workflow.",
      });
    }
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (datasetDuplicateModal && !datasetDuplicateModal.hidden) {
    closeDatasetDuplicateModal();
  }
  if (datasetServiceErrorModal && !datasetServiceErrorModal.hidden) {
    closeDatasetServiceErrorModal();
  }
});

window.addEventListener("pageshow", () => {
  if (datasetDuplicateModal && !datasetDuplicateModal.hidden) {
    closeDatasetDuplicateModal();
  }
  if (datasetServiceErrorModal && !datasetServiceErrorModal.hidden) {
    closeDatasetServiceErrorModal();
  }
});
