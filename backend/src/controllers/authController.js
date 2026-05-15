const crypto = require("crypto");
const User = require("../models/User");
const Admin = require("../models/Admin");
const { createNotification } = require("../services/notificationService");
const { emitDoctorRegistrationEvent } = require("../services/realtimeService");
const {
  sendDoctorApprovedEmail,
  sendDoctorActivatedEmail,
  sendDoctorDeletedEmail,
  sendDoctorRejectedEmail,
  sendTwoStepVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/emailService");
const { storePrivateUpload, sendStoredFileResponse } = require("../services/fileAccessService");
const { validateSeedAdminInput } = require("../services/adminBootstrapService");
const { validatePasswordPolicy } = require("../services/passwordPolicyService");
const { logAuditEventSafe } = require("../services/auditLogService");
const {
  ensureAccountIsNotLocked,
  registerFailedLoginAttempt,
  registerFailedTwoStepAttempt,
  resetLoginProtection,
  resetAllAuthProtection,
} = require("../services/authProtectionService");
const {
  buildAuthResponse,
  createAuthSession,
  refreshAuthSession,
  revokeAuthSessionById,
  revokeAuthSessionByRefreshToken,
  rotateAuthSession,
  getSessionRecordById,
} = require("../services/authSessionService");

const toSafeStorageSegment = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "doctor";

const buildDoctorDocumentFolder = (doctorName = "") =>
  `doctor-documents/${toSafeStorageSegment(doctorName)}-documents`;

const getActorName = (user) => user?.name || user?.email || "Admin";
const toAuditOutcomeFromStatus = (statusCode) =>
  Number(statusCode) >= 400 && Number(statusCode) < 500 ? "denied" : "failed";
const buildCsvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const toDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const buildDoctorDirectoryFilter = (query = {}) => {
  const search = String(query.search || "").trim().toLowerCase();
  const approvalStatus = String(query.approvalStatus || "").trim();
  const accountStatus = String(query.accountStatus || "").trim();
  const specialty = String(query.specialty || "").trim();
  const dateRange = String(query.dateRange || "").trim();

  return {
    search,
    approvalStatus,
    accountStatus,
    specialty,
    dateRange,
  };
};
const doctorMatchesDirectoryFilter = (doctor, filter = {}) => {
  const searchHaystack = [
    doctor.name,
    doctor.email,
    doctor.specialty,
    doctor.hospital,
    doctor.assignedAdmin,
  ]
    .join(" ")
    .toLowerCase();

  if (filter.search && !searchHaystack.includes(filter.search)) return false;
  if (filter.approvalStatus && filter.approvalStatus !== "all" && doctor.approvalStatus !== filter.approvalStatus) {
    return false;
  }
  if (filter.accountStatus && filter.accountStatus !== "all" && doctor.accountStatus !== filter.accountStatus) {
    return false;
  }
  if (filter.specialty && filter.specialty !== "all" && doctor.specialty !== filter.specialty) {
    return false;
  }
  if (filter.dateRange && filter.dateRange !== "all") {
    const days = Number.parseInt(filter.dateRange, 10);
    if (Number.isFinite(days) && days > 0) {
      const createdAt = toDateOrNull(doctor.createdAt);
      if (!createdAt) return false;
      const diffDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > days) return false;
    }
  }

  return true;
};
const buildDoctorDirectoryCsv = (doctors = []) => {
  const headers = [
    "Doctor Name",
    "Email",
    "Specialty",
    "Hospital",
    "Role",
    "Access Type",
    "Approval Status",
    "Account Status",
    "Assigned Admin",
    "Created At",
    "Updated At",
  ];

  const lines = [
    headers.map(buildCsvValue).join(","),
    ...doctors.map((doctor) =>
      [
        doctor.name,
        doctor.email,
        doctor.specialty,
        doctor.hospital,
        doctor.role,
        doctor.doctorAccountType,
        doctor.approvalStatus,
        doctor.accountStatus,
        doctor.assignedAdmin,
        doctor.createdAt ? new Date(doctor.createdAt).toISOString() : "",
        doctor.updatedAt ? new Date(doctor.updatedAt).toISOString() : "",
      ]
        .map(buildCsvValue)
        .join(",")
    ),
  ];

  return lines.join("\n");
};

const appendDoctorHistory = (doctor, label, actor, actorId = null) => {
  doctor.assignedAdmin = actor;
  doctor.assignedAdminId = actorId || doctor.assignedAdminId || null;
  doctor.statusHistory = [
    {
      date: new Date(),
      label,
      by: actor,
    },
    ...(Array.isArray(doctor.statusHistory) ? doctor.statusHistory : []),
  ].slice(0, 25);
};

const normalizeSessionTimeout = (value) => {
  if (value === "60 minutes") return "1 hour";
  if (value === "15 minutes") return "30 minutes";
  return value;
};

const getPasswordResetBaseUrl = () =>
  process.env.APP_BASE_URL || process.env.FRONTEND_BASE_URL || "http://localhost:5000";

const hashToken = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const createTwoStepCode = () => String(Math.floor(100000 + Math.random() * 900000));

const clearTwoStepChallenge = (user) => {
  user.twoStepCodeToken = "";
  user.twoStepCodeExpires = null;
  user.twoStepChallengeToken = "";
};

const sanitizeSubmittedDocument = (document, userId, options = {}) => ({
  id: document?._id ? String(document._id) : "",
  label: document?.label || "",
  fileName: document?.fileName || "",
  mimeType: document?.mimeType || "",
  fileSize: document?.fileSize || 0,
  verified: Boolean(document?.verified),
  ...(options.includeDocumentDownloads && userId && document?._id
    ? {
        downloadUrl: `/api/auth/admin/users/${encodeURIComponent(String(userId))}/documents/${encodeURIComponent(
          String(document._id)
        )}/download`,
      }
    : {}),
});

