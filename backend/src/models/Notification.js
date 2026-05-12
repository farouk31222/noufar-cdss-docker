const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipientUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    recipientRole: {
      type: String,
      enum: ["doctor", "admin"],
      required: true,
      index: true,
    },
    actorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorName: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    targetType: {
      type: String,
      enum: ["doctor-profile", "support-ticket"],
      required: true,
    },
    targetId: {
      type: String,
      required: true,
      trim: true,
    },
    targetUrl: {
      type: String,
      required: true,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
