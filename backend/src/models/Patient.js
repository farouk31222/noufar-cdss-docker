const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
  {
    patientName: {
      type: String,
      trim: true,
      default: "",
    },
    age: {
      type: Number,
      default: 0,
      min: 0,
    },
    sex: {
      type: String,
      trim: true,
      default: "",
    },
    consultationReason: {
      type: String,
      trim: true,
      default: "",
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
    source: {
      type: String,
      trim: true,
      default: "Manual",
    },
    inputData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    encryptedData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    encryptedDataKeyId: {
      type: String,
      trim: true,
      default: "",
    },
    patientNameBlindIndex: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    consultationReasonCode: {
      type: String,
      trim: true,
      default: "",
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    savedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    savedByName: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

patientSchema.index({ doctorId: 1, createdAt: -1 });

module.exports = mongoose.model("Patient", patientSchema);
