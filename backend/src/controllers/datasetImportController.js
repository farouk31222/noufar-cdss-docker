const DatasetImport = require("../models/DatasetImport");
const DatasetImportRow = require("../models/DatasetImportRow");
const { storePrivateUpload, removeStoredFile } = require("../services/fileAccessService");
const { logAuditEventSafe } = require("../services/auditLogService");
const {
  computeScopedBlindIndex,
  encryptDatasetImportRowPayload,
  decryptDatasetImportRowPayload,
} = require("../services/patientDataProtectionService");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toSafeStorageSegment = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "doctor";

const buildDoctorDatasetFolder = (doctorName = "") =>
  `doctor-dataset-imports/${toSafeStorageSegment(doctorName)}-imports`;

const parseJsonArrayField = (value, fieldLabel) => {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    if (!Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed;
  } catch (error) {
    const validationError = new Error(`${fieldLabel} must be a valid JSON array.`);
    validationError.statusCode = 400;
    throw validationError;
  }
};

const normalizeStringArray = (values = []) =>
  [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];

const normalizeDatasetColumnKey = (value) =>
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

const CONSULTATION_REASON_OPTIONS = Object.freeze([
  "DYSTHYROIDIE",
  "Compression signs",
  "Tumefaction",
  "Other",
]);

const CONSULTATION_REASON_ERROR =
  "Consultation reason must be DYSTHYROIDIE, Compression signs, Tumefaction, or Other.";

const ANTI_TPO_TOTAL_ALIASES = [
  "anti tpo total",
  "anti-tpo total",
  "anti_tpo_total",
  "antiTpoTotal",
  "antiTPOtotal",
  "AntiTPOTOTAL",
  "anti tpo taux",
  "anti-tpo taux",
  "anti_tpo_taux",
  "AntiTPO taux",
  "AntiTPOTAUX",
  "AntiTPO_TAUX",
  "anti tpo level",
  "anti-tpo level",
  "anti tpo value",
  "anti tpo titer",
  "anti tpo titre",
  "anti tpo total ui ml",
  "anti tpo total iu ml",
  "anti tpo total ui/ml",
  "anti tpo total iu/ml",
];

const TSI_LEVEL_ALIASES = [
  "tsi level",
  "tsiLevel",
  "TSILevel",
  "tsi_level",
  "tsi taux",
  "TSItaux",
  "TSI_taux",
  "tsi titer",
  "tsi titre",
  "tsi value",
  "tsi total",
  "tsi index",
];

const REQUIRED_DATASET_COLUMNS = [
  { label: "Name", aliases: ["name", "full name", "patient name", "nom", "patient"] },
  { label: "Age", aliases: ["age", "patient age", "AGE"] },
  { label: "Sex", aliases: ["sex", "gender", "sexe"] },
  { label: "Consultation reason", aliases: ["consultation reason", "reason", "motif consultation"] },
  { label: "TSH", aliases: ["tsh", "tsh level", "thyroid stimulating hormone"] },
  { label: "FT4", aliases: ["ft4", "ft 4", "free t4", "freeT4", "free thyroxine"] },
  { label: "Anti-TPO", aliases: ["anti tpo", "anti-tpo", "anti tpo status", "AntiTPO_POSITIFS", "AntiTPO_NEGATIFS"] },
  {
    label: "Anti-TPO total",
    aliases: ANTI_TPO_TOTAL_ALIASES,
  },
  { label: "Anti-Tg", aliases: ["anti tg", "anti-tg", "anti tg status", "AntiTg_POSITIFS", "AntiTg_NEGATIFS"] },
  { label: "TSI", aliases: ["tsi", "tsi status", "TSI_POSITIFS", "TSI_NEGATIFS"] },
  { label: "TSI level", aliases: TSI_LEVEL_ALIASES },
  { label: "Ultrasound", aliases: ["ultrasound", "thyroid ultrasound", "echographie"] },
  { label: "Scintigraphy", aliases: ["scintigraphy", "thyroid scintigraphy"] },
  { label: "Therapy", aliases: ["therapy", "treatment", "treatment type"] },
  { label: "Duration of treatment", aliases: ["duration of treatment", "treatment duration", "duration", "duree ats", "dureeATS"] },
];

