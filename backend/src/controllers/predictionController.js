const Prediction = require("../models/Prediction");
const Patient = require("../models/Patient");
const { getPredictionModelCatalog, requestPrediction } = require("../services/aiPredictionService");
const {
  getActivePredictionModel,
  getPredictionModelOptions,
  getPredictionSelectionPolicy,
  setPredictionSelectionPolicy,
  setActivePredictionModel,
} = require("../services/predictionModelService");
const {
  SUPPORTED_POLICIES,
  selectModelByCompleteness,
  resolveSelectionPolicy,
} = require("../services/modelSelectionService");
const {
  computePatientNameBlindIndex,
  encryptPatientPayload,
  encryptPredictionPatientSnapshot,
  decryptPredictionPatientSnapshot,
  mergePredictionForResponse,
} = require("../services/patientDataProtectionService");
const {
  isDoctorUser,
  getDoctorPredictionQuery,
  logCrossDoctorDenied,
} = require("../services/doctorOwnershipService");

const findPatientNameConflict = async (
  patientName,
  currentPredictionId = null,
  currentPatientId = null,
  user = null
) => {
  const blindIndex = computePatientNameBlindIndex(patientName);
  const patientOwnerFilter = isDoctorUser(user) ? { doctorId: user._id } : {};
  const predictionOwnerFilter = isDoctorUser(user) ? { predictedBy: user._id } : {};

  const patientFilter = currentPatientId
    ? { ...patientOwnerFilter, _id: { $ne: currentPatientId }, patientNameBlindIndex: blindIndex }
    : { ...patientOwnerFilter, patientNameBlindIndex: blindIndex };
  const existingPatient = await Patient.findOne(patientFilter).select("_id");

  if (existingPatient) {
    return {
      source: "patients",
      record: existingPatient,
    };
  }

  const predictionFilter = currentPredictionId
    ? { ...predictionOwnerFilter, _id: { $ne: currentPredictionId }, patientNameBlindIndex: blindIndex }
    : { ...predictionOwnerFilter, patientNameBlindIndex: blindIndex };
  const existingPrediction = await Prediction.findOne(predictionFilter).select("_id");

  if (existingPrediction) {
    return {
      source: "predictions",
      record: existingPrediction,
    };
  }

  return null;
};

const getNextPredictionHistoryVersionNumber = (prediction) =>
  (Array.isArray(prediction?.history) ? prediction.history : []).reduce(
    (max, entry) => Math.max(max, Number(entry?.versionNumber) || 0),
    0
  ) + 1;

