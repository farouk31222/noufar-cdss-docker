require("dotenv").config();
const mongoose = require("mongoose");

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  const usersCollection = db.collection("users");
  const doctorsCollection = db.collection("doctors");

  const usersCount = await usersCollection.countDocuments();
  const doctorsCount = await doctorsCollection.countDocuments();

  if (!usersCount) {
    console.log("No documents found in users collection. Nothing to migrate.");
    return;
  }

  const users = await usersCollection.find({}).toArray();
  const operations = users.map((doc) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: doc },
      upsert: true,
    },
  }));

  if (operations.length) {
    const result = await doctorsCollection.bulkWrite(operations, { ordered: false });
    console.log(
      `Migration finished: users=${usersCount}, doctors_before=${doctorsCount}, upserted=${result.upsertedCount}, modified=${result.modifiedCount}`
    );
  } else {
    console.log("No operations prepared.");
  }

  console.log("Safe mode: users collection was kept unchanged.");
};

run()
  .catch((error) => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
