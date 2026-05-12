const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { PASSWORD_MIN_LENGTH } = require("../services/passwordPolicyService");

const adminSchema = new mongoose.Schema(
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
    role: {
      type: String,
      enum: ["admin"],
      default: "admin",
    },
    profilePhoto: {
      type: String,
      default: "",
    },
    twoStepEnabled: {
      type: Boolean,
      default: false,
    },
    sessionTimeout: {
      type: String,
      enum: ["10 seconds", "30 minutes", "1 hour", "4 hours", "Never", "15 minutes", "60 minutes"],
      default: "Never",
    },
  },
  { timestamps: true }
);

adminSchema.pre("save", async function savePassword() {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

adminSchema.methods.matchPassword = async function matchPassword(enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Admin", adminSchema);