const buildPredictionHistoryEntry = (predictionSnapshot = {}, versionNumber = 1) => ({
  patientId: predictionSnapshot.patientId || null,
  patientName: "",
  age: 0,
  sex: "",
  consultationReason: "",
  duration: 0,
  source: String(predictionSnapshot.source || "Manual").trim() || "Manual",
  result: predictionSnapshot.result,
  prediction: Number(predictionSnapshot.prediction),
  probability: Number(predictionSnapshot.probability) || 0,
  probabilityScore: Number(predictionSnapshot.probabilityScore) || 0,
  riskLevel: predictionSnapshot.riskLevel || "LOW",
  modelName: predictionSnapshot.modelName || "LogisticRegression",
  selectedModelKey: predictionSnapshot.selectedModelKey || "logistic_regression",
  selectionPolicy: predictionSnapshot.selectionPolicy || "manual",
  completenessScore: Number(predictionSnapshot.completenessScore) || 0,
  completenessBucket: predictionSnapshot.completenessBucket || "",
  selectionReason: predictionSnapshot.selectionReason || "",
  topFactors: Array.isArray(predictionSnapshot.topFactors) ? predictionSnapshot.topFactors : [],
  inputData: {},
  encryptedPatientData:
    predictionSnapshot.encryptedPatientData &&
    typeof predictionSnapshot.encryptedPatientData === "object" &&
    Object.keys(predictionSnapshot.encryptedPatientData).length > 0
      ? predictionSnapshot.encryptedPatientData
      : encryptPredictionPatientSnapshot({
          patientName: predictionSnapshot.patientName || "",
          age: Number(predictionSnapshot.age) || 0,
          sex: String(predictionSnapshot.sex || "").trim(),
          consultationReason: String(predictionSnapshot.consultationReason || "").trim(),
          duration: Number(predictionSnapshot.duration) || 0,
          inputData:
            predictionSnapshot.inputData && typeof predictionSnapshot.inputData === "object"
              ? predictionSnapshot.inputData
              : {},
        }).encryptedPatientData,
  encryptedPatientDataKeyId:
    predictionSnapshot.encryptedPatientDataKeyId ||
    encryptPredictionPatientSnapshot({
      patientName: predictionSnapshot.patientName || "",
      age: Number(predictionSnapshot.age) || 0,
      sex: String(predictionSnapshot.sex || "").trim(),
      consultationReason: String(predictionSnapshot.consultationReason || "").trim(),
      duration: Number(predictionSnapshot.duration) || 0,
      inputData:
        predictionSnapshot.inputData && typeof predictionSnapshot.inputData === "object"
          ? predictionSnapshot.inputData
          : {},
    }).encryptedPatientDataKeyId,
  patientNameBlindIndex:
    predictionSnapshot.patientNameBlindIndex || computePatientNameBlindIndex(predictionSnapshot.patientName || ""),
  predictedBy: predictionSnapshot.predictedBy || null,
  predictedByName: predictionSnapshot.predictedByName || "",
  actualOutcome: predictionSnapshot.actualOutcome || "",
  validationStatus: predictionSnapshot.validationStatus || "Pending",
  validationRecordedAt: predictionSnapshot.validationRecordedAt || null,
  validatedBy: predictionSnapshot.validatedBy || null,
  validatedByName: predictionSnapshot.validatedByName || "",
  versionNumber,
  snapshotCreatedAt: predictionSnapshot.createdAt || null,
  snapshotUpdatedAt: predictionSnapshot.updatedAt || null,
  archivedAt: new Date(),
});

const resolveOrCreatePatient = async ({
  patientId = null,
  patientName = "",
  age = 0,
  sex = "Not specified",
  consultationReason = "",
  duration = 0,
  inputData = {},
  predictedBy = null,
  predictedByName = "",
  user = null,
  createdAt = new Date(),
  updatedAt = null,
} = {}) => {
  const ownerFilter = isDoctorUser(user) ? { doctorId: user._id } : {};
  const ownerId = isDoctorUser(user) ? user._id : predictedBy;

  if (patientId) {
    const byId = await Patient.findOne({ _id: patientId, ...ownerFilter }).select("_id patientName doctorId");
    if (byId) return byId;
    if (isDoctorUser(user)) {
      const error = new Error("Patient not found");
      error.statusCode = 404;
      throw error;
    }
  }

  const normalizedPatientName = String(patientName || "").trim();
  if (!normalizedPatientName) return null;
  const blindIndex = computePatientNameBlindIndex(normalizedPatientName);

  const existingPatient = await Patient.findOne({
    ...ownerFilter,
    patientNameBlindIndex: blindIndex,
  }).select("_id patientName doctorId");

  if (existingPatient) {
    return existingPatient;
  }

  const payload = {
    patientName: normalizedPatientName,
    age: Number(age) || 0,
    sex: String(sex || "Not specified").trim() || "Not specified",
    consultationReason: String(consultationReason || "").trim(),
    duration: Number(duration) || 0,
    inputData: inputData || {},
  };
  const encryptedPayload = encryptPatientPayload(payload);

  const createdPatient = await Patient.create({
    encryptedData: encryptedPayload.encryptedData,
    encryptedDataKeyId: encryptedPayload.encryptedDataKeyId,
    patientNameBlindIndex: encryptedPayload.patientNameBlindIndex,
    consultationReasonCode: encryptedPayload.consultationReasonCode,
    doctorId: ownerId || null,
    source: "Prediction History",
    inputData: {},
    savedBy: predictedBy || null,
    savedByName: predictedByName || "",
    createdAt,
    updatedAt: updatedAt || createdAt,
  });

  return createdPatient;
};

