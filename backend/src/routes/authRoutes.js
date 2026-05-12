const express = require("express");
const router = express.Router();

const {
  registerUser,
  loginUser,
  verifyTwoStepLogin,
  refreshUserSession,
  logoutUser,
  forgotPassword,
  resetPassword,
  getUserProfile,
  updateUserProfile,
  updateUserEmail,
  updateUserPassword,
  getAllUsers,
  exportDoctorsDirectory,
  getAdminOverview,
  createAdditionalAdmin,
  getDoctorWorkspace,
  approveDoctorAccount,
  rejectDoctorAccount,
  deactivateDoctorAccount,
  activateDoctorAccount,
  updateDoctorAccessType,
  deleteDoctorAccount,
  downloadDoctorDocument,
} = require("../controllers/authController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { upload } = require("../middleware/uploadMiddleware");
const {
  registerLimiter,
  loginLimiter,
  twoFactorLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  createAdminLimiter,
} = require("../middleware/rateLimitMiddleware");

router.post(
  "/register",
  registerLimiter,
  upload.fields([
    { name: "medicalLicense", maxCount: 1 },
    { name: "nationalId", maxCount: 1 },
  ]),
  registerUser
);
router.post("/login", loginLimiter, loginUser);
router.post("/login/verify-2fa", twoFactorLimiter, verifyTwoStepLogin);
router.post("/refresh", refreshUserSession);
router.post("/logout", protect, logoutUser);
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password", resetPasswordLimiter, resetPassword);
router.get("/profile", protect, getUserProfile);
router.patch("/profile", protect, updateUserProfile);
router.patch("/profile/email", protect, updateUserEmail);
router.patch("/profile/password", protect, updateUserPassword);
router.get("/doctor/workspace", protect, authorize("doctor"), getDoctorWorkspace);
router.get("/admin/overview", protect, authorize("admin"), getAdminOverview);
router.post("/admin/admins", protect, authorize("admin"), createAdminLimiter, createAdditionalAdmin);
router.get("/admin/users", protect, authorize("admin"), getAllUsers);
router.get("/admin/users/export", protect, authorize("admin"), exportDoctorsDirectory);
router.get(
  "/admin/users/:id/documents/:documentId/download",
  protect,
  authorize("admin"),
  downloadDoctorDocument
);
router.patch("/admin/users/:id/approve", protect, authorize("admin"), approveDoctorAccount);
router.patch("/admin/users/:id/reject", protect, authorize("admin"), rejectDoctorAccount);
router.patch("/admin/users/:id/deactivate", protect, authorize("admin"), deactivateDoctorAccount);
router.patch("/admin/users/:id/activate", protect, authorize("admin"), activateDoctorAccount);
router.patch("/admin/users/:id/access-type", protect, authorize("admin"), updateDoctorAccessType);
router.patch("/admin/users/:id/delete", protect, authorize("admin"), deleteDoctorAccount);

module.exports = router;
