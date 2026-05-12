const patientsApiBaseUrl = window.NOUFAR_API_BASE_URL || "http://localhost:5000/api";
const patientsDoctorAuthStorageKey = "noufar-doctor-auth-v1";
const patientPredictionDraftStorageKey = "noufar-patient-clinical-draft-v1";
const TRI_TOGGLE_STATES = ["Yes", "Not measured", "No"];
const patientsDoctorSessionBridge = window.NoufarDoctorSessionBridge || null;

const patientsBody = document.querySelector("#patients-body");
const patientsEmpty = document.querySelector("#patients-empty");
const patientsSearch = document.querySelector("#patients-search");
const patientsFilter = document.querySelector("#patients-filter");
const patientsPagination = document.querySelector("#patients-pagination");
const patientsPaginationSummary = document.querySelector("#patients-pagination-summary");
const addPatientModal = document.querySelector("#add-patient-modal");
const addPatientForm = document.querySelector("#add-patient-form");
const patientFormTitle = document.querySelector("#patient-form-title");
const patientFormCopy = document.querySelector("#patient-form-copy");
const savePatientButton = document.querySelector("#save-patient-button");
const patientFormNote = document.querySelector("#patient-form-note");
const openAddPatientButton = document.querySelector("#open-add-patient-modal");
const addPatientCloseControls = document.querySelectorAll("[data-patient-modal-close]");
const patientDetailsModal = document.querySelector("#patient-details-modal");
const patientDetailsTitle = document.querySelector("#patient-details-title");
const patientDetailsCopy = document.querySelector("#patient-details-copy");
const patientDetailsContent = document.querySelector("#patient-details-content");
const editPatientButton = document.querySelector("#edit-patient-button");
const patientDetailsCloseControls = document.querySelectorAll("[data-patient-details-close]");
const deleteModal = document.querySelector("#delete-patient-modal");
const deletePatientSummary = document.querySelector("#delete-patient-summary");
const confirmDeletePatient = document.querySelector("#confirm-delete-patient");
const deletePatientCloseControls = document.querySelectorAll("[data-patient-delete-close]");
const duplicatePatientPredictionModal = document.querySelector("#duplicate-patient-prediction-modal");
const duplicatePatientPredictionCopy = document.querySelector("#duplicate-patient-prediction-copy");
const duplicatePatientPredictionViewButton = document.querySelector("#duplicate-patient-prediction-view");
const duplicatePatientPredictionOkButton = document.querySelector("#duplicate-patient-prediction-ok");
const duplicatePatientPredictionCloseControls = document.querySelectorAll("[data-close-duplicate-patient-prediction]");
const patientToggleInputs = Array.from(addPatientForm?.querySelectorAll(".toggle-switch-input") || []);
const patientRangeInputs = Array.from(addPatientForm?.querySelectorAll(".range-input") || []);
const patientChipSelectGroups = Array.from(addPatientForm?.querySelectorAll(".chip-select-group") || []);

const getPatientsCurrentDoctorIdentity = () => {
  try {
    const raw = window.localStorage.getItem(patientsDoctorAuthStorageKey);
    const session = raw ? JSON.parse(raw) : null;
    const user = session?.user || {};
    return {
      name: String(user.name || "").trim(),
      email: String(user.email || "").trim(),
    };
  } catch (error) {
    return { name: "", email: "" };
  }
};

const formatPredictedByDisplay = (value) => {
  const rawName = String(value || "").trim();
  if (!rawName) return "Unknown user";

  const current = getPatientsCurrentDoctorIdentity();
  const normalizedRaw = rawName.toLowerCase();
  const normalizedName = current.name.toLowerCase();
  const normalizedEmail = current.email.toLowerCase();

  if (
    (normalizedName && normalizedRaw === normalizedName) ||
    (normalizedEmail && normalizedRaw === normalizedEmail)
  ) {
    return "Me";
  }

  if (/^dr\.?\s+/i.test(rawName)) {
    return rawName;
  }

  return `Dr. ${rawName}`;
};

const normalizeTriToggleValue = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No";
  return "Not measured";
};

const setPatientTriToggleState = (input, nextState) => {
  const state = normalizeTriToggleValue(nextState);
  input.dataset.triState = state;
  input.value = state;
  input.checked = state === "Yes";

  const field = input.closest(".toggle-switch-field");
  if (!field) return;
  field.querySelectorAll(".tri-toggle-btn").forEach((button) => {
    const isActive = button.dataset.stateValue === state;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
};

const initPatientTriStateToggles = () => {
  patientToggleInputs.forEach((input) => {
    const field = input.closest(".toggle-switch-field");
    const control = input.closest(".toggle-switch-control");
    if (!field || !control || field.querySelector(".tri-toggle")) return;

    field.classList.add("tri-toggle-field");

    const tri = document.createElement("div");
    tri.className = "tri-toggle";
    tri.setAttribute("role", "group");
    tri.innerHTML = `
      <button type="button" class="tri-toggle-btn" data-state-value="Yes" aria-pressed="false">Yes</button>
      <button type="button" class="tri-toggle-btn" data-state-value="Not measured" aria-pressed="false">Not measured</button>
      <button type="button" class="tri-toggle-btn" data-state-value="No" aria-pressed="false">No</button>
    `;
    control.appendChild(tri);

    tri.addEventListener("click", (event) => {
      const button = event.target.closest(".tri-toggle-btn");
      if (!button) return;
      input.dataset.touched = "true";
      setPatientTriToggleState(input, button.dataset.stateValue);
      syncPatientFieldState(input);
      updatePatientSubmitState();
    });

    setPatientTriToggleState(input, input.checked ? "Yes" : "Not measured");
  });
};

const initPatientNotMeasuredOptions = () => {
  patientRangeInputs.forEach((input) => {
    const shell = input.closest(".range-field-shell");
    const field = input.closest(".slider-field");
    const fieldLabel = field?.querySelector(":scope > span");
    if (!shell || !fieldLabel || fieldLabel.querySelector(".range-not-measured")) return;

    const wrapper = document.createElement("span");
    wrapper.className = "range-not-measured range-not-measured-inline";
    wrapper.innerHTML = `
      <input type="checkbox" data-range-not-measured="${input.name}" />
      <span class="range-not-measured-text">Not measured</span>
    `;
    fieldLabel.appendChild(wrapper);

    const toggleButton = wrapper.querySelector(".range-not-measured-text");
    const toggleInput = wrapper.querySelector(`[data-range-not-measured="${input.name}"]`);
    const applyNotMeasuredState = (enabled) => {
      input.dataset.notMeasured = enabled ? "true" : "false";
      if (toggleInput instanceof HTMLInputElement) {
        toggleInput.checked = enabled;
      }
      const target = document.getElementById(input.dataset.rangeTarget || "");
      if (enabled) {
        input.dataset.lastMeasuredValue = input.value;
        input.disabled = true;
        input.classList.add("is-not-measured");
        if (target) target.textContent = "Not measured";
      } else {
        input.disabled = false;
        input.classList.remove("is-not-measured");
        if (input.dataset.lastMeasuredValue) {
          input.value = input.dataset.lastMeasuredValue;
        }
        updatePatientRangePresentation(input);
      }
      updatePatientSubmitState();
    };

    toggleButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const enabled = input.dataset.notMeasured !== "true";
      applyNotMeasuredState(enabled);
    });
    toggleInput?.addEventListener("change", () => {
      applyNotMeasuredState(Boolean(toggleInput.checked));
    });

    applyNotMeasuredState(false);
  });
};

