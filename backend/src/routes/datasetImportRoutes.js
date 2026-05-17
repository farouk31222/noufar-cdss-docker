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
const { isPredictionChiefDoctor } = require("../services/doctorOwnershipService");

const router = express.Router();

const requireDatasetImportAccess = (req, res, next) => {
  const isStandardDoctor =
    req.user?.role === "doctor" &&
    !isPredictionChiefDoctor(req.user) &&
    (req.user?.doctorAccountType || "prediction") === "standard";

  if (isStandardDoctor) {
    res.status(403);
    return next(new Error("This doctor account cannot access imported datasets."));
  }

  return next();
};

router
  .route("/")
  .get(protect, authorize("doctor"), requireDatasetImportAccess, listDatasetImports)
  .post(protect, authorize("doctor"), requireDatasetImportAccess, datasetImportUpload.single("datasetFile"), createDatasetImport);

router
  .route("/:id")
  .get(protect, authorize("doctor"), requireDatasetImportAccess, getDatasetImport)
  .delete(protect, authorize("doctor"), requireDatasetImportAccess, deleteDatasetImport);

router
  .route("/:id/rows")
  .get(protect, authorize("doctor"), requireDatasetImportAccess, listDatasetImportRows)
  .post(protect, authorize("doctor"), requireDatasetImportAccess, appendDatasetImportRows);

router.patch("/:id/rows/:rowId", protect, authorize("doctor"), requireDatasetImportAccess, updateDatasetImportRow);

module.exports = router;
