const Patient = require("../models/Patient");
const Prediction = require("../models/Prediction");
const {
  computePatientNameBlindIndex,
  encryptPatientPayload,
  mergePatientForResponse,
} = require("../services/patientDataProtectionService");
const { logAuditEventSafe } = require("../services/auditLogService");
const {
  isDoctorUser,
  getDoctorPatientQuery,
  isPatientOwnedByDoctor,
  logCrossDoctorDenied,
} = require("../services/doctorOwnershipService");

const BIOLOGY_REQUIRED_FIELDS = [
  { key: "tsh", label: "TSH", numeric: true },
  { key: "ft4", label: "FT4", numeric: true },
  { key: "antiTpo", label: "Anti-TPO", numeric: false },
  { key: "antiTpoTotal", label: "Anti-TPO total", numeric: true },
  { key: "antiTg", label: "Anti-Tg", numeric: false },
  { key: "tsi", label: "TSI", numeric: false },
  { key: "tsiLevel", label: "TSI level", numeric: true },
];
const ALLOWED_THERAPIES = new Set(["Carbimazole", "Benzylthiouracile"]);

const getMissingBiologyFields = (payload = {}) =>
  BIOLOGY_REQUIRED_FIELDS.filter(({ key, numeric }) => {
    const value = payload?.[key];

    if (numeric) {
      if (typeof value === "number") {
        return !Number.isFinite(value);
      }

      if (typeof value === "string") {
        const normalized = value.trim();
        if (!normalized) return true;
        if (normalized.toLowerCase() === "not measured") return false;
        return !Number.isFinite(Number(normalized));
      }

      return true;
    }

    return !String(value || "").trim();
  }).map(({ label }) => label);

const ensureRequiredBiologyFields = (payload, res) => {
  const missingFields = getMissingBiologyFields(payload);

  if (missingFields.length) {
    res.status(400);
    throw new Error(`${missingFields.join(", ")} ${missingFields.length === 1 ? "is" : "are"} required.`);
  }
};

const ensureAllowedTherapy = (payload, res) => {
  const therapy = String(payload?.therapy || "").trim();

  if (!therapy) {
    res.status(400);
    throw new Error("Therapy is required.");
  }

  if (!ALLOWED_THERAPIES.has(therapy)) {
    res.status(400);
    throw new Error("Therapy must be either Carbimazole or Benzylthiouracile.");
  }
};

const buildPatientPayload = (rawPayload = {}) => {
  const patientName = String(rawPayload?.name || "").trim();
  const consultationReason = String(rawPayload?.consultationReason || "").trim();
  const age = Number(rawPayload?.age);
  const sex = String(rawPayload?.sex || "").trim();

  return {
    patientName,
    consultationReason,
    age,
    sex,
    duration: Number(rawPayload?.duration) || 0,
    inputData: rawPayload,
  };
};

const ensurePatientPayloadIsValid = (payload, res) => {
  if (
    !payload.patientName ||
    !Number.isFinite(payload.age) ||
    !payload.consultationReason ||
    !payload.sex
  ) {
    res.status(400);
    throw new Error("Name, age, sex, and consultation reason are required.");
  }
};

const findPatientNameConflict = async ({ patientName, currentPatientId = null, user = null } = {}) => {
  const blindIndex = computePatientNameBlindIndex(patientName);
  const ownerFilter = isDoctorUser(user) ? { doctorId: user._id } : {};
  const predictionOwnerFilter = isDoctorUser(user) ? { predictedBy: user._id } : {};
  const patientFilter = currentPatientId
    ? { ...ownerFilter, _id: { $ne: currentPatientId }, patientNameBlindIndex: blindIndex }
    : { ...ownerFilter, patientNameBlindIndex: blindIndex };

  const existingPatient = await Patient.findOne(patientFilter).select("_id");
  if (existingPatient) {
    return { source: "patients", record: existingPatient };
  }

  const existingPrediction = await Prediction.findOne({
    ...predictionOwnerFilter,
    patientNameBlindIndex: blindIndex,
  }).select("_id");
  if (existingPrediction) {
    return { source: "predictions", record: existingPrediction };
  }

  return null;
};

