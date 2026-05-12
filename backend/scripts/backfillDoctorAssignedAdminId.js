require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../src/models/User");
const Admin = require("../src/models/Admin");

const normalize = (value) => String(value || "").trim().toLowerCase();

const run = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const admins = await Admin.find({}).select("_id name email").lean();
  const adminByNameOrEmail = new Map();

  admins.forEach((admin) => {
    adminByNameOrEmail.set(normalize(admin.name), admin._id);
    adminByNameOrEmail.set(normalize(admin.email), admin._id);
  });

  const doctors = await User.find({
    role: "doctor",
    $or: [{ assignedAdminId: null }, { assignedAdminId: { $exists: false } }],
  })
    .select("_id assignedAdmin")
    .lean();

  const ops = [];
  for (const doctor of doctors) {
    const key = normalize(doctor.assignedAdmin);
    const adminId = adminByNameOrEmail.get(key);
    if (!adminId) continue;
    ops.push({
      updateOne: {
        filter: { _id: doctor._id },
        update: { $set: { assignedAdminId: adminId } },
      },
    });
  }

  if (ops.length) {
    const result = await User.bulkWrite(ops, { ordered: false });
    console.log(`Backfill completed: matched=${result.matchedCount}, modified=${result.modifiedCount}`);
  } else {
    console.log("Backfill completed: no doctor rows matched an admin by assignedAdmin text.");
  }
};

run()
  .catch((error) => {
    console.error("Backfill failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