const ensurePatientRegistryEntry = async (prediction) => {
  const plain = decryptPredictionPatientSnapshot(prediction);
  const patientName = String(plain.patientName || "").trim();
  if (!patientName) return;

  const patient = await resolveOrCreatePatient({
    patientId: prediction.patientId || null,
    patientName,
    age: plain.age,
    sex: plain.sex,
    consultationReason: plain.consultationReason,
    duration: plain.duration,
    inputData: plain.inputData || {},
    predictedBy: prediction.predictedBy || null,
    predictedByName: prediction.predictedByName || "",
    createdAt: prediction.createdAt,
    updatedAt: prediction.updatedAt || prediction.createdAt,
  });

  if (patient && (!prediction.patientId || String(prediction.patientId) !== String(patient._id))) {
    prediction.patientId = patient._id;
    await prediction.save();
  }
};

const ensurePredictionAccess = (req, res) => {
  const isStandardDoctor =
    req.user?.role === "doctor" &&
    (req.user?.doctorAccountType || "prediction") === "standard";

  if (!isStandardDoctor) {
    return;
  }

  res.status(403);
  throw new Error("This doctor account can manage patients but cannot run or access prediction workflows.");
};
// charger toutes les prédictions
const findAccessiblePrediction = async (req, predictionId, projection = "") => {
  const query = getDoctorPredictionQuery(req.user, { _id: predictionId });
  const finder = Prediction.findOne(query);
  const prediction = projection ? await finder.select(projection) : await finder;

  if (!prediction && isDoctorUser(req.user)) {
    const existingPrediction = await Prediction.findById(predictionId).select("_id predictedBy").lean();
    if (existingPrediction) {
      await logCrossDoctorDenied({
        req,
        action: "prediction.access.denied",
        targetType: "prediction",
        targetId: existingPrediction._id,
      });
    }
  }

  return prediction;
};

const BIOLOGY_REQUIRED_FIELDS = [
  { key: "tsh", label: "TSH", numeric: true },
  { key: "ft4", label: "FT4", numeric: true },
  { key: "antiTpo", label: "Anti-TPO", numeric: false },
  { key: "antiTpoTotal", label: "Anti-TPO total", numeric: true },
  { key: "antiTg", label: "Anti-Tg", numeric: false },
  { key: "tsi", label: "TSI", numeric: false },
  { key: "tsiLevel", label: "TSI level", numeric: true },
];
const ALLOWED_THERAPIES = new Set(["Carbimazole", "Benzylthiouracile"]);

const getMissingBiologyFields = (payload = {}) =>
  BIOLOGY_REQUIRED_FIELDS.filter(({ key, numeric }) => {
    const value = payload?.[key];

    if (numeric) {
      if (typeof value === "number") {
        return !Number.isFinite(value);
      }

      if (typeof value === "string") {
        const normalized = value.trim();
        if (!normalized) return true;
        if (normalized.toLowerCase() === "not measured") return false;
        return !Number.isFinite(Number(normalized));
      }

      return true;
    }

    return !String(value || "").trim();
  }).map(({ label }) => label);

const ensureRequiredBiologyFields = (payload, res) => {
  const missingFields = getMissingBiologyFields(payload);

  if (missingFields.length) {
    res.status(400);
    throw new Error(`${missingFields.join(", ")} ${missingFields.length === 1 ? "is" : "are"} required.`);
  }
};

const ensureAllowedTherapy = (payload, res) => {
  const therapy = String(payload?.therapy || "").trim();

  if (!therapy) {
    res.status(400);
    throw new Error("Therapy is required.");
  }

  if (!ALLOWED_THERAPIES.has(therapy)) {
    res.status(400);
    throw new Error("Therapy must be either Carbimazole or Benzylthiouracile.");
  }
};

const getPredictions = async (req, res, next) => {
  try {
    ensurePredictionAccess(req, res);
    const predictions = await Prediction.find(getDoctorPredictionQuery(req.user)).sort({ createdAt: -1 });
    res.status(200).json(predictions.map((entry) => mergePredictionForResponse(entry)));
  } catch (error) {
    next(error);
  }
};
// charger une prédiction par id pour ouvrir Prediction Details et afficher ses données
const getPredictionById = async (req, res, next) => {
  try {
    ensurePredictionAccess(req, res);
    const prediction = await findAccessiblePrediction(req, req.params.id);

    if (!prediction) {
      res.status(404);
      throw new Error("Prediction not found");
    }

    res.status(200).json(mergePredictionForResponse(prediction));
  } catch (error) {
    next(error);
  }
};