const DATASET_FIELD_ALIASES = {
  name: ["name", "full name", "patient name", "nom", "patient"],
  age: ["age", "patient age", "AGE"],
  sex: ["sex", "gender", "sexe"],
  consultationReason: ["consultation reason", "reason", "motif consultation"],
  stress: ["stress"],
  palpitations: ["palpitations"],
  spp: ["spp"],
  amg: ["amg"],
  diarrhea: ["diarrhea"],
  tremors: ["tremors"],
  agitation: ["agitation"],
  moodDisorder: ["mood disorder", "moodDisorder"],
  sleepDisorder: ["sleep disorder", "sleepDisorder"],
  sweating: ["excess sweating", "sweating"],
  heatIntolerance: ["heat intolerance", "heatIntolerance"],
  muscleWeakness: ["muscle weakness", "muscleWeakness"],
  goiter: ["goiter"],
  tsh: ["tsh", "tsh level"],
  ft4: ["ft4", "ft 4", "free t4", "freeT4", "free thyroxine"],
  antiTpo: ["anti tpo", "anti-tpo", "antiTpo"],
  antiTpoTotal: ANTI_TPO_TOTAL_ALIASES,
  antiTg: ["anti tg", "anti-tg", "antiTg"],
  tsi: ["tsi"],
  tsiLevel: TSI_LEVEL_ALIASES,
  ultrasound: ["ultrasound", "echographie"],
  scintigraphy: ["scintigraphy"],
  therapy: ["therapy", "treatment", "treatment type"],
  blockReplace: ["block and replace", "block replace"],
  duration: ["duration of treatment", "treatment duration", "duration", "dureeATS", "duree ats"],
  surgery: ["surgery"],
  radioactiveIodine: ["radioactive iodine", "radioactiveIodine"],
};

const getMissingDatasetColumns = (columns = []) => {
  const normalizedColumns = new Set(columns.map(normalizeDatasetColumnKey));
  return REQUIRED_DATASET_COLUMNS.filter((field) =>
    field.aliases.every((alias) => !normalizedColumns.has(normalizeDatasetColumnKey(alias)))
  ).map((field) => field.label);
};

const getDatasetFieldForColumn = (column) => {
  const normalizedColumn = normalizeDatasetColumnKey(column);
  return (
    Object.entries(DATASET_FIELD_ALIASES).find(([, aliases]) =>
      aliases.some((alias) => normalizeDatasetColumnKey(alias) === normalizedColumn)
    )?.[0] || ""
  );
};

