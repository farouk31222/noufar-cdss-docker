const FLASK_AI_URL = process.env.FLASK_AI_URL || "http://127.0.0.1:5001";
const {
  getPredictionModels,
  findPredictionModel,
  getDefaultPredictionModel,
} = require("../config/predictionModels");

const normalizeText = (value) => String(value ?? "").trim().toLowerCase();

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  return ["yes", "true", "1", "on", "positive"].includes(normalizeText(value));
};

const normalizeConsultReason = (value) => {
  const normalized = normalizeText(value);

  if (normalized === "compression signs") return "Signes de compression";
  if (normalized === "dysthyroidie") return "DYSTHYROIDIE";

  return String(value ?? "").trim();
};

const normalizeUltrasound = (value) => {
  const normalized = normalizeText(value);

  if (normalized === "goiter") return "goitre";
  if (normalized === "diffuse goiter with vascular pattern") return "goitre";
  if (normalized === "goiter + nodules") return "goitre + nodules";
  if (normalized === "goiter with nodules") return "goitre + nodules";
  if (normalized === "normal volume") return "volume normal";
  if (normalized === "normal thyroid volume") return "volume normal";
  if (normalized === "mild heterogeneous texture") return "volume normal";

  return String(value ?? "").trim();
};

const normalizeScintigraphy = (value) => {
  const normalized = normalizeText(value);

  if (normalized === "high uptake") return "hypercaptante";
  if (normalized === "hot nodule") return "nodule chaud";
  if (normalized === "normal uptake") return "normocaptante";

  return String(value ?? "").trim();
};

const normalizeTherapy = (value) => {
  const normalized = normalizeText(value);

  if (normalized === "ats") return "ATS";
  return String(value ?? "").trim();
};

const featureLabelMap = {
  TSH: "TSH",
  FT4: "FT4",
  TSItaux: "TSI level",
  AntiTPOTAUX: "Anti-TPO total",
  ["dur\u00E9eATS"]: "Duration of treatment",
  AGE: "Age",
  stress: "Stress",
  palpitations: "Palpitations",
  spp: "SPP",
  amg: "AMG",
  diarrhee: "Diarrhea",
  temeblements: "Tremors",
  agitation: "Agitation",
  troublehumeur: "Mood disorder",
  sommeil: "Sleep disorder",
  hypersud: "Excess sweating",
  thermophobie: "Heat intolerance",
  faiblessemusc: "Muscle weakness",
  goitre: "Goiter",
  blockandrep: "Block and replace",
  chirurgie: "Surgery",
  IRA: "Radioactive iodine",
  motifconsult_DYSTHYROIDIE: "Consultation reason: DYSTHYROIDIE",
  "motifconsult_Signes de compression": "Consultation reason: Compression signs",
  classifgoitre_0: "Goiter classification 0",
  classifgoitre_1A: "Goiter classification 1A",
  classifgoitre_2: "Goiter classification 2",
  classifgoitre_3: "Goiter classification 3",
  AntiTPO_NEGATIFS: "Anti-TPO negative",
  AntiTPO_POSITIFS: "Anti-TPO positive",
  AntiTg_NEGATIFS: "Anti-Tg negative",
  AntiTg_POSITIFS: "Anti-Tg positive",
  TSI_NEGATIFS: "TSI negative",
  TSI_POSITIFS: "TSI positive",
  Echographie_goitre: "Ultrasound: goiter",
  "Echographie_goitre + nodules": "Ultrasound: goiter + nodules",
  "Echographie_volume normal": "Ultrasound: normal volume",
  Scintigraphie_hypercaptante: "Scintigraphy: high uptake",
  "Scintigraphie_nodule chaud": "Scintigraphy: hot nodule",
  Scintigraphie_normocaptante: "Scintigraphy: normal uptake",
  Therapie_ATS: "Therapy: ATS",
};