let patientsRegistry = [];
let activePatientId = null;
let editingPatientId = null;
let duplicatePatientPredictionId = "";
let predictionsRegistry = [];
let patientsCurrentPage = 1;
const PATIENTS_PAGE_SIZE = 8;

const patientDetailSections = [
  {
    title: "Patient Info",
    fields: [
      ["name", "Patient name"],
      ["age", "Age"],
      ["sex", "Sex"],
    ],
  },
  {
    title: "Symptoms / Clinical",
    fields: [
      ["consultationReason", "Consultation reason"],
      ["stress", "Stress"],
      ["palpitations", "Palpitations"],
      ["spp", "SPP"],
      ["amg", "AMG"],
      ["diarrhea", "Diarrhea"],
      ["tremors", "Tremors"],
      ["agitation", "Agitation"],
      ["moodDisorder", "Mood disorder"],
      ["sleepDisorder", "Sleep disorder"],
      ["sweating", "Excess sweating"],
      ["heatIntolerance", "Heat intolerance"],
      ["muscleWeakness", "Muscle weakness"],
    ],
  },
  {
    title: "Thyroid Examination",
    fields: [
      ["goiter", "Goiter"],
      ["goiterClassification", "Goiter classification"],
    ],
  },
  {
    title: "Biology",
    fields: [
      ["tsh", "TSH"],
      ["ft4", "FT4"],
      ["antiTpo", "Anti-TPO"],
      ["antiTpoTotal", "Anti-TPO total"],
      ["antiTg", "Anti-Tg"],
      ["tsi", "TSI"],
      ["tsiLevel", "TSI level"],
    ],
  },
  {
    title: "Imaging",
    fields: [
      ["ultrasound", "Ultrasound"],
      ["scintigraphy", "Scintigraphy"],
    ],
  },
  {
    title: "Treatment",
    fields: [
      ["therapy", "Therapy"],
      ["duration", "Treatment duration"],
      ["blockReplace", "Block and replace"],
      ["surgery", "Surgery"],
      ["radioactiveIodine", "Radioactive iodine"],
    ],
  },
];

const showPatientsToast = (message, variant = "success") => {
  if (typeof window.showNoufarToast === "function") {
    window.showNoufarToast(message, variant);
  }
};

