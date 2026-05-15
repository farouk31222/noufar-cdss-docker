const crypto = require("crypto");

const SENSITIVE_PATIENT_FIELDS = [
  "patientName",
  "age",
  "sex",
  "consultationReason",
  "duration",
  "inputData",
];

const normalizeName = (value) => String(value || "").trim().toLowerCase();

const toBase64 = (buffer) => Buffer.from(buffer).toString("base64");
const fromBase64 = (value) => Buffer.from(String(value || ""), "base64");

const safeJsonParse = (value, fallback) => {
  try {
    return JSON.parse(String(value || ""));
  } catch (_error) {
    return fallback;
  }
};

const normalizeKeyValue = (rawValue = "") => {
  const value = String(rawValue || "").trim();
  if (!value) return Buffer.alloc(0);

  if (/^[a-f0-9]{64}$/i.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    return Buffer.from(value, "base64");
  } catch (_error) {
    return Buffer.alloc(0);
  }
};

let cachedConfig = null;

const resolveConfig = () => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const keyring = safeJsonParse(process.env.PATIENT_DATA_KEYS, {});
  const activeKeyId = String(process.env.PATIENT_DATA_ACTIVE_KEY_ID || "").trim();
  const blindIndexKeyBuffer = normalizeKeyValue(process.env.PATIENT_BLIND_INDEX_KEY || "");
  const normalizedKeys = Object.entries(keyring).reduce((accumulator, [keyId, rawValue]) => {
    const normalizedKeyId = String(keyId || "").trim();
    const keyBuffer = normalizeKeyValue(rawValue);
    if (!normalizedKeyId || keyBuffer.length !== 32) {
      return accumulator;
    }
    accumulator[normalizedKeyId] = keyBuffer;
    return accumulator;
  }, {});

  if (!activeKeyId || !normalizedKeys[activeKeyId]) {
    throw new Error(
      "Patient data encryption is not configured correctly. Set PATIENT_DATA_KEYS and PATIENT_DATA_ACTIVE_KEY_ID."
    );
  }

  if (blindIndexKeyBuffer.length !== 32) {
    throw new Error("PATIENT_BLIND_INDEX_KEY must be a 32-byte key (hex or base64).");
  }

  cachedConfig = {
    activeKeyId,
    keys: normalizedKeys,
    blindIndexKeyBuffer,
  };

  return cachedConfig;
};

const computePatientNameBlindIndex = (name = "") => {
  const { blindIndexKeyBuffer } = resolveConfig();
  const normalized = normalizeName(name);
  return crypto.createHmac("sha256", blindIndexKeyBuffer).update(normalized).digest("hex");
};

const computeScopedBlindIndex = (scope = "", value = "") => {
  const { blindIndexKeyBuffer } = resolveConfig();
  const normalizedScope = String(scope || "").trim().toLowerCase();
  const normalizedValue = String(value || "").trim().toLowerCase();
  return crypto
    .createHmac("sha256", blindIndexKeyBuffer)
    .update(`${normalizedScope}:${normalizedValue}`)
    .digest("hex");
};

