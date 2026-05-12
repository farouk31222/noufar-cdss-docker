const { logAuditEventSafe } = require("./auditLogService");

const isDoctorUser = (user) => user?.role === "doctor";

const getDoctorPatientQuery = (user, extra = {}) =>
  isDoctorUser(user) ? { ...extra, doctorId: user._id } : extra;

const getDoctorPredictionQuery = (user, extra = {}) =>
  isDoctorUser(user) ? { ...extra, predictedBy: user._id } : extra;

const getDoctorSupportTicketQuery = (user, extra = {}) =>
  isDoctorUser(user) ? { ...extra, doctor: user._id } : extra;

const idsMatch = (left, right) => String(left || "") === String(right || "");

const getRecordId = (record) => record?._id || record?.id || "";

const isPatientOwnedByDoctor = (patient, user) =>
  !isDoctorUser(user) || idsMatch(patient?.doctorId, user?._id);

const isPredictionOwnedByDoctor = (prediction, user) =>
  !isDoctorUser(user) || idsMatch(prediction?.predictedBy, user?._id);

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
