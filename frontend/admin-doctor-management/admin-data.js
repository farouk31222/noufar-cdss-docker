const seedDoctors = [
  {
    id: "DOC-2401",
    firstName: "Amel",
    lastName: "Benali",
    name: "Dr. Amel Benali",
    email: "amel.benali@endo-med.dz",
    phone: "+213 555 18 40 12",
    specialty: "Endocrinology",
    hospital: "Algiers University Hospital",
    city: "Algiers",
    country: "Algeria",
    registrationDate: "2026-04-18T09:40:00",
    approvalStatus: "Pending",
    accountStatus: "Inactive",
    assignedAdmin: "Sarah M.",
    licenseNumber: "ALG-ENDO-8741",
    yearsPractice: 11,
    submittedDocuments: [
      { label: "Medical license", file: "medical-license-amel.pdf", verified: false },
      { label: "National ID", file: "national-id-amel.pdf", verified: true },
      { label: "Hospital affiliation letter", file: "hospital-affiliation-amel.pdf", verified: false }
    ],
    notes: "Requested access for hyperthyroid relapse decision support in endocrine outpatient unit.",
    supportTicketIds: ["SUP-9021", "SUP-9025"],
    statusHistory: [
      { date: "2026-04-18T09:40:00", label: "Doctor registration submitted", by: "System" },
      { date: "2026-04-18T10:20:00", label: "Documents queued for manual verification", by: "System" }
    ]
  },
  {
    id: "DOC-2402",
    firstName: "Nassim",
    lastName: "Haddad",
    name: "Dr. Nassim Haddad",
    email: "n.haddad@thycare.org",
    phone: "+213 661 32 76 18",
    specialty: "Nuclear Medicine",
    hospital: "Oran Thyroid Center",
    city: "Oran",
    country: "Algeria",
    registrationDate: "2026-04-17T14:10:00",
    approvalStatus: "Approved",
    accountStatus: "Active",
    assignedAdmin: "Sarah M.",
    licenseNumber: "ALG-NM-5520",
    yearsPractice: 8,
    submittedDocuments: [
      { label: "Medical license", file: "license-haddad.pdf", verified: true },
      { label: "Specialty certificate", file: "specialty-haddad.pdf", verified: true }
    ],
    notes: "Uses the platform for Graves disease follow-up and imaging review.",
    supportTicketIds: ["SUP-9018"],
    statusHistory: [
      { date: "2026-04-17T14:10:00", label: "Doctor registration submitted", by: "System" },
      { date: "2026-04-17T16:50:00", label: "Approved after document review", by: "Admin Sarah M." },
      { date: "2026-04-17T16:55:00", label: "Account activated", by: "System" }
    ]
  },
  {
    id: "DOC-2403",
    firstName: "Leila",
    lastName: "Mansouri",
    name: "Dr. Leila Mansouri",
    email: "leila.mansouri@hospital-setif.dz",
    phone: "+213 560 20 19 04",
    specialty: "Internal Medicine",
    hospital: "Setif Regional Hospital",
    city: "Setif",
    country: "Algeria",
    registrationDate: "2026-04-16T08:50:00",
    approvalStatus: "Rejected",
    accountStatus: "Inactive",
    assignedAdmin: "Karim O.",
    licenseNumber: "ALG-IM-1137",
    yearsPractice: 6,
    submittedDocuments: [
      { label: "Medical license", file: "license-mansouri.pdf", verified: false },
      { label: "Institution letter", file: "letter-mansouri.pdf", verified: false }
    ],
    rejectionReason: "Uploaded license copy was incomplete. Please resubmit a legible signed version.",
    notes: "Interested in evaluation workflow for endocrine referrals.",
    supportTicketIds: [],
    statusHistory: [
      { date: "2026-04-16T08:50:00", label: "Doctor registration submitted", by: "System" },
      { date: "2026-04-16T13:20:00", label: "Registration rejected: incomplete license file", by: "Admin Karim O." }
    ]
  },
  {
    id: "DOC-2404",
    firstName: "Rayan",
    lastName: "Chekroun",
    name: "Dr. Rayan Chekroun",
    email: "rayan.chekroun@endolink.fr",
    phone: "+33 6 82 44 21 50",
    specialty: "Endocrinology",
    hospital: "Clinique Endolink",
    city: "Paris",
    country: "France",
    registrationDate: "2026-04-15T11:35:00",
    approvalStatus: "Approved",
    accountStatus: "Suspended",
    assignedAdmin: "Nora A.",
    licenseNumber: "FR-ENDO-2204",
    yearsPractice: 15,
    submittedDocuments: [
      { label: "Medical license", file: "license-chekroun.pdf", verified: true },
      { label: "Board certification", file: "board-chekroun.pdf", verified: true }
    ],
    notes: "Temporarily suspended during repeated credential update request.",
    supportTicketIds: ["SUP-9020"],
    statusHistory: [
      { date: "2026-04-15T11:35:00", label: "Doctor registration submitted", by: "System" },
      { date: "2026-04-15T14:00:00", label: "Approved after credential review", by: "Admin Nora A." },
      { date: "2026-04-18T09:10:00", label: "Account suspended pending updated hospital proof", by: "Admin Nora A." }
    ]
  },
  {
    id: "DOC-2405",
    firstName: "Sonia",
    lastName: "Fares",
    name: "Dr. Sonia Fares",
    email: "s.fares@thyroid-care.ma",
    phone: "+212 661 90 30 55",
    specialty: "Endocrinology",
    hospital: "Casablanca Endocrine Institute",
    city: "Casablanca",
    country: "Morocco",
    registrationDate: "2026-04-19T08:18:00",
    approvalStatus: "Pending",
    accountStatus: "Inactive",
    assignedAdmin: "Sarah M.",
    licenseNumber: "MA-ENDO-6409",
    yearsPractice: 10,
    submittedDocuments: [
      { label: "Medical license", file: "license-fares.pdf", verified: true },
      { label: "Hospital letter", file: "hospital-fares.pdf", verified: false },
      { label: "Identity document", file: "id-fares.pdf", verified: true }
    ],
    notes: "Wants team onboarding for physician group in thyroid relapse research program.",
    supportTicketIds: ["SUP-9024"],
    statusHistory: [
      { date: "2026-04-19T08:18:00", label: "Doctor registration submitted", by: "System" },
      { date: "2026-04-19T08:35:00", label: "Notification sent to admin queue", by: "System" }
    ]
  },
  {
    id: "DOC-2406",
    firstName: "Mehdi",
    lastName: "Kassouri",
    name: "Dr. Mehdi Kassouri",
    email: "mehdi.kassouri@samu-clinique.dz",
    phone: "+213 771 03 87 12",
    specialty: "Emergency Medicine",
    hospital: "Constantine General Clinic",
    city: "Constantine",
    country: "Algeria",
    registrationDate: "2026-04-10T15:12:00",
    approvalStatus: "Approved",
    accountStatus: "Inactive",
    assignedAdmin: "Karim O.",
    licenseNumber: "ALG-ER-9021",
    yearsPractice: 13,
    submittedDocuments: [
      { label: "Medical license", file: "license-kassouri.pdf", verified: true },
      { label: "Professional registration", file: "registration-kassouri.pdf", verified: true }
    ],
    notes: "Inactive due to no platform activity in the last 45 days.",
    supportTicketIds: [],
    statusHistory: [
      { date: "2026-04-10T15:12:00", label: "Doctor registration submitted", by: "System" },
      { date: "2026-04-10T18:05:00", label: "Approved after document review", by: "Admin Karim O." },
      { date: "2026-04-19T12:10:00", label: "Marked inactive after inactivity threshold", by: "System" }
    ]
  },
  {
    id: "DOC-2407",
    firstName: "Ines",
    lastName: "Belkacem",
    name: "Dr. Ines Belkacem",
    email: "ines.belkacem@med-thyroid.com",
    phone: "+213 554 22 67 99",
    specialty: "Radiology",
    hospital: "Blida Imaging Center",
    city: "Blida",
    country: "Algeria",
    registrationDate: "2026-04-14T10:08:00",
    approvalStatus: "Approved",
    accountStatus: "Active",
    assignedAdmin: "Nora A.",
    licenseNumber: "ALG-RAD-3370",
    yearsPractice: 9,
    submittedDocuments: [
      { label: "Medical license", file: "license-belkacem.pdf", verified: true },
      { label: "Radiology certification", file: "radiology-cert-belkacem.pdf", verified: true }
    ],
    notes: "Needs dataset upload access for imaging-centered reviews.",
    supportTicketIds: ["SUP-9017", "SUP-9023"],
    statusHistory: [
      { date: "2026-04-14T10:08:00", label: "Doctor registration submitted", by: "System" },
      { date: "2026-04-14T13:22:00", label: "Approved after credential review", by: "Admin Nora A." }
    ]
  },
  {
    id: "DOC-2408",
    firstName: "Youssef",
    lastName: "Draoui",
    name: "Dr. Youssef Draoui",
    email: "y.draoui@endo-lab.tn",
    phone: "+216 25 814 403",
    specialty: "Clinical Pathology",
    hospital: "Tunis Endocrine Lab",
    city: "Tunis",
    country: "Tunisia",
    registrationDate: "2026-04-13T16:44:00",
    approvalStatus: "Approved",
    accountStatus: "Active",
    assignedAdmin: "Sarah M.",
    licenseNumber: "TN-PATH-4402",
    yearsPractice: 12,
    submittedDocuments: [
      { label: "Medical license", file: "license-draoui.pdf", verified: true },
      { label: "Laboratory accreditation", file: "lab-accreditation-draoui.pdf", verified: true }
    ],
    notes: "Uses the app to review biological markers and probability outputs.",
    supportTicketIds: ["SUP-9022"],
    statusHistory: [
      { date: "2026-04-13T16:44:00", label: "Doctor registration submitted", by: "System" },
      { date: "2026-04-13T18:00:00", label: "Approved after credential review", by: "Admin Sarah M." }
    ]
  }
];