const getPatientsDoctorSession = () => {
  try {
    const raw = window.localStorage.getItem(patientsDoctorAuthStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const getPatientsDoctorAccountType = () => {
  const session = getPatientsDoctorSession();
  return session?.user?.doctorAccountType === "standard" ? "standard" : "prediction";
};

const patientsCanRunPredictions = () => getPatientsDoctorAccountType() === "prediction";

const requestPatientsJson = async (path, options = {}) => {
  if (patientsDoctorSessionBridge?.requestJson) {
    return patientsDoctorSessionBridge.requestJson(path, options);
  }

  const session = getPatientsDoctorSession();
  const token = session?.token;

  if (!token) {
    throw new Error("Doctor session token is missing. Please log in again.");
  }

  const response = await fetch(`${patientsApiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
};

const requestPatients = async () => {
  const data = await requestPatientsJson("/patients");
  return Array.isArray(data) ? data : [];
};

const requestPredictions = async () => {
  const data = await requestPatientsJson("/predictions");
  return Array.isArray(data) ? data : [];
};

const createPatientEntry = async (payload) => {
  const data = await requestPatientsJson("/patients", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.patient;
};

const updatePatientEntry = async (id, payload) => {
  const data = await requestPatientsJson(`/patients/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return data.patient;
};

const deletePatientEntry = async (id) => {
  await requestPatientsJson(`/patients/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

const findPredictionByPatientName = async (patientName) => {
  const normalizedPatientName = String(patientName || "").trim().toLowerCase();
  if (!normalizedPatientName) return null;

  const predictions = await requestPredictions();
  return (
    predictions.find(
      (prediction) => String(prediction?.patientName || "").trim().toLowerCase() === normalizedPatientName
    ) || null
  );
};

const getPredictionForPatientName = (patientName) => {
  const normalizedPatientName = String(patientName || "").trim().toLowerCase();
  if (!normalizedPatientName) return null;

  return (
    predictionsRegistry.find(
      (prediction) => String(prediction?.patientName || "").trim().toLowerCase() === normalizedPatientName
    ) || null
  );
};

const formatDate = (value, withTime = false) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");

  const base = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  if (!withTime) return base;

  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${base} ${time}`;
};

const normalizePatientEntry = (entry = {}) => ({
  id: String(entry._id || entry.id || ""),
  patientName: entry.patientName || entry.name || "Unknown patient",
  age: Number(entry.age) || 0,
  sex: entry.sex || "Not specified",
  consultationReason:
    entry.consultationReason ||
    entry.inputData?.consultationReason ||
    entry.inputData?.consultReason ||
    "Not specified",
  duration: Number(entry.duration ?? entry.inputData?.duration) || 0,
  source: entry.source || "Manual",
  savedByName: entry.savedByName || "Unknown user",
  createdAt: entry.createdAt || new Date().toISOString(),
  inputData: entry.inputData || {},
});

const getPatientInputSnapshot = (patient = {}) => {
  const input = patient.inputData && typeof patient.inputData === "object" ? patient.inputData : {};

  return {
    ...input,
    name: input.name || patient.patientName || "",
    age: input.age ?? patient.age ?? "",
    sex: input.sex || input.gender || patient.sex || "",
    consultationReason:
      input.consultationReason ||
      input.consultReason ||
      patient.consultationReason ||
      "",
    sweating: input.sweating ?? input.excessSweating,
    goiterClassification: input.goiterClassification ?? input.goiterClass,
    antiTpo: input.antiTpo ?? input.antiTPO,
    antiTpoTotal: input.antiTpoTotal ?? input.antiTPOtotal,
    antiTg: input.antiTg ?? input.antiTG,
    tsi: input.tsi ?? input.TSI,
    tsiLevel: input.tsiLevel ?? input.TSIlevel,
    therapy: input.therapy ?? input.treatment,
    radioactiveIodine: input.radioactiveIodine ?? input.rai,
    duration: input.duration ?? patient.duration ?? "",
    source: input.source || patient.source || "Manual",
  };
};

const serializePatientForm = () => {
  const formData = new FormData(addPatientForm);
  patientToggleInputs.forEach((input) => {
    formData.set(input.name, normalizeTriToggleValue(input.dataset.triState || input.value));
  });
  patientRangeInputs.forEach((input) => {
    if (input.dataset.notMeasured === "true") {
      formData.set(input.name, "Not measured");
    }
  });
  const payload = Object.fromEntries(formData.entries());
  payload.source = "Manual";
  payload.age = Number(payload.age);
  payload.duration = Number(payload.duration || 0);
  payload.tsh = String(payload.tsh || "").toLowerCase() === "not measured" ? "Not measured" : Number(payload.tsh || 0);
  payload.ft4 = String(payload.ft4 || "").toLowerCase() === "not measured" ? "Not measured" : Number(payload.ft4 || 0);
  payload.antiTpoTotal =
    String(payload.antiTpoTotal || "").toLowerCase() === "not measured" ? "Not measured" : Number(payload.antiTpoTotal || 0);
  payload.tsiLevel =
    String(payload.tsiLevel || "").toLowerCase() === "not measured" ? "Not measured" : Number(payload.tsiLevel || 0);
  return payload;
};

const initializePatientChipSelect = (group) => {
  if (!(group instanceof HTMLElement)) return;

  const field = group.closest(".chip-select-field");
  const hiddenInput = field?.querySelector('input[type="hidden"]');
  const options = Array.from(group.querySelectorAll(".chip-select-option"));
  if (!hiddenInput || !options.length) return;

  const syncSelectedOption = (value) => {
    hiddenInput.value = value;
    options.forEach((option) => {
      const isSelected = option.dataset.chipValue === value;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  };

  syncSelectedOption(hiddenInput.value || options[0].dataset.chipValue || "");

  const handleOptionSelection = (option) => {
    if (!(option instanceof HTMLElement)) return;
    syncSelectedOption(option.dataset.chipValue || "");
    hiddenInput.dataset.touched = "true";
    syncPatientFieldState(hiddenInput);
    updatePatientSubmitState();
  };

  group.addEventListener("click", (event) => {
    const option = event.target.closest(".chip-select-option");
    if (!option) return;
    event.preventDefault();
    handleOptionSelection(option);
  });

  options.forEach((option) => {
    option.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      handleOptionSelection(option);
    });
  });
};

const isPatientValidatableField = (field) =>
  (field instanceof HTMLInputElement ||
    field instanceof HTMLSelectElement ||
    field instanceof HTMLTextAreaElement) &&
  typeof field.checkValidity === "function" &&
  field.type !== "submit" &&
  field.type !== "button" &&
  field.type !== "reset" &&
  field.type !== "hidden" &&
  !field.disabled;

const getPatientValidatableFields = () => {
  if (!addPatientForm) return [];
  return Array.from(addPatientForm.elements).filter(isPatientValidatableField);
};

const getPatientRequiredFields = () => {
  if (!addPatientForm) return [];
  return Array.from(addPatientForm.querySelectorAll("input[required], select[required], textarea[required]")).filter(
    (field) => field instanceof HTMLElement && typeof field.checkValidity === "function" && !field.disabled
  );
};

const getPatientFieldContainer = (field) => field?.closest(".field, .toggle-switch-field") ?? null;

const ensurePatientErrorElement = (field) => {
  const container = getPatientFieldContainer(field);
  if (!container) return null;

  let errorElement = container.querySelector(".field-error-message");
  if (!errorElement) {
    errorElement = document.createElement("p");
    errorElement.className = "field-error-message";
    errorElement.setAttribute("aria-live", "polite");
    container.appendChild(errorElement);
  }

  return errorElement;
};

const getPatientFieldErrorMessage = (field) => {
  if (!(field instanceof HTMLElement) || typeof field.checkValidity !== "function") return "";

  if (field.validity.valueMissing) {
    return "This field is required.";
  }

  if (field.validity.badInput) {
    return "Please enter a valid number.";
  }

  if (field.validity.rangeUnderflow || field.validity.rangeOverflow) {
    if (field.name === "age") return "Age must be between 17 and 100.";
    if (field.name === "duration") return "Duration must be between 3 and 96 months.";
    return "Please enter a valid value.";
  }

  if (field.validity.customError) {
    return field.validationMessage;
  }

  return "Please review this field.";
};

const shouldShowPatientFieldError = (field, force = false) => {
  if (!field) return false;
  if (force) return true;
  return addPatientForm?.dataset.submitAttempted === "true" || field.dataset.touched === "true";
};

const syncPatientFieldState = (field, force = false) => {
  if (!(field instanceof HTMLElement) || typeof field.checkValidity !== "function") return;

  const container = getPatientFieldContainer(field);
  const errorElement = ensurePatientErrorElement(field);
  const isInvalid = shouldShowPatientFieldError(field, force) && !field.checkValidity();

  container?.classList.toggle("is-invalid", isInvalid);

  if (errorElement) {
    errorElement.textContent = isInvalid ? getPatientFieldErrorMessage(field) : "";
    errorElement.hidden = !isInvalid;
  }
};

const updatePatientTogglePresentation = (input) => {
  if (!input) return;
  if (input.dataset.triState) return;
  const valueLabel = input.closest(".toggle-switch-control")?.querySelector(".toggle-switch-value");
  if (valueLabel) {
    valueLabel.textContent = input.checked ? "Yes" : "No";
  }
};

const updatePatientRangePresentation = (input) => {
  if (!input) return;
  const target = document.getElementById(input.dataset.rangeTarget || "");

  if (input.dataset.notMeasured === "true") {
    input.disabled = true;
    input.classList.add("is-not-measured");
    if (target) target.textContent = "Not measured";
    return;
  }

  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || min);
  const decimals = Number(input.dataset.rangeDecimals || 0);
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;

  input.style.background = `linear-gradient(90deg, #2d71d3 0%, #63a8ff ${progress}%, rgba(68, 121, 196, 0.18) ${progress}%, rgba(150, 187, 239, 0.24) 100%)`;

  if (target) {
    target.textContent = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  }
};

const commitPatientRangeManualValue = (input, rawValue) => {
  if (!input) return;

  if (input.dataset.notMeasured === "true") {
    showPatientsToast("Uncheck Not measured first to edit this value.", "danger");
    return;
  }

  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const step = Number(input.step || 1);
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return;

  const clamped = Math.min(max, Math.max(min, parsed));
  const precision = String(step).includes(".") ? String(step).split(".")[1].length : 0;
  const snapped = Number((Math.round(clamped / step) * step).toFixed(precision));
  input.value = String(snapped);
  input.dataset.touched = "true";
  updatePatientRangePresentation(input);
  syncPatientFieldState(input);
  updatePatientSubmitState();
};

const initPatientManualRangeEditors = () => {
  patientRangeInputs.forEach((input) => {
    const target = document.getElementById(input.dataset.rangeTarget || "");
    if (!target || target.dataset.manualEditorBound === "true") return;
    target.dataset.manualEditorBound = "true";
    target.classList.add("range-value-display");
    target.title = "Click to edit value";

    target.addEventListener("click", () => {
      if (input.dataset.notMeasured === "true") return;
      const previous = target.textContent?.trim() || "";
      const editor = document.createElement("input");
      editor.type = "number";
      editor.className = "range-value-editor";
      editor.min = input.min || "0";
      editor.max = input.max || "100";
      editor.step = input.step || "1";
      editor.value = String(input.value || previous);
      target.replaceWith(editor);
      editor.focus();
      editor.select();

      const finish = (accept) => {
        editor.replaceWith(target);
        if (accept) {
          commitPatientRangeManualValue(input, editor.value);
        }
      };

      editor.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      });

      editor.addEventListener("blur", () => finish(true), { once: true });
    });
  });
};

const updatePatientSubmitState = () => {
  if (!addPatientForm || !savePatientButton) return;

  const requiredFields = getPatientRequiredFields();
  const isFormValid = requiredFields.every((field) => field.checkValidity());
  savePatientButton.disabled = !isFormValid;

  if (!patientFormNote) return;

  patientFormNote.classList.remove("is-error", "is-ready");

  if (isFormValid) {
    patientFormNote.textContent = editingPatientId
      ? "All required fields are ready. You can update this patient entry."
      : "All required fields are ready. You can save this patient entry.";
    patientFormNote.classList.add("is-ready");
    return;
  }

  if (addPatientForm.dataset.submitAttempted === "true") {
    patientFormNote.textContent = editingPatientId
      ? "Complete the required fields highlighted below before updating this patient."
      : "Complete the required fields highlighted below before saving this patient.";
    patientFormNote.classList.add("is-error");
    return;
  }

  patientFormNote.textContent = editingPatientId
    ? "Complete all required fields to update this patient entry."
    : "Complete all required fields to save this patient entry.";
};

const syncPatientFormMode = () => {
  const isEditing = Boolean(editingPatientId);

  if (patientFormTitle) {
    patientFormTitle.textContent = isEditing ? "Update Patient Clinical Entry" : "Add Patient Clinical Entry";
  }

  if (patientFormCopy) {
    patientFormCopy.textContent = isEditing
      ? "Update the saved clinical entry and keep the patient registry synchronized."
      : "Fill in the clinical entry and save it to the patient registry without running prediction.";
  }

  if (savePatientButton) {
    savePatientButton.textContent = isEditing ? "Update Patient" : "Save Patient";
  }

  updatePatientSubmitState();
};

const populatePatientForm = (patient) => {
  if (!patient || !addPatientForm) return;

  const values = getPatientInputSnapshot(patient);

  Array.from(addPatientForm.elements).forEach((field) => {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) {
      return;
    }

    if (!field.name || field.type === "submit" || field.type === "button") return;

    const nextValue = values[field.name];
    if (field.type === "checkbox") {
      setPatientTriToggleState(field, nextValue);
      return;
    }

    field.value = nextValue === undefined || nextValue === null ? "" : String(nextValue);
  });

  patientToggleInputs.forEach((input) => {
    updatePatientTogglePresentation(input);
    syncPatientFieldState(input);
  });

  patientRangeInputs.forEach((input) => {
    const markedNotMeasured = String(values[input.name] ?? "").trim().toLowerCase() === "not measured";
    const notMeasuredButton = addPatientForm.querySelector(`[data-range-not-measured="${input.name}"]`);
    if (notMeasuredButton instanceof HTMLInputElement) {
      notMeasuredButton.checked = markedNotMeasured;
      input.dataset.notMeasured = markedNotMeasured ? "true" : "false";
      if (markedNotMeasured) {
        input.disabled = true;
        input.classList.add("is-not-measured");
      } else {
        input.disabled = false;
        input.classList.remove("is-not-measured");
      }
    }
    updatePatientRangePresentation(input);
    syncPatientFieldState(input);
  });

  patientChipSelectGroups.forEach((group) => {
    const field = group.closest(".chip-select-field");
    const hiddenInput = field?.querySelector('input[type="hidden"]');
    const selectedValue = hiddenInput?.value;

    Array.from(group.querySelectorAll(".chip-select-option")).forEach((button) => {
      const isSelected = button.dataset.chipValue === selectedValue;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  });

  getPatientValidatableFields().forEach((field) => {
    syncPatientFieldState(field);
  });

  updatePatientSubmitState();
};

const resetPatientFormState = () => {
  if (!addPatientForm) return;

  addPatientForm.reset();
  delete addPatientForm.dataset.submitAttempted;

  patientToggleInputs.forEach((input) => {
    input.dataset.touched = "false";
    if (input.dataset.triState) {
      setPatientTriToggleState(input, "Not measured");
    } else {
      updatePatientTogglePresentation(input);
    }
    syncPatientFieldState(input);
  });

  patientRangeInputs.forEach((input) => {
    input.dataset.touched = "false";
    const notMeasuredButton = addPatientForm.querySelector(`[data-range-not-measured="${input.name}"]`);
    if (notMeasuredButton instanceof HTMLInputElement) {
      notMeasuredButton.checked = false;
      input.dataset.notMeasured = "false";
      input.disabled = false;
      input.classList.remove("is-not-measured");
    }
    updatePatientRangePresentation(input);
    syncPatientFieldState(input);
  });

  patientChipSelectGroups.forEach((group) => {
    const field = group.closest(".chip-select-field");
    const hiddenInput = field?.querySelector('input[type="hidden"]');
    const options = Array.from(group.querySelectorAll(".chip-select-option"));
    if (!hiddenInput || !options.length) return;

    hiddenInput.dataset.touched = "false";
    hiddenInput.value = hiddenInput.defaultValue || options[0].dataset.chipValue || "";

    options.forEach((option) => {
      const isSelected = option.dataset.chipValue === hiddenInput.value;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  });

  getPatientValidatableFields().forEach((field) => {
    field.dataset.touched = "false";
    syncPatientFieldState(field);
  });

  updatePatientSubmitState();
};

const openDuplicatePatientPredictionModal = (
  message = "A manual prediction already exists for this patient. Duplicate predictions are not allowed.",
  predictionId = ""
) => {
  duplicatePatientPredictionId = String(predictionId || "").trim();

  if (duplicatePatientPredictionCopy) {
    duplicatePatientPredictionCopy.textContent = message;
  }

  if (duplicatePatientPredictionViewButton) {
    duplicatePatientPredictionViewButton.hidden = !duplicatePatientPredictionId;
  }

  openModal(duplicatePatientPredictionModal);
};

const escapePatientHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const patientDisplayValue = (value, fallback = "Not provided") =>
  value === undefined || value === null || value === "" ? fallback : String(value);

const buildReadonlyInputField = (label, value, extra = "") => `
  <label class="field">
    <span>${escapePatientHtml(label)}</span>
    <input type="text" value="${escapePatientHtml(value)}" readonly ${extra}/>
  </label>
`;

const buildReadonlyToggleField = (label, rawValue) => {
  const state = normalizeTriToggleValue(rawValue);
  return `
    <label class="toggle-switch-field">
      <span>${escapePatientHtml(label)}</span>
      <span class="toggle-switch-control is-readonly tri-toggle-readonly">
        <span class="tri-toggle tri-toggle-readonly-group" role="group" aria-label="${escapePatientHtml(label)}">
          <button type="button" class="tri-toggle-btn ${state === "Yes" ? "is-active" : ""}" aria-pressed="${state === "Yes" ? "true" : "false"}" disabled>Yes</button>
          <button type="button" class="tri-toggle-btn ${state === "Not measured" ? "is-active" : ""}" aria-pressed="${state === "Not measured" ? "true" : "false"}" disabled>Not measured</button>
          <button type="button" class="tri-toggle-btn ${state === "No" ? "is-active" : ""}" aria-pressed="${state === "No" ? "true" : "false"}" disabled>No</button>
        </span>
      </span>
    </label>
  `;
};

const buildReadonlyRangeField = (label, rawValue, min, max, decimals, unit) => {
  if (String(rawValue ?? "").trim().toLowerCase() === "not measured") {
    return `
      <label class="field slider-field">
        <span>${escapePatientHtml(label)}</span>
        <div class="range-field-shell is-not-measured">
          <div class="range-field-meta">
            <strong>Not measured</strong>
            <small>${escapePatientHtml(unit)}</small>
          </div>
        </div>
      </label>
    `;
  }

  const fallback = Number(rawValue);
  const value = Number.isFinite(fallback) ? fallback : min;
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const displayValue = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));

  return `
    <label class="field slider-field">
      <span>${escapePatientHtml(label)}</span>
      <div class="range-field-shell">
        <input
          class="range-input"
          type="range"
          min="${min}"
          max="${max}"
          step="${decimals > 0 ? "0.1" : "1"}"
          value="${value}"
          disabled
          style="background: linear-gradient(90deg, #2d71d3 0%, #63a8ff ${progress}%, rgba(68, 121, 196, 0.18) ${progress}%, rgba(150, 187, 239, 0.24) 100%);"
        />
        <div class="range-field-meta">
          <strong>${escapePatientHtml(displayValue)}</strong>
          <small>${escapePatientHtml(unit)}</small>
        </div>
      </div>
    </label>
  `;
};

const buildReadonlyChipField = (label, rawValue, options, ariaLabel) => {
  const selectedValue = patientDisplayValue(rawValue, options[0] || "");
  return `
    <div class="field chip-select-field">
      <span>${escapePatientHtml(label)}</span>
      <div class="chip-select-group" role="group" aria-label="${escapePatientHtml(ariaLabel)}">
        ${options
          .map(
            (option) => `
              <button
                class="chip-select-option ${selectedValue === option ? "is-selected" : ""}"
                type="button"
                aria-pressed="${selectedValue === option ? "true" : "false"}"
                disabled
              >
                ${escapePatientHtml(option)}
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
};

const buildPatientDetailsMarkup = (patient) => {
  const values = getPatientInputSnapshot(patient);

  return `
    <div class="form-section">
      <div class="form-section-title">Patient Info</div>
      <div class="form-grid form-grid-3">
        ${buildReadonlyInputField("Name", patientDisplayValue(values.name))}
        ${buildReadonlyInputField("Age", patientDisplayValue(values.age))}
        ${buildReadonlyInputField("Sex", patientDisplayValue(values.sex))}
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Symptoms / Clinical</div>
      <div class="form-grid form-grid-2">
        ${buildReadonlyInputField("Consultation reason", patientDisplayValue(values.consultationReason))}
      </div>
      <div class="toggle-grid">
        ${buildReadonlyToggleField("Stress", values.stress)}
        ${buildReadonlyToggleField("Palpitations", values.palpitations)}
        ${buildReadonlyToggleField("SPP", values.spp)}
        ${buildReadonlyToggleField("AMG", values.amg)}
        ${buildReadonlyToggleField("Diarrhea", values.diarrhea)}
        ${buildReadonlyToggleField("Tremors", values.tremors)}
        ${buildReadonlyToggleField("Agitation", values.agitation)}
        ${buildReadonlyToggleField("Mood disorder", values.moodDisorder)}
        ${buildReadonlyToggleField("Sleep disorder", values.sleepDisorder)}
        ${buildReadonlyToggleField("Excess sweating", values.sweating)}
        ${buildReadonlyToggleField("Heat intolerance", values.heatIntolerance)}
        ${buildReadonlyToggleField("Muscle weakness", values.muscleWeakness)}
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Thyroid Examination</div>
      <div class="form-grid form-grid-2">
        ${buildReadonlyToggleField("Goiter", values.goiter)}
        ${buildReadonlyInputField("Goiter classification", patientDisplayValue(values.goiterClassification))}
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Biology</div>
      <div class="form-grid form-grid-3">
        ${buildReadonlyRangeField("TSH", values.tsh, 0, 5, 1, "mIU/L")}
        ${buildReadonlyRangeField("FT4", values.ft4, 0.3, 4, 1, "ng/dL")}
        ${buildReadonlyChipField("Anti-TPO", values.antiTpo, ["Not measured", "Negative", "Positive"], "Patient Anti-TPO status")}
        ${buildReadonlyRangeField("Anti-TPO total", values.antiTpoTotal, 0, 1000, 0, "IU/mL")}
        ${buildReadonlyChipField("Anti-Tg", values.antiTg, ["Not measured", "Negative", "Positive"], "Patient Anti-Tg status")}
        ${buildReadonlyChipField("TSI", values.tsi, ["Not measured", "Negative", "Positive"], "Patient TSI status")}
        ${buildReadonlyRangeField("TSI level", values.tsiLevel, 0, 5, 1, "index")}
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Imaging</div>
      <div class="form-grid form-grid-2">
        ${buildReadonlyInputField("Ultrasound", patientDisplayValue(values.ultrasound))}
        ${buildReadonlyInputField("Scintigraphy", patientDisplayValue(values.scintigraphy))}
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Treatment</div>
      <div class="form-grid form-grid-2">
        ${buildReadonlyInputField("Therapy", patientDisplayValue(values.therapy))}
        ${buildReadonlyInputField("Duration of treatment", patientDisplayValue(values.duration ? `${values.duration} months` : "", "Not provided"))}
      </div>
      <div class="toggle-grid">
        ${buildReadonlyToggleField("Block and replace", values.blockReplace)}
        ${buildReadonlyToggleField("Surgery", values.surgery)}
        ${buildReadonlyToggleField("Radioactive iodine", values.radioactiveIodine)}
      </div>
    </div>
  `;
};

const closeModal = (modal) => {
  if (modal) {
    modal.hidden = true;
  }

  if (modal === duplicatePatientPredictionModal) {
    duplicatePatientPredictionId = "";
    if (duplicatePatientPredictionViewButton) {
      duplicatePatientPredictionViewButton.hidden = true;
    }
  }

  document.body.style.overflow = "";
};

const openModal = (modal) => {
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
};

const getFilteredPatients = () => {
  const query = patientsSearch?.value?.trim().toLowerCase() ?? "";
  const filter = patientsFilter?.value ?? "all";

  return [...patientsRegistry]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .filter((entry) => {
      const sourceLabel = String(entry.source || "").toLowerCase();
      const summary = `${entry.patientName} ${entry.consultationReason} ${entry.savedByName} ${sourceLabel}`.toLowerCase();
      const matchesQuery = !query || summary.includes(query);

      let matchesFilter = true;
      if (filter === "manual") matchesFilter = sourceLabel === "manual";
      else if (filter === "import") matchesFilter = sourceLabel !== "manual";
      else if (filter === "predicted") matchesFilter = Boolean(getPredictionForPatientName(entry.patientName));
      else if (filter === "not-predicted") matchesFilter = !getPredictionForPatientName(entry.patientName);

      return matchesQuery && matchesFilter;
    });
};

const paginatePatients = (items, page = 1, pageSize = PATIENTS_PAGE_SIZE) => {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    currentPage,
    totalPages,
    totalItems: items.length,
    start,
  };
};

const buildPatientsPaginationItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages];
};