const syncPatientsFromPredictionHistory = async () => {
  const predictions = await Prediction.find()
    .select(
      "_id patientId patientName patientNameBlindIndex age sex consultationReason duration source inputData predictedBy predictedByName createdAt updatedAt"
    )
    .sort({ createdAt: 1 })
    .lean();
  const existingPatients = await Patient.find().select("_id patientNameBlindIndex doctorId").lean();
  const knownByBlindIndex = new Set(
    existingPatients
      .map((entry) => {
        const blindIndex = String(entry.patientNameBlindIndex || "").trim();
        const doctorId = String(entry.doctorId || "").trim();
        return blindIndex && doctorId ? `${doctorId}:${blindIndex}` : "";
      })
      .filter(Boolean)
  );

  const toInsert = [];
  const patientMap = new Map();
  existingPatients.forEach((entry) => {
    const key = String(entry.patientNameBlindIndex || "").trim();
    const doctorId = String(entry.doctorId || "").trim();
    if (key && doctorId) patientMap.set(`${doctorId}:${key}`, String(entry._id));
  });

  predictions.forEach((prediction) => {
    const patientName = String(prediction.patientName || "").trim();
    if (!patientName) return;
    const doctorId = String(prediction.predictedBy || "").trim();
    if (!doctorId) return;
    const blindIndex = String(
      prediction.patientNameBlindIndex || computePatientNameBlindIndex(patientName)
    ).trim();
    if (!blindIndex) return;
    const ownershipKey = `${doctorId}:${blindIndex}`;
    if (knownByBlindIndex.has(ownershipKey)) return;

    knownByBlindIndex.add(ownershipKey);
    const payload = {
      patientName,
      age: Number(prediction.age) || 0,
      sex: String(prediction.sex || "Not specified").trim() || "Not specified",
      consultationReason: String(prediction.consultationReason || "").trim(),
      duration: Number(prediction.duration) || 0,
      inputData: prediction.inputData || {},
    };
    const encrypted = encryptPatientPayload(payload);

    toInsert.push({
      encryptedData: encrypted.encryptedData,
      encryptedDataKeyId: encrypted.encryptedDataKeyId,
      patientNameBlindIndex: encrypted.patientNameBlindIndex,
      consultationReasonCode: encrypted.consultationReasonCode,
      doctorId: prediction.predictedBy || null,
      source: String(prediction.source || "Prediction History").trim() || "Prediction History",
      inputData: {},
      savedBy: prediction.predictedBy || null,
      savedByName: prediction.predictedByName || "",
      createdAt: prediction.createdAt,
      updatedAt: prediction.updatedAt || prediction.createdAt,
    });
  });

  if (toInsert.length) {
    const inserted = await Patient.insertMany(toInsert, { ordered: false });
    inserted.forEach((entry) => {
      if (entry.patientNameBlindIndex) {
        patientMap.set(`${String(entry.doctorId || "")}:${String(entry.patientNameBlindIndex)}`, String(entry._id));
      }
    });
  }

  const bulk = [];
  predictions.forEach((prediction) => {
    if (prediction.patientId) return;
    const patientName = String(prediction.patientName || "").trim();
    if (!patientName) return;
    const doctorId = String(prediction.predictedBy || "").trim();
    if (!doctorId) return;
    const blindIndex = String(
      prediction.patientNameBlindIndex || computePatientNameBlindIndex(patientName)
    ).trim();
    const patientId = patientMap.get(`${doctorId}:${blindIndex}`);
    if (!patientId) return;

    bulk.push({
      updateOne: {
        filter: { _id: prediction._id, patientId: null },
        update: { $set: { patientId } },
      },
    });
  });

  if (bulk.length) {
    await Prediction.bulkWrite(bulk, { ordered: false });
  }
};

const getPatients = async (req, res, next) => {
  try {
    if (!isDoctorUser(req.user)) {
      await syncPatientsFromPredictionHistory();
    }
    const patientQuery = getDoctorPatientQuery(req.user);
    const patients = await Patient.find(patientQuery).sort({ createdAt: -1 });

    await logAuditEventSafe({
      req,
      action: "patient.read.list",
      targetType: "patient",
      targetId: "",
      outcome: "success",
      metadata: {
        total: patients.length,
        role: req.user?.role || "",
      },
    });

    res.status(200).json(patients.map((entry) => mergePatientForResponse(entry)));
  } catch (error) {
    next(error);
  }
};

