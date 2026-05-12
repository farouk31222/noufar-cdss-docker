const SupportTicket = require("../models/SupportTicket");
const User = require("../models/User");
const { Notification, createNotification } = require("../services/notificationService");
const { emitSupportTicketEvent } = require("../services/realtimeService");
const {
  sendDoctorAccessUpgradeApprovedEmail,
  sendDoctorAccessUpgradeRefusedEmail,
} = require("../services/emailService");
const { storePrivateUpload, sendStoredFileResponse } = require("../services/fileAccessService");
const { logAuditEventSafe } = require("../services/auditLogService");
const { isDoctorUser, logCrossDoctorDenied } = require("../services/doctorOwnershipService");
const VALID_TICKET_STATUSES = new Set(["Open", "In Progress", "Resolved", "Closed"]);
const toSafeStorageSegment = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "doctor";

const getSupportAttachmentFolder = (senderRole = "", senderName = "") =>
  senderRole === "admin"
    ? "support-files-fromAdmin"
    : `support-files-fromDoctor/${toSafeStorageSegment(senderName)}-files`;

const buildSupportAttachment = async (file, senderRole = "doctor", senderName = "") => {
  if (!file) return null;

  const storedFile = await storePrivateUpload({
    file,
    folder: getSupportAttachmentFolder(senderRole, senderName),
  });

  return {
    fileName: storedFile.fileName,
    originalName: file.originalname,
    filePath: storedFile.filePath,
    storageProvider: storedFile.storageProvider,
    bucket: storedFile.bucket,
    objectKey: storedFile.objectKey,
    mimeType: storedFile.mimeType,
    fileSize: storedFile.fileSize,
  };
};

const buildSupportAttachmentDownloadUrl = (ticketId, messageId) =>
  `/api/support/tickets/${encodeURIComponent(String(ticketId))}/attachments/${encodeURIComponent(
    String(messageId)
  )}/download`;

const normalizeSupportMessageText = (value) => String(value || "").trim();

const buildSupportMessagePreview = (message) => {
  const text = normalizeSupportMessageText(message?.body);
  if (text) return text;

  const attachmentName =
    message?.attachment?.originalName ||
    message?.attachment?.fileName ||
    "";

  return attachmentName ? `Shared file: ${attachmentName}` : "No message content";
};

const getTicketVisibilityField = (role) =>
  role === "doctor" ? "deletedByDoctor" : "deletedByAdmin";

const getTicketDeletedAtField = (role) =>
  role === "doctor" ? "deletedByDoctorAt" : "deletedByAdminAt";

const getVisibleSupportTicketQuery = (user) =>
  user.role === "doctor"
    ? { doctor: user._id, deletedByDoctor: { $ne: true } }
    : { deletedByAdmin: { $ne: true } };

const deleteThreadNotificationsForRole = async ({ ticketId, role, userId }) => {
  if (role === "doctor") {
    await Notification.deleteMany({
      targetType: "support-ticket",
      targetId: String(ticketId),
      recipientUser: userId,
    });
    return;
  }

  await Notification.deleteMany({
    targetType: "support-ticket",
    targetId: String(ticketId),
    recipientRole: "admin",
  });
};

const finalizeSupportTicketDeletion = async (ticket) => {
  if (!ticket.deletedByDoctor || !ticket.deletedByAdmin) {
    await ticket.save();
    return false;
  }

  await SupportTicket.deleteOne({ _id: ticket._id });
  await Notification.deleteMany({
    targetType: "support-ticket",
    targetId: String(ticket._id),
  });
  return true;
};

const hideSupportTicketForRole = async (ticket, role, userId) => {
  const visibilityField = getTicketVisibilityField(role);
  const deletedAtField = getTicketDeletedAtField(role);

  ticket[visibilityField] = true;
  ticket[deletedAtField] = new Date();

  await deleteThreadNotificationsForRole({
    ticketId: ticket._id,
    role,
    userId,
  });

  return finalizeSupportTicketDeletion(ticket);
};

const getAccessibleSupportTicket = async (ticketId, user, req = null) => {
  // pour ouvrir un ticket
  const ticketQuery = isDoctorUser(user) ? { _id: ticketId, doctor: user._id } : { _id: ticketId };
  const ticket = await SupportTicket.findOne(ticketQuery).populate("doctor", "name email specialty hospital");

  if (!ticket) {
    if (isDoctorUser(user) && req) {
      const existingTicket = await SupportTicket.findById(ticketId).select("_id doctor").lean();
      if (existingTicket) {
        await logCrossDoctorDenied({
          req,
          action: "support_ticket.access.denied",
          targetType: "support-ticket",
          targetId: existingTicket._id,
        });
      }
    }
    const error = new Error("Support ticket not found");
    error.statusCode = 404;
    throw error;
  }

  return ticket;
};