const buildPatientsRow = (entry) => {
  const existingPrediction = getPredictionForPatientName(entry.patientName);
  const predictionAction = patientsCanRunPredictions()
    ? existingPrediction
      ? `<button class="mini-btn" type="button" data-view-prediction="${String(existingPrediction._id || existingPrediction.id || "")}">View Prediction</button>`
      : `<button class="mini-btn" type="button" data-run-patient="${entry.id}">Run Prediction</button>`
    : "";

  const sourceClass = entry.source === "Manual" ? "pt-source-manual" : "pt-source-import";
  const hasPrediction = Boolean(existingPrediction);
  const predStatusClass = hasPrediction ? "pt-pred-done" : "pt-pred-pending";
  const predStatusLabel = hasPrediction ? "Predicted" : "Not yet";
  const isPredictionAccount = patientsCanRunPredictions();

  const row = document.createElement("tr");
  row.className = "pt-row";
  row.dataset.predicted = hasPrediction ? "yes" : "no";
  row.innerHTML = `
    <td>
      <div class="patient-meta">
        <strong>${entry.patientName}</strong>
        <span>${entry.id}</span>
      </div>
    </td>
    <td class="pt-cell-muted">${entry.age} yrs / ${entry.sex}</td>
    <td>
      <div class="patient-meta">
        <strong>${entry.consultationReason}</strong>
        <span>${entry.duration ? `${entry.duration} months treatment` : "No duration"}</span>
      </div>
    </td>
    ${isPredictionAccount ? `<td><span class="pt-source-badge ${sourceClass}">${entry.source}</span></td>` : ""}
    ${isPredictionAccount ? `<td><span class="pt-pred-badge ${predStatusClass}">${predStatusLabel}</span></td>` : ""}
    <td class="pt-cell-muted">${formatPredictedByDisplay(entry.savedByName)}</td>
    <td class="pt-cell-muted pt-cell-date">${formatDate(entry.createdAt, true)}</td>
    <td>
      <div class="patients-row-actions">
        <button class="mini-btn" type="button" data-view-patient="${entry.id}">View Clinical Entry</button>
        ${predictionAction}
        <button class="mini-btn mini-btn-danger" type="button" data-delete-patient="${entry.id}">Delete</button>
      </div>
    </td>
  `;
  return row;
};