const sanitizeUser = (user, options = {}) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role || "doctor",
  doctorAccountType: user.doctorAccountType === "standard" ? "standard" : "prediction",
  specialty: user.specialty || "",
  hospital: user.hospital || "",
  profilePhoto: user.profilePhoto || "",
  twoStepEnabled: Boolean(user.twoStepEnabled),
  sessionTimeout: normalizeSessionTimeout(user.sessionTimeout || "Never"),
  termsAccepted: Boolean(user.termsAccepted),
  submittedDocuments: Array.isArray(user.submittedDocuments)
    ? user.submittedDocuments.map((document) => sanitizeSubmittedDocument(document, user._id, options))
    : [],
  approvalStatus: user.approvalStatus || "Approved",
  accountStatus: user.accountStatus || "Active",
  rejectionReason: user.rejectionReason || "",
  deactivationReason: user.deactivationReason || "",
  deletionReason: user.deletionReason || "",
  assignedAdmin: user.assignedAdmin || "System",
  assignedAdminId: user.assignedAdminId || null,
  statusHistory: Array.isArray(user.statusHistory) ? user.statusHistory : [],
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const getAuthCollection = (user) => (user?.role === "admin" ? Admin : User);

const sanitizeUsers = (users, options = {}) => users.map((user) => sanitizeUser(user, options));

const createAuthResponsePayload = async (user, req) => {
  const { tokenBundle } = await createAuthSession({
    user,
    req,
  });

  return buildAuthResponse(sanitizeUser(user), tokenBundle);
};

const rotateCurrentSessionPayload = async (user, req) => {
  const sessionId = req?.auth?.sessionId;

  if (!sessionId) {
    return null;
  }

  const { tokenBundle } = await rotateAuthSession({
    session: await getSessionRecordById(sessionId),
    user,
    req,
  });

  return buildAuthResponse(sanitizeUser(user), tokenBundle);
};

const ensureDoctorAccountCanAuthenticate = (user) => {
  if (user.role !== "doctor") return;

  if (user.accountStatus === "Deleted") {
    const error = new Error("Your account has been blocked.");
    error.statusCode = 403;
    error.code = "ACCOUNT_DELETED";
    error.reason = user.deletionReason || "No block reason was provided.";
    error.email = user.email || "";
    error.doctorName = user.name || "";
    error.institution = user.hospital || "";
    throw error;
  }

  if (user.approvalStatus !== "Approved") {
    const error = new Error(
      "Your account is pending approval. You’ll receive an email once it has been approved. If it takes more than 24 hours, please contact support at: noufar.cdss@gmail.com."
    );
    error.statusCode = 403;
    error.code = "ACCOUNT_PENDING_APPROVAL";
    throw error;
  }

  if (user.accountStatus !== "Active") {
    const error = new Error("Your account has been deactivated.");
    error.statusCode = 403;
    error.code = "ACCOUNT_DEACTIVATED";
    error.reason = user.deactivationReason || "No reason was provided by the admin.";
    throw error;
  }
};

