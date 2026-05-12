const {
  Notification,
  sanitizeNotification,
  getNotificationRecipientQuery,
} = require("../services/notificationService");
const { registerRealtimeClient } = require("../services/realtimeService");
const { getAuthenticatedUserFromToken } = require("../middleware/authMiddleware");

const listNotifications = async (req, res, next) => {
  try {
    // pour la liste
    const notifications = await Notification.find(getNotificationRecipientQuery(req.user)).sort({ createdAt: -1 });
    res.status(200).json(notifications.map((notification) => sanitizeNotification(notification)));
  } catch (error) {
    next(error);
  }
};

const markNotificationAsRead = async (req, res, next) => {
  try {
    // pour une notification précise
    const notification = await Notification.findOne({
      _id: req.params.id,
      ...getNotificationRecipientQuery(req.user),
    });

    if (!notification) {
      res.status(404);
      throw new Error("Notification not found");
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await notification.save();
    }

    res.status(200).json({
      message: "Notification marked as read",
      notification: sanitizeNotification(notification),
    });
  } catch (error) {
    next(error);
  }
};

const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      {
        ...getNotificationRecipientQuery(req.user),
        readAt: null,
      },
      {
        $set: {
          readAt: new Date(),
        },
      }
    );

    res.status(200).json({ message: "Notifications marked as read" });
  } catch (error) {
    next(error);
  }
};

const openNotificationTarget = async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      ...getNotificationRecipientQuery(req.user),
    });

    if (!notification) {
      res.status(404);
      throw new Error("Notification not found");
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await notification.save();
    }

    res.status(200).json({
      message: "Notification target loaded",
      notification: sanitizeNotification(notification),
      target: {
        type: notification.targetType,
        id: notification.targetId,
        url: notification.targetUrl,
        metadata: notification.metadata || {},
      },
    });
  } catch (error) {
    next(error);
  }
};

const streamNotifications = async (req, res, next) => {
  try {
    const token =
      req.query.token ||
      (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : "");

    const user = await getAuthenticatedUserFromToken(token);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const unregister = registerRealtimeClient({ user, res });
    req.on("close", unregister);
  } catch (error) {
    if (!res.headersSent) {
      res.status(error.statusCode || 401).json({
        message: error.message || "Unable to open realtime notification stream",
      });
      return;
    }
    next(error);
  }
};

module.exports = {
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  openNotificationTarget,
  streamNotifications,
};
