const express = require("express");

const { listSecurityEvents, exportSecurityEvents } = require("../controllers/securityEventController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, authorize("admin"), listSecurityEvents);
router.get("/export", protect, authorize("admin"), exportSecurityEvents);

module.exports = router;