const buildTicketResponse = (ticket) => {
  const doctor = ticket.doctor && typeof ticket.doctor === "object" ? ticket.doctor : null;
  const isAccessUpgradeTicket = String(ticket.category || "").trim() === "Access upgrade request";

  return {
    id: String(ticket._id),
    doctorId: doctor ? String(doctor._id) : String(ticket.doctor),
    doctorName: doctor?.name || "Doctor account",
    doctorEmail: doctor?.email || "",
    doctorSpecialty: doctor?.specialty || "",
    category: ticket.category,
    priority: ticket.priority,
    subject: ticket.subject,
    status: ticket.status,
    assignedAdmin: ticket.assignedAdmin || "Unassigned",
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastDoctorMessageAt: ticket.lastDoctorMessageAt,
    lastAdminMessageAt: ticket.lastAdminMessageAt,
    unreadByDoctor: ticket.messages.some(
      (message) => message.senderRole === "admin" && !message.readByDoctor
    ),
    unreadByAdmin: ticket.messages.some(
      (message) => message.senderRole === "doctor" && !message.readByAdmin
    ),
    deletedByDoctor: Boolean(ticket.deletedByDoctor),
    deletedByAdmin: Boolean(ticket.deletedByAdmin),
    accessUpgradeRequest: isAccessUpgradeTicket
      ? {
          decision: ticket.accessUpgradeRequest?.decision || "pending",
          reviewedAt: ticket.accessUpgradeRequest?.reviewedAt || null,
          reviewedBy: ticket.accessUpgradeRequest?.reviewedBy || "",
          reviewedReason: ticket.accessUpgradeRequest?.reviewedReason || "",
        }
      : null,
    messages: ticket.messages.map((message) => ({
      id: String(message._id),
      senderId: String(message.senderId),
      senderRole: message.senderRole,
      senderName: message.senderName,
      body: message.body,
      preview: buildSupportMessagePreview(message),
      attachment: message.attachment && (message.attachment.filePath || message.attachment.objectKey)
        ? {
            fileName: message.attachment.fileName,
            originalName: message.attachment.originalName || message.attachment.fileName,
            mimeType: message.attachment.mimeType,
            fileSize: message.attachment.fileSize,
            downloadUrl: buildSupportAttachmentDownloadUrl(ticket._id, message._id),
          }
        : null,
      readByDoctor: message.readByDoctor,
      readByAdmin: message.readByAdmin,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    })),
  };
};

const downloadSupportAttachment = async (req, res, next) => {
  let ticket = null;
  let message = null;
  try {
    ticket = await getAccessibleSupportTicket(req.params.id, req.user, req);
    message = ticket.messages.id(req.params.messageId);

    if (!message?.attachment || (!message.attachment.filePath && !message.attachment.objectKey)) {
      res.status(404);
      throw new Error("Attachment not found");
    }

    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "support_attachment.download",
      targetType: "support-attachment",
      targetId: req.params.messageId,
      outcome: "success",
      metadata: {
        ticketId: ticket._id,
        senderRole: message.senderRole,
        fileName: message.attachment.originalName || message.attachment.fileName || "",
      },
    });

    await sendStoredFileResponse(message.attachment, res);
  } catch (error) {
    if (error.statusCode && res.statusCode === 200) {
      res.status(error.statusCode);
    }
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "support_attachment.download_failed",
      targetType: "support-attachment",
      targetId: req.params.messageId || "",
      outcome: Number(res.statusCode || 500) >= 400 && Number(res.statusCode || 500) < 500 ? "denied" : "failed",
      metadata: {
        ticketId: ticket?._id || req.params.id,
        senderRole: message?.senderRole || "",
        fileName: message?.attachment?.originalName || message?.attachment?.fileName || "",
        reason: error.message,
      },
    });
    next(error);
  }
};

const createTicketMessage = ({ senderId, senderRole, senderName, body, attachment }) => {
  const normalizedBody = normalizeSupportMessageText(body);
  const normalizedAttachment = attachment || null;

  if (!normalizedBody && !normalizedAttachment) {
    const error = new Error("Message text or an attached file is required");
    error.statusCode = 400;
    throw error;
  }

  return {
    senderId,
    senderRole,
    senderName,
    body: normalizedBody,
    attachment: normalizedAttachment,
    readByDoctor: senderRole === "doctor",
    readByAdmin: senderRole === "admin",
  };
};