const renderPatientsPagination = (currentPage, totalPages, totalItems) => {
  if (!patientsPagination) return;

  if (!totalItems) {
    patientsPagination.innerHTML = "";
    return;
  }

  const items = buildPatientsPaginationItems(currentPage, totalPages);
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  patientsPagination.innerHTML = `
    <button
      class="pagination-button pagination-button-nav"
      type="button"
      data-page="${Math.max(currentPage - 1, 1)}"
      aria-label="Go to previous page"
      ${prevDisabled ? "disabled" : ""}
    >
      &#8249;
    </button>
    <div class="pagination-track">
      ${items
        .map((item) => {
          if (item === "ellipsis") {
            return '<span class="pagination-ellipsis" aria-hidden="true">...</span>';
          }

          return `
            <button
              class="pagination-button ${item === currentPage ? "active" : ""}"
              type="button"
              data-page="${item}"
              aria-label="Go to page ${item}"
              ${item === currentPage ? 'aria-current="page"' : ""}
            >
              ${item}
            </button>
          `;
        })
        .join("")}
    </div>
    <button
      class="pagination-button pagination-button-nav"
      type="button"
      data-page="${Math.min(currentPage + 1, totalPages)}"
      aria-label="Go to next page"
      ${nextDisabled ? "disabled" : ""}
    >
      &#8250;
    </button>
  `;

  patientsPagination.querySelectorAll(".pagination-button[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number(button.dataset.page);
      if (!nextPage || nextPage === patientsCurrentPage) return;
      patientsCurrentPage = nextPage;
      renderPatients();
    });
  });
};

