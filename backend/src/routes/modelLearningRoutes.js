const express = require("express");
const {
  getModelLearningSummary,
  getModelLearningRuns,
  getModelLearningRunById,
  createManualRetrainingRun,
  activateModelLearningRun,
  rollbackModelLearningRun,
} = require("../controllers/modelLearningController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/summary", protect, authorize("admin"), getModelLearningSummary);
router.get("/runs", protect, authorize("admin"), getModelLearningRuns);
router.post("/retrain", protect, authorize("admin"), createManualRetrainingRun);
router.get("/runs/:id", protect, authorize("admin"), getModelLearningRunById);
router.post("/runs/:id/activate", protect, authorize("admin"), activateModelLearningRun);
router.post("/runs/:id/rollback", protect, authorize("admin"), rollbackModelLearningRun);

module.exports = router;