const parseDatasetNumber = (value) => {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const isDatasetNotMeasured = (value) => {
  const normalized = normalizeDatasetColumnKey(value);
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

const normalizeDatasetConsultationReason = (value) => {
  if (value === undefined || value === null || String(value).trim() === "" || isDatasetNotMeasured(value)) {
    return "";
  }

  const normalized = normalizeDatasetColumnKey(value);
  return (
    CONSULTATION_REASON_OPTIONS.find(
      (option) => normalizeDatasetColumnKey(option) === normalized
    ) || String(value ?? "").trim()
  );
};

const isAllowedDatasetConsultationReason = (value) =>
  CONSULTATION_REASON_OPTIONS.some(
    (option) => normalizeDatasetColumnKey(option) === normalizeDatasetColumnKey(value)
  );

const normalizeDatasetSex = (value) => {
  const normalized = normalizeDatasetColumnKey(value);
  if (["m", "male", "h", "homme", "man"].includes(normalized)) return "Male";
  if (["f", "female", "femme", "famme", "woman"].includes(normalized)) return "Female";
  return String(value ?? "").trim();
};

const normalizeDatasetClinicalStatus = (value) => {
  if (value === undefined || value === null || String(value).trim() === "" || isDatasetNotMeasured(value)) {
    return "Not measured";
  }
  const normalized = normalizeDatasetColumnKey(value);
  if (["yes", "true", "1", "positive", "positif", "positifs", "positives", "present"].includes(normalized)) {
    return "Positive";
  }
  if (["no", "false", "0", "negative", "negatif", "negatifs", "negatives", "absent"].includes(normalized)) {
    return "Negative";
  }
  return String(value).trim();
};

const normalizeDatasetToggle = (value) => {
  if (value === undefined || value === null || String(value).trim() === "" || isDatasetNotMeasured(value)) {
    return "Not measured";
  }
  const normalized = normalizeDatasetColumnKey(value);
  if (["yes", "oui", "true", "1", "positive", "positif", "positifs", "present"].includes(normalized)) return "Yes";
  if (["no", "non", "false", "0", "negative", "negatif", "negatifs", "absent"].includes(normalized)) return "No";
  return String(value).trim();
};

const normalizeDatasetMeasuredNumber = (value) => {
  if (value === undefined || value === null || String(value).trim() === "" || isDatasetNotMeasured(value)) {
    return "Not measured";
  }
  const parsed = parseDatasetNumber(value);
  return parsed === null ? String(value).trim() : parsed;
};

const normalizeDatasetUltrasound = (value) => {
  const normalized = normalizeDatasetColumnKey(value);
  if (["goiter", "goitre"].includes(normalized)) return "Goiter";
  if (["normal volume", "volume normal"].includes(normalized)) return "Normal volume";
  if (["goiter nodules", "goitre nodules", "goiter nodule", "goitre nodule"].includes(normalized)) {
    return "Goiter + nodules";
  }
  return String(value ?? "").trim();
};

const normalizeDatasetScintigraphy = (value) => {
  const normalized = normalizeDatasetColumnKey(value);
  if (["normal uptake", "normocaptante", "normocaptation"].includes(normalized)) return "Normal uptake";
  if (["high uptake", "hypercaptante", "hypercaptation"].includes(normalized)) return "High uptake";
  if (["hot nodule", "nodule chaud"].includes(normalized)) return "Hot nodule";
  return String(value ?? "").trim();
};

const normalizeDatasetTherapy = (value) => {
  const normalized = normalizeDatasetColumnKey(value);
  if (["carbimazole", "ats", "therapie ats", "traitement ats"].includes(normalized)) return "Carbimazole";
  if (["benzylthiouracile", "benzyl thiouracile", "btu"].includes(normalized)) return "Benzylthiouracile";
  return String(value ?? "").trim();
};

const normalizeDatasetFieldValue = (field, value) => {
  if (field === "sex") return normalizeDatasetSex(value);
  if (field === "consultationReason") return normalizeDatasetConsultationReason(value);
  if (["antiTpo", "antiTg", "tsi"].includes(field)) return normalizeDatasetClinicalStatus(value);
  if (field === "ultrasound") return normalizeDatasetUltrasound(value);
  if (field === "scintigraphy") return normalizeDatasetScintigraphy(value);
  if (field === "therapy") return normalizeDatasetTherapy(value);
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
    return normalizeDatasetToggle(value);
  }
  if (["tsh", "ft4", "antiTpoTotal", "tsiLevel"].includes(field)) return normalizeDatasetMeasuredNumber(value);
  if (field === "duration") {
    const parsed = parseDatasetNumber(value);
    return parsed === null ? String(value ?? "").trim() : parsed;
  }
  return String(value ?? "").trim();
};

const normalizeDatasetFieldForStorage = (field, value) => {
  if (field && isDatasetNotMeasured(value)) {
    return "";
  }
  return normalizeDatasetFieldValue(field, value);
};

const getDatasetCellValidationMessage = (field, value) => {
  if (!field) return "";
  const normalizedValue = normalizeDatasetFieldValue(field, value);
  const raw = String(normalizedValue ?? "").trim();
  const normalized = normalizeDatasetColumnKey(raw);

  if (field === "consultationReason") {
    if (!raw || isDatasetNotMeasured(raw)) return "Consultation reason is required.";
    if (!isAllowedDatasetConsultationReason(raw)) return CONSULTATION_REASON_ERROR;
  }

  if (!raw || isDatasetNotMeasured(raw)) return "";

  if (field === "age") {
    const age = parseDatasetNumber(raw);
    if (age === null) return "Age must be a number.";
    if (age < 17 || age > 100) return "Age must be between 17 and 100.";
  }

  if (field === "duration") {
    const duration = parseDatasetNumber(raw);
    if (duration === null) return "Duration must be a number.";
    if (duration < 3 || duration > 96) return "Duration must be between 3 and 96 months.";
  }

  if (["tsh", "ft4", "antiTpoTotal", "tsiLevel"].includes(field)) {
    if (!raw || isDatasetNotMeasured(raw)) return "";
    if (parseDatasetNumber(raw) === null) return "Value must be numeric or Not measured.";
  }

  if (field === "sex" && !["male", "female"].includes(normalized)) {
    return "Sex must be Male or Female.";
  }

  if (["antiTpo", "antiTg", "tsi"].includes(field)) {
    if (!["positive", "negative", "not measured", "yes", "no"].includes(normalized)) {
      return "Value must be Positive, Negative, or Not measured.";
    }
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
    ].includes(field) &&
    raw &&
    !isDatasetNotMeasured(raw) &&
    !["yes", "no", "true", "false", "1", "0", "positive", "negative"].includes(normalized)
  ) {
    return "Value must be Yes, No, or Not measured.";
  }

  if (field === "ultrasound" && !["goiter", "normal volume", "goiter nodules"].includes(normalized)) {
    return "Ultrasound must match an allowed option.";
  }

  if (field === "scintigraphy" && !["normal uptake", "high uptake", "hot nodule"].includes(normalized)) {
    return "Scintigraphy must match an allowed option.";
  }

  if (field === "therapy" && !["carbimazole", "benzylthiouracile"].includes(normalized)) {
    return "Therapy must be Carbimazole or Benzylthiouracile.";
  }

  return "";
};