const seedTickets = [
  {
    id: "SUP-9017",
    doctorId: "DOC-2407",
    subject: "CSV import columns are not mapping correctly",
    priority: "High",
    status: "In Progress",
    createdAt: "2026-04-17T09:25:00",
    updatedAt: "2026-04-19T11:02:00",
    assignedAdmin: "Nora A.",
    category: "Dataset import",
    messages: [
      {
        author: "Dr. Ines Belkacem",
        role: "doctor",
        body: "The CSV upload accepts the file but some imaging variables are not detected in the mapping step.",
        date: "2026-04-17T09:25:00"
      },
      {
        author: "Nora A.",
        role: "admin",
        body: "We have reviewed the file format. The import parser expects standardized column names. We are preparing an updated mapping guide for your workflow.",
        date: "2026-04-18T10:40:00"
      }
    ]
  },
  {
    id: "SUP-9018",
    doctorId: "DOC-2402",
    subject: "Need guidance for uploading supporting documents",
    priority: "Low",
    status: "Resolved",
    createdAt: "2026-04-16T13:12:00",
    updatedAt: "2026-04-17T08:10:00",
    assignedAdmin: "Sarah M.",
    category: "Onboarding",
    messages: [
      {
        author: "Dr. Nassim Haddad",
        role: "doctor",
        body: "Could you confirm the accepted format for professional certification files during onboarding?",
        date: "2026-04-16T13:12:00"
      },
      {
        author: "Sarah M.",
        role: "admin",
        body: "PDF is preferred. We also accept clear JPG or PNG scans below 5 MB for each document.",
        date: "2026-04-16T15:36:00"
      }
    ]
  },
  {
    id: "SUP-9020",
    doctorId: "DOC-2404",
    subject: "Account suspended after document refresh notice",
    priority: "High",
    status: "Open",
    createdAt: "2026-04-18T09:20:00",
    updatedAt: "2026-04-19T09:20:00",
    assignedAdmin: "Nora A.",
    category: "Account access",
    messages: [
      {
        author: "Dr. Rayan Chekroun",
        role: "doctor",
        body: "My account was suspended after a request for updated affiliation proof. I have now uploaded the requested letter.",
        date: "2026-04-18T09:20:00"
      }
    ]
  },
  {
    id: "SUP-9021",
    doctorId: "DOC-2401",
    subject: "Pending approval timeline clarification",
    priority: "Medium",
    status: "Open",
    createdAt: "2026-04-19T08:45:00",
    updatedAt: "2026-04-19T08:45:00",
    assignedAdmin: "Sarah M.",
    category: "Registration review",
    messages: [
      {
        author: "Dr. Amel Benali",
        role: "doctor",
        body: "Could you tell me when the review of my registration and documents is expected to be completed?",
        date: "2026-04-19T08:45:00"
      }
    ]
  },
  {
    id: "SUP-9022",
    doctorId: "DOC-2408",
    subject: "Need export access for approved cohort data",
    priority: "Medium",
    status: "Closed",
    createdAt: "2026-04-15T14:50:00",
    updatedAt: "2026-04-17T17:10:00",
    assignedAdmin: "Sarah M.",
    category: "Permissions",
    messages: [
      {
        author: "Dr. Youssef Draoui",
        role: "doctor",
        body: "Is there a way to export approved cohort summaries for our pathology meeting?",
        date: "2026-04-15T14:50:00"
      },
      {
        author: "Sarah M.",
        role: "admin",
        body: "Export for doctors is not enabled yet. For now, admin can provide a reviewed summary export upon request.",
        date: "2026-04-16T10:05:00"
      }
    ]
  },
  {
    id: "SUP-9023",
    doctorId: "DOC-2407",
    subject: "Question about support turnaround",
    priority: "Low",
    status: "Resolved",
    createdAt: "2026-04-14T11:40:00",
    updatedAt: "2026-04-14T15:55:00",
    assignedAdmin: "Nora A.",
    category: "Support",
    messages: [
      {
        author: "Dr. Ines Belkacem",
        role: "doctor",
        body: "What is the usual support response time for physician onboarding questions?",
        date: "2026-04-14T11:40:00"
      },
      {
        author: "Nora A.",
        role: "admin",
        body: "Most physician support requests are handled within one business day. Critical access issues are prioritized sooner.",
        date: "2026-04-14T15:55:00"
      }
    ]
  },
  {
    id: "SUP-9024",
    doctorId: "DOC-2405",
    subject: "Team onboarding request for endocrine unit",
    priority: "High",
    status: "Open",
    createdAt: "2026-04-19T09:05:00",
    updatedAt: "2026-04-19T09:05:00",
    assignedAdmin: "Sarah M.",
    category: "Onboarding",
    messages: [
      {
        author: "Dr. Sonia Fares",
        role: "doctor",
        body: "We would like to onboard three endocrinologists from our department after approval. Can you share the recommended process?",
        date: "2026-04-19T09:05:00"
      }
    ]
  },
  {
    id: "SUP-9025",
    doctorId: "DOC-2401",
    subject: "Document upload finished but review not updated",
    priority: "Medium",
    status: "In Progress",
    createdAt: "2026-04-19T11:16:00",
    updatedAt: "2026-04-19T14:48:00",
    assignedAdmin: "Sarah M.",
    category: "Registration review",
    messages: [
      {
        author: "Dr. Amel Benali",
        role: "doctor",
        body: "I uploaded the missing hospital affiliation letter. The dashboard still shows my verification as pending.",
        date: "2026-04-19T11:16:00"
      },
      {
        author: "Sarah M.",
        role: "admin",
        body: "The newly uploaded document is visible. We will complete manual verification shortly and update your status.",
        date: "2026-04-19T14:48:00"
      }
    ]
  }
];

const seedAuditLog = [
  {
    id: "LOG-1",
    timestamp: "2026-04-19T14:48:00",
    actor: "Sarah M.",
    action: "Replied to registration review support request",
    target: "SUP-9025"
  },
  {
    id: "LOG-2",
    timestamp: "2026-04-18T16:40:00",
    actor: "Nora A.",
    action: "Suspended doctor account for updated credential review",
    target: "DOC-2404"
  },
  {
    id: "LOG-3",
    timestamp: "2026-04-17T16:50:00",
    actor: "Sarah M.",
    action: "Approved doctor registration",
    target: "DOC-2402"
  }
];

const registrationSeries = [
  { label: "Nov", value: 8 },
  { label: "Dec", value: 11 },
  { label: "Jan", value: 9 },
  { label: "Feb", value: 13 },
  { label: "Mar", value: 15 },
  { label: "Apr", value: 18 }
];

window.NoufarAdminSeed = {
  doctors: seedDoctors,
  tickets: seedTickets,
  auditLog: seedAuditLog,
  registrationSeries
};
