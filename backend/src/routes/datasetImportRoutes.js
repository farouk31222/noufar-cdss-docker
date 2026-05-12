const express = require("express");

const {
  listDatasetImports,
  createDatasetImport,
  appendDatasetImportRows,
  updateDatasetImportRow,
  getDatasetImport,
  listDatasetImportRows,
  deleteDatasetImport,
} = require("../controllers/datasetImportController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { datasetImportUpload } = require("../middleware/uploadMiddleware");

const router = express.Router();

router
  .route("/")
  .get(protect, authorize("doctor"), listDatasetImports)
  .post(protect, authorize("doctor"), datasetImportUpload.single("datasetFile"), createDatasetImport);

router
  .route("/:id")
  .get(protect, authorize("doctor"), getDatasetImport)
  .delete(protect, authorize("doctor"), deleteDatasetImport);

router
  .route("/:id/rows")
  .get(protect, authorize("doctor"), listDatasetImportRows)
  .post(protect, authorize("doctor"), appendDatasetImportRows);

router.patch("/:id/rows/:rowId", protect, authorize("doctor"), updateDatasetImportRow);

module.exports = router;