const getPredictionHistory = async (req, res, next) => {
  try {
    ensurePredictionAccess(req, res);
    const prediction = await findAccessiblePrediction(req, req.params.id);

    if (!prediction) {
      res.status(404);
      throw new Error("Prediction not found");
    }

    const historyEntries = Array.isArray(prediction.history) ? prediction.history : [];
    const currentVersionNumber = getNextPredictionHistoryVersionNumber(prediction);

    const currentPlain = decryptPredictionPatientSnapshot(prediction);
    const items = [
      {
        id: String(prediction._id),
        predictionId: String(prediction._id),
        versionNumber: currentVersionNumber,
        isCurrent: true,
        patientName: currentPlain.patientName,
        age: currentPlain.age,
        sex: currentPlain.sex,
        source: prediction.source,
        result: prediction.result,
        probability: prediction.probability,
        consultationReason: currentPlain.consultationReason,
        predictedByName: prediction.predictedByName || "",
        actualOutcome: prediction.actualOutcome || "",
        validationStatus: prediction.validationStatus || "Pending",
        validationRecordedAt: prediction.validationRecordedAt || null,
        createdAt: prediction.createdAt || null,
        updatedAt: prediction.updatedAt || null,
        recordedAt: prediction.updatedAt || prediction.createdAt || null,
        modelName: prediction.modelName || "",
        inputData: currentPlain.inputData,
      },
      ...historyEntries.map((revision) => ({
        ...(() => {
          const revisionPlain = decryptPredictionPatientSnapshot(revision);
          return {
            patientName: revisionPlain.patientName,
            age: revisionPlain.age,
            sex: revisionPlain.sex,
            consultationReason: revisionPlain.consultationReason,
            inputData: revisionPlain.inputData,
          };
        })(),
        id: String(revision._id),
        predictionId: String(prediction._id),
        versionNumber: Number(revision.versionNumber) || 0,
        isCurrent: false,
        source: revision.source,
        result: revision.result,
        probability: revision.probability,
        predictedByName: revision.predictedByName || "",
        actualOutcome: revision.actualOutcome || "",
        validationStatus: revision.validationStatus || "Pending",
        validationRecordedAt: revision.validationRecordedAt || null,
        createdAt: revision.snapshotCreatedAt || null,
        updatedAt: revision.snapshotUpdatedAt || null,
        recordedAt: revision.archivedAt || revision.snapshotUpdatedAt || revision.snapshotCreatedAt || null,
        modelName: revision.modelName || "",
      })),
    ].sort((left, right) => {
      if (left.isCurrent && !right.isCurrent) return -1;
      if (!left.isCurrent && right.isCurrent) return 1;

      const versionDiff = (Number(right.versionNumber) || 0) - (Number(left.versionNumber) || 0);
      if (versionDiff !== 0) return versionDiff;

      return new Date(right.recordedAt || 0) - new Date(left.recordedAt || 0);
    });

    res.status(200).json({
      predictionId: String(prediction._id),
      patientId: prediction.patientId ? String(prediction.patientId) : "",
      patientName: currentPlain.patientName,
      totalVersions: items.length,
      items,
    });
  } catch (error) {
    next(error);
  }
};

const getPredictionModels = async (req, res, next) => {
  try {
    const activeModel = await getActivePredictionModel();
    const selectionPolicy = await getPredictionSelectionPolicy();
    const catalog = await getPredictionModelCatalog();
    res.status(200).json({
      activeModelKey: activeModel.key,
      activeModelLabel: activeModel.label,
      selectionPolicy,
      options: (catalog?.options || getPredictionModelOptions()).map((option) => ({
        key: option.key,
        label: option.label,
        description: option.description,
        deployed: option.deployed !== false,
      })),
    });
  } catch (error) {
    next(error);
  }
};