const getDatasetRowValidationErrors = (columns = [], rowData = {}) =>
  columns
    .map((column) => ({
      column,
      message: getDatasetCellValidationMessage(getDatasetFieldForColumn(column), rowData[column]),
    }))
    .filter((entry) => entry.message);

const buildRowSearchText = (rowData = {}) =>
  Object.values(rowData || {})
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

const buildDatasetRowProtectionPayload = (rowData = {}) => {
  const searchText = buildRowSearchText(rowData);
  const consultationReason = normalizeDatasetConsultationReason(
    getDatasetRowValue(rowData, ["Consultation reason", "Reason", "Motif consultation"])
  );
  const sex = normalizeDatasetSex(getDatasetRowValue(rowData, ["Sex", "Gender", "Sexe"]));
  const ultrasound = normalizeDatasetUltrasound(
    getDatasetRowValue(rowData, ["Ultrasound", "Thyroid ultrasound", "Echographie"])
  );
  const tsi = normalizeDatasetClinicalStatus(getDatasetRowValue(rowData, ["TSI", "TSI status"]));

  return {
    searchText,
    consultationReason,
    ultrasound,
    tsi,
    encrypted: encryptDatasetImportRowPayload({
      rowData,
      searchText,
      consultationReason,
      sex,
      ultrasound,
      tsi,
    }),
  };
};

const decryptDatasetRowForResponse = (entry = {}) => {
  const plain = decryptDatasetImportRowPayload(entry);
  const rowData = plain.rowData && typeof plain.rowData === "object" ? plain.rowData : {};

  return {
    __rowId: entry.rowId,
    ...rowData,
  };
};

const datasetValueMatchesFilter = (actual = "", expected = "") =>
  !expected || String(actual || "").trim().toLowerCase() === String(expected || "").trim().toLowerCase();

