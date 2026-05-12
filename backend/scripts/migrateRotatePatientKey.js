const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const Patient = require("../src/models/Patient");
const Prediction = require("../src/models/Prediction");
const {
  encryptPatientPayload,
  encryptPredictionPatientSnapshot,
  decryptPatientPayload,
} = require("../src/services/patientDataProtectionService");

const BATCH_SIZE = 100;

const getActiveKeyId = () => String(process.env.PATIENT_DATA_ACTIVE_KEY_ID || "").trim();

const rotatePatients = async () => {
  let processed = 0;
  let rotated = 0;
  let cursor = null;
  const activeKeyId = getActiveKeyId();

  while (true) {
    const filter = cursor ? { _id: { $gt: cursor } } : {};
    const batch = await Patient.find(filter).sort({ _id: 1 }).limit(BATCH_SIZE);
    if (!batch.length) break;

    for (const patient of batch) {
      processed += 1;
      cursor = patient._id;
      if (String(patient.encryptedDataKeyId || "") === activeKeyId) continue;

      const plain = decryptPatientPayload(patient);
      if (!String(plain.patientName || "").trim()) continue;

      const encryptedPayload = encryptPatientPayload(plain);
      patient.encryptedData = encryptedPayload.encryptedData;
      patient.encryptedDataKeyId = encryptedPayload.encryptedDataKeyId;
      patient.patientNameBlindIndex = encryptedPayload.patientNameBlindIndex;
      patient.consultationReasonCode = encryptedPayload.consultationReasonCode;
      patient.inputData = {};
      await patient.save();
      rotated += 1;
    }

    console.log(
      `[migrate:rotate-patient-key] patients processed=${processed} rotated=${rotated} lastId=${String(cursor)}`
    );
  }

  return { processed, rotated };
};

const rotatePredictions = async () => {
  let processed = 0;
  let rotated = 0;
  let cursor = null;
  const activeKeyId = getActiveKeyId();

  while (true) {
    const filter = cursor ? { _id: { $gt: cursor } } : {};
    const batch = await Prediction.find(filter).sort({ _id: 1 }).limit(BATCH_SIZE);
    if (!batch.length) break;

    for (const prediction of batch) {
      processed += 1;
      cursor = prediction._id;
      if (String(prediction.encryptedPatientDataKeyId || "") === activeKeyId) continue;

      const patientName = String(prediction.patientName || "").trim();
      if (!patientName) continue;

      const encryptedSnapshot = encryptPredictionPatientSnapshot({
        patientName,
        age: Number(prediction.age) || 0,
        sex: String(prediction.sex || "").trim(),
        consultationReason: String(prediction.consultationReason || "").trim(),
        duration: Number(prediction.duration) || 0,
        inputData:
          prediction.inputData && typeof prediction.inputData === "object" ? prediction.inputData : {},
      });

      prediction.patientNameBlindIndex = encryptedSnapshot.patientNameBlindIndex;
      prediction.encryptedPatientData = encryptedSnapshot.encryptedPatientData;
      prediction.encryptedPatientDataKeyId = encryptedSnapshot.encryptedPatientDataKeyId;
      await prediction.save();
      rotated += 1;
    }

    console.log(
      `[migrate:rotate-patient-key] predictions processed=${processed} rotated=${rotated} lastId=${String(cursor)}`
    );
  }

  return { processed, rotated };
};

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }
  if (!getActiveKeyId()) {
    throw new Error("PATIENT_DATA_ACTIVE_KEY_ID is missing in backend/.env");
  }

  await mongoose.connect(mongoUri);

  const patientStats = await rotatePatients();
  const predictionStats = await rotatePredictions();
  console.log(
    `[migrate:rotate-patient-key] done patients=${JSON.stringify(
      patientStats
    )} predictions=${JSON.stringify(predictionStats)}`
  );
};

run()
  .catch((error) => {
    console.error("[migrate:rotate-patient-key] failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_error) {
      // ignore disconnect errors
    }
  });
