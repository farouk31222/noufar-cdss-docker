const mongoose = require("mongoose");

const datasetImportRowSchema = new mongoose.Schema(
  {
    datasetImport: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DatasetImport",
      required: true,
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rowId: {
      type: String,
      required: true,
      trim: true,
    },
    rowIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    rowData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    searchText: {
      type: String,
      default: "",
      trim: true,
    },
    consultationReason: {
      type: String,
      default: "",
      trim: true,
    },
    ultrasound: {
      type: String,
      default: "",
      trim: true,
    },
    tsi: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

datasetImportRowSchema.index({ datasetImport: 1, rowIndex: 1 });
datasetImportRowSchema.index({ datasetImport: 1, rowId: 1 }, { unique: true });
datasetImportRowSchema.index({ doctor: 1, datasetImport: 1 });

module.exports = mongoose.model("DatasetImportRow", datasetImportRowSchema);
