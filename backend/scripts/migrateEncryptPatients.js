const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const Patient = require("../src/models/Patient");
const {
  encryptPatientPayload,
  decryptPatientPayload,
  computePatientNameBlindIndex,
} = require("../src/services/patientDataProtectionService");

const BATCH_SIZE = 100;

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
    const patients = await Patient.find(filter).sort({ _id: 1 }).limit(BATCH_SIZE);
    if (!patients.length) break;

    for (const patient of patients) {
      processed += 1;
      cursor = patient._id;

      const hasEncryptedData =
        patient.encryptedData &&
        typeof patient.encryptedData === "object" &&
        Object.keys(patient.encryptedData).length > 0;

      const plain = decryptPatientPayload(patient);
      if (!String(plain.patientName || "").trim()) {
        continue;
      }

      const encryptedPayload = encryptPatientPayload(plain);
      const currentBlindIndex = String(patient.patientNameBlindIndex || "").trim();
      const computedBlindIndex = computePatientNameBlindIndex(plain.patientName);
      const shouldRewrite =
        !hasEncryptedData ||
        !patient.encryptedDataKeyId ||
        currentBlindIndex !== computedBlindIndex;

      if (!shouldRewrite) {
        continue;
      }

      patient.encryptedData = encryptedPayload.encryptedData;
      patient.encryptedDataKeyId = encryptedPayload.encryptedDataKeyId;
      patient.patientNameBlindIndex = encryptedPayload.patientNameBlindIndex;
      patient.consultationReasonCode = encryptedPayload.consultationReasonCode;
      patient.inputData = {};
      await patient.save();
      encrypted += 1;
    }

    console.log(
      `[migrate:encrypt-patients] processed=${processed} encrypted=${encrypted} lastId=${String(cursor)}`
    );
  }

  console.log(`[migrate:encrypt-patients] done processed=${processed} encrypted=${encrypted}`);
};

run()
  .catch((error) => {
    console.error("[migrate:encrypt-patients] failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_error) {
      // ignore disconnect errors
    }
  });