const createPatient = async (req, res, next) => {
  try {
    const source = String(req.body?.source || "Manual").trim() || "Manual";
    const payload = buildPatientPayload(req.body);
    ensurePatientPayloadIsValid(payload, res);
    ensureRequiredBiologyFields(req.body, res);
    ensureAllowedTherapy(req.body, res);

    const nameConflict = await findPatientNameConflict({
      patientName: payload.patientName,
      user: req.user,
    });
    if (nameConflict) {
      res.status(409);
      throw new Error(
        nameConflict.source === "predictions"
          ? "A patient with this name already exists in prediction history."
          : "A patient with this name already exists in the registry."
      );
    }

    const encrypted = encryptPatientPayload(payload);

    const patient = await Patient.create({
      encryptedData: encrypted.encryptedData,
      encryptedDataKeyId: encrypted.encryptedDataKeyId,
      patientNameBlindIndex: encrypted.patientNameBlindIndex,
      consultationReasonCode: encrypted.consultationReasonCode,
      doctorId: req.user?._id || null,
      source,
      inputData: {},
      savedBy: req.user?._id || null,
      savedByName: req.user?.name || req.user?.email || "",
    });

    await logAuditEventSafe({
      req,
      action: "patient.create",
      targetType: "patient",
      targetId: String(patient._id),
      outcome: "success",
      metadata: {
        source,
      },
    });

    res.status(201).json({
      message: "Patient clinical entry saved successfully.",
      patient: mergePatientForResponse(patient),
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(400);
    }
    next(error);
  }
};

const updatePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      res.status(404);
      throw new Error("Patient not found");
    }

    if (!isPatientOwnedByDoctor(patient, req.user)) {
      await logCrossDoctorDenied({
        req,
        action: "patient.update.denied",
        targetType: "patient",
        targetId: patient._id,
      });
      res.status(404);
      throw new Error("Patient not found");
    }

    const payload = buildPatientPayload(req.body);
    const source = String(req.body?.source || patient.source || "Manual").trim() || "Manual";
    ensurePatientPayloadIsValid(payload, res);
    ensureRequiredBiologyFields(req.body, res);
    ensureAllowedTherapy(req.body, res);

    const nameConflict = await findPatientNameConflict({
      patientName: payload.patientName,
      currentPatientId: patient._id,
      user: req.user,
    });
    if (nameConflict) {
      res.status(409);
      throw new Error(
        nameConflict.source === "predictions"
          ? "A patient with this name already exists in prediction history."
          : "Another patient with this name already exists in the registry."
      );
    }

    const encrypted = encryptPatientPayload(payload);
    patient.encryptedData = encrypted.encryptedData;
    patient.encryptedDataKeyId = encrypted.encryptedDataKeyId;
    patient.patientNameBlindIndex = encrypted.patientNameBlindIndex;
    patient.consultationReasonCode = encrypted.consultationReasonCode;
    patient.source = source;
    patient.inputData = {};
    patient.savedBy = req.user?._id || patient.savedBy || null;
    patient.savedByName = req.user?.name || req.user?.email || patient.savedByName || "";
    if (!patient.doctorId) {
      patient.doctorId = req.user?._id || null;
    }

    await patient.save();

    await logAuditEventSafe({
      req,
      action: "patient.update",
      targetType: "patient",
      targetId: String(patient._id),
      outcome: "success",
      metadata: {
        source,
      },
    });

    res.status(200).json({
      message: "Patient clinical entry updated successfully.",
      patient: mergePatientForResponse(patient),
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(400);
    }
    next(error);
  }
};

const deletePatient = async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      res.status(404);
      throw new Error("Patient not found");
    }

    if (!isPatientOwnedByDoctor(patient, req.user)) {
      await logCrossDoctorDenied({
        req,
        action: "patient.delete.denied",
        targetType: "patient",
        targetId: patient._id,
      });
      res.status(404);
      throw new Error("Patient not found");
    }

    await Patient.deleteOne({ _id: patient._id });

    await logAuditEventSafe({
      req,
      action: "patient.delete",
      targetType: "patient",
      targetId: String(patient._id),
      outcome: "success",
      metadata: {},
    });

    res.status(200).json({ message: "Patient deleted successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPatients,
  createPatient,
  updatePatient,
  deletePatient,
};
