const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const DatasetImportRow = require("../src/models/DatasetImportRow");
const {
  encryptDatasetImportRowPayload,
  decryptDatasetImportRowPayload,
} = require("../src/services/patientDataProtectionService");

const BATCH_SIZE = 200;

const normalizeKey = (value = "") =>
  String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");

const CONSULTATION_REASON_OPTIONS = ["DYSTHYROIDIE", "Compression signs", "Tumefaction", "Other"];

const isNotMeasured = (value = "") =>
  ["", "-", "not measured", "not mesured", "not messured", "not available", "na", "n a", "missing", "unknown"].includes(
    normalizeKey(value)
  );

const normalizeConsultationReason = (value = "") => {
  if (isNotMeasured(value)) return "";
  const normalized = normalizeKey(value);
  return CONSULTATION_REASON_OPTIONS.find((option) => normalizeKey(option) === normalized) || String(value || "").trim();
};

const normalizeSex = (value = "") => {
  const normalized = normalizeKey(value);
  if (["m", "male", "h", "homme", "man"].includes(normalized)) return "Male";
  if (["f", "female", "femme", "famme", "woman"].includes(normalized)) return "Female";
  return String(value || "").trim();
};

const buildRowSearchText = (rowData = {}) =>
  Object.values(rowData || {})
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

const getRowValue = (rowData = {}, aliases = []) => {
  const normalizedAliases = aliases.map(normalizeKey);
  for (const [key, value] of Object.entries(rowData || {})) {
    if (normalizedAliases.includes(normalizeKey(key)) && value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return "";
};

const normalizeClinicalStatus = (value = "") => {
  const normalized = normalizeKey(value);
  if (["yes", "true", "1", "positive", "positif", "positifs", "positives", "present"].includes(normalized)) {
    return "Positive";
  }
  if (["no", "false", "0", "negative", "negatif", "negatifs", "negatives", "absent"].includes(normalized)) {
    return "Negative";
  }
  return String(value || "").trim();
};

const normalizeUltrasound = (value = "") => {
  const normalized = normalizeKey(value);
  if (["goiter", "goitre"].includes(normalized)) return "Goiter";
  if (["normal volume", "volume normal"].includes(normalized)) return "Normal volume";
  if (["goiter nodules", "goitre nodules", "goiter nodule", "goitre nodule"].includes(normalized)) {
    return "Goiter + nodules";
  }
  return String(value || "").trim();
};

const buildProtectedPayload = (row) => {
  const plain = decryptDatasetImportRowPayload(row);
  const rowData = plain.rowData && typeof plain.rowData === "object" ? plain.rowData : {};
  const searchText = plain.searchText || buildRowSearchText(rowData);
  const consultationReason = normalizeConsultationReason(
    String(row.consultationReason || "").trim() ||
      String(getRowValue(rowData, ["Consultation reason", "Reason", "Motif consultation"])).trim()
  );
  const sex = normalizeSex(getRowValue(rowData, ["Sex", "Gender", "Sexe"]));
  const ultrasound =
    String(row.ultrasound || "").trim() ||
    normalizeUltrasound(getRowValue(rowData, ["Ultrasound", "Thyroid ultrasound", "Echographie"]));
  const tsi =
    String(row.tsi || "").trim() || normalizeClinicalStatus(getRowValue(rowData, ["TSI", "TSI status"]));

  return encryptDatasetImportRowPayload({
    rowData,
    searchText,
    consultationReason,
    sex,
    ultrasound,
    tsi,
  });
};

const getIndexSourceValues = (row) => {
  const plain = decryptDatasetImportRowPayload(row);
  const rowData = plain.rowData && typeof plain.rowData === "object" ? plain.rowData : {};

  return {
    consultationReason: normalizeConsultationReason(
      String(row.consultationReason || "").trim() ||
        String(getRowValue(rowData, ["Consultation reason", "Reason", "Motif consultation"])).trim()
    ),
    sex: normalizeSex(getRowValue(rowData, ["Sex", "Gender", "Sexe"])),
    ultrasound:
      String(row.ultrasound || "").trim() ||
      normalizeUltrasound(getRowValue(rowData, ["Ultrasound", "Thyroid ultrasound", "Echographie"])),
    tsi: String(row.tsi || "").trim() || normalizeClinicalStatus(getRowValue(rowData, ["TSI", "TSI status"])),
  };
};

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  await mongoose.connect(mongoUri);

  let processed = 0;
  let encrypted = 0;
  let cursor = null;

  while (true) {
    const filter = cursor ? { _id: { $gt: cursor } } : {};
    const rows = await DatasetImportRow.find(filter).sort({ _id: 1 }).limit(BATCH_SIZE);
    if (!rows.length) break;

    for (const row of rows) {
      processed += 1;
      cursor = row._id;

      const hasEncryptedRow =
        row.encryptedRowData &&
        typeof row.encryptedRowData === "object" &&
        Object.keys(row.encryptedRowData).length > 0;
      const indexSourceValues = getIndexSourceValues(row);
      const missingBlindIndexes =
        (indexSourceValues.consultationReason && !String(row.consultationReasonBlindIndex || "").trim()) ||
        (indexSourceValues.sex && !String(row.sexBlindIndex || "").trim()) ||
        (indexSourceValues.ultrasound && !String(row.ultrasoundBlindIndex || "").trim()) ||
        (indexSourceValues.tsi && !String(row.tsiBlindIndex || "").trim());
      const hasClearSensitiveData =
        (row.rowData && typeof row.rowData === "object" && Object.keys(row.rowData).length > 0) ||
        String(row.searchText || "").trim() ||
        String(row.consultationReason || "").trim() ||
        String(row.ultrasound || "").trim() ||
        String(row.tsi || "").trim();

      if (hasEncryptedRow && !hasClearSensitiveData && !missingBlindIndexes) {
        continue;
      }

      const protectedPayload = buildProtectedPayload(row);
      row.encryptedRowData = protectedPayload.encryptedRowData;
      row.encryptedSearchText = protectedPayload.encryptedSearchText;
      row.encryptedRowDataKeyId = protectedPayload.encryptedRowDataKeyId;
      row.consultationReasonBlindIndex = protectedPayload.consultationReasonBlindIndex;
      row.sexBlindIndex = protectedPayload.sexBlindIndex;
      row.ultrasoundBlindIndex = protectedPayload.ultrasoundBlindIndex;
      row.tsiBlindIndex = protectedPayload.tsiBlindIndex;
      row.rowData = {};
      row.searchText = "";
      row.consultationReason = "";
      row.ultrasound = "";
      row.tsi = "";
      await row.save();
      encrypted += 1;
    }

    console.log(
      `[migrate:encrypt-dataset-import-rows] processed=${processed} encrypted=${encrypted} lastId=${String(cursor)}`
    );
  }

  console.log(`[migrate:encrypt-dataset-import-rows] done processed=${processed} encrypted=${encrypted}`);
};

run()
  .catch((error) => {
    console.error("[migrate:encrypt-dataset-import-rows] failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_error) {
      // Ignore disconnect errors.
    }
  });
