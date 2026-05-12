const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");
const {
  predictionCreateLimiter,
  predictionUpdateLimiter,
} = require("../middleware/rateLimitMiddleware");

const {
  getPredictions,
  getPredictionById,
  getPredictionHistory,
  getPredictionModels,
  updateActivePredictionModel,
  createPrediction,
  updatePrediction,
  deletePrediction,
  deletePredictionHistoryEntry,
} = require("../controllers/predictionController");

router
  .route("/models")
  .get(protect, authorize("admin"), getPredictionModels);

router
  .route("/models/active")
  .put(protect, authorize("admin"), updateActivePredictionModel);

router
  .route("/")
  .get(protect, authorize("doctor", "admin"), getPredictions)
  .post(protect, authorize("doctor", "admin"), predictionCreateLimiter, createPrediction);

router
  .route("/:id/history")
  .get(protect, authorize("doctor", "admin"), getPredictionHistory);

router
  .route("/:id/history/:historyId")
  .delete(protect, authorize("doctor", "admin"), deletePredictionHistoryEntry);

router
  .route("/:id")
  .get(protect, authorize("doctor", "admin"), getPredictionById)
  .put(protect, authorize("doctor", "admin"), predictionUpdateLimiter, updatePrediction)
  .delete(protect, authorize("doctor", "admin"), deletePrediction);

module.exports = router;
