const mongoose = require("mongoose");

const modelTrainingRunSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["queued", "running", "succeeded", "failed", "rejected", "activated"],
      default: "queued",
      index: true,
    },
    trigger: {
      type: String,
      enum: ["auto_10_validated_cases", "manual_admin"],
      required: true,
      index: true,
    },
    syntheticRows: {
      type: Number,
      default: 0,
      min: 0,
    },
    realValidatedRows: {
      type: Number,
      default: 0,
      min: 0,
    },
    newValidatedRows: {
      type: Number,
      default: 0,
      min: 0,
    },
    previousActiveModelKey: {
      type: String,
      trim: true,
      default: "",
    },
    previousActiveModelLabel: {
      type: String,
      trim: true,
      default: "",
    },
    newActiveModelKey: {
      type: String,
      trim: true,
      default: "",
    },
    newActiveModelLabel: {
      type: String,
      trim: true,
      default: "",
    },
    candidateVersion: {
      type: String,
      trim: true,
      default: "",
    },
    oldWinnerModelKey: {
      type: String,
      trim: true,
      default: "",
    },
    newWinnerModelKey: {
      type: String,
      trim: true,
      default: "",
    },
    winnerReason: {
      type: String,
      trim: true,
      default: "",
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },
    metricsSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    activatedArtifactPaths: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    startedAt: {
      type: Date,
      default: null,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    requestedByName: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

modelTrainingRunSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ModelTrainingRun", modelTrainingRunSchema);