const updateActivePredictionModel = async (req, res, next) => {
  try {
    const catalog = await getPredictionModelCatalog();
    const requestedModel = req.body?.modelKey;
    const requestedPolicy = req.body?.selectionPolicy;
    const nextCatalogModel = requestedModel
      ? (catalog?.options || []).find((option) => option.key === requestedModel)
      : null;

    if (nextCatalogModel && nextCatalogModel.deployed === false) {
      res.status(400);
      throw new Error("This prediction model is not deployed on the AI service yet.");
    }

    if (!requestedModel && !requestedPolicy) {
      res.status(400);
      throw new Error("Provide modelKey and/or selectionPolicy.");
    }

    const activeModel = requestedModel
      ? await setActivePredictionModel(requestedModel, req.user)
      : await getActivePredictionModel();
    const selectionPolicy = requestedPolicy
      ? await setPredictionSelectionPolicy(requestedPolicy, req.user)
      : await getPredictionSelectionPolicy();

    res.status(200).json({
      message: `${activeModel.label} is now the active prediction model.`,
      activeModelKey: activeModel.key,
      activeModelLabel: activeModel.label,
      selectionPolicy,
      options: (catalog?.options || getPredictionModelOptions()).map((option) => ({
        key: option.key,
        label: option.label,
        description: option.description,
        deployed: option.key === activeModel.key ? true : option.deployed !== false,
      })),
    });
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(error.status || 400);
    }
    next(error);
  }
};

const ensureDeployedActiveModel = async () => {
  const activeModel = await getActivePredictionModel();
  const catalog = await getPredictionModelCatalog();
  const activeCatalogModel = (catalog?.options || []).find((option) => option.key === activeModel.key);

  if (activeCatalogModel && activeCatalogModel.deployed === false) {
    const error = new Error(`The active prediction model "${activeModel.label}" is not deployed on the AI service.`);
    error.status = 503;
    throw error;
  }

  return activeModel;
};

const resolveRuntimeModelSelection = async (payload = {}, requestedPolicy = "") => {
  const systemPolicy = await getPredictionSelectionPolicy();
  const effectivePolicy = resolveSelectionPolicy(requestedPolicy, systemPolicy);

  if (effectivePolicy === SUPPORTED_POLICIES.AUTO_BY_COMPLETENESS) {
    const autoSelection = selectModelByCompleteness(payload);
    const selectedModel = autoSelection.selectedModel;
    const catalog = await getPredictionModelCatalog();
    const catalogMatch = (catalog?.options || []).find((option) => option.key === selectedModel.key);

    if (catalogMatch && catalogMatch.deployed === false) {
      const fallbackModel = await ensureDeployedActiveModel();
      return {
        selectionPolicy: effectivePolicy,
        selectedModel: fallbackModel,
        completenessScore: autoSelection.completenessScore,
        completenessBucket: autoSelection.completenessBucket,
        selectionReason: `Auto selection fallback: model "${selectedModel.key}" not deployed, used active model "${fallbackModel.key}".`,
      };
    }

    return {
      selectionPolicy: effectivePolicy,
      selectedModel,
      completenessScore: autoSelection.completenessScore,
      completenessBucket: autoSelection.completenessBucket,
      selectionReason: autoSelection.selectionReason,
    };
  }

  const activeModel = await ensureDeployedActiveModel();
  return {
    selectionPolicy: SUPPORTED_POLICIES.MANUAL,
    selectedModel: activeModel,
    completenessScore: null,
    completenessBucket: "manual",
    selectionReason: `Manual policy: active model "${activeModel.key}" used.`,
  };
};

