const detailsPageSidebar = document.querySelector(".sidebar");
const detailsPageMobileButton = document.querySelector(".mobile-nav-button");
const rerunConfirmationModal = document.querySelector("#rerun-confirmation-modal");
const deletePredictionModal = document.querySelector("#delete-prediction-modal");
const predictionValidationModal = document.querySelector("#prediction-validation-modal");
const historyClinicalEntryModal = document.querySelector("#history-clinical-entry-modal");
const historyVersionDeleteModal = document.querySelector("#history-version-delete-modal");
const historyProbabilityChartModal = document.querySelector("#history-probability-chart-modal");
const detailServiceErrorModal = document.querySelector("#detail-service-error-modal");
const detailModalCloseControls = document.querySelectorAll("[data-close-details-modal]");
const historyClinicalEntryCloseControls = document.querySelectorAll("[data-close-history-clinical-entry]");
const historyVersionDeleteCloseControls = document.querySelectorAll("[data-close-history-version-delete]");
const historyProbabilityChartCloseControls = document.querySelectorAll("[data-close-history-probability-chart]");
const detailServiceErrorCloseControls = document.querySelectorAll("[data-close-detail-service-error]");
const openRerunPredictionButtons = Array.from(
  document.querySelectorAll("#open-rerun-prediction, [data-open-rerun-prediction]")
);
const backToDataSelectionButton = document.querySelector("#detail-back-to-selection");
const openDeletePredictionButton = document.querySelector("#open-delete-prediction");
const openValidationModalButton = document.querySelector("#open-validation-modal");
const openPatientHistoryButton = document.querySelector("#detail-open-history");
const inlineClinicalEntryForm = document.querySelector("#inline-clinical-entry-form");
const rerunPatientNameInput = document.querySelector("#detail-rerun-patient-name");
const rerunWarningNode = document.querySelector("#detail-rerun-warning");
const rerunSummaryCopy = document.querySelector("#rerun-summary-copy");
const rerunChangeList = document.querySelector("#rerun-change-list");
const confirmRerunPredictionButton = document.querySelector("#confirm-rerun-prediction");
const deleteSummaryNode = document.querySelector("#detail-delete-summary");
const confirmDeletePredictionButton = document.querySelector("#confirm-delete-prediction");
const validationPredictedNode = document.querySelector("#detail-validation-predicted");
const validationActualNode = document.querySelector("#detail-validation-actual");
const validationBadgeNode = document.querySelector("#detail-validation-badge");
const validationStatusHeadingNode = document.querySelector("#detail-validation-status-heading");
const validationDateNode = document.querySelector("#detail-validation-date");
const validationCopyNode = document.querySelector("#detail-validation-copy");
const validationModalSummary = document.querySelector("#detail-validation-modal-summary");
const validationOutcomeSelect = document.querySelector("#detail-validation-outcome");
const validationPreviewNode = document.querySelector("#detail-validation-preview");
const confirmValidationResultButton = document.querySelector("#confirm-validation-result");
const detailHistoryBody = document.querySelector("#detail-history-body");
const detailHistoryEmpty = document.querySelector("#detail-history-empty");
const detailHistoryChip = document.querySelector("#detail-history-chip");
const detailOutcomeCard = document.querySelector(".details-outcome-card");
const openHistoryChartButton = document.querySelector("#detail-open-history-chart");
const historyClinicalEntrySummary = document.querySelector("#history-clinical-entry-summary");
const historyClinicalEntryContent = document.querySelector("#history-clinical-entry-content");
const historyVersionDeleteSummary = document.querySelector("#history-version-delete-summary");
const confirmHistoryVersionDeleteButton = document.querySelector("#confirm-history-version-delete");
const historyProbabilityChartMeta = document.querySelector("#history-probability-chart-meta");
const historyProbabilityChartSvg = document.querySelector("#history-probability-chart-svg");
const historyProbabilityChartSummary = document.querySelector("#history-probability-chart-summary");
const printHistoryProbabilityChartButton = document.querySelector("#print-history-probability-chart");
const detailServiceErrorCopy = document.querySelector("#detail-service-error-copy");
const detailServiceErrorOkButton = document.querySelector("#detail-service-error-ok");
const detailServiceErrorSupportButton = document.querySelector("#detail-service-error-support");
const detailToggleInputs = Array.from(document.querySelectorAll(".detail-toggle-input"));
const detailRangeInputs = Array.from(document.querySelectorAll(".detail-range-input"));
const detailChipSelectGroups = Array.from(document.querySelectorAll(".detail-chip-select-group"));
const DETAIL_TRI_TOGGLE_STATES = ["Yes", "Not measured", "No"];
const REQUIRED_BIOLOGY_KEYS = ["tsh", "ft4", "antiTpo", "antiTpoTotal", "antiTg", "tsi", "tsiLevel"];
const predictionDetailsAuthStorageKey = "noufar-doctor-auth-v1";
const predictionDetailsApiBaseUrl = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
const predictionDetailsSessionBridge = window.NoufarDoctorSessionBridge || null;

if (detailsPageMobileButton && detailsPageSidebar) {
  detailsPageMobileButton.addEventListener("click", () => {
    const isOpen = detailsPageSidebar.classList.toggle("is-open");
    detailsPageMobileButton.setAttribute("aria-expanded", String(isOpen));
  });
}

const detailParams = new URLSearchParams(window.location.search);
const detailId = detailParams.get("id");
const detailReturnTo = detailParams.get("returnTo");
let detailEntry = detailId ? getPredictionById(detailId) : null;
let detailHistoryEntries = [];
let pendingHistoryDeleteEntry = null;

const isDatasetSelectionReturn = () => {
  if (!detailReturnTo) return false;
  const normalized = String(detailReturnTo || "").trim().toLowerCase();
  return normalized.startsWith("dataset-selection.html");
};

const getDetailReturnUrl = () => {
  const fallback = "dataset-selection.html";

  if (!detailReturnTo || !isDatasetSelectionReturn()) {
    return fallback;
  }

  const normalized = String(detailReturnTo || "").trim();
  if (!normalized || /^https?:/i.test(normalized) || normalized.startsWith("//")) {
    return fallback;
  }

  return normalized;
};

const hydrateDetailReturnButton = () => {
  if (!backToDataSelectionButton) return;

  if (!isDatasetSelectionReturn()) {
    backToDataSelectionButton.hidden = true;
    backToDataSelectionButton.style.display = "none";
    backToDataSelectionButton.href = "dataset-selection.html";
    return;
  }

  backToDataSelectionButton.href = getDetailReturnUrl();
  backToDataSelectionButton.hidden = false;
  backToDataSelectionButton.style.display = "";
};

hydrateDetailReturnButton();

const showPredictionDetailsToast = (message, variant = "success") => {
  if (typeof window.showNoufarToast === "function") {
    window.showNoufarToast(message, variant);
  }
};

