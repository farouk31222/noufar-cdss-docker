const express = require("express");

const {
  getPatients,
  createPatient,
  updatePatient,
  deletePatient,
} = require("../controllers/patientController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router
  .route("/")
  .get(protect, authorize("doctor", "admin"), getPatients)
  .post(protect, authorize("doctor", "admin"), createPatient);

router
  .route("/:id")
  .put(protect, authorize("doctor", "admin"), updatePatient)
  .delete(protect, authorize("doctor", "admin"), deletePatient);

module.exports = router;