const registerUser = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      role,
      specialty,
      hospital,
      adminKey,
      doctorAccountType,
      termsAccepted,
    } = req.body;
    const medicalLicenseFile = req.files?.medicalLicense?.[0];
    const nationalIdFile = req.files?.nationalId?.[0];

    if (!name || !email || !password) {
      res.status(400);
      throw new Error("Name, email, and password are required");
    }

    const requestedRole = role === "admin" ? "admin" : "doctor";
    const normalizedDoctorAccountType = doctorAccountType === "standard" ? "standard" : "prediction";

    if (requestedRole === "admin" && adminKey !== process.env.ADMIN_REGISTRATION_KEY) {
      res.status(403);
      throw new Error("Invalid admin registration key");
    }

    if (requestedRole === "admin") {
      res.status(403);
      throw new Error(
        "Admin self-registration is disabled. Provision admins with the secure seed command."
      );
    }

    if (requestedRole === "doctor") {
      if (!specialty || !hospital) {
        res.status(400);
        throw new Error("Specialty and institution are required for doctor registration");
      }

      if (!medicalLicenseFile || !nationalIdFile) {
        res.status(400);
        throw new Error("Medical license and national ID must be provided");
      }

      if (!termsAccepted) {
        res.status(400);
        throw new Error("Terms confirmation is required");
      }
    }

    const normalizedEmail = email.toLowerCase();
    validatePasswordPolicy({
      password,
      email: normalizedEmail,
    });
    // pour vérifier si l’email existe déjà
    const userExists = await User.findOne({ email: normalizedEmail });

    if (userExists) {
      const canReplaceRejectedOrDeletedDoctor =
        requestedRole === "doctor" &&
        userExists.role === "doctor" &&
        userExists.approvalStatus === "Rejected";

      if (canReplaceRejectedOrDeletedDoctor) {
        await userExists.deleteOne();
      } else if (
        requestedRole === "doctor" &&
        userExists.role === "doctor" &&
        userExists.accountStatus === "Deleted"
      ) {
        res.status(400);
        throw new Error("This email is blocked. Please use another.");
      } else {
        res.status(400);
        throw new Error("User already exists");
      }
    }

    let medicalLicenseDocument = null;
    let nationalIdDocument = null;

    if (requestedRole === "doctor") {
      const doctorDocumentFolder = buildDoctorDocumentFolder(name);

      medicalLicenseDocument = await storePrivateUpload({
        file: medicalLicenseFile,
        folder: doctorDocumentFolder,
      });
      nationalIdDocument = await storePrivateUpload({
        file: nationalIdFile,
        folder: doctorDocumentFolder,
      });
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: requestedRole,
      doctorAccountType: requestedRole === "doctor" ? normalizedDoctorAccountType : "prediction",
      specialty,
      hospital,
      termsAccepted: Boolean(termsAccepted),
      submittedDocuments:
        requestedRole === "doctor"
          ? [
              {
                label: "Medical license",
                fileName: medicalLicenseDocument.fileName,
                filePath: medicalLicenseDocument.filePath,
                storageProvider: medicalLicenseDocument.storageProvider,
                bucket: medicalLicenseDocument.bucket,
                objectKey: medicalLicenseDocument.objectKey,
                mimeType: medicalLicenseDocument.mimeType,
                fileSize: medicalLicenseDocument.fileSize,
                verified: false,
              },
              {
                label: "National ID",
                fileName: nationalIdDocument.fileName,
                filePath: nationalIdDocument.filePath,
                storageProvider: nationalIdDocument.storageProvider,
                bucket: nationalIdDocument.bucket,
                objectKey: nationalIdDocument.objectKey,
                mimeType: nationalIdDocument.mimeType,
                fileSize: nationalIdDocument.fileSize,
                verified: false,
              },
            ]
          : [],
      approvalStatus: requestedRole === "admin" ? "Approved" : "Pending",
      accountStatus: requestedRole === "admin" ? "Active" : "Inactive",
      statusHistory:
        requestedRole === "doctor"
          ? [
              {
                date: new Date(),
                label: "Doctor account created and pending review",
                by: "System",
              },
            ]
          : [
              {
                date: new Date(),
                label: "Admin account created",
                by: "System",
              },
            ],
    });

    if (requestedRole === "doctor") {
      await createNotification({
        recipientRole: "admin",
        actorUser: user._id,
        actorName: user.name,
        type: "doctor-registration",
        title: "New doctor registration",
        message: `${user.name} submitted a registration request in ${user.specialty} at ${user.hospital}.`,
        targetType: "doctor-profile",
        targetId: user._id,
        targetUrl: `doctor-details.html?id=${user._id}`,
        metadata: {
          doctorId: String(user._id),
          doctorName: user.name,
          doctorEmail: user.email,
          specialty: user.specialty,
          hospital: user.hospital,
          approvalStatus: user.approvalStatus,
        },
      });

      emitDoctorRegistrationEvent({
        doctorId: user._id,
      });
    }

    const authPayload = await createAuthResponsePayload(user, req);

    res.status(201).json(authPayload);
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(500);
    }
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  let auditUser = null;
  let normalizedEmail = "";
  let lockEventDetails = null;
  try {
    const { email, password, expectedRole } = req.body;

    if (!email || !password) {
      res.status(400);
      throw new Error("Email and password are required");
    }
    // pour login / récupération user
    normalizedEmail = String(email).toLowerCase();
    const isAdminLogin = expectedRole === "admin";
    const user = isAdminLogin
      ? await Admin.findOne({ email: normalizedEmail })
      : await User.findOne({ email: normalizedEmail });
    auditUser = user;

    if (user) {
      ensureAccountIsNotLocked(user);
    }

    if (!user) {
      res.status(401);
      throw new Error("Invalid email or password");
    }

    const passwordMatches = await user.matchPassword(password);
    if (!passwordMatches) {
      lockEventDetails = await registerFailedLoginAttempt(user);
      res.status(lockEventDetails?.lockApplied ? 423 : 401);
      const error = new Error(
        lockEventDetails?.lockApplied
          ? "This account is temporarily locked due to repeated failed authentication attempts. Please try again later."
          : "Invalid email or password"
      );
      if (lockEventDetails?.lockApplied) {
        error.statusCode = 423;
        error.lockUntil = lockEventDetails.lockUntil;
      }
      throw error;
    }

    await resetLoginProtection(user);

    if (expectedRole === "doctor" && user.role !== "doctor") {
      res.status(403);
      const error = new Error("This account does not have doctor access. Please use the admin portal to sign in.");
      error.code = "DOCTOR_ACCESS_ONLY";
      throw error;
    }

    if (expectedRole === "admin" && user.role !== "admin") {
      res.status(403);
      const error = new Error("This account does not have admin access.");
      error.code = "ADMIN_ACCESS_ONLY";
      throw error;
    }

    if (user.role === "doctor" && user.accountStatus === "Deleted") {
      res.status(403);
      const error = new Error("Your account has been blocked.");
      error.code = "ACCOUNT_DELETED";
      error.reason = user.deletionReason || "No block reason was provided.";
      error.email = user.email || "";
      error.doctorName = user.name || "";
      error.institution = user.hospital || "";
      throw error;
    }

    if (user.role === "doctor" && user.approvalStatus !== "Approved") {
      res.status(403);
      const error = new Error("Your account is pending approval. You’ll receive an email once it has been approved. If it takes more than 24 hours, please contact support at: noufar.cdss@gmail.com.");
      error.code = "ACCOUNT_PENDING_APPROVAL";
      throw error;
    }

    if (user.role === "doctor" && user.accountStatus !== "Active") {
      res.status(403);
      const error = new Error("Your account has been deactivated.");
      error.code = "ACCOUNT_DEACTIVATED";
      error.reason = user.deactivationReason || "No reason was provided by the admin.";
      throw error;
    }

    if (user.role === "doctor" && user.twoStepEnabled) {
      const verificationCode = createTwoStepCode();
      const challengeToken = crypto.randomBytes(24).toString("hex");

      user.twoStepCodeToken = hashToken(verificationCode);
      user.twoStepChallengeToken = hashToken(challengeToken);
      user.twoStepCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      await sendTwoStepVerificationEmail(user, verificationCode);

      await logAuditEventSafe({
        req,
        actor: user,
        action: "auth.login.2fa_challenge_issued",
        targetType: "account",
        targetId: user._id,
        outcome: "success",
        metadata: {
          expectedRole: expectedRole || "doctor",
        },
      });

      res.status(202).json({
        requiresTwoStep: true,
        challengeToken,
        email: user.email,
        maskedEmail: `${user.email.slice(0, 2)}***${user.email.slice(user.email.indexOf("@"))}`,
        expiresInMinutes: 10,
      });
      return;
    }

    await resetAllAuthProtection(user);
    const authPayload = await createAuthResponsePayload(user, req);

    await logAuditEventSafe({
      req,
      actor: user,
      action: "auth.login.success",
      targetType: "account",
      targetId: user._id,
      outcome: "success",
      metadata: {
        expectedRole: expectedRole || user.role,
      },
    });

    res.status(200).json(authPayload);
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(error.statusCode || 500);
    }
    await logAuditEventSafe({
      req,
      actor: auditUser,
      actorRole: req.body?.expectedRole === "admin" ? "admin" : auditUser?.role || "doctor",
      action: "auth.login.failed",
      targetType: "account",
      targetId: auditUser?._id || normalizedEmail,
      outcome: toAuditOutcomeFromStatus(res.statusCode),
      metadata: {
        email: normalizedEmail,
        expectedRole: req.body?.expectedRole || "doctor",
        reason: error.message,
        lockUntil: error.lockUntil || lockEventDetails?.lockUntil || null,
        failedAttemptCount: lockEventDetails?.failedCount || undefined,
      },
    });
    if (lockEventDetails?.lockApplied && auditUser) {
      await logAuditEventSafe({
        req,
        actor: auditUser,
        action: "auth.login.account_locked",
        targetType: "account",
        targetId: auditUser._id,
        outcome: "success",
        metadata: {
          email: normalizedEmail,
          failedAttemptCount: lockEventDetails.failedCount,
          lockUntil: lockEventDetails.lockUntil,
          lockDurationMs: lockEventDetails.lockDurationMs,
          expectedRole: req.body?.expectedRole || auditUser.role || "doctor",
        },
      });
    }
    next(error);
  }
};

