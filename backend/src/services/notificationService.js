const Notification = require("../models/Notification");
const { emitNotificationEvent } = require("./realtimeService");

const sanitizeNotification = (notification) => ({
  id: String(notification._id),
  recipientUser: notification.recipientUser ? String(notification.recipientUser) : null,
  recipientRole: notification.recipientRole,
  actorUser: notification.actorUser ? String(notification.actorUser) : null,
  actorName: notification.actorName || "",
  type: notification.type,
  title: notification.title,
  message: notification.message,
  targetType: notification.targetType,
  targetId: notification.targetId,
  targetUrl: notification.targetUrl,
  metadata: notification.metadata || {},
  readAt: notification.readAt,
  isRead: Boolean(notification.readAt),
  createdAt: notification.createdAt,
  updatedAt: notification.updatedAt,
});

const createNotification = async ({
  recipientUser = null,
  recipientRole,
  actorUser = null,
  actorName = "",
  type,
  title,
  message,
  targetType,
  targetId,
  targetUrl,
  metadata = {},
}) => {
  const notification = await Notification.create({
    recipientUser,
    recipientRole,
    actorUser,
    actorName,
    type,
    title,
    message,
    targetType,
    targetId: String(targetId),
    targetUrl,
    metadata,
  });
  emitNotificationEvent({ notification });

  return notification;
};

const getNotificationRecipientQuery = (user) => {
  if (user?.role === "admin") {
    return {
      recipientRole: "admin",
    };
  }

  return {
    recipientRole: "doctor",
    recipientUser: user?._id,
  };
};

module.exports = {
  Notification,
  sanitizeNotification,
  createNotification,
  getNotificationRecipientQuery,
};
