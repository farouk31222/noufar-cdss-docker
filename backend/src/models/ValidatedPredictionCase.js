const mongoose = require("mongoose");

const validatedPredictionCaseSchema = new mongoose.Schema(
  {
    predictionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prediction",
      required: true,
      unique: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    doctorName: {
      type: String,
      trim: true,
      default: "",
    },
    modelKey: {
      type: String,
      trim: true,
      default: "logistic_regression",
      index: true,
    },
    modelName: {
      type: String,
      trim: true,
      default: "Logistic Regression",
    },
    predictedResult: {
      type: String,
      enum: ["Relapse", "No Relapse"],
      required: true,
    },
    actualOutcome: {
      type: String,
      enum: ["Relapse", "No Relapse"],
      required: true,
      index: true,
    },
    validationStatus: {
      type: String,
      enum: ["Correct", "Incorrect"],
      required: true,
      index: true,
    },
    featuresSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    source: {
      type: String,
      trim: true,
      default: "Manual",
    },
    sourcePredictionCreatedAt: {
      type: Date,
      default: null,
    },
    validatedAt: {
      type: Date,
      required: true,
      index: true,
    },
    usedInTrainingRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ModelTrainingRun",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

validatedPredictionCaseSchema.index({ usedInTrainingRunId: 1, validatedAt: 1 });

module.exports = mongoose.model("ValidatedPredictionCase", validatedPredictionCaseSchema);