const createDoctorSupportTicket = async (req, res, next) => {
  try {
    const { category, priority, subject, message } = req.body;
    const doctor = await User.findById(req.user._id);

    if (!doctor || doctor.role !== "doctor") {
      res.status(403);
      throw new Error("Only doctor accounts can create support tickets");
    }

    if (!category || !priority || !subject) {
      res.status(400);
      throw new Error("Category, priority, and subject are required");
    }

    const attachment = await buildSupportAttachment(req.file, "doctor", doctor.name || doctor.email || "doctor");

    if (!normalizeSupportMessageText(message) && !attachment) {
      res.status(400);
      throw new Error("Message text or an attached file is required");
    }

    const ticket = await SupportTicket.create({
      doctor: doctor._id,
      category: String(category).trim(),
      priority: String(priority).trim(),
      subject: String(subject).trim(),
      status: "Open",
      messages: [
        createTicketMessage({
          senderId: doctor._id,
          senderRole: "doctor",
          senderName: doctor.name,
          body: message,
          attachment,
        }),
      ],
      lastDoctorMessageAt: new Date(),
      accessUpgradeRequest:
        String(category).trim() === "Access upgrade request"
          ? {
              decision: "pending",
            }
          : undefined,
    });

    const populated = await SupportTicket.findById(ticket._id).populate(
      "doctor",
      "name email specialty hospital"
    );

    await createNotification({
      recipientRole: "admin",
      actorUser: doctor._id,
      actorName: doctor.name,
      type: "support-request",
      title: populated.subject,
        message: `${doctor.name} sent a new ${priority} support request in ${category}.`,
      targetType: "support-ticket",
      targetId: populated._id,
      targetUrl: `support-center.html?ticket=${populated._id}`,
      metadata: {
        ticketId: String(populated._id),
        doctorId: String(doctor._id),
        doctorName: doctor.name,
        doctorEmail: doctor.email,
        category,
        priority,
        status: populated.status,
      },
    });

    emitSupportTicketEvent({
      ticketId: populated._id,
      doctorId: doctor._id,
      action: "created",
      actorRole: "doctor",
    });

    res.status(201).json({
      message: "Support request sent successfully.",
      ticket: buildTicketResponse(populated),
    });
  } catch (error) {
    next(error);
  }
};

