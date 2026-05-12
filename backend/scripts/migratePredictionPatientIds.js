const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const Patient = require("../src/models/Patient");
const Prediction = require("../src/models/Prediction");

const normalizeNameKey = (value) => String(value || "").trim().toLowerCase();

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  await mongoose.connect(mongoUri);

  const patients = await Patient.find().select("_id patientName");
  const patientByNameKey = new Map(
    patients.map((patient) => [normalizeNameKey(patient.patientName), patient])
  );

  const predictions = await Prediction.find().select(
    "_id patientId patientName age sex consultationReason duration source inputData predictedBy predictedByName createdAt updatedAt"
  );

  const patientsToCreate = [];
  const bulkPredictionUpdates = [];
  let linkedCount = 0;
  let createdPatients = 0;

  predictions.forEach((prediction) => {
    if (prediction.patientId) return;

    const nameKey = normalizeNameKey(prediction.patientName);
    if (!nameKey) return;

    let patient = patientByNameKey.get(nameKey);

    if (!patient) {
      const draft = new Patient({
        patientName: String(prediction.patientName || "").trim(),
        age: Number(prediction.age) || 0,
        sex: String(prediction.sex || "Not specified").trim() || "Not specified",
        consultationReason: String(prediction.consultationReason || "").trim(),
        duration: Number(prediction.duration) || 0,
        source: "Prediction History",
        inputData: prediction.inputData || {},
        savedBy: prediction.predictedBy || null,
        savedByName: prediction.predictedByName || "",
        createdAt: prediction.createdAt,
        updatedAt: prediction.updatedAt || prediction.createdAt,
      });

      patientsToCreate.push(draft);
      patient = draft;
      patientByNameKey.set(nameKey, patient);
    }

    bulkPredictionUpdates.push({
      updateOne: {
        filter: { _id: prediction._id, patientId: null },
        update: { $set: { patientId: patient._id } },
      },
    });
    linkedCount += 1;
  });

  if (patientsToCreate.length) {
    await Patient.insertMany(patientsToCreate, { ordered: false });
    createdPatients = patientsToCreate.length;
  }

  if (bulkPredictionUpdates.length) {
    await Prediction.bulkWrite(bulkPredictionUpdates, { ordered: false });
  }

  console.log(
    `[migration] done. linked predictions: ${linkedCount}, created patients: ${createdPatients}`
  );
};

run()
  .catch((error) => {
    console.error("[migration] failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (error) {
      // ignore disconnect errors
    }
  });
