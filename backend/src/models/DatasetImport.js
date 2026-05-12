const mongoose = require("mongoose");

const datasetImportSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    filePath: {
      type: String,
      default: "",
      trim: true,
    },
    storageProvider: {
      type: String,
      enum: ["local", "minio"],
      default: "local",
    },
    bucket: {
      type: String,
      default: "",
      trim: true,
    },
    objectKey: {
      type: String,
      default: "",
      trim: true,
    },
    mimeType: {
      type: String,
      default: "",
      trim: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    sheetName: {
      type: String,
      default: "",
      trim: true,
    },
    columns: {
      type: [String],
      default: [],
    },
    totalRows: {
      type: Number,
      default: 0,
      min: 0,
    },
    importedRows: {
      type: Number,
      default: 0,
      min: 0,
    },
    consultationReasons: {
      type: [String],
      default: [],
    },
    ultrasoundValues: {
      type: [String],
      default: [],
    },
    tsiValues: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["uploading", "ready"],
      default: "uploading",
    },
  },
  { timestamps: true }
);

datasetImportSchema.index({ doctor: 1, updatedAt: -1 });

module.exports = mongoose.model("DatasetImport", datasetImportSchema);