const reviewAccessUpgradeRequest = async (req, res, next) => {
  try {
    const ticket = await getAccessibleSupportTicket(req.params.id, req.user, req);
    const decision = String(req.body?.decision || "").trim().toLowerCase();
    const reason = normalizeSupportMessageText(req.body?.reason);
    const actorName = req.user?.name || req.user?.email || "Admin";

    if (String(ticket.category || "").trim() !== "Access upgrade request") {
      res.status(400);
      throw new Error("This ticket is not an access upgrade request");
    }

    if (!["approve", "refuse"].includes(decision)) {
      res.status(400);
      throw new Error("Decision must be approve or refuse");
    }

    const currentDecision = ticket.accessUpgradeRequest?.decision || "pending";
    if (currentDecision !== "pending") {
      res.status(400);
      throw new Error("This access upgrade request has already been reviewed");
    }

    const doctor = await User.findById(ticket.doctor?._id || ticket.doctor);
    if (!doctor || doctor.role !== "doctor") {
      res.status(404);
      throw new Error("Doctor account not found");
    }

    const approved = decision === "approve";
    if (approved) {
      doctor.doctorAccountType = "prediction";
      await doctor.save();
    }

    ticket.assignedAdmin = actorName;
    ticket.status = "Resolved";
    ticket.accessUpgradeRequest = {
      decision: approved ? "approved" : "refused",
      reviewedAt: new Date(),
      reviewedBy: actorName,
      reviewedReason: reason || "",
    };

    const reviewMessage = approved
      ? reason
        ? `Access upgrade approved. ${reason}`
        : "Access upgrade approved. This doctor account can now access Doctor with prediction workflows."
      : reason
        ? `Access upgrade refused. ${reason}`
        : "Access upgrade refused. The doctor account remains in Standard doctor mode."
      ;

    ticket.messages.push(
      createTicketMessage({
        senderId: req.user._id,
        senderRole: "admin",
        senderName: actorName,
        body: reviewMessage,
        attachment: null,
      })
    );

    ticket.lastAdminMessageAt = new Date();
    ticket.messages.forEach((message) => {
      if (message.senderRole === "doctor") {
        message.readByAdmin = true;
      }
    });

    await ticket.save();

    let emailStatus = "sent";

    try {
      const emailResult = approved
        ? await sendDoctorAccessUpgradeApprovedEmail(doctor, reason)
        : await sendDoctorAccessUpgradeRefusedEmail(doctor, reason);
      if (emailResult?.skipped) {
        emailStatus = "skipped";
      }
    } catch (emailError) {
      console.error(
        `${approved ? "Access-upgrade approval" : "Access-upgrade refusal"} email failed for ${doctor.email}:`,
        emailError.message
      );
      emailStatus = "failed";
    }

    await createNotification({
      recipientUser: doctor._id,
      recipientRole: "doctor",
      actorUser: req.user._id,
      actorName,
      type: approved ? "access-upgrade-approved" : "access-upgrade-refused",
      title: ticket.subject,
      message: approved
        ? "Your request for Doctor with prediction access has been approved."
        : "Your request for Doctor with prediction access has been refused.",
      targetType: "support-ticket",
      targetId: ticket._id,
      targetUrl: `support-ticket:${ticket._id}`,
      metadata: {
        ticketId: String(ticket._id),
        doctorId: String(doctor._id),
        doctorName: doctor.name,
        category: ticket.category,
        decision: ticket.accessUpgradeRequest.decision,
      },
    });

    emitSupportTicketEvent({
      ticketId: ticket._id,
      doctorId: doctor._id,
      action: "access-upgrade-reviewed",
      actorRole: "admin",
    });

    const refreshedTicket = await SupportTicket.findById(ticket._id).populate(
      "doctor",
      "name email specialty hospital"
    );

    res.status(200).json({
      message: approved
        ? emailStatus === "sent"
          ? "Doctor access upgraded and email sent"
          : emailStatus === "skipped"
            ? "Doctor access upgraded but email sending is not configured"
            : "Doctor access upgraded but email delivery failed"
        : emailStatus === "sent"
          ? "Doctor access request refused and email sent"
          : emailStatus === "skipped"
            ? "Doctor access request refused but email sending is not configured"
            : "Doctor access request refused but email delivery failed",
      ticket: buildTicketResponse(refreshedTicket),
      doctor: {
        id: String(doctor._id),
        doctorAccountType: doctor.doctorAccountType,
      },
      emailStatus,
    });
  } catch (error) {
    next(error);
  }
};

const listDoctorSupportTickets = async (req, res, next) => {
  try {
    // pour lister les tickets d’un médecin
    const tickets = await SupportTicket.find(getVisibleSupportTicketQuery(req.user))
      .populate("doctor", "name email specialty hospital")
      .sort({ updatedAt: -1 });

    res.status(200).json(tickets.map((ticket) => buildTicketResponse(ticket)));
  } catch (error) {
    next(error);
  }
};

const markDoctorSupportTicketsRead = async (req, res, next) => {
  try {
    // pour marquer les notifications comme lues
    const tickets = await SupportTicket.find(getVisibleSupportTicketQuery(req.user));

    for (const ticket of tickets) {
      ticket.messages.forEach((message) => {
        if (message.senderRole === "admin" && !message.readByDoctor) {
          message.readByDoctor = true;
        }
      });
      await ticket.save();
    }

    res.status(200).json({ message: "Doctor notifications marked as read" });
  } catch (error) {
    next(error);
  }
};

const listAdminSupportTickets = async (req, res, next) => {
  try {
    // pour lister les tickets d’un admin
    const tickets = await SupportTicket.find(getVisibleSupportTicketQuery(req.user))
      .populate("doctor", "name email specialty hospital")
      .sort({ updatedAt: -1 });

    res.status(200).json(tickets.map((ticket) => buildTicketResponse(ticket)));
  } catch (error) {
    next(error);
  }
};

const updateSupportTicketStatus = async (req, res, next) => {
  try {
    const ticket = await getAccessibleSupportTicket(req.params.id, req.user, req);

    const { status } = req.body;
    if (!status) {
      res.status(400);
      throw new Error("Ticket status is required");
    }

    if (!VALID_TICKET_STATUSES.has(status)) {
      res.status(400);
      throw new Error("Unsupported ticket status");
    }

    ticket.status = status;
    ticket.assignedAdmin = req.user?.name || req.user?.email || "Admin";
    await ticket.save();

    emitSupportTicketEvent({
      ticketId: ticket._id,
      doctorId: ticket.doctor?._id || ticket.doctor,
      action: "status-updated",
      actorRole: req.user.role,
    });

    res.status(200).json({
      message: "Support ticket status updated",
      ticket: buildTicketResponse(ticket),
    });
  } catch (error) {
    next(error);
  }
};

