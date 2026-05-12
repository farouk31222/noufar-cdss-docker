const defaultPatientPredictions = [
  {
    id: "NFR-2401",
    patient: "A. Benali",
    age: 34,
    sex: "F",
    analyzedAt: "2026-04-18",
    source: "Manual",
    result: "Relapse",
    probability: 78,
  },
  {
    id: "NFR-2402",
    patient: "M. Haddad",
    age: 41,
    sex: "M",
    analyzedAt: "2026-04-18",
    source: "Excel import",
    result: "No Relapse",
    probability: 28,
  },
  {
    id: "NFR-2403",
    patient: "S. Karim",
    age: 29,
    sex: "F",
    analyzedAt: "2026-04-17",
    source: "Manual",
    result: "Relapse",
    probability: 81,
  },
  {
    id: "NFR-2404",
    patient: "R. Naceur",
    age: 52,
    sex: "M",
    analyzedAt: "2026-04-16",
    source: "CSV import",
    result: "No Relapse",
    probability: 32,
  },
  {
    id: "NFR-2405",
    patient: "L. Farhat",
    age: 37,
    sex: "F",
    analyzedAt: "2026-04-15",
    source: "Manual",
    result: "Relapse",
    probability: 74,
  },
  {
    id: "NFR-2406",
    patient: "T. Mansouri",
    age: 45,
    sex: "M",
    analyzedAt: "2026-04-14",
    source: "Excel import",
    result: "No Relapse",
    probability: 21,
  },
  {
    id: "NFR-2407",
    patient: "N. Chikhi",
    age: 31,
    sex: "F",
    analyzedAt: "2026-04-13",
    source: "Manual",
    result: "Relapse",
    probability: 69,
  },
  {
    id: "NFR-2408",
    patient: "Y. Bouzid",
    age: 48,
    sex: "M",
    analyzedAt: "2026-04-12",
    source: "CSV import",
    result: "No Relapse",
    probability: 35,
  },
  {
    id: "NFR-2409",
    patient: "D. Saadi",
    age: 39,
    sex: "F",
    analyzedAt: "2026-04-11",
    source: "Manual",
    result: "Relapse",
    probability: 73,
  },
  {
    id: "NFR-2410",
    patient: "K. Yousfi",
    age: 43,
    sex: "M",
    analyzedAt: "2026-04-10",
    source: "Excel import",
    result: "No Relapse",
    probability: 24,
  },
  {
    id: "NFR-2411",
    patient: "H. Zeroual",
    age: 36,
    sex: "F",
    analyzedAt: "2026-04-09",
    source: "Manual",
    result: "Relapse",
    probability: 76,
  },
  {
    id: "NFR-2412",
    patient: "C. Belaid",
    age: 47,
    sex: "F",
    analyzedAt: "2026-04-08",
    source: "CSV import",
    result: "No Relapse",
    probability: 30,
  },
];

const PATIENT_PREDICTIONS_STORAGE_KEY = "noufar-patient-predictions";

const readStoredPatientPredictions = () => {
  try {
    const raw = window.localStorage.getItem(PATIENT_PREDICTIONS_STORAGE_KEY);
    if (!raw) return [...defaultPatientPredictions];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [...defaultPatientPredictions];
  } catch (error) {
    return [...defaultPatientPredictions];
  }
};

let patientPredictions = readStoredPatientPredictions();

const persistPatientPredictions = () => {
  try {
    window.localStorage.setItem(PATIENT_PREDICTIONS_STORAGE_KEY, JSON.stringify(patientPredictions));
  } catch (error) {
    // Ignore storage write failures to preserve offline local behaviour.
  }
};

