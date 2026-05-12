const nodemailer = require("nodemailer");

let transporterPromise = null;

const getMailerConfig = () => {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
  } = process.env;

  const isConfigured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);

  return {
    isConfigured,
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: String(SMTP_SECURE).toLowerCase() === "true",
    user: SMTP_USER,
    pass: SMTP_PASS,
    from: SMTP_FROM,
  };
};

const getTransporter = async () => {
  if (transporterPromise) return transporterPromise;

  const config = getMailerConfig();
  if (!config.isConfigured) {
    throw new Error("SMTP settings are incomplete");
  }

  transporterPromise = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return transporterPromise;
};

const buildDoctorApprovedEmail = (doctorName) => {
  const safeName = doctorName?.trim() || "Doctor";

  const text = `Dear Doctor,

We are pleased to inform you that your account has been successfully approved.

Your account is now active, and you can log in to the platform and start using all available features.

If you have any questions or need assistance, feel free to contact our support team.

Welcome aboard, and we're glad to have you with us.

Best regards,
NOUFAR CDSS`;

  const html = `
    <div style="margin:0;padding:32px;background:#f4f7fb;font-family:Arial,sans-serif;color:#1b2b4a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbe4f0;">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#0d4f90,#2f86e6);color:#ffffff;">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;">NOUFAR CDSS</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">Account Approved</h1>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Dear ${safeName},</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">We are pleased to inform you that your account has been successfully approved.</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Your account is now active, and you can log in to the platform and start using all available features.</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">If you have any questions or need assistance, feel free to contact our support team.</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.7;">Welcome aboard, and we're glad to have you with us.</p>
          <p style="margin:0;font-size:16px;line-height:1.7;">Best regards,<br /><strong>NOUFAR CDSS</strong></p>
        </div>
      </div>
    </div>
  `;

  return {
    subject: "Your NOUFAR CDSS account is now active",
    text,
    html,
  };
};