const createPrediction = async (req, res, next) => {
  try {
    ensurePredictionAccess(req, res);
    const patientName = String(req.body?.name || "").trim();
    const consultationReason = String(req.body?.consultationReason || "").trim();
    const age = Number(req.body?.age);
    const sex = String(req.body?.sex || "").trim();
    const source = String(req.body?.source || "Manual").trim() || "Manual";

    if (!patientName || !Number.isFinite(age) || !consultationReason || !sex) {
      res.status(400);
      throw new Error("Name, age, sex, and consultation reason are required.");
    }

    ensureRequiredBiologyFields(req.body, res);
    ensureAllowedTherapy(req.body, res);

    const patient = await resolveOrCreatePatient({
      patientId: req.body?.patientId || null,
      patientName,
      age,
      sex,
      consultationReason,
      duration: req.body?.duration,
      inputData: req.body,
      predictedBy: req.user?._id || null,
      predictedByName: req.user?.name || req.user?.email || "",
      user: req.user,
    });

    const runtimeSelection = await resolveRuntimeModelSelection(req.body, req.body?.selectionPolicy);
    const selectedModel = runtimeSelection.selectedModel;
    const aiResult = await requestPrediction(req.body, {
      modelKey: selectedModel.key,
      modelLabel: selectedModel.label,
    });
    // pour vérifier les doublons
    const existingPrediction = await Prediction.findOne({
      ...getDoctorPredictionQuery(req.user),
      source,
      $or: [
        ...(patient?._id ? [{ patientId: patient._id }] : []),
        { patientNameBlindIndex: computePatientNameBlindIndex(patientName) },
      ],
    }).select("_id patientName age createdAt result probability patientId");

    const encryptedSnapshot = encryptPredictionPatientSnapshot({
      patientName,
      age,
      sex,
      consultationReason,
      duration: Number(req.body?.duration) || 0,
      inputData: req.body || {},
    });

    if (existingPrediction) {
      return res.status(409).json({
        message:
          source === "Data Import"
            ? "A prediction already exists for this imported patient. Duplicate predictions are not allowed."
            : "A manual prediction already exists for this patient. Duplicate predictions are not allowed.",
        existingPredictionId: String(existingPrediction._id),
      });
    }

    const prediction = await Prediction.create({
      patientId: patient?._id || null,
      patientName: "",
      age: 0,
      sex: "",
      consultationReason: "",
      duration: 0,
      patientNameBlindIndex: encryptedSnapshot.patientNameBlindIndex,
      encryptedPatientData: encryptedSnapshot.encryptedPatientData,
      encryptedPatientDataKeyId: encryptedSnapshot.encryptedPatientDataKeyId,
      source,
      result: aiResult.result,
      prediction: aiResult.prediction,
      probability: aiResult.probabilityPercent,
      probabilityScore: aiResult.probabilityScore,
      riskLevel: aiResult.riskLevel,
      modelName: aiResult.modelName || selectedModel.label,
      selectedModelKey: selectedModel.key,
      selectionPolicy: runtimeSelection.selectionPolicy,
      completenessScore:
        typeof runtimeSelection.completenessScore === "number" ? runtimeSelection.completenessScore : undefined,
      completenessBucket: runtimeSelection.completenessBucket,
      selectionReason: runtimeSelection.selectionReason,
      topFactors: aiResult.topFactors,
      inputData: {},
      predictedBy: req.user?._id || null,
      predictedByName: req.user?.name || req.user?.email || "",
    });

    await ensurePatientRegistryEntry(prediction);

    res.status(201).json({
      message: "Prediction created successfully.",
      prediction: mergePredictionForResponse(prediction),
      displayResult: {
        patientName,
        consultationReason,
        duration: Number(req.body?.duration) || 0,
        probability: aiResult.probabilityPercent,
        relapse: aiResult.prediction === 1,
        contributions: aiResult.displayFactors,
      },
      modelSelection: {
        selectionPolicy: runtimeSelection.selectionPolicy,
        selectedModelKey: selectedModel.key,
        selectedModelLabel: selectedModel.label,
        completenessScore: runtimeSelection.completenessScore,
        completenessBucket: runtimeSelection.completenessBucket,
        selectionReason: runtimeSelection.selectionReason,
      },
    });
  } catch (error) {
    if (!res.statusCode || res.statusCode === 200) {
      res.status(error.status || error.statusCode || 400);
    }
    next(error);
  }
};