const getPredictionDetailsDoctorSession = () => {
  try {
    const raw = window.localStorage.getItem(predictionDetailsAuthStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const getPredictionDetailsAuthHeaders = () => {
  const session = getPredictionDetailsDoctorSession();
  const token = session?.token;

  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
};

const requestPredictionDetailsJson = async (path, options = {}) => {
  if (predictionDetailsSessionBridge?.requestJson) {
    return predictionDetailsSessionBridge.requestJson(path, options);
  }

  const response = await fetch(`${predictionDetailsApiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...getPredictionDetailsAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || "Unable to complete this prediction request.");
    error.status = response.status;
    throw error;
  }

  return data;
};

const requestPredictionDetailsEntry = async (id) => {
  return requestPredictionDetailsJson(`/predictions/${encodeURIComponent(id)}`);
};

const updatePredictionDetailsEntry = async (id, payload) => {
  return requestPredictionDetailsJson(`/predictions/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};

const deletePredictionDetailsEntry = async (id) => {
  return requestPredictionDetailsJson(`/predictions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

const deletePredictionHistoryEntryRequest = async (predictionId, historyId) => {
  return requestPredictionDetailsJson(
    `/predictions/${encodeURIComponent(predictionId)}/history/${encodeURIComponent(historyId)}`,
    {
      method: "DELETE",
    }
  );
};

const requestPredictionDetailsHistory = async (id) => {
  const data = await requestPredictionDetailsJson(`/predictions/${encodeURIComponent(id)}/history`);
  return Array.isArray(data?.items) ? data.items : [];
};

const normalizePredictionDetailsEntry = (entry = {}) => {
  const normalizedBase =
    typeof normalizePredictionEntry === "function" ? normalizePredictionEntry(entry) : entry;

  return {
    ...normalizedBase,
    topFactors: Array.isArray(entry.topFactors) ? entry.topFactors : [],
    inputData: entry.inputData && typeof entry.inputData === "object" ? entry.inputData : {},
    modelName: entry.modelName || "LogisticRegression",
    predictedByName: entry.predictedByName || "",
    validatedByName: entry.validatedByName || "",
    createdAt: entry.createdAt || normalizedBase.createdAt || normalizedBase.analyzedAt || "",
    updatedAt: entry.updatedAt || normalizedBase.updatedAt || normalizedBase.analyzedAt || "",
  };
};

const DETAIL_STORAGE_KEY = "noufar-detail-profiles";
const DETAIL_HISTORY_STORAGE_KEY = "noufar-detail-prediction-history";

const baseDetailCatalog = {
  "NFR-2401": {
    age: 34,
    consultationReason: "Dysthyroidie",
    stress: "Yes",
    palpitations: "Yes",
    spp: "No",
    amg: "Yes",
    diarrhea: "No",
    tremors: "Yes",
    agitation: "Yes",
    moodDisorder: "No",
    sleepDisorder: "Yes",
    sweating: "Yes",
    heatIntolerance: "Yes",
    muscleWeakness: "Yes",
    goiter: "Yes",
    goiterClass: "1B",
    tsh: 0.03,
    ft4: 2.41,
    antiTpo: "Positive",
    antiTpoTotal: 482,
    antiTg: "Positive",
    tsi: "Positive",
    tsiLevel: 4.7,
    ultrasound: "Diffuse goiter with vascular pattern",
    scintigraphy: "High uptake",
    therapy: "Antithyroid therapy",
    duration: 18,
    blockReplace: "No",
    surgery: "No",
    radioactiveIodine: "No",
  },
  "NFR-2402": {
    age: 41,
    consultationReason: "Compression signs",
    stress: "No",
    palpitations: "No",
    spp: "No",
    amg: "No",
    diarrhea: "No",
    tremors: "No",
    agitation: "No",
    moodDisorder: "No",
    sleepDisorder: "No",
    sweating: "No",
    heatIntolerance: "No",
    muscleWeakness: "No",
    goiter: "No",
    goiterClass: "0",
    tsh: 1.84,
    ft4: 1.02,
    antiTpo: "Negative",
    antiTpoTotal: 36,
    antiTg: "Negative",
    tsi: "Negative",
    tsiLevel: 0.4,
    ultrasound: "Normal thyroid volume",
    scintigraphy: "Normal uptake",
    therapy: "Maintenance monitoring",
    duration: 9,
    blockReplace: "No",
    surgery: "No",
    radioactiveIodine: "No",
  },
  "NFR-2403": {
    age: 29,
    consultationReason: "Tumefaction",
    stress: "Yes",
    palpitations: "Yes",
    spp: "Yes",
    amg: "Yes",
    diarrhea: "Yes",
    tremors: "Yes",
    agitation: "Yes",
    moodDisorder: "Yes",
    sleepDisorder: "Yes",
    sweating: "Yes",
    heatIntolerance: "Yes",
    muscleWeakness: "Yes",
    goiter: "Yes",
    goiterClass: "2",
    tsh: 0.02,
    ft4: 2.56,
    antiTpo: "Positive",
    antiTpoTotal: 600,
    antiTg: "Positive",
    tsi: "Positive",
    tsiLevel: 5.2,
    ultrasound: "Goiter with nodules",
    scintigraphy: "High uptake",
    therapy: "Antithyroid therapy",
    duration: 24,
    blockReplace: "Yes",
    surgery: "No",
    radioactiveIodine: "No",
  },
};

const readStoredDetailProfiles = () => {
  try {
    const raw = window.localStorage.getItem(DETAIL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
};

const readStoredPredictionHistory = () => {
  try {
    const raw = window.localStorage.getItem(DETAIL_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
};

let storedDetailProfiles = readStoredDetailProfiles();
let storedPredictionHistory = readStoredPredictionHistory();
let pendingRerunProfile = null;

const persistDetailProfiles = () => {
  try {
    window.localStorage.setItem(DETAIL_STORAGE_KEY, JSON.stringify(storedDetailProfiles));
  } catch (error) {
    // Ignore storage failures for offline local preview.
  }
};

const persistStoredPredictionHistory = () => {
  try {
    window.localStorage.setItem(DETAIL_HISTORY_STORAGE_KEY, JSON.stringify(storedPredictionHistory));
  } catch (error) {
    // Ignore storage failures for offline local preview.
  }
};

const detailFieldMap = {
  age: "#detail-age",
  sex: "#detail-sex",
  consultationReason: "#detail-consultation-reason",
  stress: "#detail-stress",
  palpitations: "#detail-palpitations",
  spp: "#detail-spp",
  amg: "#detail-amg",
  diarrhea: "#detail-diarrhea",
  tremors: "#detail-tremors",
  agitation: "#detail-agitation",
  moodDisorder: "#detail-mood-disorder",
  sleepDisorder: "#detail-sleep-disorder",
  sweating: "#detail-sweating",
  heatIntolerance: "#detail-heat-intolerance",
  muscleWeakness: "#detail-muscle-weakness",
  goiter: "#detail-goiter",
  goiterClass: "#detail-goiter-class",
  tsh: "#detail-tsh",
  ft4: "#detail-ft4",
  antiTpo: "#detail-anti-tpo",
  antiTpoTotal: "#detail-anti-tpo-total",
  antiTg: "#detail-anti-tg",
  tsi: "#detail-tsi",
  tsiLevel: "#detail-tsi-level",
  ultrasound: "#detail-ultrasound",
  scintigraphy: "#detail-scintigraphy",
  therapy: "#detail-therapy",
  duration: "#detail-duration",
  blockReplace: "#detail-block-replace",
  surgery: "#detail-surgery",
  radioactiveIodine: "#detail-rai",
};

const defaultDetailProfile = {
  age: 35,
  sex: "Female",
  consultationReason: "Dysthyroidie",
  stress: "No",
  palpitations: "No",
  spp: "No",
  amg: "No",
  diarrhea: "No",
  tremors: "No",
  agitation: "No",
  moodDisorder: "No",
  sleepDisorder: "No",
  sweating: "No",
  heatIntolerance: "No",
  muscleWeakness: "No",
  goiter: "No",
  goiterClass: "0",
  tsh: 1.2,
  ft4: 1.1,
  antiTpo: "Negative",
  antiTpoTotal: 40,
  antiTg: "Negative",
  tsi: "Negative",
  tsiLevel: 0.5,
  ultrasound: "Normal thyroid volume",
  scintigraphy: "Normal uptake",
  therapy: "Maintenance monitoring",
  duration: 12,
  blockReplace: "No",
  surgery: "No",
  radioactiveIodine: "No",
};

const normalizeDetailConsultationReason = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return defaultDetailProfile.consultationReason;
  if (normalized === "dysthyroidie") return "Dysthyroidie";
  if (normalized === "signes de compression") return "Compression signs";
  if (normalized === "other" || normalized === "follow-up control") return "Other";
  return String(value ?? "").trim();
};

const normalizeDetailSex = (value, fallback = defaultDetailProfile.sex) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "female") return "Female";
  if (normalized === "male") return "Male";
  return fallback;
};

const normalizeDetailUltrasound = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return defaultDetailProfile.ultrasound;
  if (normalized === "goiter" || normalized === "goitre") return "Diffuse goiter with vascular pattern";
  if (normalized === "normal volume" || normalized === "volume normal") return "Normal thyroid volume";
  if (normalized === "goiter + nodules" || normalized === "goitre + nodules") return "Goiter with nodules";
  return String(value ?? "").trim();
};

const normalizeDetailScintigraphy = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return defaultDetailProfile.scintigraphy;
  if (normalized === "high uptake" || normalized === "hypercaptante") return "High uptake";
  if (normalized === "hot nodule" || normalized === "nodule chaud") return "Hot nodule";
  if (normalized === "normal uptake" || normalized === "normocaptante") return "Normal uptake";
  return String(value ?? "").trim();
};

const normalizeDetailNumericOrNotMeasured = (value, fallback) => {
  if (String(value ?? "").trim().toLowerCase() === "not measured") {
    return "Not measured";
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDetailProfile = (profile, entry) => ({
  ...defaultDetailProfile,
  ...profile,
  age: normalizeDetailNumericOrNotMeasured(profile?.age ?? entry.age, defaultDetailProfile.age),
  sex: normalizeDetailSex(profile?.sex ?? entry?.sex, defaultDetailProfile.sex),
  antiTpoTotal: normalizeDetailNumericOrNotMeasured(profile?.antiTpoTotal, defaultDetailProfile.antiTpoTotal),
  tsiLevel: normalizeDetailNumericOrNotMeasured(profile?.tsiLevel, defaultDetailProfile.tsiLevel),
  tsh: normalizeDetailNumericOrNotMeasured(profile?.tsh, defaultDetailProfile.tsh),
  ft4: normalizeDetailNumericOrNotMeasured(profile?.ft4, defaultDetailProfile.ft4),
  duration: normalizeDetailNumericOrNotMeasured(profile?.duration, defaultDetailProfile.duration),
  therapy: profile?.therapy ?? profile?.treatment ?? defaultDetailProfile.therapy,
  radioactiveIodine:
    profile?.radioactiveIodine ?? profile?.rai ?? defaultDetailProfile.radioactiveIodine,
});

const getGeneratedDetailProfile = (entry) => {
  const index = Math.max(0, patientPredictions.findIndex((item) => item.id === entry.id));
  const consultationReasons = ["Dysthyroidie", "Compression signs", "Tumefaction", "Other"];
  const ultrasoundFindings = [
    "Diffuse goiter with vascular pattern",
    "Normal thyroid volume",
    "Goiter with nodules",
    "Mild heterogeneous texture",
  ];
  const scintigraphyFindings = ["High uptake", "Normal uptake", "Hot nodule", "Normal uptake"];
  const treatmentPlans = ["Antithyroid therapy", "Maintenance monitoring", "Block and replace", "Observation plan"];
  const classification = ["0", "1A", "1B", "2", "3"];
  const highRisk = entry.result === "Relapse";

  return normalizeDetailProfile({
    age: entry.age,
    sex: normalizeDetailSex(entry.sex, defaultDetailProfile.sex),
    consultationReason: consultationReasons[index % consultationReasons.length],
    stress: highRisk ? "Yes" : "No",
    palpitations: entry.probability >= 60 ? "Yes" : "No",
    spp: entry.probability >= 62 ? "Yes" : "No",
    amg: entry.probability >= 68 ? "Yes" : "No",
    diarrhea: entry.probability >= 58 ? "Yes" : "No",
    tremors: entry.probability >= 70 ? "Yes" : "No",
    agitation: entry.probability >= 64 ? "Yes" : "No",
    moodDisorder: entry.probability >= 60 ? "Yes" : "No",
    sleepDisorder: entry.probability >= 57 ? "Yes" : "No",
    sweating: entry.probability >= 61 ? "Yes" : "No",
    heatIntolerance: entry.probability >= 65 ? "Yes" : "No",
    muscleWeakness: entry.probability >= 56 ? "Yes" : "No",
    goiter: index % 2 === 0 ? "Yes" : "No",
    goiterClass: classification[(index + 1) % classification.length],
    tsh: Number(Math.max(0.03, ((100 - entry.probability) / 35).toFixed(2))),
    ft4: Number((0.85 + entry.probability / 60).toFixed(2)),
    antiTpo: highRisk ? "Positive" : "Negative",
    antiTpoTotal: Math.round(65 + entry.probability * 4.8),
    antiTg: index % 3 === 0 ? "Positive" : "Negative",
    tsi: highRisk ? "Positive" : "Negative",
    tsiLevel: Number((0.4 + entry.probability / 18).toFixed(2)),
    ultrasound: ultrasoundFindings[index % ultrasoundFindings.length],
    scintigraphy: scintigraphyFindings[index % scintigraphyFindings.length],
    therapy: treatmentPlans[index % treatmentPlans.length],
    duration: 8 + index * 3,
    blockReplace: index % 3 === 0 ? "Yes" : "No",
    surgery: "No",
    radioactiveIodine: index % 5 === 0 ? "Yes" : "No",
  }, entry);
};

const buildDetailProfileFromInputData = (entry) => {
  const input = entry?.inputData;
  if (!input || typeof input !== "object") return null;
  const asTriValue = (value) => {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (value === true || normalized === "yes" || normalized === "true") return "Yes";
    if (value === false || normalized === "no" || normalized === "false") return "No";
    return "Not measured";
  };

  return normalizeDetailProfile(
    {
      age: input.age ?? entry.age ?? defaultDetailProfile.age,
      sex: normalizeDetailSex(input.sex ?? entry.sex, defaultDetailProfile.sex),
      consultationReason: normalizeDetailConsultationReason(
        input.consultationReason ?? input.consultReason ?? entry.consultationReason
      ),
      stress: asTriValue(input.stress),
      palpitations: asTriValue(input.palpitations),
      spp: asTriValue(input.spp),
      amg: asTriValue(input.amg),
      diarrhea: asTriValue(input.diarrhea),
      tremors: asTriValue(input.tremors),
      agitation: asTriValue(input.agitation),
      moodDisorder: asTriValue(input.moodDisorder),
      sleepDisorder: asTriValue(input.sleepDisorder),
      sweating: asTriValue(input.sweating ?? input.excessSweating),
      heatIntolerance: asTriValue(input.heatIntolerance),
      muscleWeakness: asTriValue(input.muscleWeakness),
      goiter: asTriValue(input.goiter),
      goiterClass: input.goiterClassification || defaultDetailProfile.goiterClass,
      tsh: input.tsh ?? defaultDetailProfile.tsh,
      ft4: input.ft4 ?? defaultDetailProfile.ft4,
      antiTpo: input.antiTPO || defaultDetailProfile.antiTpo,
      antiTpoTotal: input.antiTPOtotal ?? defaultDetailProfile.antiTpoTotal,
      antiTg: input.antiTg || defaultDetailProfile.antiTg,
      tsi: input.TSI || defaultDetailProfile.tsi,
      tsiLevel: input.TSIlevel ?? defaultDetailProfile.tsiLevel,
      ultrasound: normalizeDetailUltrasound(input.ultrasound),
      scintigraphy: normalizeDetailScintigraphy(input.scintigraphy),
      therapy: input.therapy || defaultDetailProfile.therapy,
      duration: input.duration ?? entry.duration ?? defaultDetailProfile.duration,
      blockReplace: asTriValue(input.blockReplace),
      surgery: asTriValue(input.surgery),
      radioactiveIodine: asTriValue(input.radioactiveIodine),
    },
    entry
  );
};

const getDetailProfile = (entry) => {
  const inputProfile = buildDetailProfileFromInputData(entry);
  if (inputProfile) {
    return inputProfile;
  }
  if (storedDetailProfiles[entry.id]) {
    return normalizeDetailProfile(storedDetailProfiles[entry.id], entry);
  }
  if (baseDetailCatalog[entry.id]) {
    return normalizeDetailProfile(baseDetailCatalog[entry.id], entry);
  }
  return getGeneratedDetailProfile(entry);
};

const renderLoadingState = () => {
  const titleNode = document.querySelector("#detail-page-title");
  const summaryNode = document.querySelector("#detail-page-summary");
  const pillsNode = document.querySelector("#detail-page-pills");

  if (titleNode) titleNode.textContent = "Loading prediction record";
  if (summaryNode) {
    summaryNode.textContent = "The patient-level dossier is being retrieved from the clinical database.";
  }
  if (pillsNode) pillsNode.innerHTML = "";
};

const addDays = (dateString, days) => {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date;
};

const formatTimelineDate = (date) =>
  date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const getTimelineDateValue = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isSameTimelineMoment = (left, right) => {
  const leftDate = getTimelineDateValue(left);
  const rightDate = getTimelineDateValue(right);
  if (!leftDate || !rightDate) return false;
  return Math.abs(leftDate.getTime() - rightDate.getTime()) < 1000;
};

const buildTimeline = (entry) => {
  const createdAt = getTimelineDateValue(entry.createdAt || entry.analyzedAt);
  const analyzedAt = getTimelineDateValue(entry.analyzedAt || entry.updatedAt || entry.createdAt);
  const updatedAt = getTimelineDateValue(entry.updatedAt || entry.analyzedAt || entry.createdAt);
  const validationAt = getTimelineDateValue(entry.validationRecordedAt);
  const clinician = formatPredictedByDisplay(entry.predictedByName || "");
  const modelLabel = String(entry.modelName || "Prediction model").trim();
  const timeline = [];

  if (createdAt) {
    timeline.push({
      title: "Clinical data captured",
      copy: `${entry.source} intake was saved for ${entry.patient} and added to the prediction workflow.`,
      when: createdAt,
    });
  }

  if (analyzedAt) {
    timeline.push({
      title: "Prediction model executed",
      copy: `The AI generated a ${String(entry.result || "").toLowerCase()} result with ${entry.probability}% probability.`,
      when: analyzedAt,
    });
  }

  if (
    updatedAt &&
    !isSameTimelineMoment(updatedAt, createdAt) &&
    !isSameTimelineMoment(updatedAt, validationAt)
  ) {
    timeline.push({
      title: "Clinical entry updated",
      copy: `${clinician} updated the stored clinical entry and re-ran the prediction for this patient.`,
      when: updatedAt,
    });
  }

  if (entry.actualOutcome && entry.validationStatus && entry.validationStatus !== "Pending" && validationAt) {
    timeline.push({
      title: "Real outcome recorded",
      copy:
        entry.validationStatus === "Correct"
          ? `Doctor confirmed the real result as ${entry.actualOutcome}, matching the prediction.`
          : `Doctor recorded the real result as ${entry.actualOutcome}, showing the prediction was incorrect.`,
      when: validationAt,
    });
  }

  return timeline
    .sort((a, b) => a.when.getTime() - b.when.getTime())
    .map((item) => ({
      title: item.title,
      copy: item.copy,
      date: formatTimelineDate(item.when),
    }));
};

const getValidationStatusMeta = (entry) => {
  const actualOutcome = entry.actualOutcome || "";
  const validationStatus = entry.validationStatus || "Pending";
  const recordedDate = entry.validationRecordedAt || "";

  if (!actualOutcome || validationStatus === "Pending") {
    return {
      predicted: entry.result,
      actual: "Awaiting confirmation",
      badgeLabel: "Pending Review",
      badgeTone: "pending",
      dateLabel: "Awaiting doctor update",
      copy: "No confirmed outcome has been saved yet. Record the observed patient result to validate this prediction.",
      actionLabel: "Record Real Outcome",
    };
  }

  return {
    predicted: entry.result,
    actual: actualOutcome,
    badgeLabel: validationStatus,
    badgeTone: validationStatus.toLowerCase(),
    dateLabel: recordedDate ? `Recorded ${formatDate(recordedDate, true)}` : "Recorded",
    copy:
      validationStatus === "Correct"
        ? `The confirmed patient outcome matches the model output. This case now supports validated model performance tracking.`
        : `The confirmed patient outcome differs from the model output. This case is stored as an incorrect prediction for review.`,
    actionLabel: "Update Real Outcome",
  };
};

const getDetailHistoryValidationMeta = (entry) => {
  const actualOutcome = entry.actualOutcome || "";
  const validationStatus = entry.validationStatus || "Pending";

  if (!actualOutcome || validationStatus === "Pending") {
    return {
      label: "Awaiting confirmation",
      tone: "pending",
    };
  }

  return {
    label: actualOutcome,
    tone: validationStatus.toLowerCase(),
  };
};

const buildHistoryEntryProfile = (entry = {}) => {
  const input = entry.inputData && typeof entry.inputData === "object" ? entry.inputData : null;
  if (input) {
    return buildDetailProfileFromInputData({
      ...entry,
      inputData: input,
    });
  }

  return normalizeDetailProfile(
    {
      age: entry.age,
      sex: entry.sex,
      consultationReason: entry.consultationReason,
      duration: entry.duration,
    },
    entry
  );
};

const buildHistoricalClinicalEntryModal = (entry = {}) => {
  const profile = buildHistoryEntryProfile(entry);
  const sections = [
    {
      title: "Patient Information",
      items: [
        ["Patient name", entry.patientName || entry.patient || "Unknown patient"],
        ["Age", `${profile.age} years`],
        ["Sex", profile.sex],
        ["Consultation reason", profile.consultationReason],
      ],
    },
    {
      title: "Symptoms / Clinical",
      items: [
        ["Stress", profile.stress],
        ["Palpitations", profile.palpitations],
        ["SPP", profile.spp],
        ["AMG", profile.amg],
        ["Diarrhea", profile.diarrhea],
        ["Tremors", profile.tremors],
        ["Agitation", profile.agitation],
        ["Mood disorder", profile.moodDisorder],
        ["Sleep disorder", profile.sleepDisorder],
        ["Excess sweating", profile.sweating],
        ["Heat intolerance", profile.heatIntolerance],
        ["Muscle weakness", profile.muscleWeakness],
      ],
    },
    {
      title: "Thyroid Examination",
      items: [
        ["Goiter", profile.goiter],
        ["Goiter classification", profile.goiterClass],
      ],
    },
    {
      title: "Biology",
      items: [
        ["TSH", formatTsh(profile.tsh)],
        ["FT4", formatFt4(profile.ft4)],
        ["Anti-TPO", profile.antiTpo],
        ["Anti-TPO total", String(profile.antiTpoTotal ?? "")],
        ["Anti-Tg", profile.antiTg],
        ["TSI", profile.tsi],
        ["TSI level", String(profile.tsiLevel ?? "")],
      ],
    },
    {
      title: "Imaging",
      items: [
        ["Ultrasound", profile.ultrasound],
        ["Scintigraphy", profile.scintigraphy],
      ],
    },
    {
      title: "Treatment",
      items: [
        ["Therapy", profile.therapy],
        ["Duration", `${profile.duration} months`],
        ["Block and replace", profile.blockReplace],
        ["Surgery", profile.surgery],
        ["Radioactive iodine", profile.radioactiveIodine],
      ],
    },
  ];

  return sections
    .map(
      (section) => `
        <article class="details-clinical-card">
          <h3>${section.title}</h3>
          <div class="details-definition-list">
            ${section.items
              .map(
                ([label, value]) => `
                  <div class="details-definition-row">
                    <span>${label}</span>
                    <strong>${value || "Not provided"}</strong>
                  </div>
                `
              )
              .join("")}
          </div>
        </article>
      `
    )
    .join("");
};

const openHistoryClinicalEntryModal = (entryId) => {
  const entry = detailHistoryEntries.find((item) => String(item.id) === String(entryId));
  if (!entry || !historyClinicalEntrySummary || !historyClinicalEntryContent || !historyClinicalEntryModal) {
    return;
  }

  historyClinicalEntrySummary.innerHTML = `
    <div class="details-history-modal-meta">
      <strong>${entry.patientName || entry.patient || "Unknown patient"}</strong>
      <span>Version v${entry.versionNumber} · ${entry.isCurrent ? "Current record" : "Archived before re-run"} · ${formatDate(entry.recordedAt || entry.updatedAt || entry.createdAt, true)}</span>
    </div>
    <div class="details-history-modal-badges">
      <span class="details-history-status-badge ${entry.isCurrent ? "current" : "archived"}">
        ${entry.isCurrent ? "Active record" : "Historical version"}
      </span>
      <span class="dashboard-inline-chip">${entry.result || "Pending"} · ${Number(entry.probability || 0)}%</span>
    </div>
  `;
  historyClinicalEntryContent.innerHTML = buildHistoricalClinicalEntryModal(entry);
  historyClinicalEntryModal.hidden = false;
  document.body.style.overflow = "hidden";
};

const openHistoryVersionDeleteModal = (entryId) => {
  const entry = detailHistoryEntries.find((item) => String(item.id) === String(entryId));
  if (!entry || entry.isCurrent || !historyVersionDeleteModal || !historyVersionDeleteSummary) {
    return;
  }

  pendingHistoryDeleteEntry = entry;
  historyVersionDeleteSummary.innerHTML = `
    <strong>${entry.patientName || entry.patient || "Unknown patient"}</strong>
    <span>Version v${entry.versionNumber} · ${formatDate(entry.recordedAt || entry.updatedAt || entry.createdAt, true)} · ${entry.result || "Pending"} · ${Number(entry.probability || 0)}%</span>
  `;
  historyVersionDeleteModal.hidden = false;
  document.body.style.overflow = "hidden";
};

const getStoredPredictionHistoryEntries = (predictionId) => {
  const key = String(predictionId || "").trim();
  if (!key) return [];
  return Array.isArray(storedPredictionHistory[key]) ? storedPredictionHistory[key] : [];
};

const removeStoredPredictionHistoryEntry = (predictionId, entryId) => {
  const key = String(predictionId || "").trim();
  if (!key) return;

  const currentEntries = getStoredPredictionHistoryEntries(key);
  storedPredictionHistory[key] = currentEntries.filter((entry) => String(entry.id) !== String(entryId));
  persistStoredPredictionHistory();
};

const mergePredictionHistoryEntries = (remoteEntries = [], predictionId = "") => {
  const localEntries = getStoredPredictionHistoryEntries(predictionId);
  const remoteArchivedVersions = new Set(
    remoteEntries
      .filter((entry) => entry && !entry.isCurrent)
      .map((entry) => Number(entry.versionNumber) || 0)
      .filter((value) => value > 0)
  );
  const merged = [];
  const seenKeys = new Set();

  [...remoteEntries, ...localEntries].forEach((entry) => {
    if (!entry) return;
    if (!entry.isCurrent && remoteArchivedVersions.has(Number(entry.versionNumber) || 0) && String(entry.id).startsWith("local-")) {
      return;
    }
    const key = [
      entry.isCurrent ? "current" : "archived",
      entry.versionNumber || "",
      entry.recordedAt || "",
      entry.result || "",
      entry.probability || "",
    ].join("|");

    if (seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    merged.push(entry);
  });

  return merged.sort((left, right) => {
    if (left.isCurrent && !right.isCurrent) return -1;
    if (!left.isCurrent && right.isCurrent) return 1;

    const versionDiff = (Number(right.versionNumber) || 0) - (Number(left.versionNumber) || 0);
    if (versionDiff !== 0) return versionDiff;

    return new Date(right.recordedAt || 0) - new Date(left.recordedAt || 0);
  });
};

const printHistoryClinicalEntry = (entryId) => {
  const entry = detailHistoryEntries.find((item) => String(item.id) === String(entryId));
  if (!entry) return;

  const popup = window.open("", "_blank", "width=1100,height=900");
  if (!popup) {
    showPredictionDetailsToast("Unable to open the print preview window.", "danger");
    return;
  }

  const summary = `
    <div class="print-summary">
      <strong>${entry.patientName || entry.patient || "Unknown patient"}</strong>
      <span>Version v${entry.versionNumber} · ${entry.isCurrent ? "Current record" : "Archived before re-run"} · ${formatDate(entry.recordedAt || entry.updatedAt || entry.createdAt, true)}</span>
      <span>${entry.result || "Pending"} · ${Number(entry.probability || 0)}%</span>
    </div>
  `;

  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Clinical Entry History Print</title>
        <style>
          body { font-family: "Segoe UI", Arial, sans-serif; margin: 28px; color: #12305a; }
          h1 { margin: 0 0 10px; font-size: 28px; }
          p { margin: 0 0 18px; color: #5f7592; }
          .print-summary { display: grid; gap: 6px; margin-bottom: 22px; padding: 16px 18px; border: 1px solid #dde8f5; border-radius: 16px; background: #f8fbff; }
          .print-summary strong { font-size: 18px; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
          .card { padding: 16px; border: 1px solid #e6eef8; border-radius: 18px; background: #fff; break-inside: avoid; }
          .card h3 { margin: 0 0 14px; font-size: 18px; }
          .list { display: grid; gap: 10px; }
          .row { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 10px; border-bottom: 1px solid #edf2fb; }
          .row:last-child { border-bottom: 0; padding-bottom: 0; }
          .row span { color: #6881a0; font-size: 13px; }
          .row strong { max-width: 58%; text-align: right; font-size: 13px; }
        </style>
      </head>
      <body>
        <h1>Historical Clinical Entry</h1>
        <p>Saved prediction version print preview from the NOUFAR CDSS patient history table.</p>
        ${summary}
        <div class="grid">${buildHistoricalClinicalEntryModal(entry)}</div>
        <script>
          window.addEventListener("load", () => {
            window.print();
          });
        <\/script>
      </body>
    </html>
  `);
  popup.document.close();
};

const printHistoryProbabilityChart = () => {
  if (!historyProbabilityChartSvg || !historyProbabilityChartMeta || !historyProbabilityChartSummary) {
    return;
  }

  const printableEntries = [...detailHistoryEntries]
    .filter((entry) => Number.isFinite(Number(entry.probability)))
    .sort(
      (left, right) =>
        new Date(left.recordedAt || left.updatedAt || left.createdAt || 0) -
        new Date(right.recordedAt || right.updatedAt || right.createdAt || 0)
    );
  const firstEntry = printableEntries[0] || null;
  const latestEntry = printableEntries[printableEntries.length - 1] || null;
  const patientInfo = detailEntry || latestEntry || {};
  const latestProbability = Number(latestEntry?.probability || 0);
  const firstProbability = Number(firstEntry?.probability || 0);
  const deltaValue = latestProbability - firstProbability;
  const riskLevel = latestProbability >= 70 ? "High" : latestProbability >= 40 ? "Moderate" : "Low";

  const popup = window.open("", "_blank", "width=1280,height=960");
  if (!popup) {
    showPredictionDetailsToast("Unable to open the print preview window.", "danger");
    return;
  }

  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Probability Risk Over Time</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; color: #12305a; background: #ffffff; }
          h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.1; }
          p { margin: 0 0 16px; color: #5f7592; }
          .page { width: 100%; }
          .meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; margin-bottom: 18px; padding: 16px 18px; border: 1px solid #dde8f5; border-radius: 18px; background: #f8fbff; }
          .meta > div { padding: 0 14px; border-right: 1px solid #e2ebf7; min-width: 0; }
          .meta > div:last-child { border-right: 0; }
          .meta strong { display: block; margin-bottom: 4px; color: #5e7796; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
          .meta span { display: block; color: #12305a; font-size: 15px; font-weight: 800; word-break: break-word; }
          .chart-shell { padding: 18px; border: 1px solid #dde8f5; border-radius: 22px; background: #ffffff; }
          .chart-shell h2 { margin: 0 0 6px; font-size: 24px; color: #173765; line-height: 1.15; }
          .chart-shell .sub { margin: 0 0 14px; color: #6881a0; font-size: 15px; }
          .chart-svg-wrap { border-radius: 18px; overflow: hidden; }
          svg { display: block; width: 100%; height: auto; max-height: 168mm; }
          .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 14px; border: 1px solid #dde8f5; border-radius: 18px; overflow: hidden; }
          .summary-card { padding: 14px 16px; border-right: 1px solid #dde8f5; }
          .summary-card:last-child { border-right: 0; }
          .summary-card strong { display: block; color: #3f5c85; font-size: 12px; font-weight: 800; }
          .summary-card b { display: block; margin-top: 4px; color: #173765; font-size: 26px; font-weight: 900; line-height: 1.05; }
          .summary-card b.is-low { color: #2d8a65; }
          .summary-card b.is-moderate { color: #3f8e57; }
          .summary-card b.is-high { color: #d24f42; }
          .summary-card span { display: block; margin-top: 4px; color: #6982a1; font-size: 13px; line-height: 1.35; }
          .note { margin-top: 10px; color: #6f86a4; font-size: 12px; font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="page">
        <h1>Probability Risk Over Time</h1>
        <p>Review how the saved relapse probability changed across prediction versions for this patient.</p>
        <div class="meta">
          <div>
            <strong>Patient ID</strong>
            <span>${escapeSvgText(detailId || patientInfo.predictionId || patientInfo.id || "Unknown")}</span>
          </div>
          <div>
            <strong>Patient name</strong>
            <span>${escapeSvgText(patientInfo.patientName || patientInfo.patient || "Unknown patient")}</span>
          </div>
          <div>
            <strong>Sex</strong>
            <span>${escapeSvgText(patientInfo.sex || "Not specified")}</span>
          </div>
          <div>
            <strong>Age</strong>
            <span>${escapeSvgText(patientInfo.age || "")}</span>
          </div>
        </div>
        <div class="chart-shell">
          <h2>Estimated Probability of Relapse Over Time</h2>
          <p class="sub">Each point represents a saved prediction version.</p>
          <div class="chart-svg-wrap">${historyProbabilityChartSvg.outerHTML}</div>
          <div class="summary">
            <div class="summary-card">
              <strong>Latest estimate</strong>
              <b>${latestProbability}%</b>
              <span>as of ${escapeSvgText(formatDate(latestEntry?.recordedAt || latestEntry?.updatedAt || latestEntry?.createdAt, false))} (${escapeSvgText(`v${latestEntry?.versionNumber || printableEntries.length}`)})</span>
            </div>
            <div class="summary-card">
              <strong>Change since first</strong>
              <b>${deltaValue > 0 ? "+" : ""}${deltaValue}%</b>
              <span>from ${firstProbability}% to ${latestProbability}%</span>
            </div>
            <div class="summary-card">
              <strong>Risk level</strong>
              <b class="is-${riskLevel.toLowerCase()}">${riskLevel}</b>
              <span>Based on latest estimate</span>
            </div>
          </div>
          <p class="note">% = percentage</p>
        </div>
        </div>
        <script>
          window.addEventListener("load", () => {
            window.print();
          });
        <\/script>
      </body>
    </html>
  `);
  popup.document.close();
};

const escapeSvgText = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderHistoryProbabilityChart = (items = []) => {
  if (!historyProbabilityChartSvg || !historyProbabilityChartMeta || !historyProbabilityChartSummary) return;

  const rawPoints = [...items]
    .filter((entry) => Number.isFinite(Number(entry.probability)))
    .sort(
      (left, right) =>
        new Date(left.recordedAt || left.updatedAt || left.createdAt || 0) -
        new Date(right.recordedAt || right.updatedAt || right.createdAt || 0)
    );
  const points = rawPoints.map((entry, index) => ({
      ...entry,
      plotLabel: `v${entry.versionNumber || index + 1}`,
      probabilityValue: Number(entry.probability || 0),
      recordedLabel: formatDate(entry.recordedAt || entry.updatedAt || entry.createdAt, false),
      recordedSubLabel: formatPredictedByDisplay(entry.predictedByName || ""),
    }));

  if (!points.length) {
    historyProbabilityChartMeta.innerHTML = "";
    historyProbabilityChartSummary.innerHTML = "";
    historyProbabilityChartSvg.innerHTML = `
      <rect x="0" y="0" width="980" height="520" rx="22" fill="#ffffff"></rect>
      <text x="490" y="255" text-anchor="middle" fill="#6b84a3" font-size="22" font-weight="700">
        No probability history available yet
      </text>
    `;
    return;
  }

  const patientInfo = detailEntry || points[points.length - 1];
  const firstPoint = points[0];
  const latestPoint = points[points.length - 1];
  const deltaValue = latestPoint.probabilityValue - firstPoint.probabilityValue;
  const deltaLabel = `${deltaValue > 0 ? "+" : ""}${deltaValue}%`;
  const riskLevel =
    latestPoint.probabilityValue >= 70 ? "High" : latestPoint.probabilityValue >= 40 ? "Moderate" : "Low";
  const riskTone = riskLevel.toLowerCase();
  historyProbabilityChartMeta.innerHTML = `
    <div class="details-history-chart-patient">
      <strong>Patient ID</strong>
      <span>${escapeSvgText(detailId || patientInfo.predictionId || patientInfo.id || "Unknown")}</span>
    </div>
    <div class="details-history-chart-patient">
      <strong>Patient name</strong>
      <span>${escapeSvgText(patientInfo.patientName || patientInfo.patient || "Unknown patient")}</span>
    </div>
    <div class="details-history-chart-patient">
      <strong>Sex</strong>
      <span>${escapeSvgText(patientInfo.sex || "Not specified")}</span>
    </div>
    <div class="details-history-chart-patient">
      <strong>Age</strong>
      <span>${escapeSvgText(patientInfo.age || "")}</span>
    </div>
  `;
  historyProbabilityChartSummary.innerHTML = `
    <article class="details-history-summary-card">
      <div class="details-history-summary-icon is-blue">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 15 4-4 3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </div>
      <div>
        <strong>Latest estimate</strong>
        <b>${latestPoint.probabilityValue}%</b>
        <span>as of ${escapeSvgText(latestPoint.recordedSubLabel || latestPoint.recordedLabel)} (${escapeSvgText(latestPoint.plotLabel)})</span>
      </div>
    </article>
    <article class="details-history-summary-card">
      <div class="details-history-summary-icon is-slate">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12h4l2-6 4 12 2-6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </div>
      <div>
        <strong>Change since first</strong>
        <b>${escapeSvgText(deltaLabel)}</b>
        <span>from ${firstPoint.probabilityValue}% to ${latestPoint.probabilityValue}%</span>
      </div>
    </article>
    <article class="details-history-summary-card">
      <div class="details-history-summary-icon is-green">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 5 6v5c0 5 3.4 8.7 7 10 3.6-1.3 7-5 7-10V6l-7-3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="m9.5 12 1.6 1.6 3.4-3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </div>
      <div>
        <strong>Risk level</strong>
        <b class="is-${riskTone}">${riskLevel}</b>
        <span>Based on latest estimate</span>
      </div>
    </article>
  `;

  const width = 980;
  const height = 520;
  const chartLeft = 92;
  const chartRight = 44;
  const chartTop = 94;
  const chartBottom = 94;
  const innerWidth = width - chartLeft - chartRight;
  const innerHeight = height - chartTop - chartBottom;
  const rowStep = innerHeight / 5;
  const pointInset = points.length > 1 ? 12 : innerWidth / 2;
  const plotStartX = chartLeft + pointInset;
  const plotEndX = width - chartRight - pointInset;
  const plotUsableWidth = Math.max(0, plotEndX - plotStartX);
  const xStep = points.length > 1 ? plotUsableWidth / (points.length - 1) : 0;

  const projectX = (index) => (points.length > 1 ? plotStartX + xStep * index : chartLeft + innerWidth / 2);
  const projectY = (probability) => chartTop + innerHeight - (Math.max(0, Math.min(100, probability)) / 100) * innerHeight;
  const polyline = points.map((point, index) => `${projectX(index)},${projectY(point.probabilityValue)}`).join(" ");
  const gridRows = Array.from({ length: 6 }, (_, index) => {
    const y = chartTop + rowStep * index;
    const value = 100 - index * 20;
    const stroke = value === 100 ? "#f06d64" : "#d9e3f1";
    const dash = value === 100 ? "6 6" : "4 6";
    const labelColor = value === 100 ? "#f04f45" : "#4e6788";

    return `
      <line x1="${chartLeft}" y1="${y}" x2="${width - chartRight}" y2="${y}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="${dash}"></line>
      <text x="${chartLeft - 16}" y="${y + 6}" text-anchor="end" fill="${labelColor}" font-size="15" font-weight="${value === 100 ? "800" : "700"}">${value}%</text>
    `;
  }).join("");

  const verticalGuides = points.map((point, index) => {
    const x = projectX(index);
    const y = projectY(point.probabilityValue);
    const pointColor = point.isCurrent ? "#1e5dc2" : "#284f92";
    const valueColor = point.probabilityValue >= 100 ? "#f04f45" : "#244a8d";

    return `
      <line x1="${x}" y1="${chartTop + innerHeight}" x2="${x}" y2="${y}" stroke="#d6e0ee" stroke-width="1.3" stroke-dasharray="4 6"></line>
      <circle cx="${x}" cy="${y}" r="${point.isCurrent ? "8" : "6.5"}" fill="${pointColor}" stroke="#ffffff" stroke-width="3"></circle>
      <text x="${x}" y="${y - 16}" text-anchor="middle" fill="${valueColor}" font-size="15" font-weight="800">${point.probabilityValue}%</text>
      <text x="${x}" y="${chartTop + innerHeight + 34}" text-anchor="middle" fill="#314b70" font-size="13" font-weight="700">${escapeSvgText(point.recordedLabel)}</text>
      <text x="${x}" y="${chartTop + innerHeight + 58}" text-anchor="middle" fill="#2e63c7" font-size="12" font-weight="800">${escapeSvgText(point.plotLabel)}</text>
    `;
  }).join("");

  historyProbabilityChartSvg.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" rx="22" fill="#ffffff"></rect>
    <text x="32" y="${chartTop + innerHeight / 2}" transform="rotate(-90 32 ${chartTop + innerHeight / 2})" text-anchor="middle" fill="#213d68" font-size="16" font-weight="800">
      Probability of relapse (%)
    </text>
    ${gridRows}
    <line x1="${chartLeft}" y1="${projectY(20)}" x2="${width - chartRight}" y2="${projectY(20)}" stroke="#77cfb4" stroke-width="1.5" stroke-dasharray="6 6"></line>
    <line x1="${chartLeft}" y1="${chartTop}" x2="${chartLeft}" y2="${chartTop + innerHeight}" stroke="#1f3f77" stroke-width="2"></line>
    <line x1="${chartLeft}" y1="${chartTop + innerHeight}" x2="${width - chartRight}" y2="${chartTop + innerHeight}" stroke="#1f3f77" stroke-width="2"></line>
    <polyline fill="none" stroke="#1f4f9b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polyline}"></polyline>
    ${verticalGuides}
  `;
};

const openHistoryProbabilityChartModal = () => {
  if (!historyProbabilityChartModal) return;
  renderHistoryProbabilityChart(detailHistoryEntries);
  historyProbabilityChartModal.hidden = false;
  document.body.style.overflow = "hidden";
};

const renderPredictionHistory = (items = []) => {
  detailHistoryEntries = Array.isArray(items) ? items : [];
  const archivedEntries = detailHistoryEntries.filter((entry) => !entry.isCurrent);
  const currentEntry = detailHistoryEntries.find((entry) => entry.isCurrent) || null;

  if (currentEntry) {
    currentEntry.versionNumber = Math.max(Number(currentEntry.versionNumber) || 0, archivedEntries.length + 1);
  }

  if (detailHistoryChip) {
    const label = detailHistoryEntries.length === 1 ? "1 version" : `${detailHistoryEntries.length} versions`;
    detailHistoryChip.textContent = label;
  }

  if (openHistoryChartButton) {
    openHistoryChartButton.disabled = !detailHistoryEntries.length;
  }

  if (!detailHistoryBody || !detailHistoryEmpty) {
    return;
  }

  if (!detailHistoryEntries.length) {
    detailHistoryBody.innerHTML = "";
    detailHistoryEmpty.hidden = false;
    return;
  }

  detailHistoryEmpty.hidden = true;
  detailHistoryBody.innerHTML = detailHistoryEntries
    .map((entry) => {
      const validation = getDetailHistoryValidationMeta(entry);
      const rowClass = entry.isCurrent ? "is-current" : "";
      const statusLabel = entry.isCurrent ? "Current" : `Archived v${entry.versionNumber}`;

      return `
        <tr class="${rowClass}">
          <td>
            <div class="details-history-version-cell">
              <strong>v${entry.versionNumber}</strong>
              <span>${statusLabel}</span>
            </div>
          </td>
          <td>
            <span class="details-history-status-badge ${entry.isCurrent ? "current" : "archived"}">
              ${entry.isCurrent ? "Active record" : "Saved before re-run"}
            </span>
          </td>
          <td>${formatDate(entry.recordedAt || entry.updatedAt || entry.createdAt, true)}</td>
          <td>${entry.result || "Pending"}</td>
          <td>${Number(entry.probability || 0)}%</td>
          <td>
            <span class="history-validation-pill ${validation.tone}">${validation.label}</span>
          </td>
          <td>${formatPredictedByDisplay(entry.predictedByName || "")}</td>
          <td>
            <div class="details-history-actions">
              <button class="mini-btn" type="button" data-view-history-clinical-entry="${entry.id}">
                View Clinical Entry
              </button>
              <button class="mini-btn mini-btn-icon" type="button" data-print-history-clinical-entry="${entry.id}" aria-label="Print saved clinical entry">
                <img class="mini-btn-icon__img" src="assets/printer.png" alt="">
              </button>
              ${
                entry.isCurrent
                  ? ""
                  : `
                    <button class="mini-btn mini-btn-danger" type="button" data-delete-history-clinical-entry="${entry.id}">
                      Delete
                    </button>
                  `
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
};

const loadPredictionHistory = async (id) => {
  if (!id) {
    renderPredictionHistory([]);
    return;
  }

  try {
    const items = await requestPredictionDetailsHistory(id);
    renderPredictionHistory(mergePredictionHistoryEntries(items, id));
  } catch (error) {
    if (error instanceof Error && error.status === 404 && detailEntry) {
      renderPredictionHistory([
        {
          id: detailEntry.id,
          predictionId: detailEntry.id,
          versionNumber: 1,
          isCurrent: true,
          patientName: detailEntry.patient,
          age: detailEntry.age,
          sex: detailEntry.sex,
          source: detailEntry.source,
          result: detailEntry.result,
          probability: detailEntry.probability,
          consultationReason: detailEntry.consultationReason || "",
          predictedByName: detailEntry.predictedByName || "",
          actualOutcome: detailEntry.actualOutcome || "",
          validationStatus: detailEntry.validationStatus || "Pending",
          validationRecordedAt: detailEntry.validationRecordedAt || null,
          createdAt: detailEntry.createdAt || null,
          updatedAt: detailEntry.updatedAt || null,
          recordedAt: detailEntry.updatedAt || detailEntry.createdAt || detailEntry.analyzedAt || null,
          inputData: detailEntry.inputData && typeof detailEntry.inputData === "object" ? detailEntry.inputData : {},
        },
        ...getStoredPredictionHistoryEntries(id),
      ]);
      return;
    }

    renderPredictionHistory(getStoredPredictionHistoryEntries(id));
    showPredictionDetailsToast(
      error instanceof Error ? error.message : "Unable to load this patient's prediction history.",
      "danger"
    );
  }
};

const updateValidationPreview = () => {
  if (!validationPreviewNode || !detailEntry) return;

  const actualOutcome = validationOutcomeSelect?.value || "";
  validationPreviewNode.classList.remove("is-correct", "is-incorrect");

  if (!actualOutcome) {
    validationPreviewNode.textContent =
      "Select the confirmed outcome to preview whether this case will be saved as a correct or incorrect prediction.";
    return;
  }

  const isCorrect = actualOutcome === detailEntry.result;
  validationPreviewNode.classList.add(isCorrect ? "is-correct" : "is-incorrect");
  validationPreviewNode.innerHTML = isCorrect
    ? `<strong>Prediction will be marked correct.</strong> The confirmed outcome matches the predicted ${detailEntry.result.toLowerCase()} result.`
    : `<strong>Prediction will be marked incorrect.</strong> The confirmed outcome is ${actualOutcome.toLowerCase()}, which differs from the predicted ${detailEntry.result.toLowerCase()} result.`;
};

const closeDetailModals = () => {
  if (rerunConfirmationModal) rerunConfirmationModal.hidden = true;
  if (deletePredictionModal) deletePredictionModal.hidden = true;
  if (predictionValidationModal) predictionValidationModal.hidden = true;
  if (historyClinicalEntryModal) historyClinicalEntryModal.hidden = true;
  if (historyVersionDeleteModal) historyVersionDeleteModal.hidden = true;
  if (historyProbabilityChartModal) historyProbabilityChartModal.hidden = true;
  pendingRerunProfile = null;
  pendingHistoryDeleteEntry = null;
  document.body.style.overflow = "";
};

const closeDetailServiceErrorModal = () => {
  if (!detailServiceErrorModal) return;
  detailServiceErrorModal.hidden = true;
  document.body.style.overflow = "";
};

const openDetailModal = (modal) => {
  if (!modal) return;
  closeDetailModals();
  modal.hidden = false;
  document.body.style.overflow = "hidden";
};

const openDetailServiceErrorModal = (
  message = "The AI prediction service is currently unavailable. Please try again later or contact the system administrator."
) => {
  if (detailServiceErrorCopy) {
    detailServiceErrorCopy.textContent = message;
  }
  closeDetailModals();
  if (detailServiceErrorModal) {
    detailServiceErrorModal.hidden = false;
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

detailModalCloseControls.forEach((control) => {
  control.addEventListener("click", closeDetailModals);
});

historyClinicalEntryCloseControls.forEach((control) => {
  control.addEventListener("click", closeDetailModals);
});

historyVersionDeleteCloseControls.forEach((control) => {
  control.addEventListener("click", closeDetailModals);
});

historyProbabilityChartCloseControls.forEach((control) => {
  control.addEventListener("click", closeDetailModals);
});

detailServiceErrorCloseControls.forEach((control) => {
  control.addEventListener("click", closeDetailServiceErrorModal);
});

detailServiceErrorOkButton?.addEventListener("click", closeDetailServiceErrorModal);
detailServiceErrorSupportButton?.addEventListener("click", () => {
  closeDetailServiceErrorModal();
  if (typeof window.openNoufarSupportModal === "function") {
    window.openNoufarSupportModal({
      category: "Technical issue",
      priority: "High",
      subject: "AI prediction service unavailable",
      message:
        "The AI prediction service is currently unavailable from the Prediction Details workflow. Please review the Flask backend availability.",
    });
  }
});

openHistoryChartButton?.addEventListener("click", openHistoryProbabilityChartModal);
printHistoryProbabilityChartButton?.addEventListener("click", printHistoryProbabilityChart);

detailHistoryBody?.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view-history-clinical-entry]");
  if (viewButton) {
    openHistoryClinicalEntryModal(viewButton.dataset.viewHistoryClinicalEntry);
    return;
  }

  const printButton = event.target.closest("[data-print-history-clinical-entry]");
  if (printButton) {
    printHistoryClinicalEntry(printButton.dataset.printHistoryClinicalEntry);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-history-clinical-entry]");
  if (deleteButton) {
    openHistoryVersionDeleteModal(deleteButton.dataset.deleteHistoryClinicalEntry);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDetailModals();
  }
});

const formatTsh = (value) =>
  String(value ?? "").trim().toLowerCase() === "not measured" ? "Not measured" : `${Number(value).toFixed(2)} mIU/L`;
const formatFt4 = (value) =>
  String(value ?? "").trim().toLowerCase() === "not measured" ? "Not measured" : `${Number(value).toFixed(2)} ng/dL`;

const clearRerunWarning = () => {
  if (!rerunWarningNode) return;
  rerunWarningNode.hidden = true;
  rerunWarningNode.textContent = "";
};

const showRerunWarning = (message) => {
  clearRerunWarning();
  showPredictionDetailsToast(message, "danger");
};

const rerunHasRequiredBiologyNotMeasured = () => {
  const profile = collectRerunProfile();
  return REQUIRED_BIOLOGY_KEYS.some(
    (key) => String(profile?.[key] || "").trim().toLowerCase() === "not measured"
  );
};

const updateRerunButtonState = () => {
  if (!openRerunPredictionButtons.length) return;

  const disabled = rerunHasRequiredBiologyNotMeasured();
  openRerunPredictionButtons.forEach((button) => {
    button.disabled = disabled;
    button.title = disabled ? "Re-run is disabled while a required Biology field is marked Not measured." : "";
  });
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

const normalizeDetailTriToggleValue = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No";
  return "Not measured";
};

const setDetailTriToggleState = (input, nextState) => {
  if (!input) return;
  const state = normalizeDetailTriToggleValue(nextState);
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

const initDetailTriStateToggles = () => {
  detailToggleInputs.forEach((input) => {
    const field = input.closest(".toggle-switch-field");
    const control = input.closest(".toggle-switch-control");
    if (!field || !control || field.querySelector(".tri-toggle")) return;

    field.classList.add("tri-toggle-field");

    const tri = document.createElement("div");
    tri.className = "tri-toggle";
    tri.setAttribute("role", "group");
    tri.innerHTML = DETAIL_TRI_TOGGLE_STATES.map(
      (state) =>
        `<button type="button" class="tri-toggle-btn" data-state-value="${state}" aria-pressed="false">${state}</button>`
    ).join("");
    control.appendChild(tri);

    tri.addEventListener("click", (event) => {
      const button = event.target.closest(".tri-toggle-btn");
      if (!button) return;
      setDetailTriToggleState(input, button.dataset.stateValue);
      clearRerunWarning();
    });

    setDetailTriToggleState(input, input.checked ? "Yes" : "Not measured");
  });
};

const initDetailNotMeasuredRanges = () => {
  detailRangeInputs.forEach((input) => {
    const shell = input.closest(".range-field-shell");
    const field = input.closest(".slider-field");
    const fieldLabel = field?.querySelector(":scope > span");
    if (!shell || !fieldLabel || fieldLabel.querySelector(".range-not-measured")) return;

    const wrapper = document.createElement("span");
    wrapper.className = "range-not-measured range-not-measured-inline";
    wrapper.innerHTML = `
      <input type="checkbox" data-range-not-measured="${input.id}" />
      <span class="range-not-measured-text">Not measured</span>
    `;
    fieldLabel.appendChild(wrapper);

    const toggleButton = wrapper.querySelector(".range-not-measured-text");
    const toggleInput = wrapper.querySelector(`[data-range-not-measured="${input.id}"]`);
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
        updateDetailRangePresentation(input);
      }
      clearRerunWarning();
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

const updateDetailTogglePresentation = (input) => {
  if (!input) return;
  setDetailTriToggleState(input, input.dataset.triState || (input.checked ? "Yes" : "Not measured"));
};

const updateDetailRangePresentation = (input) => {
  if (!input) return;

  const target = document.getElementById(input.dataset.rangeTarget || "");
  if (input.dataset.notMeasured === "true") {
    input.disabled = true;
    input.classList.add("is-not-measured");
    if (target) target.textContent = "Not measured";
    return;
  }

  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || min);
  const decimals = Number(input.dataset.rangeDecimals || 0);
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;

  input.style.background = `linear-gradient(90deg, #2d71d3 0%, #63a8ff ${progress}%, rgba(68, 121, 196, 0.18) ${progress}%, rgba(150, 187, 239, 0.24) 100%)`;

  if (target) {
    target.textContent = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  }
};

const commitDetailRangeManualValue = (input, rawValue) => {
  if (!input) return;
  if (input.dataset.notMeasured === "true") {
    showPredictionDetailsToast("Uncheck Not measured first to edit this value.", "danger");
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
  updateDetailRangePresentation(input);
  clearRerunWarning();
};

const initDetailManualRangeEditors = () => {
  detailRangeInputs.forEach((input) => {
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
          commitDetailRangeManualValue(input, editor.value);
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

const syncDetailChipSelectGroup = (group, value) => {
  if (!group) return;
  const hiddenInput = group.parentElement?.querySelector('input[type="hidden"]');
  const options = Array.from(group.querySelectorAll(".chip-select-option"));
  if (!hiddenInput || !options.length) return;

  hiddenInput.value = value;
  options.forEach((option) => {
    const isSelected = option.dataset.chipValue === value;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });
};

const initializeDetailChipSelect = (group) => {
  const hiddenInput = group.parentElement?.querySelector('input[type="hidden"]');
  const options = Array.from(group.querySelectorAll(".chip-select-option"));
  if (!hiddenInput || !options.length) return;

  const initialValue = options.some((option) => option.dataset.chipValue === hiddenInput.value)
    ? hiddenInput.value
    : options[0].dataset.chipValue || "";
  syncDetailChipSelectGroup(group, initialValue);

  options.forEach((option) => {
    option.addEventListener("click", () => {
      syncDetailChipSelectGroup(group, option.dataset.chipValue || "");
      clearRerunWarning();
      updateRerunButtonState();
    });
  });
};

const formatDetailValue = (key, value) => {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (String(value ?? "").trim().toLowerCase() === "not measured") return "Not measured";
  if (key === "tsh") return formatTsh(value);
  if (key === "ft4") return formatFt4(value);
  if (key === "antiTpoTotal") return `${Number(value).toFixed(0)}`;
  if (key === "tsiLevel") return Number(value).toFixed(2);
  if (key === "duration") return `${value} months`;
  if (key === "age") return `${value} years`;
  return String(value);
};

const detailFieldLabels = {
  age: "Age",
  consultationReason: "Consultation reason",
  stress: "Stress",
  palpitations: "Palpitations",
  spp: "SPP",
  amg: "AMG",
  diarrhea: "Diarrhea",
  tremors: "Tremors",
  agitation: "Agitation",
  moodDisorder: "Mood disorder",
  sleepDisorder: "Sleep disorder",
  sweating: "Excess sweating",
  heatIntolerance: "Heat intolerance",
  muscleWeakness: "Muscle weakness",
  goiter: "Goiter",
  goiterClass: "Goiter classification",
  tsh: "TSH",
  ft4: "FT4",
  antiTpo: "Anti-TPO",
  antiTpoTotal: "Anti-TPO total",
  antiTg: "Anti-Tg",
  tsi: "TSI",
  tsiLevel: "TSI level",
  ultrasound: "Ultrasound",
  scintigraphy: "Scintigraphy",
  therapy: "Therapy",
  duration: "Duration",
  blockReplace: "Block and replace",
  surgery: "Surgery",
  radioactiveIodine: "Radioactive iodine",
};

const detailComparisonStepMap = {
  age: 1,
  duration: 1,
  tsh: 0.1,
  ft4: 0.1,
  antiTpoTotal: 10,
  tsiLevel: 0.1,
};

const normalizeDetailComparisonValue = (key, value) => {
  if (value === null || value === undefined) return "";

  if (Object.prototype.hasOwnProperty.call(detailComparisonStepMap, key)) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "";

    const step = detailComparisonStepMap[key];
    const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
    return Number((Math.round(numericValue / step) * step).toFixed(decimals));
  }

  if (typeof value === "boolean") {
    return value;
  }

  return String(value).trim();
};

const buildProfileDiff = (previousProfile, updatedProfile) =>
  Object.keys(detailFieldMap)
    .filter(
      (key) =>
        normalizeDetailComparisonValue(key, previousProfile[key]) !==
        normalizeDetailComparisonValue(key, updatedProfile[key])
    )
    .map((key) => ({
      key,
      label: detailFieldLabels[key] || key,
      previous: formatDetailValue(key, previousProfile[key]),
      next: formatDetailValue(key, updatedProfile[key]),
    }));

const buildPatientNameChange = (previousName, nextName) => {
  const previous = String(previousName || "").trim();
  const next = String(nextName || "").trim();

  if (previous === next) {
    return [];
  }

  return [
    {
      key: "name",
      label: "Patient name",
      previous: previous || "Not provided",
      next: next || "Not provided",
    },
  ];
};

const scoreToImpactValue = (points) => Math.max(34, Math.min(88, Math.round(32 + Math.abs(points) * 3.1)));

const buildPredictionFromProfile = (profile) => {
  const contributions = [];
  let score = 18;

  const addContribution = (label, points, note, tone) => {
    if (!points) return;
    contributions.push({ label, points, note, tone });
    score += points;
  };

  addContribution("Stress", profile.stress === "Yes" ? 5 : 0, "Symptom burden increases instability", "warm");
  addContribution("Palpitations", profile.palpitations === "Yes" ? 6 : 0, "Clinical activity remains present", "warm");
  addContribution("SPP", profile.spp === "Yes" ? 4 : 0, "Additional clinical symptom burden", "warm");
  addContribution("AMG", profile.amg === "Yes" ? 5 : 0, "Systemic symptom signal remains present", "warm");
  addContribution("Diarrhea", profile.diarrhea === "Yes" ? 4 : 0, "Supports active hyperthyroid presentation", "warm");
  addContribution("Tremors", profile.tremors === "Yes" ? 6 : 0, "Ongoing symptom activity", "warm");
  addContribution("Agitation", profile.agitation === "Yes" ? 4 : 0, "Neurovegetative instability contributes to risk", "warm");
  addContribution("Mood disorder", profile.moodDisorder === "Yes" ? 3 : 0, "Behavioral symptoms remain clinically relevant", "warm");
  addContribution("Sleep disorder", profile.sleepDisorder === "Yes" ? 3 : 0, "Persistent symptoms affect recovery profile", "warm");
  addContribution("Excess sweating", profile.sweating === "Yes" ? 4 : 0, "Autonomic activity supports relapse concern", "warm");
  addContribution("Heat intolerance", profile.heatIntolerance === "Yes" ? 5 : 0, "Supports persistent hyperthyroid symptoms", "warm");
  addContribution("Muscle weakness", profile.muscleWeakness === "Yes" ? 4 : 0, "Functional burden supports closer monitoring", "warm");
  addContribution("Goiter", profile.goiter === "Yes" ? 6 : -2, profile.goiter === "Yes" ? "Structural thyroid burden remains present" : "No major structural burden", profile.goiter === "Yes" ? "warm" : "cool");

  const goiterScoreMap = { "0": -4, "1A": 2, "1B": 6, "2": 10, "3": 14 };
  addContribution(
    `Goiter class ${profile.goiterClass}`,
    goiterScoreMap[profile.goiterClass] ?? 0,
    profile.goiterClass === "0" ? "Lower structural recurrence concern" : "Severity contributes to relapse monitoring",
    profile.goiterClass === "0" ? "cool" : "warm"
  );

  const tsh = Number(profile.tsh);
  if (tsh < 0.1) addContribution("Suppressed TSH", 16, "Biological relapse signal", "warm");
  else if (tsh < 0.3) addContribution("Low TSH", 12, "Hyperthyroid pattern persists", "warm");
  else if (tsh < 0.5) addContribution("Borderline low TSH", 8, "Mild biological concern", "warm");
  else if (tsh < 1) addContribution("Near-normal TSH", 4, "Limited residual variability", "warm");
  else addContribution("Normalized TSH", -10, "Protective stability factor", "cool");

  const ft4 = Number(profile.ft4);
  if (ft4 > 2) addContribution("Elevated FT4", 14, "Hormonal activity remains high", "warm");
  else if (ft4 > 1.6) addContribution("Raised FT4", 10, "Moderate biological activity", "warm");
  else if (ft4 > 1.2) addContribution("Upper-normal FT4", 4, "Borderline activity", "warm");
  else addContribution("Stable FT4", -8, "Favorable biological context", "cool");

  addContribution("Anti-TPO", profile.antiTpo === "Positive" ? 8 : -4, profile.antiTpo === "Positive" ? "Autoimmune activity contributes to risk" : "Lower autoimmune pressure", profile.antiTpo === "Positive" ? "warm" : "cool");
  const antiTpoTotal = Number(profile.antiTpoTotal);
  if (antiTpoTotal >= 400) addContribution("Anti-TPO total", 10, "High antibody load supports relapse concern", "warm");
  else if (antiTpoTotal >= 150) addContribution("Anti-TPO total", 5, "Moderate antibody activity", "warm");
  else addContribution("Anti-TPO total", -3, "Lower antibody burden", "cool");
  addContribution("Anti-Tg", profile.antiTg === "Positive" ? 6 : -3, profile.antiTg === "Positive" ? "Additional antibody burden" : "Reduced antibody activity", profile.antiTg === "Positive" ? "warm" : "cool");
  addContribution("TSI", profile.tsi === "Positive" ? 16 : -8, profile.tsi === "Positive" ? "Dominant relapse driver" : "Reduced immunological drive", profile.tsi === "Positive" ? "warm" : "cool");
  const tsiLevel = Number(profile.tsiLevel);
  if (tsiLevel >= 4) addContribution("TSI level", 12, "High stimulating immunological activity", "warm");
  else if (tsiLevel >= 2) addContribution("TSI level", 7, "Moderate stimulating activity", "warm");
  else addContribution("TSI level", -4, "Lower stimulating antibody burden", "cool");

  const ultrasoundPoints = {
    "Diffuse goiter with vascular pattern": 8,
    "Diffuse goiter": 8,
    "Goiter with nodules": 10,
    "Mild heterogeneous texture": 4,
    "Normal thyroid volume": -6,
  };
  addContribution(
    "Ultrasound pattern",
    ultrasoundPoints[profile.ultrasound] ?? 0,
    profile.ultrasound === "Normal thyroid volume" ? "Favorable imaging context" : "Imaging pattern remains clinically relevant",
    profile.ultrasound === "Normal thyroid volume" ? "cool" : "warm"
  );

  const scintigraphyPoints = {
    "High uptake": 10,
    "Hot nodule": 7,
    "Normal uptake": -5,
  };
  addContribution(
    "Scintigraphy",
    scintigraphyPoints[profile.scintigraphy] ?? 0,
    profile.scintigraphy === "Normal uptake" ? "Lower activity on imaging" : "Scintigraphy supports ongoing thyroid activity",
    profile.scintigraphy === "Normal uptake" ? "cool" : "warm"
  );

  const treatmentPoints = {
    "Antithyroid therapy": 5,
    "Block and replace": 7,
    "Maintenance monitoring": 1,
    "Observation plan": 2,
  };
  addContribution("Treatment context", treatmentPoints[profile.therapy] ?? 0, "Current therapy contributes to prediction context", "warm");

  const duration = Number(profile.duration);
  if (duration < 12) addContribution("Short treatment duration", 8, "Shorter duration may increase relapse likelihood", "warm");
  else if (duration < 24) addContribution("Intermediate treatment duration", 4, "Moderate follow-up protection", "warm");
  else addContribution("Long treatment duration", -6, "Longer treatment duration helps stabilize risk", "cool");

  addContribution("Block and replace", profile.blockReplace === "Yes" ? 4 : 0, "Complex treatment context remains relevant", "warm");
  addContribution("Surgery", profile.surgery === "Yes" ? -18 : 0, "Surgical management lowers residual relapse burden", "cool");
  addContribution("Radioactive iodine", profile.radioactiveIodine === "Yes" ? -12 : 0, "Radioactive iodine reduces residual risk", "cool");

  const probability = Math.max(8, Math.min(92, Math.round(score)));
  const result = probability >= 55 ? "Relapse" : "No Relapse";

  const sortedContributions = contributions
    .filter((item) => item.points !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 4)
    .map((item) => ({
      label: item.label,
      note: item.note,
      tone: item.tone,
      value: scoreToImpactValue(item.points),
    }));

  const note =
    result === "Relapse"
      ? "Updated clinical entry keeps the patient in an elevated relapse band and supports closer endocrine follow-up."
      : "Updated clinical entry lowers the relapse signal and supports routine monitoring with continued physician oversight.";

  return { probability, result, impacts: sortedContributions, note };
};

const renderMissingState = () => {
  const main = document.querySelector("#prediction-details-main");
  if (!main) return;

  const returnAction = isDatasetSelectionReturn()
    ? `<a class="btn btn-secondary btn-sm" href="${getDetailReturnUrl()}">Back to Data Selection</a>`
    : "";

  main.innerHTML = `
      <section class="surface-card details-empty-state">
        <span class="prediction-page-kicker">Prediction details</span>
        <h1>Patient record not found</h1>
        <p>The selected prediction could not be loaded. Return to history and choose another patient record.</p>
        <div class="prediction-page-hero-actions">
          ${returnAction}
          <a class="btn btn-secondary btn-sm" href="history.html">Back to History</a>
          <a class="btn btn-primary btn-sm" href="dashboard.html">Open Dashboard</a>
        </div>
      </section>
    `;
};

const renderDetails = (entry) => {
  const profile = getDetailProfile(entry);
  const derived = buildPredictionFromProfile(profile);
  const badge = getPredictionBadge(entry);
  const titleNode = document.querySelector("#detail-page-title");
  const summaryNode = document.querySelector("#detail-page-summary");
  const pillsNode = document.querySelector("#detail-page-pills");
  const recordChipNode = document.querySelector("#detail-record-chip");
  const statGridNode = document.querySelector("#detail-stat-grid");
  const clinicalGridNode = document.querySelector("#detail-clinical-grid");
  const timelineNode = document.querySelector("#detail-timeline");
  const outcomeBadgeNode = document.querySelector("#detail-outcome-badge");
  const outcomeProbabilityNode = document.querySelector("#detail-outcome-probability");
  const outcomeLabelNode = document.querySelector("#detail-outcome-label");
  const outcomeBarNode = document.querySelector("#detail-outcome-bar");
  const outcomeCopyNode = document.querySelector("#detail-outcome-copy");
  const impactListNode = document.querySelector("#detail-impact-list");
  const validationState = getValidationStatusMeta(entry);

  if (titleNode) titleNode.textContent = `${entry.patient} Clinical Prediction Report`;
  if (summaryNode) {
    summaryNode.textContent =
      entry.result === "Relapse"
        ? `${entry.patient} presents an elevated relapse profile after ${entry.source.toLowerCase()} review, requiring closer endocrine surveillance and a structured physician follow-up plan.`
        : `${entry.patient} currently presents a lower relapse profile after ${entry.source.toLowerCase()} review, supporting routine monitoring with continued physician oversight.`;
  }

  if (pillsNode) {
    pillsNode.innerHTML = `
      <span class="dashboard-pill">${entry.id}</span>
      <span class="dashboard-pill">${entry.age} years / ${entry.sex}</span>
      <span class="dashboard-pill">${entry.source}</span>
      <span class="dashboard-pill">${formatDate(entry.analyzedAt, true)}</span>
    `;
  }

  if (recordChipNode) recordChipNode.textContent = profile.consultationReason;
  populateInlineForm(profile);
  clearRerunWarning();

  if (statGridNode) {
    const isRelapse = entry.result === "Relapse";
    const statItems = [
      ["Patient ID", entry.id, ""],
      ["Age / Sex", `${entry.age} years / ${entry.sex}`, ""],
      ["Input source", entry.source, ""],
      ["Review date", formatDate(entry.analyzedAt, true), ""],
      ["Consultation reason", profile.consultationReason, ""],
      ["Current result", badge.label, isRelapse ? "stat-card-relapse" : "stat-card-stable"],
      ["Probability", `${entry.probability}%`, isRelapse ? "stat-card-relapse" : "stat-card-stable"],
      ["Monitoring plan", isRelapse ? "Closer follow-up" : "Routine monitoring", isRelapse ? "stat-card-relapse" : "stat-card-stable"],
    ];

    statGridNode.innerHTML = statItems
      .map(
        ([label, value, cls]) => `
          <article class="details-stat-card${cls ? " " + cls : ""}">
            <span>${label}</span>
            <strong>${value}</strong>
          </article>
        `
      )
      .join("");
  }

  if (clinicalGridNode) {
    const sections = [
      {
        title: "Patient Information",
        items: [
          ["Patient name", entry.patient],
          ["Age", `${profile.age} years`],
          ["Sex", profile.sex],
          ["Consultation reason", profile.consultationReason],
        ],
      },
      {
        title: "Symptoms / Clinical",
        items: [
          ["Stress", profile.stress],
          ["Palpitations", profile.palpitations],
          ["SPP", profile.spp],
          ["AMG", profile.amg],
          ["Diarrhea", profile.diarrhea],
          ["Tremors", profile.tremors],
          ["Agitation", profile.agitation],
          ["Mood disorder", profile.moodDisorder],
          ["Sleep disorder", profile.sleepDisorder],
          ["Excess sweating", profile.sweating],
          ["Heat intolerance", profile.heatIntolerance],
          ["Muscle weakness", profile.muscleWeakness],
        ],
      },
      {
        title: "Thyroid Examination",
        items: [
          ["Goiter", profile.goiter],
          ["Goiter classification", profile.goiterClass],
        ],
      },
      {
        title: "Imaging",
        items: [
          ["Ultrasound", profile.ultrasound],
          ["Scintigraphy", profile.scintigraphy],
        ],
      },
      {
        title: "Biology",
        items: [
          ["TSH", formatTsh(profile.tsh)],
          ["FT4", formatFt4(profile.ft4)],
          ["Anti-TPO", profile.antiTpo],
          ["Anti-TPO total", `${Number(profile.antiTpoTotal).toFixed(0)}`],
          ["Anti-Tg", profile.antiTg],
          ["TSI", profile.tsi],
          ["TSI level", Number(profile.tsiLevel).toFixed(2)],
        ],
      },
      {
        title: "Treatment",
        items: [
          ["Therapy", profile.therapy],
          ["Duration", `${profile.duration} months`],
          ["Block and replace", profile.blockReplace],
          ["Surgery", profile.surgery],
          ["Radioactive iodine", profile.radioactiveIodine],
        ],
      },
    ];

    clinicalGridNode.innerHTML = sections
      .map(
        (section) => `
          <article class="details-clinical-card">
            <h3>${section.title}</h3>
            <div class="details-definition-list">
              ${section.items
                .map(
                  ([label, value]) => `
                    <div class="details-definition-row">
                      <span>${label}</span>
                      <strong>${value}</strong>
                    </div>
                  `
                )
                .join("")}
            </div>
          </article>
        `
      )
      .join("");
  }

  if (timelineNode) {
    timelineNode.innerHTML = buildTimeline(entry)
      .map(
        (item) => `
          <article class="details-timeline-item">
            <span class="details-timeline-marker" aria-hidden="true"></span>
            <div class="details-timeline-copy">
              <div class="details-timeline-head">
                <strong>${item.title}</strong>
                <span>${item.date}</span>
              </div>
              <p>${item.copy}</p>
            </div>
          </article>
        `
      )
      .join("");
  }

  if (outcomeBadgeNode) {
    outcomeBadgeNode.className = `prediction-badge ${badge.tone}`;
    outcomeBadgeNode.textContent = badge.label;
  }
  const outcomeClass = entry.result === "Relapse" ? "is-relapse" : "is-stable";
  const detailsOutcomeCard = document.querySelector(".details-outcome-card");
  if (detailsOutcomeCard) {
    detailsOutcomeCard.classList.remove("is-relapse", "is-stable");
    detailsOutcomeCard.classList.add(outcomeClass);
  }
  document.querySelectorAll(".impact-card-item, .impact-card-list, #detail-impact-list").forEach((el) => {
    el.classList.remove("is-relapse", "is-stable");
    el.classList.add(outcomeClass);
  });
  if (outcomeProbabilityNode) outcomeProbabilityNode.textContent = `${entry.probability}%`;
  if (outcomeLabelNode) outcomeLabelNode.textContent = entry.result === "Relapse" ? "Will Relapse" : "Will Not Relapse";
  if (outcomeBarNode) outcomeBarNode.style.width = `${entry.probability}%`;
  if (outcomeCopyNode) outcomeCopyNode.textContent = derived.note;

  if (validationPredictedNode) validationPredictedNode.textContent = validationState.predicted;
  if (validationActualNode) validationActualNode.textContent = validationState.actual;
  if (validationStatusHeadingNode) validationStatusHeadingNode.textContent = validationState.badgeLabel;
  if (validationBadgeNode) {
    validationBadgeNode.className = `details-validation-badge ${validationState.badgeTone}`;
    validationBadgeNode.textContent = validationState.badgeLabel;
  }
  if (validationDateNode) validationDateNode.textContent = validationState.dateLabel;
  if (validationCopyNode) validationCopyNode.textContent = validationState.copy;
  if (openValidationModalButton) openValidationModalButton.textContent = validationState.actionLabel;

  if (impactListNode) {
    impactListNode.innerHTML = derived.impacts
      .map(
        (impact) => {
          const tone = impact.tone === "warm" ? "is-warm" : "is-cool";
          return `
          <article class="impact-card-item">
            <div class="impact-card-head">
              <strong>${impact.label}</strong>
              <span>${impact.note} · ${impact.value}%</span>
            </div>
            <div class="impact-card-bar" aria-hidden="true">
              <i class="${tone}" style="width:${impact.value}%; ${impactGradientStyle(impact.value)}"></i>
            </div>
          </article>
        `;
        }
      )
      .join("");
  }
};

const populateInlineForm = (profile) => {
  if (rerunPatientNameInput && detailEntry) {
    rerunPatientNameInput.value = detailEntry.patient || detailEntry.patientName || "";
  }

  Object.entries(detailFieldMap).forEach(([key, selector]) => {
    const field = document.querySelector(selector);
    if (!field) return;

    if (field instanceof HTMLInputElement && field.type === "checkbox") {
      setDetailTriToggleState(field, profile[key]);
      return;
    }

    field.value = profile[key];

    if (field instanceof HTMLInputElement && field.type === "hidden") {
      syncDetailChipSelectGroup(field.parentElement?.querySelector(".detail-chip-select-group"), profile[key]);
      return;
    }

    if (field instanceof HTMLInputElement && field.type === "range") {
      const notMeasuredToggle = document.querySelector(`[data-range-not-measured="${field.id}"]`);
      const normalizedValue = String(profile[key] ?? "").trim().toLowerCase();
      if (normalizedValue === "not measured") {
        field.dataset.notMeasured = "true";
        if (notMeasuredToggle instanceof HTMLInputElement) {
          notMeasuredToggle.checked = true;
        }
      } else {
        field.dataset.notMeasured = "false";
        if (notMeasuredToggle instanceof HTMLInputElement) {
          notMeasuredToggle.checked = false;
        }
        field.disabled = false;
        field.classList.remove("is-not-measured");
        field.value = profile[key];
      }
      updateDetailRangePresentation(field);
    }
  });
};

const collectRerunProfile = () => {
  const collected = {};
  Object.entries(detailFieldMap).forEach(([key, selector]) => {
    const field = document.querySelector(selector);
    if (!field) return;

    if (field instanceof HTMLInputElement && field.type === "checkbox") {
      collected[key] = normalizeDetailTriToggleValue(field.dataset.triState || (field.checked ? "Yes" : "Not measured"));
      return;
    }

    collected[key] = field.value;
  });

  return {
    ...collected,
    age: Number(collected.age),
    tsh: document.querySelector("#detail-tsh")?.dataset.notMeasured === "true" ? "Not measured" : Number(collected.tsh),
    ft4: document.querySelector("#detail-ft4")?.dataset.notMeasured === "true" ? "Not measured" : Number(collected.ft4),
    antiTpoTotal:
      document.querySelector("#detail-anti-tpo-total")?.dataset.notMeasured === "true" ? "Not measured" : Number(collected.antiTpoTotal),
    tsiLevel: document.querySelector("#detail-tsi-level")?.dataset.notMeasured === "true" ? "Not measured" : Number(collected.tsiLevel),
    duration: Number(collected.duration),
  };
};

const buildRerunPayloadFromProfile = (profile) => {
  const originalInput = detailEntry?.inputData && typeof detailEntry.inputData === "object" ? detailEntry.inputData : {};
  const patientName = String(rerunPatientNameInput?.value || detailEntry?.patient || detailEntry?.patientName || "").trim();

  return {
    ...originalInput,
    rerunPrediction: true,
    name: patientName,
    age: Number(profile.age),
    sex: profile.sex,
    consultationReason: profile.consultationReason,
    stress: profile.stress,
    palpitations: profile.palpitations,
    spp: profile.spp,
    amg: profile.amg,
    diarrhea: profile.diarrhea,
    tremors: profile.tremors,
    agitation: profile.agitation,
    moodDisorder: profile.moodDisorder,
    sleepDisorder: profile.sleepDisorder,
    sweating: profile.sweating,
    heatIntolerance: profile.heatIntolerance,
    muscleWeakness: profile.muscleWeakness,
    goiter: profile.goiter,
    goiterClassification: profile.goiterClass,
    tsh: String(profile.tsh || "").toLowerCase() === "not measured" ? "Not measured" : Number(profile.tsh),
    ft4: String(profile.ft4 || "").toLowerCase() === "not measured" ? "Not measured" : Number(profile.ft4),
    antiTpo: profile.antiTpo,
    antiTpoTotal: String(profile.antiTpoTotal || "").toLowerCase() === "not measured" ? "Not measured" : Number(profile.antiTpoTotal),
    antiTg: profile.antiTg,
    tsi: profile.tsi,
    tsiLevel: String(profile.tsiLevel || "").toLowerCase() === "not measured" ? "Not measured" : Number(profile.tsiLevel),
    ultrasound: profile.ultrasound,
    scintigraphy: profile.scintigraphy,
    therapy: profile.therapy,
    duration: Number(profile.duration),
    blockReplace: profile.blockReplace,
    surgery: profile.surgery,
    radioactiveIodine: profile.radioactiveIodine,
    source: detailEntry?.source || originalInput.source || "Manual",
  };
};

const openRerunConfirmation = () => {
  if (!detailEntry || !inlineClinicalEntryForm || !inlineClinicalEntryForm.reportValidity()) return;
  if (rerunHasRequiredBiologyNotMeasured()) {
    showRerunWarning("Re-run Prediction is disabled while a required Biology field is marked Not measured.");
    return;
  }

  const previousProfile = getDetailProfile(detailEntry);
  const updatedProfile = collectRerunProfile();
  const previousPatientName = String(detailEntry.patient || detailEntry.patientName || "").trim();
  const nextPatientName = String(rerunPatientNameInput?.value || "").trim();
  const changes = [
    ...buildPatientNameChange(previousPatientName, nextPatientName),
    ...buildProfileDiff(previousProfile, updatedProfile),
  ];

  if (!changes.length) {
    showRerunWarning("No changes were made to the Clinical Entry.");
    return;
  }

  clearRerunWarning();

  if (rerunSummaryCopy) {
    rerunSummaryCopy.innerHTML = changes.length
      ? `<strong>${changes.length} variable${changes.length > 1 ? "s" : ""} changed</strong><span>Review the previous and updated values before confirming the new prediction run for ${detailEntry.patient}.</span>`
      : `<strong>No clinical variables changed</strong><span>You can still confirm to run the prediction again with the current stored Clinical Entry.</span>`;
  }

  if (rerunChangeList) {
    rerunChangeList.innerHTML = changes.length
      ? changes
          .map(
            (change) => `
              <article class="details-change-item">
                <strong>${change.label}</strong>
                <div class="details-change-values">
                  <span><em>Previous</em>${change.previous}</span>
                  <span><em>Updated</em>${change.next}</span>
                </div>
              </article>
            `
          )
          .join("")
      : `
          <article class="details-change-item details-change-item-empty">
            <strong>Current values preserved</strong>
            <div class="details-change-values">
              <span><em>Status</em>No changes detected in the Clinical Entry.</span>
            </div>
          </article>
        `;
  }

  openDetailModal(rerunConfirmationModal);
  pendingRerunProfile = updatedProfile;
};

const openDeletePredictionModal = () => {
  if (!detailEntry || !deleteSummaryNode) return;

  deleteSummaryNode.innerHTML = `
    <strong>${detailEntry.patient}</strong>
    <span>${detailEntry.id} · ${detailEntry.probability}% probability · ${detailEntry.result}</span>
  `;
  openDetailModal(deletePredictionModal);
};

const openValidationModal = () => {
  if (!detailEntry || !predictionValidationModal) return;

  const currentStatus = getValidationStatusMeta(detailEntry);
  const predictionBadge = getPredictionBadge(detailEntry);
  const currentOutcomeLabel = detailEntry.actualOutcome || "Awaiting confirmation";
  const currentOutcomeMeta = detailEntry.actualOutcome ? currentStatus.dateLabel : "No confirmed outcome saved yet";

  if (validationModalSummary) {
    validationModalSummary.innerHTML = `
      <div class="details-validation-summary-head">
        <div>
          <strong>${detailEntry.patient}</strong>
          <span>${detailEntry.id} | Reviewed ${formatDate(detailEntry.analyzedAt, true)}</span>
        </div>
        <span class="prediction-badge ${predictionBadge.tone}">${predictionBadge.label}</span>
      </div>
      <div class="details-validation-summary-grid">
        <article class="details-validation-summary-item">
          <span>Predicted outcome</span>
          <strong>${detailEntry.result}</strong>
          <small>${detailEntry.probability}% probability</small>
        </article>
        <article class="details-validation-summary-item">
          <span>Current real outcome</span>
          <strong>${currentOutcomeLabel}</strong>
          <small>${currentOutcomeMeta}</small>
        </article>
      </div>
    `;
  }

  if (validationOutcomeSelect) {
    validationOutcomeSelect.value = detailEntry.actualOutcome || "";
  }

  updateValidationPreview();
  openDetailModal(predictionValidationModal);
};

openRerunPredictionButtons.forEach((button) => {
  button.addEventListener("click", openRerunConfirmation);
});
openPatientHistoryButton?.addEventListener("click", (event) => {
  event.preventDefault();
  document.querySelector("#detail-prediction-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
});
openDeletePredictionButton?.addEventListener("click", openDeletePredictionModal);
openValidationModalButton?.addEventListener("click", openValidationModal);
inlineClinicalEntryForm?.addEventListener("input", clearRerunWarning);
inlineClinicalEntryForm?.addEventListener("change", clearRerunWarning);
inlineClinicalEntryForm?.addEventListener("input", updateRerunButtonState);
inlineClinicalEntryForm?.addEventListener("change", updateRerunButtonState);
validationOutcomeSelect?.addEventListener("input", updateValidationPreview);
validationOutcomeSelect?.addEventListener("change", updateValidationPreview);

initDetailTriStateToggles();
  initDetailManualRangeEditors();

detailToggleInputs.forEach((input) => {
  updateDetailTogglePresentation(input);
});

detailRangeInputs.forEach((input) => {
  updateDetailRangePresentation(input);
  input.addEventListener("input", () => {
    updateDetailRangePresentation(input);
    updateRerunButtonState();
  });
});

detailChipSelectGroups.forEach(initializeDetailChipSelect);
updateRerunButtonState();

confirmRerunPredictionButton?.addEventListener("click", async () => {
  if (!detailEntry || !pendingRerunProfile) return;

  const updatedProfile = pendingRerunProfile;
  const payload = buildRerunPayloadFromProfile(updatedProfile);
  const previousLabel = confirmRerunPredictionButton.textContent;

  confirmRerunPredictionButton.disabled = true;
  confirmRerunPredictionButton.textContent = "Re-running...";

  try {
    const updated = await updatePredictionDetailsEntry(detailEntry.id, payload);

    storedDetailProfiles[detailEntry.id] = updatedProfile;
    persistDetailProfiles();

    detailEntry = normalizePredictionDetailsEntry(updated);

    if (typeof upsertPatientPrediction === "function") {
      upsertPatientPrediction(detailEntry);
    }

    closeDetailModals();
    renderDetails(detailEntry);
    await loadPredictionHistory(detailEntry.id);
    detailOutcomeCard?.scrollIntoView({ behavior: "smooth", block: "start" });
    showPredictionDetailsToast("Prediction updated successfully.");
  } catch (error) {
    if (isAiServiceUnavailableError(error)) {
      openDetailServiceErrorModal(
        error instanceof Error
          ? error.message
          : "The AI prediction service is currently unavailable. Please try again later or contact the system administrator."
      );
    } else {
    showPredictionDetailsToast(
      error instanceof Error ? error.message : "Unable to re-run the prediction.",
      "danger"
    );
    }
  } finally {
    confirmRerunPredictionButton.disabled = false;
    confirmRerunPredictionButton.textContent = previousLabel;
  }
});

confirmValidationResultButton?.addEventListener("click", async () => {
  if (!detailEntry || !validationOutcomeSelect) return;

  const actualOutcome = validationOutcomeSelect.value;
  if (!actualOutcome) {
    validationOutcomeSelect.reportValidity();
    updateValidationPreview();
    return;
  }

  const previousLabel = confirmValidationResultButton.textContent;
  confirmValidationResultButton.disabled = true;
  confirmValidationResultButton.textContent = "Saving...";

  try {
    const updated = await updatePredictionDetailsEntry(detailEntry.id, { actualOutcome });
    detailEntry = normalizePredictionDetailsEntry(updated);

    if (typeof upsertPatientPrediction === "function") {
      upsertPatientPrediction(detailEntry);
    }

    closeDetailModals();
    renderDetails(detailEntry);
    await loadPredictionHistory(detailEntry.id);
    showPredictionDetailsToast("Real outcome saved successfully.");
  } catch (error) {
    showPredictionDetailsToast(
      error instanceof Error ? error.message : "Unable to save the confirmed outcome.",
      "danger"
    );
    if (validationPreviewNode) {
      validationPreviewNode.classList.remove("is-correct", "is-incorrect");
      validationPreviewNode.textContent =
        error instanceof Error ? error.message : "Unable to save the confirmed outcome.";
    }
  } finally {
    confirmValidationResultButton.disabled = false;
    confirmValidationResultButton.textContent = previousLabel;
  }
});

confirmDeletePredictionButton?.addEventListener("click", async () => {
  if (!detailEntry) return;

  const previousLabel = confirmDeletePredictionButton.textContent;
  confirmDeletePredictionButton.disabled = true;
  confirmDeletePredictionButton.textContent = "Deleting...";

  try {
    await deletePredictionDetailsEntry(detailEntry.id);

    delete storedDetailProfiles[detailEntry.id];
    persistDetailProfiles();
    deletePredictionRecordById(detailEntry.id);

    showPredictionDetailsToast("Prediction deleted successfully.");
    window.location.href = "history.html";
  } catch (error) {
    showPredictionDetailsToast(
      error instanceof Error ? error.message : "Unable to delete this prediction record.",
      "danger"
    );
  } finally {
    confirmDeletePredictionButton.disabled = false;
    confirmDeletePredictionButton.textContent = previousLabel;
  }
});

confirmHistoryVersionDeleteButton?.addEventListener("click", async () => {
  if (!detailEntry || !pendingHistoryDeleteEntry) return;

  const targetEntry = pendingHistoryDeleteEntry;
  const previousLabel = confirmHistoryVersionDeleteButton.textContent;

  confirmHistoryVersionDeleteButton.disabled = true;
  confirmHistoryVersionDeleteButton.textContent = "Deleting...";

  try {
    if (String(targetEntry.id).startsWith("local-")) {
      removeStoredPredictionHistoryEntry(detailEntry.id, targetEntry.id);
    } else {
      await deletePredictionHistoryEntryRequest(detailEntry.id, targetEntry.id);
      removeStoredPredictionHistoryEntry(detailEntry.id, targetEntry.id);
    }

    closeDetailModals();
    await loadPredictionHistory(detailEntry.id);
    showPredictionDetailsToast("Prediction history version deleted successfully.");
  } catch (error) {
    showPredictionDetailsToast(
      error instanceof Error ? error.message : "Unable to delete this prediction history version.",
      "danger"
    );
  } finally {
    confirmHistoryVersionDeleteButton.disabled = false;
    confirmHistoryVersionDeleteButton.textContent = previousLabel;
  }
});

const loadPredictionDetailsPage = async () => {
  if (!detailId) {
    renderMissingState();
    return;
  }

  if (detailEntry) {
    detailEntry = normalizePredictionDetailsEntry(detailEntry);
    renderDetails(detailEntry);
    loadPredictionHistory(detailEntry.id).catch(() => {});
  } else {
    renderLoadingState();
  }

  try {
    const remoteEntry = await requestPredictionDetailsEntry(detailId);
    detailEntry = normalizePredictionDetailsEntry(remoteEntry);

    if (typeof upsertPatientPrediction === "function") {
      upsertPatientPrediction(detailEntry);
    }

    renderDetails(detailEntry);
    await loadPredictionHistory(detailEntry.id);
  } catch (error) {
    if (detailEntry) {
      return;
    }
    renderMissingState();
  }
};

loadPredictionDetailsPage();