const verifyTwoStepLogin = async (req, res, next) => {
  let auditUser = null;
  let normalizedEmail = "";
  let lockEventDetails = null;
  try {
    const { email, code, challengeToken } = req.body;

    if (!email || !code || !challengeToken) {
      res.status(400);
      throw new Error("Email, verification code, and challenge token are required");
    }

    normalizedEmail = String(email).toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    auditUser = user;

    if (!user || user.role !== "doctor") {
      res.status(401);
      throw new Error("Invalid verification request");
    }

    ensureAccountIsNotLocked(user);

    const isExpired = !user.twoStepCodeExpires || user.twoStepCodeExpires.getTime() < Date.now();
    const isChallengeValid = user.twoStepChallengeToken && user.twoStepChallengeToken === hashToken(challengeToken);
    const isCodeValid = user.twoStepCodeToken && user.twoStepCodeToken === hashToken(code);

    if (isExpired || !isChallengeValid || !isCodeValid) {
      if (isExpired) {
        clearTwoStepChallenge(user);
      }

      lockEventDetails = await registerFailedTwoStepAttempt(user);
      res.status(lockEventDetails?.lockApplied ? 423 : 401);
      const error = new Error(
        lockEventDetails?.lockApplied
          ? "This account is temporarily locked due to repeated failed authentication attempts. Please try again later."
          : isExpired
            ? "This verification code has expired. Please sign in again."
            : "Invalid verification code"
      );
      if (lockEventDetails?.lockApplied) {
        error.statusCode = 423;
        error.lockUntil = lockEventDetails.lockUntil;
      }
      throw error;
    }

    clearTwoStepChallenge(user);
    await resetAllAuthProtection(user);

    const authPayload = await createAuthResponsePayload(user, req);

    await logAuditEventSafe({
      req,
      actor: user,
      action: "auth.login.2fa_success",
      targetType: "account",
      targetId: user._id,
      outcome: "success",
      metadata: {
        email: user.email,
      },
    });

    res.status(200).json(authPayload);
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(error.statusCode || 500);
    }
    await logAuditEventSafe({
      req,
      actor: auditUser,
      actorRole: "doctor",
      action: "auth.login.2fa_failed",
      targetType: "account",
      targetId: auditUser?._id || normalizedEmail,
      outcome: toAuditOutcomeFromStatus(res.statusCode),
      metadata: {
        email: normalizedEmail,
        reason: error.message,
        lockUntil: error.lockUntil || lockEventDetails?.lockUntil || null,
        failedAttemptCount: lockEventDetails?.failedCount || undefined,
      },
    });
    if (lockEventDetails?.lockApplied && auditUser) {
      await logAuditEventSafe({
        req,
        actor: auditUser,
        action: "auth.login.2fa_account_locked",
        targetType: "account",
        targetId: auditUser._id,
        outcome: "success",
        metadata: {
          email: normalizedEmail,
          failedAttemptCount: lockEventDetails.failedCount,
          lockUntil: lockEventDetails.lockUntil,
          lockDurationMs: lockEventDetails.lockDurationMs,
        },
      });
    }
    next(error);
  }
};

const getUserProfile = async (req, res, next) => {
  try {
    // pour récupérer l’utilisateur connecté
    const Model = getAuthCollection(req.user);
    const user = await Model.findById(req.user._id);

    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    res.status(200).json(sanitizeUser(user));
  } catch (error) {
    next(error);
  }
};