const updatePrediction = async (req, res, next) => {
  try {
    ensurePredictionAccess(req, res);
    const prediction = await findAccessiblePrediction(req, req.params.id);

    if (!prediction) {
      res.status(404);
      throw new Error("Prediction not found");
    }

    const updates = { ...req.body };

    if (updates.rerunPrediction) {
      const previousPredictionSnapshot =
        typeof prediction.toObject === "function" ? prediction.toObject() : { ...prediction };
      const currentPlain = decryptPredictionPatientSnapshot(prediction);
      const patientName = String(updates.name || currentPlain.patientName || "").trim();
      const consultationReason = String(updates.consultationReason || currentPlain.consultationReason || "").trim();
      const age = Number(updates.age);
      const sex = String(updates.sex || currentPlain.sex || "").trim();
      const source = String(updates.source || prediction.source || "Manual").trim() || "Manual";

      if (!patientName || !Number.isFinite(age) || !consultationReason || !sex) {
        res.status(400);
        throw new Error("Name, age, sex, and consultation reason are required.");
      }

      ensureRequiredBiologyFields(updates, res);
      ensureAllowedTherapy(updates, res);

      const linkedPatient = prediction.patientId
        ? await Patient.findOne(
            isDoctorUser(req.user)
              ? { _id: prediction.patientId, doctorId: req.user._id }
              : { _id: prediction.patientId }
          )
        : null;
      if (prediction.patientId && isDoctorUser(req.user) && !linkedPatient) {
        await logCrossDoctorDenied({
          req,
          action: "prediction.patient_link.denied",
          targetType: "patient",
          targetId: prediction.patientId,
          metadata: {
            predictionId: String(prediction._id),
          },
        });
        res.status(404);
        throw new Error("Prediction not found");
      }
      const nameConflict = await findPatientNameConflict(
        patientName,
        prediction._id,
        linkedPatient?._id || null,
        req.user
      );

      if (nameConflict) {
        res.status(409);
        throw new Error(
          nameConflict.source === "predictions"
            ? "A prediction already exists for this patient name. Please choose a different patient name."
            : "A patient with this name already exists in the registry. Please choose a different patient name."
        );
      }

      let patient = linkedPatient;

      if (patient) {
        const encryptedPayload = encryptPatientPayload({
          patientName,
          age,
          sex,
          consultationReason,
          duration: Number(updates.duration) || 0,
          inputData: updates || {},
        });
        patient.encryptedData = encryptedPayload.encryptedData;
        patient.encryptedDataKeyId = encryptedPayload.encryptedDataKeyId;
        patient.patientNameBlindIndex = encryptedPayload.patientNameBlindIndex;
        patient.consultationReasonCode = encryptedPayload.consultationReasonCode;
        patient.inputData = {};
        patient.savedBy = req.user?._id || patient.savedBy || null;
        patient.savedByName = req.user?.name || req.user?.email || patient.savedByName || "";
        await patient.save();
      } else {
        patient = await resolveOrCreatePatient({
          patientId: updates.patientId || null,
          patientName,
          age,
          sex,
          consultationReason,
          duration: updates.duration,
          inputData: updates,
          predictedBy: req.user?._id || prediction.predictedBy || null,
          predictedByName: req.user?.name || req.user?.email || prediction.predictedByName || "",
          user: req.user,
        });
      }

      const runtimeSelection = await resolveRuntimeModelSelection(updates, updates?.selectionPolicy);
      const selectedModel = runtimeSelection.selectedModel;
      const aiResult = await requestPrediction(updates, {
        modelKey: selectedModel.key,
        modelLabel: selectedModel.label,
      });

      prediction.history = Array.isArray(prediction.history) ? prediction.history : [];
      prediction.history.push(
        buildPredictionHistoryEntry(
          previousPredictionSnapshot,
          getNextPredictionHistoryVersionNumber(prediction)
        )
      );

      prediction.patientName = "";
      prediction.patientId = patient?._id || prediction.patientId || null;
      prediction.age = 0;
      prediction.sex = "";
      prediction.consultationReason = "";
      prediction.duration = 0;
      const encryptedSnapshot = encryptPredictionPatientSnapshot({
        patientName,
        age,
        sex,
        consultationReason,
        duration: Number(updates.duration) || 0,
        inputData: updates || {},
      });
      prediction.patientNameBlindIndex = encryptedSnapshot.patientNameBlindIndex;
      prediction.encryptedPatientData = encryptedSnapshot.encryptedPatientData;
      prediction.encryptedPatientDataKeyId = encryptedSnapshot.encryptedPatientDataKeyId;
      prediction.source = source;
      prediction.result = aiResult.result;
      prediction.prediction = aiResult.prediction;
      prediction.probability = aiResult.probabilityPercent;
      prediction.probabilityScore = aiResult.probabilityScore;
      prediction.riskLevel = aiResult.riskLevel;
      prediction.modelName = aiResult.modelName || selectedModel.label;
      prediction.selectedModelKey = selectedModel.key;
      prediction.selectionPolicy = runtimeSelection.selectionPolicy;
      if (typeof runtimeSelection.completenessScore === "number") {
        prediction.completenessScore = runtimeSelection.completenessScore;
      }
      prediction.completenessBucket = runtimeSelection.completenessBucket;
      prediction.selectionReason = runtimeSelection.selectionReason;
      prediction.topFactors = aiResult.topFactors;
      prediction.inputData = {};
      prediction.predictedBy = req.user?._id || prediction.predictedBy || null;
      prediction.predictedByName = req.user?.name || req.user?.email || prediction.predictedByName || "";

      if (prediction.actualOutcome) {
        prediction.validationStatus = prediction.actualOutcome === prediction.result ? "Correct" : "Incorrect";
      } else {
        prediction.validationStatus = "Pending";
      }

      await prediction.save();
      await ensurePatientRegistryEntry(prediction);
      return res.status(200).json(mergePredictionForResponse(prediction));
    }

    delete updates.rerunPrediction;

    if (Object.prototype.hasOwnProperty.call(updates, "actualOutcome")) {
      const actualOutcome = String(updates.actualOutcome || "").trim();

      if (actualOutcome && !["Relapse", "No Relapse"].includes(actualOutcome)) {
        res.status(400);
        throw new Error("Actual outcome must be either Relapse or No Relapse.");
      }

      prediction.actualOutcome = actualOutcome;

      if (!actualOutcome) {
        prediction.validationStatus = "Pending";
        prediction.validationRecordedAt = null;
        prediction.validatedBy = null;
        prediction.validatedByName = "";
      } else {
        prediction.validationStatus = actualOutcome === prediction.result ? "Correct" : "Incorrect";
        prediction.validationRecordedAt = new Date();
        prediction.validatedBy = req.user?._id || null;
        prediction.validatedByName = req.user?.name || req.user?.email || "";
      }

      delete updates.actualOutcome;
    }

    [
      "patientId",
      "predictedBy",
      "predictedByName",
      "validatedBy",
      "validatedByName",
      "patientName",
      "name",
      "age",
      "sex",
      "consultationReason",
      "duration",
      "inputData",
      "encryptedPatientData",
      "encryptedPatientDataKeyId",
      "patientNameBlindIndex",
      "history",
      "source",
      "result",
      "prediction",
      "probability",
      "probabilityScore",
      "riskLevel",
      "modelName",
      "selectedModelKey",
      "selectionPolicy",
      "completenessScore",
      "completenessBucket",
      "selectionReason",
      "topFactors",
      "createdAt",
      "updatedAt",
    ].forEach((field) => {
      delete updates[field];
    });

    Object.assign(prediction, updates);
    await prediction.save();

    res.status(200).json(mergePredictionForResponse(prediction));
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(error.status || error.statusCode || 400);
    }
    next(error);
  }
};

