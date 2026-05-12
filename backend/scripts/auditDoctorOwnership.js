const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const Patient = require("../src/models/Patient");
const Prediction = require("../src/models/Prediction");

const BATCH_SIZE = 250;

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is missing in backend/.env");

  await mongoose.connect(mongoUri);

  const patientsWithoutDoctor = await Patient.countDocuments({ doctorId: null });
  const predictionsWithoutDoctor = await Prediction.countDocuments({ predictedBy: null });
  const crossOwnerLinks = [];
  let cursor = null;
  let scanned = 0;

  while (true) {
    const filter = {
      patientId: { $ne: null },
      predictedBy: { $ne: null },
      ...(cursor ? { _id: { $gt: cursor } } : {}),
    };
    const predictions = await Prediction.find(filter)
      .select("_id patientId predictedBy")
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (!predictions.length) break;

    for (const prediction of predictions) {
      scanned += 1;
      cursor = prediction._id;
      const patient = await Patient.findById(prediction.patientId).select("_id doctorId").lean();
      if (!patient?.doctorId) continue;

      if (String(patient.doctorId) !== String(prediction.predictedBy)) {
        crossOwnerLinks.push({
          predictionId: String(prediction._id),
          patientId: String(patient._id),
          predictionDoctorId: String(prediction.predictedBy),
          patientDoctorId: String(patient.doctorId),
        });
      }
    }
  }

  console.log("[doctor-ownership-audit] summary:");
  console.log(JSON.stringify(
    {
      patientsWithoutDoctor,
      predictionsWithoutDoctor,
      scannedLinkedPredictions: scanned,
      crossOwnerLinkCount: crossOwnerLinks.length,
      crossOwnerLinks,
    },
    null,
    2
  ));
};

run()
  .catch((error) => {
    console.error("[doctor-ownership-audit] failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_error) {
      // ignore disconnect errors
    }
  });