const datasetRowMatchesQuery = (entry = {}, plain = {}, query = {}) => {
  const rowData = plain.rowData && typeof plain.rowData === "object" ? plain.rowData : {};
  const searchText = String(plain.searchText || buildRowSearchText(rowData)).toLowerCase();

  if (query.search && !searchText.includes(query.search)) {
    return false;
  }

  if (query.consultationReason) {
    const expectedValue = normalizeDatasetConsultationReason(query.consultationReason);
    const expectedBlindIndex = computeScopedBlindIndex(
      "dataset_import_row:consultationReason",
      expectedValue
    );
    if (
      String(entry.consultationReasonBlindIndex || "") !== expectedBlindIndex &&
      !datasetValueMatchesFilter(
        normalizeDatasetConsultationReason(
          getDatasetRowValue(rowData, ["Consultation reason", "Reason", "Motif consultation"])
        ),
        expectedValue
      )
    ) {
      return false;
    }
  }

  if (query.sex) {
    const expectedValue = normalizeDatasetSex(query.sex);
    const expectedBlindIndex = computeScopedBlindIndex("dataset_import_row:sex", expectedValue);
    if (
      String(entry.sexBlindIndex || "") !== expectedBlindIndex &&
      !datasetValueMatchesFilter(
        normalizeDatasetSex(getDatasetRowValue(rowData, ["Sex", "Gender", "Sexe"])),
        expectedValue
      )
    ) {
      return false;
    }
  }

  if (query.ultrasound) {
    const expectedValue = normalizeDatasetUltrasound(query.ultrasound);
    const expectedBlindIndex = computeScopedBlindIndex("dataset_import_row:ultrasound", expectedValue);
    if (
      String(entry.ultrasoundBlindIndex || "") !== expectedBlindIndex &&
      !datasetValueMatchesFilter(
        normalizeDatasetUltrasound(
          getDatasetRowValue(rowData, ["Ultrasound", "Thyroid ultrasound", "Echographie"])
        ),
        expectedValue
      )
    ) {
      return false;
    }
  }

  if (query.tsi) {
    const expectedValue = normalizeDatasetClinicalStatus(query.tsi);
    const expectedBlindIndex = computeScopedBlindIndex("dataset_import_row:tsi", expectedValue);
    if (
      String(entry.tsiBlindIndex || "") !== expectedBlindIndex &&
      !datasetValueMatchesFilter(
        normalizeDatasetClinicalStatus(getDatasetRowValue(rowData, ["TSI", "TSI status"])),
        expectedValue
      )
    ) {
      return false;
    }
  }

  return true;
};