const buildFlaskPayload = (formData = {}) => ({
  TSH: toNumber(formData.tsh),
  FT4: toNumber(formData.ft4),
  TSIlevel: toNumber(formData.tsiLevel),
  AntiTPOtotal: toNumber(formData.antiTpoTotal),
  duration: toNumber(formData.duration),
  age: toNumber(formData.age),
  stress: toBoolean(formData.stress),
  palpitations: toBoolean(formData.palpitations),
  spp: toBoolean(formData.spp),
  amg: toBoolean(formData.amg),
  diarrhee: toBoolean(formData.diarrhea),
  tremors: toBoolean(formData.tremors),
  agitation: toBoolean(formData.agitation),
  moodDisorder: toBoolean(formData.moodDisorder),
  sleepDisorder: toBoolean(formData.sleepDisorder),
  excessSweating: toBoolean(formData.sweating),
  heatIntolerance: toBoolean(formData.heatIntolerance),
  muscleWeakness: toBoolean(formData.muscleWeakness),
  goiter: toBoolean(formData.goiter),
  blockAndReplace: toBoolean(formData.blockReplace),
  surgery: toBoolean(formData.surgery),
  radioactiveIodine: toBoolean(formData.radioactiveIodine),
  antiTPO: String(formData.antiTpo ?? "Not measured").trim(),
  antiTg: String(formData.antiTg ?? "Not measured").trim(),
  TSI: String(formData.tsi ?? "Not measured").trim(),
  consultReason: normalizeConsultReason(formData.consultationReason),
  goiterClass: String(formData.goiterClassification ?? "").trim(),
  ultrasound: normalizeUltrasound(formData.ultrasound),
  scintigraphy: normalizeScintigraphy(formData.scintigraphy),
  therapy: normalizeTherapy(formData.therapy),
});

const toDisplayFactors = (topFactors = []) =>
  topFactors.map((item) => ({
    label: featureLabelMap[item.feature] || item.feature,
    amount: Number(item.impact) || 0,
  }));

const requestFlaskJson = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(`${FLASK_AI_URL}${path}`, options);
  } catch (error) {
    const serviceError = new Error(
      "Le service IA Flask est indisponible. Verifiez que Flask tourne sur http://127.0.0.1:5001."
    );
    serviceError.code = "FLASK_UNREACHABLE";
    serviceError.status = 502;
    throw serviceError;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || data.message || "La communication avec le service IA a echoue.");
    error.code = "FLASK_REQUEST_FAILED";
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  return data;
};

const getPredictionModelCatalog = async () => {
  try {
    const data = await requestFlaskJson("/models");
    const localModels = getPredictionModels();
    const remoteOptions = Array.isArray(data?.options) ? data.options : [];

    const mergedOptions = localModels.map((model) => {
      const remoteMatch =
        remoteOptions.find((option) => option.key === model.key) ||
        remoteOptions.find((option) => findPredictionModel(option.key || option.label)?.key === model.key) ||
        null;

      return {
        key: model.key,
        label: model.label,
        description: model.description,
        deployed: Boolean(remoteMatch?.deployed),
      };
    });

    const resolvedActive =
      findPredictionModel(data?.activeModelKey || data?.activeModelLabel) || getDefaultPredictionModel();

    return {
      activeModelKey: resolvedActive.key,
      activeModelLabel: resolvedActive.label,
      options: mergedOptions,
    };
  } catch (error) {
    const defaultModel = getDefaultPredictionModel();
    return {
      activeModelKey: defaultModel.key,
      activeModelLabel: defaultModel.label,
      options: getPredictionModels().map((model) => ({
        key: model.key,
        label: model.label,
        description: model.description,
        deployed: model.key === defaultModel.key,
      })),
    };
  }
};

const requestPrediction = async (formData = {}, options = {}) => {
  const payload = {
    ...buildFlaskPayload(formData),
    ...(options.modelKey ? { modelKey: String(options.modelKey).trim() } : {}),
  };

  const data = await requestFlaskJson("/predict", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const probabilityScore = Number(data.probability) || 0;
  const probabilityPercent = Math.max(0, Math.min(100, Math.round(probabilityScore * 100)));
  const prediction = Number(data.prediction) === 1 ? 1 : 0;
  const result = prediction === 1 ? "Relapse" : "No Relapse";
  const topFactors = Array.isArray(data.top_factors) ? data.top_factors : [];

  return {
    flaskPayload: payload,
    prediction,
    result,
    modelName: String(data.model || options.modelLabel || "Logistic Regression").trim(),
    probabilityScore,
    probabilityPercent,
    riskLevel: String(data.risk_level || "LOW").toUpperCase(),
    topFactors,
    displayFactors: toDisplayFactors(topFactors),
    rawResponse: data,
  };
};

module.exports = {
  buildFlaskPayload,
  getPredictionModelCatalog,
  requestPrediction,
};
