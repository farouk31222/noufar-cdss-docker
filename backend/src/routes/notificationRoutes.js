const express = require("express");

const {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  openNotificationTarget,
  streamNotifications,
} = require("../controllers/notificationController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/stream", streamNotifications);
router.get("/", protect, authorize("doctor", "admin"), listNotifications);
router.patch("/read-all", protect, authorize("doctor", "admin"), markAllNotificationsAsRead);
router.patch("/:id/read", protect, authorize("doctor", "admin"), markNotificationAsRead);
router.post("/:id/open", protect, authorize("doctor", "admin"), openNotificationTarget);

module.exports = router;