const getDatasetRowValue = (rowData = {}, aliases = []) => {
  const normalizedAliases = aliases.map(normalizeDatasetColumnKey);
  for (const [key, value] of Object.entries(rowData || {})) {
    if (
      normalizedAliases.includes(normalizeDatasetColumnKey(key)) &&
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }
  return "";
};

const sanitizeDatasetImport = (entry) => ({
  id: String(entry._id),
  name: entry.name,
  fileName: entry.fileName,
  mimeType: entry.mimeType || "",
  fileSize: entry.fileSize || 0,
  uploadedAt: entry.createdAt,
  updatedAt: entry.updatedAt,
  sheetName: entry.sheetName || "",
  columns: Array.isArray(entry.columns) ? entry.columns : [],
  rowCount: Number(entry.totalRows) || 0,
  importedRows: Number(entry.importedRows) || 0,
  status: entry.status || "uploading",
  consultationReasons: CONSULTATION_REASON_OPTIONS,
  ultrasoundValues: Array.isArray(entry.ultrasoundValues) ? entry.ultrasoundValues : [],
  tsiValues: Array.isArray(entry.tsiValues) ? entry.tsiValues : [],
});

const getOwnedDatasetImport = async (datasetId, doctorId) => {
  const datasetImport = await DatasetImport.findOne({
    _id: datasetId,
    doctor: doctorId,
  });

  if (!datasetImport) {
    const error = new Error("Imported dataset not found.");
    error.statusCode = 404;
    throw error;
  }

  return datasetImport;
};

const listDatasetImports = async (req, res, next) => {
  try {
    const items = await DatasetImport.find({
      doctor: req.user._id,
      status: "ready",
    }).sort({ updatedAt: -1 });

    res.status(200).json(items.map((entry) => sanitizeDatasetImport(entry)));
  } catch (error) {
    next(error);
  }
};

const createDatasetImport = async (req, res, next) => {
  let datasetImport = null;
  try {
    if (!req.file) {
      res.status(400);
      throw new Error("A dataset file is required.");
    }

    const sheetName = String(req.body?.sheetName || "").trim();
    const name = String(req.body?.name || req.file.originalname || "").trim();
    const totalRows = Number(req.body?.totalRows || 0);
    const columns = normalizeStringArray(parseJsonArrayField(req.body?.columns, "Columns"));
    const consultationReasons = CONSULTATION_REASON_OPTIONS;
    const ultrasoundValues = normalizeStringArray(
      parseJsonArrayField(req.body?.ultrasoundValues, "Ultrasound values")
    );
    const tsiValues = normalizeStringArray(parseJsonArrayField(req.body?.tsiValues, "TSI values"));

    if (!sheetName) {
      res.status(400);
      throw new Error("Sheet name is required.");
    }

    if (!name) {
      res.status(400);
      throw new Error("Dataset name is required.");
    }

    if (!columns.length) {
      res.status(400);
      throw new Error("At least one dataset column is required.");
    }

    const missingColumns = getMissingDatasetColumns(columns);
    if (missingColumns.length) {
      res.status(400);
      throw new Error(
        `Import rejected. Missing required column${missingColumns.length > 1 ? "s" : ""}: ${missingColumns.join(", ")}.`
      );
    }

    if (!Number.isInteger(totalRows) || totalRows <= 0) {
      res.status(400);
      throw new Error("A valid dataset row count is required.");
    }

    const duplicate = await DatasetImport.findOne({
      doctor: req.user._id,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    }).select("_id");

    if (duplicate) {
      res.status(409);
      throw new Error("A dataset with this file name already exists in your private imports.");
    }

    const storedFile = await storePrivateUpload({
      file: req.file,
      folder: buildDoctorDatasetFolder(req.user?.name || req.user?.email || "doctor"),
    });

    datasetImport = await DatasetImport.create({
      doctor: req.user._id,
      name,
      fileName: storedFile.fileName,
      filePath: storedFile.filePath,
      storageProvider: storedFile.storageProvider,
      bucket: storedFile.bucket,
      objectKey: storedFile.objectKey,
      mimeType: storedFile.mimeType,
      fileSize: storedFile.fileSize,
      sheetName,
      columns,
      totalRows,
      consultationReasons,
      ultrasoundValues,
      tsiValues,
      importedRows: 0,
      status: "uploading",
    });

    res.status(201).json({
      datasetImport: sanitizeDatasetImport(datasetImport),
    });
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "dataset_import.create",
      targetType: "dataset-import",
      targetId: datasetImport._id,
      outcome: "success",
      metadata: {
        name: datasetImport.name,
        fileName: datasetImport.fileName,
        totalRows: datasetImport.totalRows,
        columnCount: datasetImport.columns.length,
      },
    });
  } catch (error) {
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "dataset_import.create_failed",
      targetType: "dataset-import",
      targetId: datasetImport?._id || "",
      outcome: Number(res.statusCode || 500) >= 400 && Number(res.statusCode || 500) < 500 ? "denied" : "failed",
      metadata: {
        name: String(req.body?.name || req.file?.originalname || "").trim(),
        fileName: req.file?.originalname || "",
        reason: error.message,
      },
    });
    next(error);
  }
};

