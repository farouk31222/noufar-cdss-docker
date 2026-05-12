const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { PASSWORD_MIN_LENGTH } = require("../services/passwordPolicyService");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: PASSWORD_MIN_LENGTH,
    },
    passwordResetToken: {
      type: String,
      default: "",
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    failedLoginCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    failedTwoStepCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastFailedAuthAt: {
      type: Date,
      default: null,
    },
    lastFailedTwoStepAt: {
      type: Date,
      default: null,
    },
    twoStepCodeToken: {
      type: String,
      default: "",
    },
    twoStepCodeExpires: {
      type: Date,
      default: null,
    },
    twoStepChallengeToken: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["doctor", "admin"],
      default: "doctor",
    },
    doctorAccountType: {
      type: String,
      enum: ["standard", "prediction"],
      default: "prediction",
    },
    specialty: {
      type: String,
      trim: true,
      default: "",
    },
    hospital: {
      type: String,
      trim: true,
      default: "",
    },
    profilePhoto: {
      type: String,
      default: "",
    },
    twoStepEnabled: {
      type: Boolean,
      default: true,
    },
    sessionTimeout: {
      type: String,
      enum: ["10 seconds", "30 minutes", "1 hour", "4 hours", "Never", "15 minutes", "60 minutes"],
      default: "30 minutes",
    },
    termsAccepted: {
      type: Boolean,
      default: false,
    },
    submittedDocuments: [
      {
        label: {
          type: String,
          required: true,
          trim: true,
        },
        fileName: {
          type: String,
          required: true,
          trim: true,
        },
        filePath: {
          type: String,
          default: "",
          trim: true,
        },
        storageProvider: {
          type: String,
          enum: ["local", "minio"],
          default: "local",
        },
        bucket: {
          type: String,
          default: "",
          trim: true,
        },
        objectKey: {
          type: String,
          default: "",
          trim: true,
        },
        mimeType: {
          type: String,
          default: "",
          trim: true,
        },
        fileSize: {
          type: Number,
          default: 0,
        },
        verified: {
          type: Boolean,
          default: false,
        },
      },
    ],
    approvalStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    accountStatus: {
      type: String,
      enum: ["Active", "Inactive", "Deleted"],
      default: "Inactive",
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },
    deactivationReason: {
      type: String,
      trim: true,
      default: "",
    },
    deletionReason: {
      type: String,
      trim: true,
      default: "",
    },
    assignedAdmin: {
      type: String,
      trim: true,
      default: "Unassigned",
    },
    assignedAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
      index: true,
    },
    statusHistory: [
      {
        date: {
          type: Date,
          default: Date.now,
        },
        label: {
          type: String,
          required: true,
          trim: true,
        },
        by: {
          type: String,
          default: "System",
          trim: true,
        },
      },
    ],
  },
  {
    timestamps: true,
    collection: "doctors",
  }
);

userSchema.pre("save", async function savePassword() {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function matchPassword(enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