const replyToSupportTicket = async (req, res, next) => {
  try {
    const ticket = await getAccessibleSupportTicket(req.params.id, req.user, req);

    const { body } = req.body;
    const normalizedBody = normalizeSupportMessageText(body);
    const attachment = await buildSupportAttachment(
      req.file,
      req.user?.role || "doctor",
      req.user?.name || req.user?.email || "doctor"
    );

    if (!normalizedBody && !attachment) {
      res.status(400);
      throw new Error("Reply text or an attached file is required");
    }

    const senderRole = req.user.role;
    const senderName = req.user.name || req.user.email || senderRole;

    if (senderRole === "doctor" && ticket.deletedByAdmin) {
      await hideSupportTicketForRole(ticket, "doctor", req.user._id);

      emitSupportTicketEvent({
        ticketId: ticket._id,
        doctorId: ticket.doctor?._id || ticket.doctor,
        action: "thread-deleted",
        actorRole: "admin",
      });

      res.status(410);
      const error = new Error("This thread was deleted by the admin and is no longer available.");
      error.code = "THREAD_DELETED_BY_ADMIN";
      error.removeThread = true;
      throw error;
    }

    if (senderRole === "admin" && ticket.deletedByDoctor) {
      await hideSupportTicketForRole(ticket, "admin", req.user._id);

      emitSupportTicketEvent({
        ticketId: ticket._id,
        doctorId: ticket.doctor?._id || ticket.doctor,
        action: "thread-deleted",
        actorRole: "doctor",
      });

      res.status(410);
      const error = new Error("This thread was deleted by the doctor and is no longer available.");
      error.code = "THREAD_DELETED_BY_DOCTOR";
      error.removeThread = true;
      throw error;
    }

    // pour ajouter un message
    ticket.messages.push(
      createTicketMessage({
        senderId: req.user._id,
        senderRole,
        senderName,
        body: normalizedBody,
        attachment,
      })
    );

    if (senderRole === "admin") {
      ticket.assignedAdmin = senderName;
      ticket.lastAdminMessageAt = new Date();
      ticket.status = ticket.status === "Open" ? "In Progress" : ticket.status;
      ticket.messages.forEach((message) => {
        if (message.senderRole === "doctor") {
          message.readByAdmin = true;
        }
      });
    } else {
      ticket.lastDoctorMessageAt = new Date();
      ticket.messages.forEach((message) => {
        if (message.senderRole === "admin") {
          message.readByDoctor = true;
        }
      });
    }

    await ticket.save();

    if (senderRole === "admin") {
      await createNotification({
        recipientUser: ticket.doctor?._id || ticket.doctor,
        recipientRole: "doctor",
        actorUser: req.user._id,
        actorName: senderName,
        type: "support-reply",
        title: ticket.subject,
        message: `${senderName} replied to your support request.`,
        targetType: "support-ticket",
        targetId: ticket._id,
        targetUrl: `support-ticket:${ticket._id}`,
        metadata: {
          ticketId: String(ticket._id),
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status,
        },
      });
    } else {
      await createNotification({
        recipientRole: "admin",
        actorUser: req.user._id,
        actorName: senderName,
        type: "support-follow-up",
        title: ticket.subject,
        message: `${senderName} added a new message to a support conversation.`,
        targetType: "support-ticket",
        targetId: ticket._id,
        targetUrl: `support-center.html?ticket=${ticket._id}`,
        metadata: {
          ticketId: String(ticket._id),
          doctorId: String(ticket.doctor?._id || ticket.doctor),
          doctorName: ticket.doctor?.name || senderName,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status,
        },
      });
    }

    emitSupportTicketEvent({
      ticketId: ticket._id,
      doctorId: ticket.doctor?._id || ticket.doctor,
      action: "message-added",
      actorRole: senderRole,
    });

    res.status(200).json({
      message: "Support reply sent",
      ticket: buildTicketResponse(ticket),
    });
  } catch (error) {
    next(error);
  }
};

