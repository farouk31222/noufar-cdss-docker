const { logAuditEventSafe } = require("./auditLogService");

const isDoctorUser = (user) => user?.role === "doctor";

const getPredictionChiefDoctorEmails = () => {
  const configured = String(process.env.PREDICTION_CHIEF_DOCTOR_EMAILS || "zakifarouk78@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured);
};

const isPredictionChiefDoctor = (user) =>
  isDoctorUser(user) &&
  getPredictionChiefDoctorEmails().has(String(user?.email || "").trim().toLowerCase());

// Clinical workspace policy:
// Patients remain shared in the clinical registry. Predictions are private per
// Doctor with prediction, except explicitly configured chief doctors.
const getDoctorPatientQuery = (_user, extra = {}) => extra;

const getDoctorPredictionQuery = (user, extra = {}) =>
  isDoctorUser(user) && !isPredictionChiefDoctor(user) ? { ...extra, predictedBy: user._id } : extra;

const getDoctorSupportTicketQuery = (user, extra = {}) =>
  isDoctorUser(user) ? { ...extra, doctor: user._id } : extra;

const idsMatch = (left, right) => String(left || "") === String(right || "");

const getRecordId = (record) => record?._id || record?.id || "";

const isPatientOwnedByDoctor = (patient, user) =>
  !isDoctorUser(user) || Boolean(patient);

const isPredictionOwnedByDoctor = (prediction, user) =>
  !isDoctorUser(user) || isPredictionChiefDoctor(user) || idsMatch(prediction?.predictedBy, user?._id);

const isSupportTicketOwnedByDoctor = (ticket, user) =>
  !isDoctorUser(user) || idsMatch(ticket?.doctor?._id || ticket?.doctor, user?._id);

const createNotFoundError = (message = "Resource not found") => {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
};

const logCrossDoctorDenied = async ({ req, action, targetType, targetId, metadata = {} }) => {
  await logAuditEventSafe({
    req,
    actor: req.user,
    action,
    targetType,
    targetId: String(targetId || ""),
    outcome: "denied",
    metadata: {
      reason: "cross_doctor_access_denied",
      ...metadata,
    },
  });
};

module.exports = {
  isDoctorUser,
  isPredictionChiefDoctor,
  getDoctorPatientQuery,
  getDoctorPredictionQuery,
  getDoctorSupportTicketQuery,
  isPatientOwnedByDoctor,
  isPredictionOwnedByDoctor,
  isSupportTicketOwnedByDoctor,
  getRecordId,
  createNotFoundError,
  logCrossDoctorDenied,
};