const encryptFieldValue = ({ entity, field, value, keyId } = {}) => {
  const { keys } = resolveConfig();
  const key = keys[keyId];
  if (!key) {
    throw new Error(`Unknown patient encryption key id: ${keyId}`);
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${entity}:${field}:${keyId}`));
  const plaintext = Buffer.from(JSON.stringify(value ?? null), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    keyId,
    iv: toBase64(iv),
    tag: toBase64(tag),
    data: toBase64(encrypted),
    algorithm: "aes-256-gcm",
    version: 1,
  };
};

const decryptFieldValue = ({ entity, field, encryptedValue } = {}) => {
  if (!encryptedValue || typeof encryptedValue !== "object") {
    return null;
  }

  const { keys } = resolveConfig();
  const keyId = String(encryptedValue.keyId || "").trim();
  const key = keys[keyId];
  if (!key) {
    throw new Error(`Missing decryption key for keyId "${keyId}"`);
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, fromBase64(encryptedValue.iv));
  decipher.setAAD(Buffer.from(`${entity}:${field}:${keyId}`));
  decipher.setAuthTag(fromBase64(encryptedValue.tag));
  const decrypted = Buffer.concat([
    decipher.update(fromBase64(encryptedValue.data)),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
};

const buildConsultationReasonCode = (value = "") =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 64);

const encryptPatientPayload = (payload = {}) => {
  const { activeKeyId } = resolveConfig();
  const encryptedData = {};

  SENSITIVE_PATIENT_FIELDS.forEach((field) => {
    encryptedData[field] = encryptFieldValue({
      entity: "patient",
      field,
      value: payload[field],
      keyId: activeKeyId,
    });
  });

  return {
    encryptedData,
    patientNameBlindIndex: computePatientNameBlindIndex(payload.patientName || ""),
    consultationReasonCode: buildConsultationReasonCode(payload.consultationReason || ""),
    encryptedDataKeyId: activeKeyId,
  };
};

const decryptPatientPayload = (patientLike = {}) => {
  const encryptedData = patientLike?.encryptedData || {};
  const hasEncryptedPayload =
    encryptedData &&
    typeof encryptedData === "object" &&
    Object.keys(encryptedData).length > 0 &&
    SENSITIVE_PATIENT_FIELDS.every((field) => encryptedData[field]);

  if (hasEncryptedPayload) {
    return {
      patientName: String(
        decryptFieldValue({ entity: "patient", field: "patientName", encryptedValue: encryptedData.patientName }) ||
          ""
      ),
      age: Number(
        decryptFieldValue({ entity: "patient", field: "age", encryptedValue: encryptedData.age }) || 0
      ),
      sex: String(
        decryptFieldValue({ entity: "patient", field: "sex", encryptedValue: encryptedData.sex }) || ""
      ),
      consultationReason: String(
        decryptFieldValue({
          entity: "patient",
          field: "consultationReason",
          encryptedValue: encryptedData.consultationReason,
        }) || ""
      ),
      duration: Number(
        decryptFieldValue({ entity: "patient", field: "duration", encryptedValue: encryptedData.duration }) || 0
      ),
      inputData:
        decryptFieldValue({ entity: "patient", field: "inputData", encryptedValue: encryptedData.inputData }) || {},
    };
  }

  return {
    patientName: String(patientLike?.patientName || "").trim(),
    age: Number(patientLike?.age) || 0,
    sex: String(patientLike?.sex || "").trim(),
    consultationReason: String(patientLike?.consultationReason || "").trim(),
    duration: Number(patientLike?.duration) || 0,
    inputData:
      patientLike?.inputData && typeof patientLike.inputData === "object" ? patientLike.inputData : {},
  };
};

const mergePatientForResponse = (patientDocument) => {
  const plainPayload = decryptPatientPayload(patientDocument);
  const raw = typeof patientDocument?.toObject === "function" ? patientDocument.toObject() : { ...patientDocument };

  return {
    ...raw,
    patientName: plainPayload.patientName,
    age: plainPayload.age,
    sex: plainPayload.sex,
    consultationReason: plainPayload.consultationReason,
    duration: plainPayload.duration,
    inputData: plainPayload.inputData,
  };
};

const encryptPredictionPatientSnapshot = (payload = {}) => {
  const { activeKeyId } = resolveConfig();
  const fields = ["patientName", "age", "sex", "consultationReason", "duration", "inputData"];

  const encryptedPatientData = fields.reduce((accumulator, field) => {
    accumulator[field] = encryptFieldValue({
      entity: "prediction_patient_snapshot",
      field,
      value: payload[field],
      keyId: activeKeyId,
    });
    return accumulator;
  }, {});

  return {
    encryptedPatientData,
    patientNameBlindIndex: computePatientNameBlindIndex(payload.patientName || ""),
    encryptedPatientDataKeyId: activeKeyId,
  };
};

const decryptPredictionPatientSnapshot = (predictionLike = {}) => {
  const encryptedData = predictionLike?.encryptedPatientData || {};
  const hasEncryptedPayload =
    encryptedData &&
    typeof encryptedData === "object" &&
    Object.keys(encryptedData).length > 0;

  if (hasEncryptedPayload) {
    return {
      patientName: String(
        decryptFieldValue({
          entity: "prediction_patient_snapshot",
          field: "patientName",
          encryptedValue: encryptedData.patientName,
        }) || ""
      ),
      age: Number(
        decryptFieldValue({
          entity: "prediction_patient_snapshot",
          field: "age",
          encryptedValue: encryptedData.age,
        }) || 0
      ),
      sex: String(
        decryptFieldValue({
          entity: "prediction_patient_snapshot",
          field: "sex",
          encryptedValue: encryptedData.sex,
        }) || ""
      ),
      consultationReason: String(
        decryptFieldValue({
          entity: "prediction_patient_snapshot",
          field: "consultationReason",
          encryptedValue: encryptedData.consultationReason,
        }) || ""
      ),
      duration: Number(
        decryptFieldValue({
          entity: "prediction_patient_snapshot",
          field: "duration",
          encryptedValue: encryptedData.duration,
        }) || 0
      ),
      inputData:
        decryptFieldValue({
          entity: "prediction_patient_snapshot",
          field: "inputData",
          encryptedValue: encryptedData.inputData,
        }) || {},
    };
  }

  return {
    patientName: String(predictionLike?.patientName || "").trim(),
    age: Number(predictionLike?.age) || 0,
    sex: String(predictionLike?.sex || "").trim(),
    consultationReason: String(predictionLike?.consultationReason || "").trim(),
    duration: Number(predictionLike?.duration) || 0,
    inputData:
      predictionLike?.inputData && typeof predictionLike.inputData === "object" ? predictionLike.inputData : {},
  };
};

const mergePredictionForResponse = (predictionDocument) => {
  const plainPayload = decryptPredictionPatientSnapshot(predictionDocument);
  const raw =
    typeof predictionDocument?.toObject === "function" ? predictionDocument.toObject() : { ...predictionDocument };

  return {
    ...raw,
    patientName: plainPayload.patientName,
    age: plainPayload.age,
    sex: plainPayload.sex,
    consultationReason: plainPayload.consultationReason,
    duration: plainPayload.duration,
    inputData: plainPayload.inputData,
  };
};

const encryptDatasetImportRowPayload = ({
  rowData = {},
  searchText = "",
  consultationReason = "",
  sex = "",
  ultrasound = "",
  tsi = "",
} = {}) => {
  const { activeKeyId } = resolveConfig();

  return {
    encryptedRowData: encryptFieldValue({
      entity: "dataset_import_row",
      field: "rowData",
      value: rowData && typeof rowData === "object" ? rowData : {},
      keyId: activeKeyId,
    }),
    encryptedSearchText: encryptFieldValue({
      entity: "dataset_import_row",
      field: "searchText",
      value: String(searchText || ""),
      keyId: activeKeyId,
    }),
    encryptedRowDataKeyId: activeKeyId,
    consultationReasonBlindIndex: consultationReason
      ? computeScopedBlindIndex("dataset_import_row:consultationReason", consultationReason)
      : "",
    sexBlindIndex: sex ? computeScopedBlindIndex("dataset_import_row:sex", sex) : "",
    ultrasoundBlindIndex: ultrasound ? computeScopedBlindIndex("dataset_import_row:ultrasound", ultrasound) : "",
    tsiBlindIndex: tsi ? computeScopedBlindIndex("dataset_import_row:tsi", tsi) : "",
  };
};

const decryptDatasetImportRowPayload = (rowLike = {}) => {
  const hasEncryptedRowData =
    rowLike?.encryptedRowData &&
    typeof rowLike.encryptedRowData === "object" &&
    Object.keys(rowLike.encryptedRowData).length > 0;

  if (hasEncryptedRowData) {
    return {
      rowData:
        decryptFieldValue({
          entity: "dataset_import_row",
          field: "rowData",
          encryptedValue: rowLike.encryptedRowData,
        }) || {},
      searchText: String(
        decryptFieldValue({
          entity: "dataset_import_row",
          field: "searchText",
          encryptedValue: rowLike.encryptedSearchText,
        }) || ""
      ),
    };
  }

  return {
    rowData: rowLike?.rowData && typeof rowLike.rowData === "object" ? rowLike.rowData : {},
    searchText: String(rowLike?.searchText || ""),
  };
};

module.exports = {
  SENSITIVE_PATIENT_FIELDS,
  computePatientNameBlindIndex,
  computeScopedBlindIndex,
  encryptPatientPayload,
  decryptPatientPayload,
  mergePatientForResponse,
  encryptPredictionPatientSnapshot,
  decryptPredictionPatientSnapshot,
  mergePredictionForResponse,
  encryptDatasetImportRowPayload,
  decryptDatasetImportRowPayload,
};