const updatePatientsSummary = (pageData, query = "") => {
  if (!patientsPaginationSummary) return;

  if (!pageData.totalItems) {
    patientsPaginationSummary.textContent = query.trim()
      ? "No patients match the current search."
      : "No patient records are available yet.";
    return;
  }

  const start = pageData.start + 1;
  const end = pageData.start + pageData.items.length;
  const noun = query.trim() ? "matching patients" : "patients";
  patientsPaginationSummary.textContent = `Showing ${start} to ${end} of ${pageData.totalItems} ${noun}`;
};

const renderPatients = () => {
  if (!patientsBody) return;

  const query = patientsSearch?.value?.trim() || "";
  const entries = getFilteredPatients();
  const pageData = paginatePatients(entries, patientsCurrentPage, PATIENTS_PAGE_SIZE);
  patientsCurrentPage = pageData.currentPage;
  patientsBody.innerHTML = "";

  pageData.items.forEach((entry) => {
    patientsBody.appendChild(buildPatientsRow(entry));
  });

  if (patientsEmpty) {
    patientsEmpty.hidden = pageData.totalItems > 0;
  }

  updatePatientsSummary(pageData, query);
  renderPatientsPagination(pageData.currentPage, pageData.totalPages, pageData.totalItems);
};

const openPatientDetails = (patientId) => {
  const patient = patientsRegistry.find((entry) => entry.id === patientId);
  if (!patient || !patientDetailsContent) return;

  activePatientId = patientId;

  patientDetailsTitle.textContent = patient.patientName;
  patientDetailsCopy.textContent = `Saved ${formatDate(patient.createdAt, true)} by ${formatPredictedByDisplay(patient.savedByName)}.`;
  patientDetailsContent.innerHTML = buildPatientDetailsMarkup(patient);

  openModal(patientDetailsModal);
};

