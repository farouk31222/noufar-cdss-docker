const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const Patient = require("../src/models/Patient");
const Prediction = require("../src/models/Prediction");
const User = require("../src/models/User");

const BATCH_SIZE = 100;

const isDoctorId = async (id) => {
  if (!id) return false;
  const user = await User.findOne({ _id: id, role: "doctor" }).select("_id").lean();
  return Boolean(user);
};

const derivePatientDoctorId = async (patient) => {
  if (await isDoctorId(patient.savedBy)) return patient.savedBy;

  const prediction = await Prediction.findOne({
    patientId: patient._id,
    predictedBy: { $ne: null },
  })
    .select("predictedBy")
    .sort({ createdAt: 1 })
    .lean();

  if (await isDoctorId(prediction?.predictedBy)) return prediction.predictedBy;
  return null;
};

const derivePredictionDoctorId = async (prediction) => {
  if (await isDoctorId(prediction.predictedBy)) return prediction.predictedBy;
  if (await isDoctorId(prediction.validatedBy)) return prediction.validatedBy;

  if (prediction.patientId) {
    const patient = await Patient.findById(prediction.patientId).select("doctorId savedBy").lean();
    if (await isDoctorId(patient?.doctorId)) return patient.doctorId;
    if (await isDoctorId(patient?.savedBy)) return patient.savedBy;
  }

  return null;
};

const backfillPatients = async () => {
  let processed = 0;
  let updated = 0;
  let cursor = null;

  while (true) {
    const filter = {
      doctorId: null,
      ...(cursor ? { _id: { $gt: cursor } } : {}),
    };
    const patients = await Patient.find(filter).sort({ _id: 1 }).limit(BATCH_SIZE);
    if (!patients.length) break;

    for (const patient of patients) {
      processed += 1;
      cursor = patient._id;
      const doctorId = await derivePatientDoctorId(patient);
      if (!doctorId) continue;

      patient.doctorId = doctorId;
      await patient.save();
      updated += 1;
    }

    console.log(`[doctor-ownership] patients processed=${processed} updated=${updated}`);
  }

  return { processed, updated };
};

const backfillPredictions = async () => {
  let processed = 0;
  let updated = 0;
  let cursor = null;

  while (true) {
    const filter = {
      predictedBy: null,
      ...(cursor ? { _id: { $gt: cursor } } : {}),
    };
    const predictions = await Prediction.find(filter).sort({ _id: 1 }).limit(BATCH_SIZE);
    if (!predictions.length) break;

    for (const prediction of predictions) {
      processed += 1;
      cursor = prediction._id;
      const doctorId = await derivePredictionDoctorId(prediction);
      if (!doctorId) continue;

      prediction.predictedBy = doctorId;
      await prediction.save();
      updated += 1;
    }

    console.log(`[doctor-ownership] predictions processed=${processed} updated=${updated}`);
  }

  return { processed, updated };
};

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is missing in backend/.env");

  await mongoose.connect(mongoUri);
  const patientStats = await backfillPatients();
  const predictionStats = await backfillPredictions();
  console.log(
    `[doctor-ownership] done patients=${JSON.stringify(patientStats)} predictions=${JSON.stringify(
      predictionStats
    )}`
  );
};

run()
  .catch((error) => {
    console.error("[doctor-ownership] failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_error) {
      // ignore disconnect errors
    }
  });
