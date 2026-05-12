const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    actorRole: {
      type: String,
      default: "",
      trim: true,
    },
    actorName: {
      type: String,
      default: "",
      trim: true,
    },
    actorEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    targetType: {
      type: String,
      default: "",
      trim: true,
    },
    targetId: {
      type: String,
      default: "",
      trim: true,
    },
    outcome: {
      type: String,
      enum: ["success", "denied", "failed"],
      required: true,
    },
    ipAddress: {
      type: String,
      default: "",
      trim: true,
    },
    userAgent: {
      type: String,
      default: "",
      trim: true,
    },
    sessionId: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actorRole: 1, createdAt: -1 });
auditLogSchema.index({ outcome: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