const appendDatasetImportRows = async (req, res, next) => {
  try {
    const datasetImport = await getOwnedDatasetImport(req.params.id, req.user._id);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

    if (!rows.length) {
      res.status(400);
      throw new Error("At least one parsed dataset row is required.");
    }

    if (datasetImport.status === "ready") {
      res.status(400);
      throw new Error("This dataset import is already complete.");
    }

    const startIndex = Number(datasetImport.importedRows) || 0;
    const preparedRows = rows.map((rowData, index) => {
      const rowObject = rowData && typeof rowData === "object" ? rowData : {};
      const rowId = String(rowObject.__rowId || `row-${startIndex + index + 1}`).trim();
      const normalizedRowObject = { ...rowObject, __rowId: rowId };

      Object.keys(rowObject).forEach((column) => {
        if (column === "__rowId") return;
        normalizedRowObject[column] = normalizeDatasetFieldForStorage(
          getDatasetFieldForColumn(column),
          rowObject[column] ?? ""
        );
      });

      // Validation errors are no longer blocking the import.
      // Empty or invalid values are flagged visually on the row in the dataset table
      // and enforced only at inline-edit save time.
      // const validationErrors = getDatasetRowValidationErrors(datasetImport.columns, normalizedRowObject);
      // if (validationErrors.length) {
      //   const firstError = validationErrors[0];
      //   const validationError = new Error(
      //     `Import rejected on row ${startIndex + index + 1}, ${firstError.column}: ${firstError.message}`
      //   );
      //   validationError.statusCode = 400;
      //   throw validationError;
      // }

      const protectedPayload = buildDatasetRowProtectionPayload(normalizedRowObject);

      return {
        datasetImport: datasetImport._id,
        doctor: req.user._id,
        rowId,
        rowIndex: startIndex + index,
        rowData: {},
        searchText: "",
        consultationReason: "",
        ultrasound: "",
        tsi: "",
        encryptedRowData: protectedPayload.encrypted.encryptedRowData,
        encryptedSearchText: protectedPayload.encrypted.encryptedSearchText,
        encryptedRowDataKeyId: protectedPayload.encrypted.encryptedRowDataKeyId,
        consultationReasonBlindIndex: protectedPayload.encrypted.consultationReasonBlindIndex,
        sexBlindIndex: protectedPayload.encrypted.sexBlindIndex,
        ultrasoundBlindIndex: protectedPayload.encrypted.ultrasoundBlindIndex,
        tsiBlindIndex: protectedPayload.encrypted.tsiBlindIndex,
      };
    });

    await DatasetImportRow.insertMany(preparedRows, { ordered: true });

    datasetImport.importedRows += preparedRows.length;
    if (datasetImport.importedRows >= datasetImport.totalRows) {
      datasetImport.importedRows = datasetImport.totalRows;
      datasetImport.status = "ready";
    }
    await datasetImport.save();

    res.status(200).json({
      datasetImport: sanitizeDatasetImport(datasetImport),
    });
  } catch (error) {
    next(error);
  }
};

const getDatasetImport = async (req, res, next) => {
  try {
    const datasetImport = await getOwnedDatasetImport(req.params.id, req.user._id);
    res.status(200).json({
      datasetImport: sanitizeDatasetImport(datasetImport),
    });
  } catch (error) {
    next(error);
  }
};

const listDatasetImportRows = async (req, res, next) => {
  try {
    const datasetImport = await getOwnedDatasetImport(req.params.id, req.user._id);
    const page = Math.max(1, Number(req.query?.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query?.pageSize) || 8));
    const search = String(req.query?.search || "").trim().toLowerCase();
    const consultationReason = String(req.query?.consultationReason || "").trim();
    const sex = String(req.query?.sex || "").trim();
    const ultrasound = String(req.query?.ultrasound || "").trim();
    const tsi = String(req.query?.tsi || "").trim();

    const baseFilter = {
      datasetImport: datasetImport._id,
      doctor: req.user._id,
    };

    const allRows = await DatasetImportRow.find(baseFilter).sort({ rowIndex: 1 }).lean();
    const filteredRows = allRows
      .map((entry) => ({
        entry,
        plain: decryptDatasetImportRowPayload(entry),
      }))
      .filter(({ entry, plain }) =>
        datasetRowMatchesQuery(entry, plain, {
          search,
          consultationReason,
          sex,
          ultrasound,
          tsi,
        })
      );

    const totalItems = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const rows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    res.status(200).json({
      datasetImport: sanitizeDatasetImport(datasetImport),
      pagination: {
        page: currentPage,
        pageSize,
        totalItems,
        totalPages,
      },
      rows: rows.map(({ entry, plain }) => ({
        __rowId: entry.rowId,
        ...(plain.rowData && typeof plain.rowData === "object" ? plain.rowData : {}),
      })),
    });
  } catch (error) {
    next(error);
  }
};

