require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");
const { ensureAdminBootstrapState } = require("./services/adminBootstrapService");
const { enforceStartupSecurityPolicy } = require("./services/startupSecurityPolicyService");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  enforceStartupSecurityPolicy();
  await connectDB();
  await ensureAdminBootstrapState();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
