const clients = new Map();
let nextClientId = 1;

const writeEvent = (res, event, payload) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const registerRealtimeClient = ({ user, res }) => {
  const clientId = `client-${nextClientId++}`;
  const heartbeat = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 20000);

  clients.set(clientId, {
    id: clientId,
    userId: String(user._id),
    role: user.role,
    res,
    heartbeat,
  });

  writeEvent(res, "realtime:connected", {
    ok: true,
    userId: String(user._id),
    role: user.role,
    connectedAt: new Date().toISOString(),
  });

  return () => {
    const client = clients.get(clientId);
    if (!client) return;
    clearInterval(client.heartbeat);
    clients.delete(clientId);
  };
};

const emitRealtimeEvent = ({ userId = null, role = null, event, payload = {} }) => {
  clients.forEach((client) => {
    const matchesUser = userId ? client.userId === String(userId) : true;
    const matchesRole = role ? client.role === role : true;
    if (!matchesUser || !matchesRole) return;
    writeEvent(client.res, event, payload);
  });
};

const emitNotificationEvent = ({ notification }) => {
  if (!notification) return;

  if (notification.recipientRole === "admin") {
    emitRealtimeEvent({
      role: "admin",
      event: "notification:new",
      payload: {
        type: notification.type,
        targetType: notification.targetType,
        targetId: notification.targetId,
      },
    });
    return;
  }

  if (notification.recipientUser) {
    emitRealtimeEvent({
      role: "doctor",
      userId: notification.recipientUser,
      event: "notification:new",
      payload: {
        type: notification.type,
        targetType: notification.targetType,
        targetId: notification.targetId,
      },
    });
  }
};

const emitSupportTicketEvent = ({ ticketId, doctorId, action, actorRole }) => {
  const payload = {
    ticketId: String(ticketId),
    doctorId: String(doctorId),
    action,
    actorRole,
    updatedAt: new Date().toISOString(),
  };

  emitRealtimeEvent({
    role: "admin",
    event: "support:ticket-updated",
    payload,
  });

  emitRealtimeEvent({
    role: "doctor",
    userId: doctorId,
    event: "support:ticket-updated",
    payload,
  });
};

const emitDoctorRegistrationEvent = ({ doctorId }) => {
  emitRealtimeEvent({
    role: "admin",
    event: "doctor:registration",
    payload: {
      doctorId: String(doctorId),
      createdAt: new Date().toISOString(),
    },
  });
};

module.exports = {
  registerRealtimeClient,
  emitNotificationEvent,
  emitSupportTicketEvent,
  emitDoctorRegistrationEvent,
};
