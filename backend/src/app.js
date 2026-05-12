const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const patientRoutes = require("./routes/patientRoutes");
const predictionRoutes = require("./routes/predictionRoutes");
const supportRoutes = require("./routes/supportRoutes");
const datasetImportRoutes = require("./routes/datasetImportRoutes");
const securityEventRoutes = require("./routes/securityEventRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();
const frontendRoot = path.join(__dirname, "..", "..", "frontend");

const parseCsvEnv = (value = "") =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const toOrigin = (value = "") => {
  try {
    return new URL(String(value || "").trim()).origin;
  } catch (error) {
    return "";
  }
};

app.set("trust proxy", toOrigin(process.env.APP_BASE_URL) ? 1 : false);

const allowedOrigins = new Set(
  [
    ...parseCsvEnv(process.env.CORS_ALLOWED_ORIGINS).map((entry) => toOrigin(entry) || entry),
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    toOrigin(process.env.APP_BASE_URL),
    toOrigin(process.env.FRONTEND_BASE_URL),
  ].filter(Boolean)
);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    const error = new Error(`CORS blocked for origin: ${origin}`);
    error.code = "CORS_ORIGIN_NOT_ALLOWED";
    error.statusCode = 403;
    callback(error);
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

const appBaseOrigin = toOrigin(process.env.APP_BASE_URL);
const frontendBaseOrigin = toOrigin(process.env.FRONTEND_BASE_URL);
const cspConnectSrc = ["'self'"];

[appBaseOrigin, frontendBaseOrigin].forEach((origin) => {
  if (origin && !cspConnectSrc.includes(origin)) {
    cspConnectSrc.push(origin);
  }
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        connectSrc: cspConnectSrc,
      },
    },
  })
);
app.use(cors(corsOptions));
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  const requestExtension = path.extname(req.path).toLowerCase();
  if (!requestExtension || [".html", ".css", ".js"].includes(requestExtension)) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});
app.use(express.static(frontendRoot));

app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/dataset-imports", datasetImportRoutes);
app.use("/api/security-events", securityEventRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