const openEditPatientModal = (patientId) => {
  const patient = patientsRegistry.find((entry) => entry.id === patientId);
  if (!patient || !addPatientForm) return;

  editingPatientId = patientId;
  resetPatientFormState();
  populatePatientForm(patient);
  syncPatientFormMode();
  closeModal(patientDetailsModal);
  openModal(addPatientModal);
};

const openDeleteModal = (patientId) => {
  const patient = patientsRegistry.find((entry) => entry.id === patientId);
  if (!patient || !deletePatientSummary) return;

  activePatientId = patientId;
  deletePatientSummary.innerHTML = `
    <strong>${patient.patientName}</strong>
    <span>${patient.consultationReason} · ${patient.source} · ${formatDate(patient.createdAt, true)}</span>
  `;
  openModal(deleteModal);
};

const startPredictionFromPatient = async (patientId) => {
  if (!patientsCanRunPredictions()) {
    showPatientsToast("This doctor account can manage patients but cannot run predictions.", "danger");
    return;
  }

  const patient = patientsRegistry.find((entry) => entry.id === patientId);
  if (!patient) return;

  try {
    const existingPrediction = await findPredictionByPatientName(patient.patientName);

    if (existingPrediction) {
      openDuplicatePatientPredictionModal(
        "A manual prediction already exists for this patient. Duplicate predictions are not allowed.",
        existingPrediction._id || existingPrediction.id || ""
      );
      return;
    }
  } catch (error) {
    showPatientsToast(
      error instanceof Error ? error.message : "Unable to verify whether this patient already has a prediction.",
      "danger"
    );
    return;
  }

  try {
    window.sessionStorage.setItem(
      patientPredictionDraftStorageKey,
      JSON.stringify(patient.inputData || {})
    );
  } catch (error) {
    showPatientsToast("Unable to prepare this patient for prediction.", "danger");
    return;
  }

  window.location.href = "new-prediction.html?patientDraft=1";
};

const normalizePredictionAsPatient = (pred = {}) => ({
  id: String(pred._id || pred.id || ""),
  patientName: pred.patientName || pred.patient || "Unknown patient",
  age: Number(pred.age) || 0,
  sex: pred.sex || "Not specified",
  consultationReason: pred.consultationReason || pred.inputData?.consultationReason || "Not specified",
  duration: Number(pred.duration ?? pred.inputData?.duration) || 0,
  source: "Prediction History",
  savedByName: pred.doctorName || pred.savedByName || "Unknown user",
  createdAt: pred.analyzedAt || pred.createdAt || new Date().toISOString(),
  inputData: pred.inputData || {},
});

const hydratePatients = async () => {
  try {
    const entries = await requestPatients();
    patientsRegistry = entries.map((entry) => normalizePatientEntry(entry));

    if (patientsCanRunPredictions()) {
      try { predictionsRegistry = await requestPredictions(); } catch (_) { predictionsRegistry = []; }

      // Merge predictions that don't have a matching patient entry
      const existingNames = new Set(
        patientsRegistry.map((p) => String(p.patientName).trim().toLowerCase())
      );
      predictionsRegistry.forEach((pred) => {
        const name = String(pred.patientName || pred.patient || "").trim().toLowerCase();
        if (name && !existingNames.has(name)) {
          patientsRegistry.push(normalizePredictionAsPatient(pred));
          existingNames.add(name);
        }
      });
    } else {
      predictionsRegistry = [];
    }

    renderPatients();
  } catch (error) {
    showPatientsToast(error instanceof Error ? error.message : "Unable to load patient registry.", "danger");
  }
};