const formatDate = (value, withTime = false) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value ?? "");
  }

  const base = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  if (!withTime) {
    return base;
  }

  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${base} ${time}`;
};

const getDashboardStats = () => {
  const relapse = patientPredictions.filter((entry) => entry.result === "Relapse").length;
  const noRelapse = patientPredictions.length - relapse;

  return {
    total: patientPredictions.length,
    relapse,
    noRelapse,
  };
};

const getRecentPatients = (count = 5) =>
  [...patientPredictions]
    .sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt))
    .slice(0, count);

const getPredictionById = (id) => patientPredictions.find((entry) => entry.id === id) || null;

const updatePredictionRecord = (id, updates) => {
  const index = patientPredictions.findIndex((entry) => entry.id === id);
  if (index === -1) return null;

  patientPredictions[index] = {
    ...patientPredictions[index],
    ...updates,
  };

  persistPatientPredictions();
  return patientPredictions[index];
};

const deletePredictionRecordById = (id) => {
  const index = patientPredictions.findIndex((entry) => entry.id === id);
  if (index === -1) return false;

  patientPredictions.splice(index, 1);
  persistPatientPredictions();
  return true;
};

const getTopRiskPatients = (count = 6) =>
  [...patientPredictions]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, count);

const getTrendSeries = () => {
  const sorted = [...patientPredictions].sort((a, b) => new Date(a.analyzedAt) - new Date(b.analyzedAt));
  return sorted.slice(-6).map((item) => ({
    label: new Date(item.analyzedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    value: item.result === "Relapse" ? 1 : 0.55,
  }));
};

const getAverageProbability = () => {
  if (!patientPredictions.length) return 0;

  const total = patientPredictions.reduce((sum, entry) => sum + entry.probability, 0);
  return Number((total / patientPredictions.length).toFixed(1));
};

const getCurrentDoctorIdentity = () => {
  try {
    const raw = window.localStorage.getItem("noufar-doctor-auth-v1");
    const session = raw ? JSON.parse(raw) : null;
    const user = session?.user || {};
    return {
      name: String(user.name || "").trim(),
      email: String(user.email || "").trim(),
    };
  } catch (error) {
    return { name: "", email: "" };
  }
};

const formatPredictedByDisplay = (value) => {
  const rawName = String(value || "").trim();
  if (!rawName) return "Unknown user";

  const current = getCurrentDoctorIdentity();
  const normalizedRaw = rawName.toLowerCase();
  const normalizedName = current.name.toLowerCase();
  const normalizedEmail = current.email.toLowerCase();

  if (
    (normalizedName && normalizedRaw === normalizedName) ||
    (normalizedEmail && normalizedRaw === normalizedEmail)
  ) {
    return "Me";
  }

  if (/^dr\.?\s+/i.test(rawName)) {
    return rawName;
  }

  return `Dr. ${rawName}`;
};

const getPredictionBadge = (entry) => {
  if (entry.result === "No Relapse") {
    return {
      label: "No Relapse",
      tone: "safe",
    };
  }

  return {
    label: "High Risk Relapse",
    tone: "relapse",
  };
};

const normalizePredictionEntry = (entry = {}) => ({
  id: String(entry.id || entry._id || ""),
  patient: entry.patient || entry.patientName || "Unknown patient",
  age: Number(entry.age || 0),
  sex: entry.sex || "Not specified",
  analyzedAt: entry.analyzedAt || entry.updatedAt || entry.createdAt || new Date().toISOString(),
  source: entry.source || "Manual",
  result:
    entry.result ||
    (Number(entry.prediction) === 1 ? "Relapse" : "No Relapse"),
  probability: Number.isFinite(Number(entry.probability))
    ? Number(entry.probability)
    : Math.round(Number(entry.probabilityScore || 0) * 100),
  actualOutcome: entry.actualOutcome || "",
  validationStatus: entry.validationStatus || "Pending",
  validationRecordedAt: entry.validationRecordedAt || "",
  consultationReason: entry.consultationReason || "",
  duration: Number(entry.duration || 0),
  predictedByName: entry.predictedByName || entry.doctorName || entry.savedByName || "",
});

const replacePatientPredictions = (entries = []) => {
  patientPredictions = entries.map((entry) => normalizePredictionEntry(entry));
  persistPatientPredictions();
  return patientPredictions;
};

const upsertPatientPrediction = (entry) => {
  const normalized = normalizePredictionEntry(entry);
  const index = patientPredictions.findIndex((item) => item.id === normalized.id);

  if (index === -1) {
    patientPredictions.unshift(normalized);
  } else {
    patientPredictions[index] = normalized;
  }

  persistPatientPredictions();
  return normalized;
};