const updateDatasetImportRow = async (req, res, next) => {
  try {
    const datasetImport = await getOwnedDatasetImport(req.params.id, req.user._id);
    const rowData = req.body?.rowData && typeof req.body.rowData === "object" ? req.body.rowData : null;

    if (!rowData || Array.isArray(rowData)) {
      res.status(400);
      throw new Error("A valid dataset row payload is required.");
    }

    const existingRow = await DatasetImportRow.findOne({
      datasetImport: datasetImport._id,
      doctor: req.user._id,
      rowId: req.params.rowId,
    });

    if (!existingRow) {
      res.status(404);
      throw new Error("Imported dataset row not found.");
    }

    const normalizedRowData = {
      __rowId: existingRow.rowId,
    };

    datasetImport.columns.forEach((column) => {
      normalizedRowData[column] = normalizeDatasetFieldForStorage(getDatasetFieldForColumn(column), rowData[column] ?? "");
    });

    const validationErrors = getDatasetRowValidationErrors(datasetImport.columns, normalizedRowData);
    if (validationErrors.length) {
      res.status(400);
      throw new Error(`${validationErrors[0].column}: ${validationErrors[0].message}`);
    }

    const protectedPayload = buildDatasetRowProtectionPayload(normalizedRowData);

    existingRow.rowData = {};
    existingRow.searchText = "";
    existingRow.consultationReason = "";
    existingRow.ultrasound = "";
    existingRow.tsi = "";
    existingRow.encryptedRowData = protectedPayload.encrypted.encryptedRowData;
    existingRow.encryptedSearchText = protectedPayload.encrypted.encryptedSearchText;
    existingRow.encryptedRowDataKeyId = protectedPayload.encrypted.encryptedRowDataKeyId;
    existingRow.consultationReasonBlindIndex = protectedPayload.encrypted.consultationReasonBlindIndex;
    existingRow.sexBlindIndex = protectedPayload.encrypted.sexBlindIndex;
    existingRow.ultrasoundBlindIndex = protectedPayload.encrypted.ultrasoundBlindIndex;
    existingRow.tsiBlindIndex = protectedPayload.encrypted.tsiBlindIndex;
    await existingRow.save();

    datasetImport.updatedAt = new Date();
    await datasetImport.save();

    res.status(200).json({
      row: decryptDatasetRowForResponse(existingRow),
      datasetImport: sanitizeDatasetImport(datasetImport),
    });

    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "dataset_import.row_update",
      targetType: "dataset-import-row",
      targetId: existingRow._id,
      outcome: "success",
      metadata: {
        datasetImportId: String(datasetImport._id),
        rowId: existingRow.rowId,
        columnCount: datasetImport.columns.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

const deleteDatasetImport = async (req, res, next) => {
  let datasetImport = null;
  try {
    datasetImport = await getOwnedDatasetImport(req.params.id, req.user._id);

    await DatasetImportRow.deleteMany({
      datasetImport: datasetImport._id,
      doctor: req.user._id,
    });

    await removeStoredFile(datasetImport);
    await datasetImport.deleteOne();

    res.status(200).json({
      message: "Imported dataset deleted successfully.",
    });
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "dataset_import.delete",
      targetType: "dataset-import",
      targetId: req.params.id,
      outcome: "success",
      metadata: {
        name: datasetImport.name,
        fileName: datasetImport.fileName,
      },
    });
  } catch (error) {
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "dataset_import.delete_failed",
      targetType: "dataset-import",
      targetId: datasetImport?._id || req.params.id,
      outcome: Number(res.statusCode || 500) >= 400 && Number(res.statusCode || 500) < 500 ? "denied" : "failed",
      metadata: {
        name: datasetImport?.name || "",
        fileName: datasetImport?.fileName || "",
        reason: error.message,
      },
    });
    next(error);
  }
};

module.exports = {
  listDatasetImports,
  createDatasetImport,
  appendDatasetImportRows,
  updateDatasetImportRow,
  getDatasetImport,
  listDatasetImportRows,
  deleteDatasetImport,
};