const sendDoctorApprovedEmail = async (doctor) => {
  const config = getMailerConfig();

  if (!config.isConfigured) {
    console.warn(`Approval email skipped for ${doctor.email}: SMTP settings are incomplete.`);
    return { skipped: true };
  }

  const transporter = await getTransporter();
  const email = buildDoctorApprovedEmail(doctor.name);

  await transporter.sendMail({
    from: config.from,
    to: doctor.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return { skipped: false };
};

const buildDoctorActivatedEmail = (doctorName) => {
  const safeName = doctorName?.trim() || "Doctor";

  const text = `Dear Doctor,

We are pleased to inform you that your account has been successfully activated.

You can now log in and access the platform.

If you need any assistance, please feel free to contact our support team.

Welcome, and we wish you a great experience using our service.

Best regards,
NOUFAR CDSS`;

  const html = `
    <div style="margin:0;padding:32px;background:#f4f7fb;font-family:Arial,sans-serif;color:#1b2b4a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbe4f0;">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#169164,#3bc486);color:#ffffff;">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;">NOUFAR CDSS</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">Account Activated</h1>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Dear ${safeName},</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">We are pleased to inform you that your account has been successfully activated.</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">You can now log in and access the platform.</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">If you need any assistance, please feel free to contact our support team.</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.7;">Welcome, and we wish you a great experience using our service.</p>
          <p style="margin:0;font-size:16px;line-height:1.7;">Best regards,<br /><strong>NOUFAR CDSS</strong></p>
        </div>
      </div>
    </div>
  `;

  return {
    subject: "Your NOUFAR CDSS account has been activated",
    text,
    html,
  };
};

const sendDoctorActivatedEmail = async (doctor) => {
  const config = getMailerConfig();

  if (!config.isConfigured) {
    console.warn(`Activation email skipped for ${doctor.email}: SMTP settings are incomplete.`);
    return { skipped: true };
  }

  const transporter = await getTransporter();
  const email = buildDoctorActivatedEmail(doctor.name);

  await transporter.sendMail({
    from: config.from,
    to: doctor.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return { skipped: false };
};

const buildTwoStepVerificationEmail = (doctorName, verificationCode) => {
  const safeName = doctorName?.trim() || "Doctor";
  const safeCode = String(verificationCode || "").trim();

  const text = `Dear ${safeName},

Use the verification code below to complete your secure sign-in to NOUFAR CDSS:

${safeCode}

This code will expire in 10 minutes.

If you did not attempt to sign in, please contact our support team at noufar.cdss@gmail.com.

Best regards,
NOUFAR CDSS`;

  const html = `
    <div style="margin:0;padding:32px;background:#f4f7fb;font-family:Arial,sans-serif;color:#1b2b4a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbe4f0;">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#0d4f90,#2f86e6);color:#ffffff;">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;">NOUFAR CDSS</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">2-Step Verification</h1>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Dear ${safeName},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;">Use the verification code below to complete your secure sign-in to NOUFAR CDSS:</p>
          <div style="margin:0 0 20px;padding:18px 20px;border-radius:18px;background:#f3f8ff;border:1px solid #d7e4f7;text-align:center;">
            <div style="font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#56759b;margin-bottom:8px;">Verification code</div>
            <div style="font-size:34px;line-height:1;font-weight:800;letter-spacing:.22em;color:#143d73;">${safeCode}</div>
          </div>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#5b7494;">This code will expire in 10 minutes.</p>
          <p style="margin:0;font-size:15px;line-height:1.7;">If you did not attempt to sign in, please contact our support team at <a href="mailto:noufar.cdss@gmail.com" style="color:#1d5fb6;font-weight:700;text-decoration:none;">noufar.cdss@gmail.com</a>.</p>
          <p style="margin:24px 0 0;font-size:16px;line-height:1.7;">Best regards,<br /><strong>NOUFAR CDSS</strong></p>
        </div>
      </div>
    </div>
  `;

  return {
    subject: "Your NOUFAR CDSS verification code",
    text,
    html,
  };
};

const sendTwoStepVerificationEmail = async (doctor, verificationCode) => {
  const config = getMailerConfig();

  if (!config.isConfigured) {
    console.warn(`2-step verification email skipped for ${doctor.email}: SMTP settings are incomplete.`);
    return { skipped: true };
  }

  const transporter = await getTransporter();
  const email = buildTwoStepVerificationEmail(doctor.name, verificationCode);

  await transporter.sendMail({
    from: config.from,
    to: doctor.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return { skipped: false };
};

const buildDoctorDeletedEmail = (doctorName, deletionReason) => {
  const safeName = doctorName?.trim() || "Doctor";
  const safeReason = deletionReason?.trim() || "No deletion reason was provided.";

  const text = `Dear Doctor,

We regret to inform you that your account has been deleted from the platform.

Reason:
${safeReason}

If you need more information, please contact our support team at noufar.cdss@gmail.com.

Best regards,
NOUFAR CDSS`;

  const html = `
    <div style="margin:0;padding:32px;background:#f4f7fb;font-family:Arial,sans-serif;color:#1b2b4a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbe4f0;">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#b6283d,#df5968);color:#ffffff;">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;">NOUFAR CDSS</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">Account Deleted</h1>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Dear ${safeName},</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">We regret to inform you that your account has been deleted from the platform.</p>
          <div style="margin:0 0 16px;padding:16px 18px;border-radius:16px;background:#fff3f5;border:1px solid #f2c7cf;">
            <div style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b53d52;">Reason</div>
            <div style="font-size:16px;line-height:1.7;color:#6d2231;">${safeReason}</div>
          </div>
          <p style="margin:0;font-size:16px;line-height:1.7;">If you need more information, please contact our support team at <a href="mailto:noufar.cdss@gmail.com" style="color:#c0354f;font-weight:700;text-decoration:none;">noufar.cdss@gmail.com</a>.</p>
          <p style="margin:24px 0 0;font-size:16px;line-height:1.7;">Best regards,<br /><strong>NOUFAR CDSS</strong></p>
        </div>
      </div>
    </div>
  `;

  return {
    subject: "Your NOUFAR CDSS account has been deleted",
    text,
    html,
  };
};

const sendDoctorDeletedEmail = async (doctor, deletionReason) => {
  const config = getMailerConfig();

  if (!config.isConfigured) {
    console.warn(`Deletion email skipped for ${doctor.email}: SMTP settings are incomplete.`);
    return { skipped: true };
  }

  const transporter = await getTransporter();
  const email = buildDoctorDeletedEmail(doctor.name, deletionReason);

  await transporter.sendMail({
    from: config.from,
    to: doctor.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return { skipped: false };
};

const buildDoctorRejectedEmail = (doctorName, rejectionReason) => {
  const safeName = doctorName?.trim() || "Doctor";
  const safeReason = rejectionReason?.trim() || "No additional reason was provided.";

  const text = `Dear Doctor,

We regret to inform you that your account request has not been approved at this time.

Reason for rejection:
${safeReason}

If you believe this was an error or need more information, please contact our support team at noufar.cdss@gmail.com.

Best regards,
NOUFAR CDSS`;

  const html = `
    <div style="margin:0;padding:32px;background:#f4f7fb;font-family:Arial,sans-serif;color:#1b2b4a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbe4f0;">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#8f2f2f,#d86b47);color:#ffffff;">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;">NOUFAR CDSS</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">Account Rejected</h1>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Dear ${safeName},</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">We regret to inform you that your account request has not been approved at this time.</p>
          <div style="margin:0 0 16px;padding:16px 18px;border-radius:16px;background:#fff6f3;border:1px solid #f0d2c8;">
            <div style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a35536;">Reason for rejection</div>
            <div style="font-size:16px;line-height:1.7;color:#5a2f1f;">${safeReason}</div>
          </div>
          <p style="margin:0;font-size:16px;line-height:1.7;">If you believe this was an error or need more information, please contact our support team at <a href="mailto:noufar.cdss@gmail.com" style="color:#b05833;font-weight:700;text-decoration:none;">noufar.cdss@gmail.com</a>.</p>
          <p style="margin:24px 0 0;font-size:16px;line-height:1.7;">Best regards,<br /><strong>NOUFAR CDSS</strong></p>
        </div>
      </div>
    </div>
  `;

  return {
    subject: "Update on your NOUFAR CDSS account request",
    text,
    html,
  };
};

const sendDoctorRejectedEmail = async (doctor, rejectionReason) => {
  const config = getMailerConfig();

  if (!config.isConfigured) {
    console.warn(`Rejection email skipped for ${doctor.email}: SMTP settings are incomplete.`);
    return { skipped: true };
  }

  const transporter = await getTransporter();
  const email = buildDoctorRejectedEmail(doctor.name, rejectionReason);

  await transporter.sendMail({
    from: config.from,
    to: doctor.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return { skipped: false };
};

const buildDoctorAccessUpgradeApprovedEmail = (doctorName, note) => {
  const safeName = doctorName?.trim() || "Doctor";
  const safeNote = String(note || "").trim();

  const text = `Dear ${safeName},

Your request to upgrade your account to Doctor with prediction has been approved.

You can now access prediction workflows in addition to managing patient clinical entries.

${safeNote ? `Admin note:\n${safeNote}\n\n` : ""}If you need help, please contact noufar.cdss@gmail.com.

Best regards,
NOUFAR CDSS`;

  const html = `
    <div style="margin:0;padding:32px;background:#f4f7fb;font-family:Arial,sans-serif;color:#1b2b4a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbe4f0;">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#0d4f90,#2f86e6);color:#ffffff;">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;">NOUFAR CDSS</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">Prediction Access Approved</h1>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Dear ${safeName},</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Your request to upgrade your account to <strong>Doctor with prediction</strong> has been approved.</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">You can now access prediction workflows in addition to managing patient clinical entries.</p>
          ${
            safeNote
              ? `<div style="margin:0 0 16px;padding:16px 18px;border-radius:16px;background:#f4f8ff;border:1px solid #d8e3f7;">
                   <div style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#496b98;">Admin note</div>
                   <div style="font-size:16px;line-height:1.7;color:#29456f;">${safeNote}</div>
                 </div>`
              : ""
          }
          <p style="margin:0;font-size:16px;line-height:1.7;">If you need assistance, please contact <a href="mailto:noufar.cdss@gmail.com" style="color:#1d5fb6;font-weight:700;text-decoration:none;">noufar.cdss@gmail.com</a>.</p>
          <p style="margin:24px 0 0;font-size:16px;line-height:1.7;">Best regards,<br /><strong>NOUFAR CDSS</strong></p>
        </div>
      </div>
    </div>
  `;

  return {
    subject: "Your NOUFAR CDSS prediction access has been approved",
    text,
    html,
  };
};

const sendDoctorAccessUpgradeApprovedEmail = async (doctor, note = "") => {
  const config = getMailerConfig();

  if (!config.isConfigured) {
    console.warn(`Access-upgrade approval email skipped for ${doctor.email}: SMTP settings are incomplete.`);
    return { skipped: true };
  }

  const transporter = await getTransporter();
  const email = buildDoctorAccessUpgradeApprovedEmail(doctor.name, note);

  await transporter.sendMail({
    from: config.from,
    to: doctor.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return { skipped: false };
};

const buildDoctorAccessUpgradeRefusedEmail = (doctorName, reason) => {
  const safeName = doctorName?.trim() || "Doctor";
  const safeReason = String(reason || "").trim() || "No additional reason was provided.";

  const text = `Dear ${safeName},

We regret to inform you that your request to upgrade your account to Doctor with prediction has been refused.

Reason:
${safeReason}

If you need more information, please contact noufar.cdss@gmail.com.

Best regards,
NOUFAR CDSS`;

  const html = `
    <div style="margin:0;padding:32px;background:#f4f7fb;font-family:Arial,sans-serif;color:#1b2b4a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dbe4f0;">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#8f2f2f,#d86b47);color:#ffffff;">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;">NOUFAR CDSS</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;">Prediction Access Refused</h1>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Dear ${safeName},</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">We regret to inform you that your request to upgrade your account to <strong>Doctor with prediction</strong> has been refused.</p>
          <div style="margin:0 0 16px;padding:16px 18px;border-radius:16px;background:#fff6f3;border:1px solid #f0d2c8;">
            <div style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a35536;">Reason</div>
            <div style="font-size:16px;line-height:1.7;color:#5a2f1f;">${safeReason}</div>
          </div>
          <p style="margin:0;font-size:16px;line-height:1.7;">If you need more information, please contact <a href="mailto:noufar.cdss@gmail.com" style="color:#b05833;font-weight:700;text-decoration:none;">noufar.cdss@gmail.com</a>.</p>
          <p style="margin:24px 0 0;font-size:16px;line-height:1.7;">Best regards,<br /><strong>NOUFAR CDSS</strong></p>
        </div>
      </div>
    </div>
  `;

  return {
    subject: "Update on your NOUFAR CDSS prediction access request",
    text,
    html,
  };
};

const sendDoctorAccessUpgradeRefusedEmail = async (doctor, reason = "") => {
  const config = getMailerConfig();

  if (!config.isConfigured) {
    console.warn(`Access-upgrade refusal email skipped for ${doctor.email}: SMTP settings are incomplete.`);
    return { skipped: true };
  }

  const transporter = await getTransporter();
  const email = buildDoctorAccessUpgradeRefusedEmail(doctor.name, reason);

  await transporter.sendMail({
    from: config.from,
    to: doctor.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return { skipped: false };
};

const buildPasswordResetEmail = (doctorName, resetLink) => {
  const safeName = doctorName?.trim() || "Doctor";
  const safeLink = String(resetLink || "");

  const text = `Dear Doctor,

We received a request to reset your NOUFAR CDSS password.

Use the secure link below to create a new password:
${safeLink}

This reset link will expire in 1 hour.

If you did not request this change, you can safely ignore this email.

If you need assistance, please contact our support team at noufar.cdss@gmail.com.

Best regards,
NOUFAR CDSS`;

  const html = `
    <div style="margin:0;padding:32px;background:#f4f7fb;font-family:Arial,sans-serif;color:#1b2b4a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #dbe4f0;box-shadow:0 18px 36px rgba(15,39,64,0.08);">
        <div style="padding:28px 32px;background:linear-gradient(135deg,#0d4f90,#2f86e6);color:#ffffff;">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.9;">NOUFAR CDSS</div>
          <h1 style="margin:12px 0 0;font-size:30px;line-height:1.2;">Password Reset</h1>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Dear ${safeName},</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">We received a request to reset your NOUFAR CDSS password.</p>
          <p style="margin:0 0 22px;font-size:16px;line-height:1.7;">Use the secure button below to create your new password and return to the platform safely.</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 26px;">
            <tr>
              <td style="border-radius:16px;background:#2369a8;background-image:linear-gradient(135deg,#1b5fa5 0%,#2f86e6 100%);box-shadow:0 16px 28px rgba(30,94,167,0.24);">
                <a href="${safeLink}" style="display:block;padding:16px 28px;border-radius:16px;color:#ffffff;font-size:15px;font-weight:800;line-height:1;text-decoration:none;text-align:center;white-space:nowrap;">Reset your password</a>
              </td>
            </tr>
          </table>
          <div style="margin:0 0 22px;padding:16px 18px;border-radius:18px;background:#f7fbff;border:1px solid #dce8f8;">
            <div style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b6d98;">Fallback link</div>
            <div style="font-size:14px;line-height:1.7;word-break:break-word;">
              <a href="${safeLink}" style="color:#1a5db1;text-decoration:none;font-family:'Courier New',monospace;">${safeLink}</a>
            </div>
          </div>
          <div style="margin:0 0 22px;padding:16px 18px;border-radius:18px;background:#fff9f0;border:1px solid #f4dfb7;color:#7c5a14;">
            <strong style="display:block;margin:0 0 6px;font-size:14px;">Security note</strong>
            <span style="font-size:15px;line-height:1.7;">This reset link will expire in 1 hour. If you did not request this change, you can safely ignore this email.</span>
          </div>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#4f6781;">If you need assistance, please contact our support team at <a href="mailto:noufar.cdss@gmail.com" style="color:#1a5db1;font-weight:700;text-decoration:none;">noufar.cdss@gmail.com</a>.</p>
          <p style="margin:0;font-size:16px;line-height:1.7;">Best regards,<br /><strong>NOUFAR CDSS</strong></p>
        </div>
      </div>
    </div>
  `;

  return {
    subject: "Reset your NOUFAR CDSS password",
    text,
    html,
  };
};

const sendPasswordResetEmail = async (doctor, resetLink) => {
  const config = getMailerConfig();

  if (!config.isConfigured) {
    console.warn(`Password reset email skipped for ${doctor.email}: SMTP settings are incomplete.`);
    return { skipped: true };
  }

  const transporter = await getTransporter();
  const email = buildPasswordResetEmail(doctor.name, resetLink);

  await transporter.sendMail({
    from: config.from,
    to: doctor.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return { skipped: false };
};

module.exports = {
  sendDoctorApprovedEmail,
  sendDoctorAccessUpgradeApprovedEmail,
  sendDoctorAccessUpgradeRefusedEmail,
  sendDoctorActivatedEmail,
  sendDoctorDeletedEmail,
  sendDoctorRejectedEmail,
  sendTwoStepVerificationEmail,
  sendPasswordResetEmail,
};