const markAdminSupportTicketsRead = async (req, res, next) => {
  try {
    const tickets = await SupportTicket.find(getVisibleSupportTicketQuery(req.user));

    for (const ticket of tickets) {
      ticket.messages.forEach((message) => {
        if (message.senderRole === "doctor" && !message.readByAdmin) {
          message.readByAdmin = true;
        }
      });
      await ticket.save();
    }

    res.status(200).json({ message: "Admin notifications marked as read" });
  } catch (error) {
    next(error);
  }
};

const deleteSupportTicketMessage = async (req, res, next) => {
  try {
    const ticket = await getAccessibleSupportTicket(req.params.id, req.user, req);
    const message = ticket.messages.id(req.params.messageId);

    if (!message) {
      res.status(404);
      throw new Error("Support message not found");
    }

    message.deleteOne();
    await ticket.save();

    res.status(200).json({
      message: "Support message deleted",
      ticket: buildTicketResponse(ticket),
    });
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode);
    }
    next(error);
  }
};

const deleteSupportTicketMessages = async (req, res, next) => {
  try {
    const ticket = await getAccessibleSupportTicket(req.params.id, req.user, req);
    const { messageIds = [], deleteAll = false } = req.body || {};

    if (!deleteAll && (!Array.isArray(messageIds) || !messageIds.length)) {
      res.status(400);
      throw new Error("Select at least one message to delete");
    }

    if (deleteAll) {
      ticket.messages = [];
    } else {
      const targetIds = new Set(messageIds.map((value) => String(value)));
      ticket.messages = ticket.messages.filter((message) => !targetIds.has(String(message._id)));
    }

    await ticket.save();

    res.status(200).json({
      message: deleteAll ? "All support messages deleted" : "Selected support messages deleted",
      ticket: buildTicketResponse(ticket),
    });
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode);
    }
    next(error);
  }
};

const deleteSupportTicket = async (req, res, next) => {
  try {
    const ticket = await getAccessibleSupportTicket(req.params.id, req.user, req);
    const deletedForRole = req.user.role;

    await hideSupportTicketForRole(ticket, deletedForRole, req.user._id);

    emitSupportTicketEvent({
      ticketId: ticket._id,
      doctorId: ticket.doctor?._id || ticket.doctor,
      action: "thread-deleted",
      actorRole: deletedForRole,
    });

    res.status(200).json({
      message:
        deletedForRole === "doctor"
          ? "Support thread deleted from the doctor inbox"
          : "Support thread deleted from the admin inbox",
    });
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode);
    }
    next(error);
  }
};

const deleteSupportTickets = async (req, res, next) => {
  try {
    const { ticketIds = [], deleteAll = false } = req.body || {};

    if (!deleteAll && (!Array.isArray(ticketIds) || !ticketIds.length)) {
      res.status(400);
      throw new Error("Select at least one support thread to delete");
    }

    const baseQuery = req.user.role === "doctor" ? { doctor: req.user._id } : {};

    const idsToDelete = deleteAll ? null : ticketIds.map((value) => String(value));
    const query = deleteAll
      ? baseQuery
      : {
          ...baseQuery,
          _id: { $in: idsToDelete },
        };

    
    const tickets = await SupportTicket.find(query).select("_id doctor");
    const targetIds = tickets.map((ticket) => String(ticket._id));

    if (!targetIds.length) {
      res.status(404);
      throw new Error("No support threads found for deletion");
    }

    for (const ticket of tickets) {
      await hideSupportTicketForRole(ticket, req.user.role, req.user._id);

      emitSupportTicketEvent({
        ticketId: ticket._id,
        doctorId: ticket.doctor,
        action: "thread-deleted",
        actorRole: req.user.role,
      });
    }

    res.status(200).json({
      message:
        req.user.role === "doctor"
          ? deleteAll
            ? "All support threads deleted from the doctor inbox"
            : "Selected support threads deleted from the doctor inbox"
          : deleteAll
            ? "All support threads deleted from the admin inbox"
            : "Selected support threads deleted from the admin inbox",
      deletedIds: targetIds,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDoctorSupportTicket,
  listDoctorSupportTickets,
  markDoctorSupportTicketsRead,
  listAdminSupportTickets,
  reviewAccessUpgradeRequest,
  updateSupportTicketStatus,
  replyToSupportTicket,
  markAdminSupportTicketsRead,
  deleteSupportTicketMessage,
  deleteSupportTicketMessages,
  deleteSupportTicket,
  deleteSupportTickets,
  downloadSupportAttachment,
};
