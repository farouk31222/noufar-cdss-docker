const AuditLog = require("../models/AuditLog");
const { logAuditEventSafe, serializeAuditLog } = require("../services/auditLogService");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toPositiveInt = (value, fallback, { min = 1, max = 100 } = {}) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildSecurityEventFilters = (query = {}) => {
  const actorRole = String(query.actorRole || "").trim();
  const action = String(query.action || "").trim();
  const outcome = String(query.outcome || "").trim();
  const targetType = String(query.targetType || "").trim();
  const search = String(query.search || "").trim();
  const dateFrom = toDateOrNull(query.dateFrom);
  const dateTo = toDateOrNull(query.dateTo);

  const filter = {};

  if (actorRole) filter.actorRole = actorRole;
  if (action) filter.action = action;
  if (outcome) filter.outcome = outcome;
  if (targetType) filter.targetType = targetType;

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = dateFrom;
    if (dateTo) {
      const inclusiveUpperBound = new Date(dateTo);
      inclusiveUpperBound.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = inclusiveUpperBound;
    }
  }

  if (search) {
    const regex = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [
      { actorName: regex },
      { actorEmail: regex },
      { action: regex },
      { targetType: regex },
      { targetId: regex },
    ];
  }

  return {
    filter,
    appliedFilters: {
      actorRole,
      action,
      outcome,
      targetType,
      search,
      dateFrom: dateFrom ? dateFrom.toISOString() : "",
      dateTo: dateTo ? dateTo.toISOString() : "",
    },
  };
};

const buildCsvValue = (value) => {
  const normalized = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
};

const buildSecurityEventsCsv = (entries = []) => {
  const headers = [
    "Timestamp",
    "Action",
    "Outcome",
    "Actor Role",
    "Actor Name",
    "Actor Email",
    "Target Type",
    "Target ID",
    "IP Address",
    "Session ID",
    "Metadata",
  ];

  const lines = [
    headers.map(buildCsvValue).join(","),
    ...entries.map((entry) =>
      [
        entry.createdAt ? new Date(entry.createdAt).toISOString() : "",
        entry.action,
        entry.outcome,
        entry.actorRole,
        entry.actorName,
        entry.actorEmail,
        entry.targetType,
        entry.targetId,
        entry.ipAddress,
        entry.sessionId,
        entry.metadata,
      ]
        .map(buildCsvValue)
        .join(",")
    ),
  ];

  return lines.join("\n");
};

const listSecurityEvents = async (req, res, next) => {
  try {
    const page = toPositiveInt(req.query?.page, 1, { min: 1, max: 100000 });
    const pageSize = toPositiveInt(req.query?.pageSize, 20, { min: 1, max: 100 });
    const { filter, appliedFilters } = buildSecurityEventFilters(req.query);

    const totalItems = await AuditLog.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const items = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .lean();

    res.status(200).json({
      filters: appliedFilters,
      pagination: {
        page: currentPage,
        pageSize,
        totalItems,
        totalPages,
      },
      items: items.map((entry) => serializeAuditLog(entry)),
    });
  } catch (error) {
    next(error);
  }
};

const exportSecurityEvents = async (req, res, next) => {
  try {
    const exportLimit = toPositiveInt(req.query?.limit, 1000, { min: 1, max: 5000 });
    const { filter, appliedFilters } = buildSecurityEventFilters(req.query);

    const items = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(exportLimit).lean();
    const serializedItems = items.map((entry) => serializeAuditLog(entry));
    const csv = buildSecurityEventsCsv(serializedItems);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "security_events.export",
      targetType: "audit-log-report",
      targetId: "",
      outcome: "success",
      metadata: {
        filters: appliedFilters,
        exportedRows: serializedItems.length,
        exportLimit,
        format: "csv",
      },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="security-events-${timestamp}.csv"`
    );
    res.status(200).send(csv);
  } catch (error) {
    await logAuditEventSafe({
      req,
      actor: req.user,
      action: "security_events.export_failed",
      targetType: "audit-log-report",
      targetId: "",
      outcome: Number(res.statusCode || 500) >= 400 && Number(res.statusCode || 500) < 500 ? "denied" : "failed",
      metadata: {
        reason: error.message,
      },
    });
    next(error);
  }
};

module.exports = {
  listSecurityEvents,
  exportSecurityEvents,
};