const updateUserProfile = async (req, res, next) => {
  try {
    const Model = getAuthCollection(req.user);
    const user = await Model.findById(req.user._id);

    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const {
      name,
      specialty,
      hospital,
      profilePhoto,
      twoStepEnabled,
      sessionTimeout,
    } = req.body;

    if (!name || !String(name).trim()) {
      res.status(400);
      throw new Error("Full name is required");
    }

    user.name = String(name).trim();
    if (user.role !== "admin") {
      user.specialty = String(specialty || "").trim();
      user.hospital = String(hospital || "").trim();
    }
    user.profilePhoto = typeof profilePhoto === "string" ? profilePhoto : user.profilePhoto;
    user.twoStepEnabled = Boolean(twoStepEnabled);

    if (sessionTimeout) {
      user.sessionTimeout = normalizeSessionTimeout(sessionTimeout);
    }

    await user.save();

    res.status(200).json({
      user: sanitizeUser(user),
      message: "Profile updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

const updateUserEmail = async (req, res, next) => {
  try {
    const Model = getAuthCollection(req.user);
    const user = await Model.findById(req.user._id);

    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const currentPassword = String(req.body?.currentPassword || "");
    const newEmail = String(req.body?.newEmail || "").trim().toLowerCase();
    const confirmEmail = String(req.body?.confirmEmail || "").trim().toLowerCase();

    if (!currentPassword || !newEmail || !confirmEmail) {
      res.status(400);
      throw new Error("Current password, new email, and confirmation are required");
    }

    if (!(await user.matchPassword(currentPassword))) {
      res.status(400);
      throw new Error("Current password is incorrect");
    }

    if (newEmail !== confirmEmail) {
      res.status(400);
      throw new Error("The new email and confirmation email do not match");
    }

    const emailTakenInUsers = await User.findOne({
      email: newEmail,
      _id: { $ne: user._id },
    });
    const emailTakenInAdmins = await Admin.findOne({
      email: newEmail,
      _id: { $ne: user._id },
    });

    if (emailTakenInUsers || emailTakenInAdmins) {
      res.status(400);
      throw new Error("This email is already in use");
    }

    user.email = newEmail;
    await user.save();

    const rotatedSessionPayload = await rotateCurrentSessionPayload(user, req);

    res.status(200).json({
      user: sanitizeUser(user),
      ...(rotatedSessionPayload
        ? {
            token: rotatedSessionPayload.token,
            accessToken: rotatedSessionPayload.accessToken,
            refreshToken: rotatedSessionPayload.refreshToken,
            sessionId: rotatedSessionPayload.sessionId,
            accessTokenExpiresIn: rotatedSessionPayload.accessTokenExpiresIn,
            refreshTokenExpiresIn: rotatedSessionPayload.refreshTokenExpiresIn,
            accessTokenExpiresAt: rotatedSessionPayload.accessTokenExpiresAt,
            refreshTokenExpiresAt: rotatedSessionPayload.refreshTokenExpiresAt,
          }
        : {}),
      message: "Email updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

const updateUserPassword = async (req, res, next) => {
  try {
    const Model = getAuthCollection(req.user);
    const user = await Model.findById(req.user._id);

    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      res.status(400);
      throw new Error("Current password, new password, and confirmation are required");
    }

    if (!(await user.matchPassword(currentPassword))) {
      res.status(400);
      throw new Error("Current password is incorrect");
    }

    if (newPassword === currentPassword) {
      res.status(400);
      throw new Error("The new password shouldn't be the same as the previous password");
    }

    if (newPassword !== confirmPassword) {
      res.status(400);
      throw new Error("The new password and confirmation do not match");
    }

    validatePasswordPolicy({
      password: newPassword,
      email: user.email,
    });

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      message: "Password updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  let auditUser = null;
  let email = "";
  try {
    email = String(req.body?.email || "").trim().toLowerCase();

    if (!email) {
      res.status(400);
      throw new Error("Email is required");
    }

    const user = await User.findOne({ email, role: "doctor" });
    auditUser = user;

    if (user && user.accountStatus !== "Deleted") {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const resetLink = `${getPasswordResetBaseUrl()}/reset-password.html?token=${rawToken}`;

      try {
        await sendPasswordResetEmail(user, resetLink);
      } catch (emailError) {
        console.error(`Password reset email failed for ${user.email}:`, emailError.message);
      }
    }

    res.status(200).json({
      message: "If an account with that email exists, a reset link has been sent.",
    });
    await logAuditEventSafe({
      req,
      actor: auditUser,
      actorRole: "doctor",
      action: "auth.password_reset.requested",
      targetType: "account",
      targetId: auditUser?._id || email,
      outcome: "success",
      metadata: {
        email,
        accountExists: Boolean(user && user.accountStatus !== "Deleted"),
      },
    });
  } catch (error) {
    await logAuditEventSafe({
      req,
      actor: auditUser,
      actorRole: "doctor",
      action: "auth.password_reset.request_failed",
      targetType: "account",
      targetId: auditUser?._id || email,
      outcome: toAuditOutcomeFromStatus(res.statusCode || 500),
      metadata: {
        email,
        reason: error.message,
      },
    });
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  let auditUser = null;
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!token || !newPassword || !confirmPassword) {
      res.status(400);
      throw new Error("Token, new password, and confirmation are required");
    }

    if (newPassword !== confirmPassword) {
      res.status(400);
      throw new Error("The new password and confirmation do not match");
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
      role: "doctor",
    });
    auditUser = user;

    if (!user) {
      res.status(400);
      throw new Error("This reset link is invalid or has expired");
    }

    validatePasswordPolicy({
      password: newPassword,
      email: user.email,
    });

    if (await user.matchPassword(newPassword)) {
      res.status(400);
      throw new Error("The new password shouldn't be the same as the previous password");
    }

    user.password = newPassword;
    user.passwordResetToken = "";
    user.passwordResetExpires = null;
    await user.save();

    res.status(200).json({
      message: "Password reset successfully. You can now log in with your new password.",
    });
    await logAuditEventSafe({
      req,
      actor: user,
      action: "auth.password_reset.completed",
      targetType: "account",
      targetId: user._id,
      outcome: "success",
      metadata: {
        email: user.email,
      },
    });
  } catch (error) {
    await logAuditEventSafe({
      req,
      actor: auditUser,
      actorRole: "doctor",
      action: "auth.password_reset.failed",
      targetType: "account",
      targetId: auditUser?._id || "password-reset",
      outcome: toAuditOutcomeFromStatus(res.statusCode || 500),
      metadata: {
        reason: error.message,
      },
    });
    next(error);
  }
};

const refreshUserSession = async (req, res, next) => {
  let auditUser = null;
  try {
    const refreshToken =
      String(req.body?.refreshToken || "").trim() ||
      (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : "");

    const { user, session, tokenBundle } = await refreshAuthSession({
      refreshToken,
      req,
    });
    auditUser = user;

    try {
      ensureDoctorAccountCanAuthenticate(user);
    } catch (error) {
      await revokeAuthSessionById(session?.sessionId);
      throw error;
    }

    res.status(200).json(
      buildAuthResponse(sanitizeUser(user), tokenBundle)
    );
    await logAuditEventSafe({
      req,
      actor: user,
      action: "auth.session.refresh",
      targetType: "session",
      targetId: session?.sessionId || req?.auth?.sessionId || "",
      outcome: "success",
      metadata: {
        role: user.role,
      },
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(error.statusCode || 401);
    }
    await logAuditEventSafe({
      req,
      actor: auditUser,
      actorRole: auditUser?.role || "",
      action: "auth.session.refresh_failed",
      targetType: "session",
      targetId: req?.auth?.sessionId || "",
      outcome: toAuditOutcomeFromStatus(res.statusCode),
      metadata: {
        reason: error.message,
      },
    });
    next(error);
  }
};

const logoutUser = async (req, res, next) => {
  try {
    const refreshToken = String(req.body?.refreshToken || "").trim();

    if (req.auth?.sessionId) {
      await revokeAuthSessionById(req.auth.sessionId);
    } else if (refreshToken) {
      await revokeAuthSessionByRefreshToken(refreshToken);
    } else {
      res.status(400);
      throw new Error("A valid session is required to log out.");
    }

    res.status(200).json({
      message: "Session revoked successfully.",
    });
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "auth.logout",
      targetType: "session",
      targetId: req.auth?.sessionId || "",
      outcome: "success",
      metadata: {
        role: req.user?.role || "",
      },
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(error.statusCode || 401);
    }
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "auth.logout_failed",
      targetType: "session",
      targetId: req.auth?.sessionId || "",
      outcome: toAuditOutcomeFromStatus(res.statusCode),
      metadata: {
        reason: error.message,
      },
    });
    next(error);
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    // pour lister les médecins
    const users = await User.find({ role: "doctor" }).sort({ createdAt: -1 });
    res.status(200).json(sanitizeUsers(users, { includeDocumentDownloads: true }));
  } catch (error) {
    next(error);
  }
};

const exportDoctorsDirectory = async (req, res, next) => {
  try {
    const filters = buildDoctorDirectoryFilter(req.query);
    const doctors = await User.find({ role: "doctor" }).sort({ createdAt: -1 });
    const sanitizedDoctors = sanitizeUsers(doctors);
    const filteredDoctors = sanitizedDoctors.filter((doctor) =>
      doctorMatchesDirectoryFilter(doctor, filters)
    );
    const csv = buildDoctorDirectoryCsv(filteredDoctors);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_directory.export",
      targetType: "doctor-directory",
      targetId: "",
      outcome: "success",
      metadata: {
        filters,
        exportedRows: filteredDoctors.length,
        format: "csv",
      },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="doctors-directory-${timestamp}.csv"`
    );
    res.status(200).send(csv);
  } catch (error) {
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_directory.export_failed",
      targetType: "doctor-directory",
      targetId: "",
      outcome: toAuditOutcomeFromStatus(res.statusCode || 500),
      metadata: {
        reason: error.message,
      },
    });
    next(error);
  }
};

const downloadDoctorDocument = async (req, res, next) => {
  let doctor = null;
  let document = null;
  try {
    doctor = await User.findById(req.params.id).select("role submittedDocuments email name");

    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor not found");
    }

    document = Array.isArray(doctor.submittedDocuments)
      ? doctor.submittedDocuments.find((entry) => String(entry._id) === String(req.params.documentId))
      : null;

    if (!document) {
      res.status(404);
      throw new Error("Document not found");
    }

    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_document.download",
      targetType: "doctor-document",
      targetId: req.params.documentId,
      outcome: "success",
      metadata: {
        doctorId: doctor._id,
        doctorEmail: doctor.email,
        doctorName: doctor.name,
        documentLabel: document.label || "",
        fileName: document.fileName || "",
      },
    });

    await sendStoredFileResponse(document, res);
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(error.statusCode || 404);
    }
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_document.download_failed",
      targetType: "doctor-document",
      targetId: req.params.documentId || "",
      outcome: toAuditOutcomeFromStatus(res.statusCode),
      metadata: {
        doctorId: doctor?._id || req.params.id,
        documentLabel: document?.label || "",
        reason: error.message,
      },
    });
    next(error);
  }
};

const getAdminOverview = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const approvedDoctors = await User.countDocuments({ role: "doctor", approvalStatus: "Approved" });
    const pendingDoctors = await User.countDocuments({ role: "doctor", approvalStatus: "Pending" });
    const totalAdmins = await Admin.countDocuments();

    res.status(200).json({
      message: "Admin access granted",
      stats: {
        totalUsers,
        approvedDoctors,
        pendingDoctors,
        totalAdmins,
      },
    });
  } catch (error) {
    next(error);
  }
};

const createAdditionalAdmin = async (req, res, next) => {
  let actorAdmin = null;
  let createdAdmin = null;
  try {
    actorAdmin = await Admin.findById(req.user?._id);

    if (!actorAdmin) {
      res.status(403);
      throw new Error("Only authenticated admins can create another admin.");
    }

    const currentPassword = String(req.body?.currentPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!currentPassword) {
      res.status(400);
      throw new Error("Current admin password is required to create another admin.");
    }

    if (!(await actorAdmin.matchPassword(currentPassword))) {
      res.status(401);
      throw new Error("Current admin password is incorrect.");
    }

    const seedAdmin = validateSeedAdminInput({
      name: req.body?.name,
      email: req.body?.email,
      password: req.body?.password,
    });

    if (seedAdmin.password !== confirmPassword) {
      res.status(400);
      throw new Error("The new admin password and confirmation do not match.");
    }

    const existingAdmin = await Admin.findOne({ email: seedAdmin.email });
    if (existingAdmin) {
      res.status(400);
      throw new Error("An admin account already exists with this email.");
    }

    const conflictingDoctor = await User.findOne({ email: seedAdmin.email });
    if (conflictingDoctor) {
      res.status(400);
      throw new Error("This email is already used by a doctor account.");
    }

    const admin = await Admin.create({
      name: seedAdmin.name,
      email: seedAdmin.email,
      password: seedAdmin.password,
    });
    createdAdmin = admin;

    res.status(201).json({
      admin: sanitizeUser(admin),
      message: "Additional admin created successfully.",
    });
    await logAuditEventSafe({
      req,
      actor: actorAdmin,
      action: "admin.create_additional_admin",
      targetType: "admin-account",
      targetId: admin._id,
      outcome: "success",
      metadata: {
        targetEmail: admin.email,
        targetName: admin.name,
      },
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(500);
    }
    await logAuditEventSafe({
      req,
      actor: actorAdmin || req.user,
      action: "admin.create_additional_admin_failed",
      targetType: "admin-account",
      targetId: createdAdmin?._id || "",
      outcome: toAuditOutcomeFromStatus(res.statusCode),
      metadata: {
        attemptedEmail: String(req.body?.email || "").trim().toLowerCase(),
        attemptedName: String(req.body?.name || "").trim(),
        reason: error.message,
      },
    });
    next(error);
  }
};

const getDoctorWorkspace = async (req, res, next) => {
  try {
    res.status(200).json({
      message: "Doctor access granted",
      user: sanitizeUser(req.user),
    });
  } catch (error) {
    next(error);
  }
};

const approveDoctorAccount = async (req, res, next) => {
  let doctor = null;
  try {
    doctor = await User.findById(req.params.id);
    const actor = getActorName(req.user);

    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor not found");
    }

    doctor.approvalStatus = "Approved";
    doctor.accountStatus = "Active";
    doctor.rejectionReason = "";
    doctor.deactivationReason = "";
    doctor.deletionReason = "";
    appendDoctorHistory(doctor, "Doctor approved and account activated", actor, req.user?._id || null);
    await doctor.save();

    let emailStatus = "sent";

    try {
      const result = await sendDoctorApprovedEmail(doctor);
      if (result?.skipped) {
        emailStatus = "skipped";
      }
    } catch (emailError) {
      console.error(`Approval email failed for ${doctor.email}:`, emailError.message);
      emailStatus = "failed";
    }

    res.status(200).json({
      user: sanitizeUser(doctor, { includeDocumentDownloads: true }),
      emailStatus,
      message:
        emailStatus === "sent"
          ? "Doctor approved and email sent"
          : emailStatus === "skipped"
            ? "Doctor approved but email sending is not configured"
            : "Doctor approved but email delivery failed",
    });
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_account.approve",
      targetType: "doctor-account",
      targetId: doctor._id,
      outcome: "success",
      metadata: {
        doctorEmail: doctor.email,
        emailStatus,
      },
    });
  } catch (error) {
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_account.approve_failed",
      targetType: "doctor-account",
      targetId: doctor?._id || req.params.id,
      outcome: toAuditOutcomeFromStatus(res.statusCode || 500),
      metadata: {
        doctorEmail: doctor?.email || "",
        reason: error.message,
      },
    });
    next(error);
  }
};

const rejectDoctorAccount = async (req, res, next) => {
  let doctor = null;
  try {
    doctor = await User.findById(req.params.id);
    const actor = getActorName(req.user);

    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor not found");
    }

    const rejectionReason = String(req.body?.reason || "").trim() || "No rejection reason was provided.";
    doctor.approvalStatus = "Rejected";
    doctor.accountStatus = "Inactive";
    doctor.rejectionReason = rejectionReason;
    doctor.deactivationReason = "";
    appendDoctorHistory(doctor, `Doctor registration rejected: ${rejectionReason}`, actor, req.user?._id || null);

    let emailStatus = "sent";

    try {
      const result = await sendDoctorRejectedEmail(doctor, rejectionReason);
      if (result?.skipped) {
        emailStatus = "skipped";
      }
    } catch (emailError) {
      console.error(`Rejection email failed for ${doctor.email}:`, emailError.message);
      emailStatus = "failed";
    }

    await doctor.save();

    res.status(200).json({
      user: sanitizeUser(doctor, { includeDocumentDownloads: true }),
      emailStatus,
      message:
        emailStatus === "sent"
          ? "Doctor rejected and email sent"
          : emailStatus === "skipped"
            ? "Doctor rejected, but email sending is not configured"
            : "Doctor rejected, but email delivery failed",
    });
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_account.reject",
      targetType: "doctor-account",
      targetId: req.params.id,
      outcome: "success",
      metadata: {
        doctorEmail: doctor.email,
        reason: rejectionReason,
        emailStatus,
      },
    });
  } catch (error) {
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_account.reject_failed",
      targetType: "doctor-account",
      targetId: doctor?._id || req.params.id,
      outcome: toAuditOutcomeFromStatus(res.statusCode || 500),
      metadata: {
        doctorEmail: doctor?.email || "",
        reason: error.message,
      },
    });
    next(error);
  }
};

const deactivateDoctorAccount = async (req, res, next) => {
  let doctor = null;
  try {
    doctor = await User.findById(req.params.id);
    const actor = getActorName(req.user);

    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor not found");
    }

    const deactivationReason = String(req.body?.reason || "").trim() || "No deactivation reason was provided.";

    doctor.accountStatus = "Inactive";
    doctor.deactivationReason = deactivationReason;
    doctor.deletionReason = "";
    appendDoctorHistory(doctor, `Doctor account deactivated: ${deactivationReason}`, actor, req.user?._id || null);
    await doctor.save();

    res.status(200).json({
      user: sanitizeUser(doctor, { includeDocumentDownloads: true }),
      message: "Doctor deactivated successfully",
    });
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_account.deactivate",
      targetType: "doctor-account",
      targetId: doctor._id,
      outcome: "success",
      metadata: {
        doctorEmail: doctor.email,
        reason: deactivationReason,
      },
    });
  } catch (error) {
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_account.deactivate_failed",
      targetType: "doctor-account",
      targetId: doctor?._id || req.params.id,
      outcome: toAuditOutcomeFromStatus(res.statusCode || 500),
      metadata: {
        doctorEmail: doctor?.email || "",
        reason: error.message,
      },
    });
    next(error);
  }
};

const activateDoctorAccount = async (req, res, next) => {
  let doctor = null;
  try {
    doctor = await User.findById(req.params.id);
    const actor = getActorName(req.user);

    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor not found");
    }

    doctor.accountStatus = "Active";
    doctor.deactivationReason = "";
    doctor.deletionReason = "";
    appendDoctorHistory(doctor, "Doctor account activated", actor, req.user?._id || null);
    await doctor.save();

    let emailStatus = "sent";

    try {
      const result = await sendDoctorActivatedEmail(doctor);
      if (result?.skipped) {
        emailStatus = "skipped";
      }
    } catch (emailError) {
      console.error(`Activation email failed for ${doctor.email}:`, emailError.message);
      emailStatus = "failed";
    }

    res.status(200).json({
      user: sanitizeUser(doctor, { includeDocumentDownloads: true }),
      emailStatus,
      message:
        emailStatus === "sent"
          ? "Doctor activated and email sent"
          : emailStatus === "skipped"
            ? "Doctor activated but email sending is not configured"
            : "Doctor activated but email delivery failed",
    });
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_account.activate",
      targetType: "doctor-account",
      targetId: doctor._id,
      outcome: "success",
      metadata: {
        doctorEmail: doctor.email,
        emailStatus,
      },
    });
  } catch (error) {
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_account.activate_failed",
      targetType: "doctor-account",
      targetId: doctor?._id || req.params.id,
      outcome: toAuditOutcomeFromStatus(res.statusCode || 500),
      metadata: {
        doctorEmail: doctor?.email || "",
        reason: error.message,
      },
    });
    next(error);
  }
};

const updateDoctorAccessType = async (req, res, next) => {
  try {
    const doctor = await User.findById(req.params.id);
    const actor = getActorName(req.user);

    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor not found");
    }

    if (doctor.accountStatus === "Deleted") {
      res.status(400);
      throw new Error("Deleted doctor accounts cannot be updated");
    }

    const requestedType = String(req.body?.doctorAccountType || "").trim().toLowerCase();
    if (!["standard", "prediction"].includes(requestedType)) {
      res.status(400);
      throw new Error("Doctor access type must be standard or prediction");
    }

    doctor.doctorAccountType = requestedType;
    appendDoctorHistory(
      doctor,
      requestedType === "prediction"
        ? "Doctor access upgraded to Doctor with prediction"
        : "Doctor access changed to Standard doctor",
      actor,
      req.user?._id || null
    );
    await doctor.save();

    res.status(200).json({
      user: sanitizeUser(doctor, { includeDocumentDownloads: true }),
      message:
        requestedType === "prediction"
          ? "Doctor access updated to Doctor with prediction"
          : "Doctor access updated to Standard doctor",
    });
  } catch (error) {
    next(error);
  }
};

const deleteDoctorAccount = async (req, res, next) => {
  let doctor = null;
  try {
    doctor = await User.findById(req.params.id);
    const actor = getActorName(req.user);

    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor not found");
    }

    const deletionReason = String(req.body?.reason || "").trim() || "No block reason was provided.";

    doctor.accountStatus = "Deleted";
    doctor.deletionReason = deletionReason;
    doctor.deactivationReason = "";
    appendDoctorHistory(doctor, `Doctor account blocked: ${deletionReason}`, actor, req.user?._id || null);
    await doctor.save();

    let emailStatus = "sent";

    try {
      const result = await sendDoctorDeletedEmail(doctor, deletionReason);
      if (result?.skipped) {
        emailStatus = "skipped";
      }
    } catch (emailError) {
      console.error(`Deletion email failed for ${doctor.email}:`, emailError.message);
      emailStatus = "failed";
    }

    res.status(200).json({
      user: sanitizeUser(doctor, { includeDocumentDownloads: true }),
      emailStatus,
      message:
        emailStatus === "sent"
          ? "Doctor account blocked and email sent"
          : emailStatus === "skipped"
            ? "Doctor account blocked but email sending is not configured"
            : "Doctor account blocked but email delivery failed",
    });
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_account.delete",
      targetType: "doctor-account",
      targetId: doctor._id,
      outcome: "success",
      metadata: {
        doctorEmail: doctor.email,
        reason: deletionReason,
        emailStatus,
      },
    });
  } catch (error) {
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "doctor_account.delete_failed",
      targetType: "doctor-account",
      targetId: doctor?._id || req.params.id,
      outcome: toAuditOutcomeFromStatus(res.statusCode || 500),
      metadata: {
        doctorEmail: doctor?.email || "",
        reason: error.message,
      },
    });
    next(error);
  }
};

module.exports = {
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
};