const deletePrediction = async (req, res, next) => {
  try {
    //  pour supprimer une prédiction
    ensurePredictionAccess(req, res);
    const prediction = await findAccessiblePrediction(req, req.params.id, "_id");

    if (!prediction) {
      res.status(404);
      throw new Error("Prediction not found");
    }

    await Prediction.deleteOne({ _id: prediction._id });

    res.status(200).json({ message: "Prediction deleted successfully" });
  } catch (error) {
    next(error);
  }
};

const deletePredictionHistoryEntry = async (req, res, next) => {
  try {
    ensurePredictionAccess(req, res);
    const prediction = await findAccessiblePrediction(req, req.params.id, "_id history");

    if (!prediction) {
      res.status(404);
      throw new Error("Prediction not found");
    }

    const initialHistoryLength = Array.isArray(prediction.history) ? prediction.history.length : 0;
    prediction.history = (prediction.history || []).filter(
      (entry) => String(entry._id) !== String(req.params.historyId)
    );

    if (prediction.history.length === initialHistoryLength) {
      res.status(404);
      throw new Error("Prediction history entry not found");
    }

    await prediction.save();
    res.status(200).json({ message: "Prediction history entry deleted successfully." });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPredictions,
  getPredictionById,
  getPredictionHistory,
  getPredictionModels,
  updateActivePredictionModel,
  createPrediction,
  updatePrediction,
  deletePrediction,
  deletePredictionHistoryEntry,
};
