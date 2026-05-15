const mongoose = require("mongoose");

const modelBenchmarkResultSchema = new mongoose.Schema(
  {
    runId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ModelTrainingRun",
      required: true,
      index: true,
    },
    modelKey: {
      type: String,
      enum: ["logistic_regression", "random_forest", "deep_neural_network"],
      required: true,
      index: true,
    },
    modelLabel: {
      type: String,
      trim: true,
      default: "",
    },
    versionType: {
      type: String,
      enum: ["old", "new"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["available", "unavailable", "failed"],
      default: "available",
    },
    metrics: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    artifactPaths: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isWinner: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

modelBenchmarkResultSchema.index({ runId: 1, modelKey: 1, versionType: 1 }, { unique: true });

module.exports = mongoose.model("ModelBenchmarkResult", modelBenchmarkResultSchema);
