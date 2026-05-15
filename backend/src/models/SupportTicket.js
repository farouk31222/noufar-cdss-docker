const mongoose = require("mongoose");

const supportMessageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    senderRole: {
      type: String,
      enum: ["doctor", "admin"],
      required: true,
    },
    senderName: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      trim: true,
      default: "",
    },
    attachment: {
      fileName: {
        type: String,
        trim: true,
        default: "",
      },
      originalName: {
        type: String,
        trim: true,
        default: "",
      },
      filePath: {
        type: String,
        trim: true,
        default: "",
      },
      storageProvider: {
        type: String,
        enum: ["local", "minio"],
        default: "local",
      },
      bucket: {
        type: String,
        trim: true,
        default: "",
      },
      objectKey: {
        type: String,
        trim: true,
        default: "",
      },
      mimeType: {
        type: String,
        trim: true,
        default: "",
      },
      fileSize: {
        type: Number,
        default: 0,
      },
    },
    readByDoctor: {
      type: Boolean,
      default: false,
    },
    readByAdmin: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    contactRequest: {
      name: {
        type: String,
        trim: true,
        default: "",
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        default: "",
      },
      institution: {
        type: String,
        trim: true,
        default: "",
      },
      phone: {
        type: String,
        trim: true,
        default: "",
      },
      source: {
        type: String,
        trim: true,
        default: "",
      },
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    priority: {
      type: String,
      enum: ["Routine", "High", "Urgent"],
      default: "Routine",
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Open", "In Progress", "Resolved", "Closed"],
      default: "Open",
    },
    assignedAdmin: {
      type: String,
      trim: true,
      default: "Unassigned",
    },
    messages: {
      type: [supportMessageSchema],
      default: [],
    },
    lastDoctorMessageAt: {
      type: Date,
      default: Date.now,
    },
    lastAdminMessageAt: {
      type: Date,
      default: null,
    },
    deletedByDoctor: {
      type: Boolean,
      default: false,
    },
    deletedByDoctorAt: {
      type: Date,
      default: null,
    },
    deletedByAdmin: {
      type: Boolean,
      default: false,
    },
    deletedByAdminAt: {
      type: Date,
      default: null,
    },
    accessUpgradeRequest: {
      decision: {
        type: String,
        enum: ["pending", "approved", "refused"],
        default: "pending",
      },
      reviewedAt: {
        type: Date,
        default: null,
      },
      reviewedBy: {
        type: String,
        trim: true,
        default: "",
      },
      reviewedReason: {
        type: String,
        trim: true,
        default: "",
      },
    },
    unlockAccountRequest: {
      decision: {
        type: String,
        enum: ["pending", "approved", "refused"],
        default: "pending",
      },
      reviewedAt: {
        type: Date,
        default: null,
      },
      reviewedBy: {
        type: String,
        trim: true,
        default: "",
      },
      reviewedReason: {
        type: String,
        trim: true,
        default: "",
      },
    },
  },
  { timestamps: true }
);

supportTicketSchema.index({ doctor: 1, updatedAt: -1 });

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