openAddPatientButton?.addEventListener("click", () => {
  editingPatientId = null;
  resetPatientFormState();
  syncPatientFormMode();
  openModal(addPatientModal);
});

addPatientCloseControls.forEach((control) => {
  control.addEventListener("click", () => {
    editingPatientId = null;
    resetPatientFormState();
    syncPatientFormMode();
    closeModal(addPatientModal);
  });
});

duplicatePatientPredictionCloseControls.forEach((control) => {
  control.addEventListener("click", () => {
    closeModal(duplicatePatientPredictionModal);
  });
});

patientDetailsCloseControls.forEach((control) => {
  control.addEventListener("click", () => {
    activePatientId = null;
    closeModal(patientDetailsModal);
  });
});

deletePatientCloseControls.forEach((control) => {
  control.addEventListener("click", () => {
    activePatientId = null;
    closeModal(deleteModal);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeModal(addPatientModal);
  closeModal(patientDetailsModal);
  closeModal(deleteModal);
  closeModal(duplicatePatientPredictionModal);
  activePatientId = null;
});

editPatientButton?.addEventListener("click", () => {
  if (!activePatientId) return;
  openEditPatientModal(activePatientId);
});

duplicatePatientPredictionOkButton?.addEventListener("click", () => {
  closeModal(duplicatePatientPredictionModal);
});

duplicatePatientPredictionViewButton?.addEventListener("click", () => {
  if (!duplicatePatientPredictionId) {
    closeModal(duplicatePatientPredictionModal);
    return;
  }

  const returnTo = `${window.location.pathname.split("/").pop() || "patients.html"}${window.location.search}`;
  const targetId = duplicatePatientPredictionId;
  closeModal(duplicatePatientPredictionModal);
  window.location.href = `prediction-details.html?id=${encodeURIComponent(targetId)}&returnTo=${encodeURIComponent(returnTo)}`;
});

patientsBody?.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view-patient]");
  if (viewButton) {
    openPatientDetails(viewButton.dataset.viewPatient);
    return;
  }

  const viewPredictionButton = event.target.closest("[data-view-prediction]");
  if (viewPredictionButton) {
    const predictionId = String(viewPredictionButton.dataset.viewPrediction || "").trim();
    if (!predictionId) return;
    const returnTo = `${window.location.pathname.split("/").pop() || "patients.html"}${window.location.search}`;
    window.location.href = `prediction-details.html?id=${encodeURIComponent(predictionId)}&returnTo=${encodeURIComponent(returnTo)}`;
    return;
  }

  const runButton = event.target.closest("[data-run-patient]");
  if (runButton) {
    startPredictionFromPatient(runButton.dataset.runPatient);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-patient]");
  if (deleteButton) {
    openDeleteModal(deleteButton.dataset.deletePatient);
  }
});

addPatientForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  addPatientForm.dataset.submitAttempted = "true";

  getPatientValidatableFields().forEach((field) => {
    syncPatientFieldState(field, true);
  });

  updatePatientSubmitState();

  if (!addPatientForm.reportValidity()) return;

  try {
    const payload = serializePatientForm();

    if (editingPatientId) {
      const updated = await updatePatientEntry(editingPatientId, payload);
      patientsRegistry = patientsRegistry.map((entry) =>
        entry.id === editingPatientId ? normalizePatientEntry(updated) : entry
      );
      renderPatients();
      closeModal(addPatientModal);
      editingPatientId = null;
      resetPatientFormState();
      syncPatientFormMode();
      showPatientsToast("Patient clinical entry updated successfully.");
      return;
    }

    const created = await createPatientEntry(payload);
    patientsRegistry.unshift(normalizePatientEntry(created));
    renderPatients();
    closeModal(addPatientModal);
    resetPatientFormState();
    showPatientsToast("Patient clinical entry saved successfully.");
  } catch (error) {
    showPatientsToast(
      error instanceof Error
        ? error.message
        : editingPatientId
          ? "Unable to update patient entry."
          : "Unable to save patient entry.",
      "danger"
    );
  }
});

confirmDeletePatient?.addEventListener("click", async () => {
  if (!activePatientId) return;

  try {
    await deletePatientEntry(activePatientId);
    patientsRegistry = patientsRegistry.filter((entry) => entry.id !== activePatientId);
    renderPatients();
    activePatientId = null;
    closeModal(deleteModal);
    showPatientsToast("Patient deleted successfully.");
  } catch (error) {
    showPatientsToast(error instanceof Error ? error.message : "Unable to delete patient.", "danger");
  }
});

patientsSearch?.addEventListener("input", () => {
  patientsCurrentPage = 1;
  renderPatients();
});
patientsFilter?.addEventListener("change", () => {
  patientsCurrentPage = 1;
  renderPatients();
});

getPatientValidatableFields().forEach((field) => {
  field.addEventListener("input", () => {
    field.dataset.touched = "true";
    syncPatientFieldState(field);
    updatePatientSubmitState();
  });

  field.addEventListener("blur", () => {
    field.dataset.touched = "true";
    syncPatientFieldState(field);
    updatePatientSubmitState();
  });
});

patientToggleInputs.forEach((input) => {
  updatePatientTogglePresentation(input);
  input.addEventListener("change", () => {
    input.dataset.touched = "true";
    updatePatientTogglePresentation(input);
    syncPatientFieldState(input);
    updatePatientSubmitState();
  });
});
initPatientTriStateToggles();

patientRangeInputs.forEach((input) => {
  updatePatientRangePresentation(input);
  input.addEventListener("input", () => {
    input.dataset.touched = "true";
    updatePatientRangePresentation(input);
    syncPatientFieldState(input);
    updatePatientSubmitState();
  });
});
initPatientNotMeasuredOptions();
initPatientManualRangeEditors();

patientChipSelectGroups.forEach(initializePatientChipSelect);
resetPatientFormState();
syncPatientFormMode();

// Hide Source + Prediction columns and filter options for standard accounts
if (!patientsCanRunPredictions()) {
  const ths = document.querySelectorAll(".patients-results-table thead th");
  ths.forEach((th) => {
    const text = th.textContent.trim().toLowerCase();
    if (text === "source" || text === "prediction") th.hidden = true;
  });
  const predFilterOptions = patientsFilter?.querySelectorAll('option[value="predicted"], option[value="not-predicted"], option[value="manual"], option[value="import"]');
  predFilterOptions?.forEach((opt) => opt.remove());
}

hydratePatients();
