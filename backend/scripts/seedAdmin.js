const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const Admin = require("../src/models/Admin");
const User = require("../src/models/User");
const { validateSeedAdminInput } = require("../src/services/adminBootstrapService");

const getArgValue = (flagName) => {
  const exactPrefix = `${flagName}=`;
  const exactMatch = process.argv.find((entry) => entry.startsWith(exactPrefix));
  if (exactMatch) {
    return exactMatch.slice(exactPrefix.length);
  }

  const index = process.argv.indexOf(flagName);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  return "";
};

const getSeedConfig = () =>
  validateSeedAdminInput({
    name: getArgValue("--name") || process.env.SEED_ADMIN_NAME,
    email: getArgValue("--email") || process.env.SEED_ADMIN_EMAIL,
    password: getArgValue("--password") || process.env.SEED_ADMIN_PASSWORD,
  });

const run = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  const seedAdmin = getSeedConfig();

  await mongoose.connect(mongoUri);

  const existingAdminCount = await Admin.countDocuments();
  if (existingAdminCount > 0) {
    console.log(
      `[seed:admin] bootstrap already completed. ${existingAdminCount} admin account(s) already exist. No changes made.`
    );
    return;
  }

  const conflictingDoctor = await User.findOne({ email: seedAdmin.email }).select("_id role");
  if (conflictingDoctor) {
    throw new Error(
      "Seed admin email is already used by a doctor account. Choose a different admin email."
    );
  }

  const admin = await Admin.create({
    name: seedAdmin.name,
    email: seedAdmin.email,
    password: seedAdmin.password,
  });

  console.log(`[seed:admin] admin created successfully: ${admin.email}`);
};

run()
  .catch((error) => {
    console.error("[seed:admin] failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (error) {
      // ignore disconnect errors
    }
  });
