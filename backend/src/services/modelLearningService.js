const ValidatedPredictionCase = require("../models/ValidatedPredictionCase");
const ModelTrainingRun = require("../models/ModelTrainingRun");
const ModelBenchmarkResult = require("../models/ModelBenchmarkResult");
const {
  buildFlaskPayload,
  requestModelRetraining,
  requestModelVersionActivation,
} = require("./aiPredictionService");
const {
  getActivePredictionModel,
  setActivePredictionModel,
} = require("./predictionModelService");
const { decryptPredictionPatientSnapshot } = require("./patientDataProtectionService");
const { findPredictionModel } = require("../config/predictionModels");

const AUTO_RETRAIN_THRESHOLD = 10;
const MODEL_KEYS = ["logistic_regression", "random_forest", "deep_neural_network"];
let autoRetrainingInFlight = false;

const stripSensitiveFeatureFields = (inputData = {}) => {
  const clone = inputData && typeof inputData === "object" ? { ...inputData } : {};
  [
    "name",
    "patientName",
    "fullName",
    "patient",
    "patientId",
    "_id",
    "id",
    "doctorName",
    "predictedByName",
    "validatedByName",
  ].forEach((field) => {
    delete clone[field];
  });
  return clone;
};

const resultToTarget = (value = "") => (String(value).trim() === "Relapse" ? 1 : 0);

const metric = (result, name) => {
  const value = Number(result?.metrics?.[name]);
  return Number.isFinite(value) ? value : null;
};

const compareCandidateResults = (left, right) => {
  if (!left) return right;
  if (!right) return left;

  const order = [
    "f1Score",
    "recall",
    "balancedAccuracy",
    "f1PerJoule",
  ];

  for (const key of order) {
    const leftValue = metric(left, key) ?? -Infinity;
    const rightValue = metric(right, key) ?? -Infinity;
    if (rightValue > leftValue) return right;
    if (rightValue < leftValue) return left;
  }

  return left;
};

const chooseWinner = (results = [], versionType = "new") =>
  results
    .filter((entry) => entry.versionType === versionType && entry.status === "available")
    .reduce((winner, entry) => compareCandidateResults(winner, entry), null);

const shouldActivateWinner = (oldWinner, newWinner) => {
  if (!oldWinner || !newWinner) {
    return {
      activate: false,
      reason: "Unable to compare old and new winners.",
    };
  }

  const oldF1 = metric(oldWinner, "f1Score") ?? 0;
  const newF1 = metric(newWinner, "f1Score") ?? 0;
  const oldRecall = metric(oldWinner, "recall") ?? 0;
  const newRecall = metric(newWinner, "recall") ?? 0;
  const oldBalancedAccuracy = metric(oldWinner, "balancedAccuracy") ?? 0;
  const newBalancedAccuracy = metric(newWinner, "balancedAccuracy") ?? 0;
  const oldLogLoss = metric(oldWinner, "logLoss");
  const newLogLoss = metric(newWinner, "logLoss");

  if (newF1 < oldF1 + 0.03) {
    return {
      activate: false,
      reason: `Rejected: F1 improvement is ${(newF1 - oldF1).toFixed(4)}, below required +0.0300.`,
    };
  }

  if (newRecall < oldRecall) {
    return {
      activate: false,
      reason: `Rejected: recall decreased from ${oldRecall.toFixed(4)} to ${newRecall.toFixed(4)}.`,
    };
  }

  if (newBalancedAccuracy < oldBalancedAccuracy) {
    return {
      activate: false,
      reason: `Rejected: balanced accuracy decreased from ${oldBalancedAccuracy.toFixed(4)} to ${newBalancedAccuracy.toFixed(4)}.`,
    };
  }

  if (oldLogLoss !== null && newLogLoss !== null && newLogLoss > oldLogLoss) {
    return {
      activate: false,
      reason: `Rejected: log loss increased from ${oldLogLoss.toFixed(4)} to ${newLogLoss.toFixed(4)}.`,
    };
  }

  return {
    activate: true,
    reason: `Activated: ${newWinner.modelLabel || newWinner.modelKey} improved F1 by ${(newF1 - oldF1).toFixed(4)} with recall stable.`,
  };
};

const TRAINING_CASE_FILTER = {
  validationStatus: "Correct",
};

const countPendingValidatedCases = () =>
  ValidatedPredictionCase.countDocuments({ ...TRAINING_CASE_FILTER, usedInTrainingRunId: null });

const getPendingOutcomeCounts = async () => {
  const classCounts = await ValidatedPredictionCase.aggregate([
    { $match: { ...TRAINING_CASE_FILTER, usedInTrainingRunId: null } },
    { $group: { _id: "$actualOutcome", count: { $sum: 1 } } },
  ]);

  return classCounts.reduce((accumulator, entry) => {
    accumulator[entry._id] = entry.count;
    return accumulator;
  }, {});
};

const isReadyForRetraining = (count) => count >= AUTO_RETRAIN_THRESHOLD;

const selectPendingTrainingCases = () =>
  ValidatedPredictionCase.find({
    ...TRAINING_CASE_FILTER,
    usedInTrainingRunId: null,
  })
    .sort({ validatedAt: 1 })
    .limit(AUTO_RETRAIN_THRESHOLD)
    .lean();

const getLearningSummary = async () => {
  const [totalRealValidatedCases, newValidatedCases, lastRun, activeModel] = await Promise.all([
    ValidatedPredictionCase.countDocuments(TRAINING_CASE_FILTER),
    countPendingValidatedCases(),
    ModelTrainingRun.findOne().sort({ createdAt: -1 }).lean(),
    getActivePredictionModel(),
  ]);

  const pendingByOutcome = await getPendingOutcomeCounts();

  return {
    threshold: AUTO_RETRAIN_THRESHOLD,
    totalRealValidatedCases,
    newValidatedCases,
    readyForRetraining: isReadyForRetraining(newValidatedCases),
    pendingByOutcome,
    activeModel,
    lastRun,
  };
};

const buildRealCasePayload = (validatedCase) => ({
  id: String(validatedCase._id),
  predictionId: String(validatedCase.predictionId),
  target: resultToTarget(validatedCase.actualOutcome),
  actualOutcome: validatedCase.actualOutcome,
  features: buildFlaskPayload(validatedCase.featuresSnapshot || {}),
});

const createBenchmarkRecords = async (run, results = [], oldWinner = null, newWinner = null) => {
  await ModelBenchmarkResult.deleteMany({ runId: run._id });

  const documents = results
    .filter((entry) => MODEL_KEYS.includes(entry.modelKey) && ["old", "new"].includes(entry.versionType))
    .map((entry) => ({
      runId: run._id,
      modelKey: entry.modelKey,
      modelLabel: entry.modelLabel || findPredictionModel(entry.modelKey)?.label || entry.modelKey,
      versionType: entry.versionType,
      status: entry.status || "available",
      metrics: entry.metrics || {},
      artifactPaths: entry.artifactPaths || {},
      isWinner:
        (oldWinner && entry.versionType === "old" && entry.modelKey === oldWinner.modelKey) ||
        (newWinner && entry.versionType === "new" && entry.modelKey === newWinner.modelKey),
    }));

  if (documents.length) {
    await ModelBenchmarkResult.insertMany(documents);
  }
};

const runRetraining = async ({ trigger = "manual_admin", user = null } = {}) => {
  const pendingCases = await selectPendingTrainingCases();
  const activeModel = await getActivePredictionModel();

  const run = await ModelTrainingRun.create({
    status: "queued",
    trigger,
    previousActiveModelKey: activeModel.key,
    previousActiveModelLabel: activeModel.label,
    newValidatedRows: pendingCases.length,
    requestedBy: user?._id || null,
    requestedByName: user?.name || user?.email || "",
  });

  if (pendingCases.length < AUTO_RETRAIN_THRESHOLD) {
    run.status = "rejected";
    run.rejectionReason = `Need ${AUTO_RETRAIN_THRESHOLD} new correct validated cases before retraining.`;
    run.finishedAt = new Date();
    await run.save();
    return run;
  }

  run.status = "running";
  run.startedAt = new Date();
  await run.save();

  try {
    const allCases = await ValidatedPredictionCase.find(TRAINING_CASE_FILTER).sort({ validatedAt: 1 }).lean();
    const retrainingResult = await requestModelRetraining({
      runId: String(run._id),
      activeModelKey: activeModel.key,
      realCases: allCases.map(buildRealCasePayload),
    });

    const results = Array.isArray(retrainingResult?.results) ? retrainingResult.results : [];
    const oldWinner = chooseWinner(results, "old");
    const newWinner = chooseWinner(results, "new");
    const activationDecision = shouldActivateWinner(oldWinner, newWinner);

    await createBenchmarkRecords(run, results, oldWinner, newWinner);

    run.syntheticRows = Number(retrainingResult?.syntheticRows) || 0;
    run.realValidatedRows = allCases.length;
    run.candidateVersion = String(retrainingResult?.candidateVersion || run._id);
    run.oldWinnerModelKey = oldWinner?.modelKey || "";
    run.newWinnerModelKey = newWinner?.modelKey || "";
    run.metricsSummary = {
      oldWinner: oldWinner || null,
      newWinner: newWinner || null,
      activationDecision,
    };

    if (activationDecision.activate) {
      const activation = await requestModelVersionActivation({
        runId: String(run._id),
        modelKey: newWinner.modelKey,
      });
      const activatedModel = await setActivePredictionModel(newWinner.modelKey, user);
      run.status = "activated";
      run.newActiveModelKey = activatedModel.key;
      run.newActiveModelLabel = activatedModel.label;
      run.winnerReason = activationDecision.reason;
      run.activatedArtifactPaths = activation?.artifactPaths || {};
    } else {
      run.status = "rejected";
      run.rejectionReason = activationDecision.reason;
      run.winnerReason = activationDecision.reason;
    }

    run.finishedAt = new Date();
    await run.save();

    await ValidatedPredictionCase.updateMany(
      { _id: { $in: pendingCases.map((entry) => entry._id) } },
      { $set: { usedInTrainingRunId: run._id } }
    );

    return run;
  } catch (error) {
    run.status = "failed";
    run.rejectionReason = error.message;
    run.finishedAt = new Date();
    await run.save();
    return run;
  }
};

const maybeTriggerAutoRetraining = async () => {
  if (autoRetrainingInFlight) return null;
  const pendingCount = await countPendingValidatedCases();
  if (pendingCount < AUTO_RETRAIN_THRESHOLD) return null;

  autoRetrainingInFlight = true;
  try {
    return await runRetraining({ trigger: "auto_10_validated_cases" });
  } finally {
    autoRetrainingInFlight = false;
  }
};

const scheduleAutoRetraining = () => {
  setImmediate(() => {
    maybeTriggerAutoRetraining().catch((error) => {
      console.error("[model-learning] auto retraining failed:", error.message);
    });
  });
};

const upsertValidatedCaseFromPrediction = async (prediction, user = null, options = {}) => {
  if (!prediction) return null;

  const actualOutcome = String(prediction.actualOutcome || "").trim();
  if (!actualOutcome) {
    await ValidatedPredictionCase.deleteOne({ predictionId: prediction._id });
    return null;
  }

  const plain = decryptPredictionPatientSnapshot(prediction);
  const featuresSnapshot = stripSensitiveFeatureFields(plain.inputData || {});
  const selectedModel = findPredictionModel(prediction.selectedModelKey || prediction.modelName);
  const validationStatus = actualOutcome === prediction.result ? "Correct" : "Incorrect";

  const existingCase = await ValidatedPredictionCase.findOne({ predictionId: prediction._id }).lean();
  const shouldResetTrainingUsage =
    !existingCase ||
    existingCase.actualOutcome !== actualOutcome ||
    existingCase.predictedResult !== prediction.result;

  const validatedCase = await ValidatedPredictionCase.findOneAndUpdate(
    { predictionId: prediction._id },
    {
      predictionId: prediction._id,
      doctorId: prediction.predictedBy || null,
      doctorName: prediction.predictedByName || "",
      modelKey: selectedModel?.key || prediction.selectedModelKey || "logistic_regression",
      modelName: selectedModel?.label || prediction.modelName || "",
      predictedResult: prediction.result,
      actualOutcome,
      validationStatus,
      featuresSnapshot,
      source: prediction.source || "Manual",
      sourcePredictionCreatedAt: prediction.createdAt || null,
      validatedAt: prediction.validationRecordedAt || new Date(),
      usedInTrainingRunId: shouldResetTrainingUsage ? null : existingCase.usedInTrainingRunId || null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (options.autoTrigger !== false) {
    scheduleAutoRetraining();
  }

  return validatedCase;
};

const listTrainingRuns = async () =>
  ModelTrainingRun.find().sort({ createdAt: -1 }).limit(25).lean();

const getTrainingRunDetails = async (runId) => {
  const [run, results] = await Promise.all([
    ModelTrainingRun.findById(runId).lean(),
    ModelBenchmarkResult.find({ runId }).sort({ modelKey: 1, versionType: 1 }).lean(),
  ]);

  if (!run) {
    const error = new Error("Training run not found");
    error.statusCode = 404;
    throw error;
  }

  return { run, results };
};

const activateTrainingRunModel = async ({ runId, modelKey, user }) => {
  const run = await ModelTrainingRun.findById(runId);
  if (!run) {
    const error = new Error("Training run not found");
    error.statusCode = 404;
    throw error;
  }

  const model = findPredictionModel(modelKey || run.newWinnerModelKey);
  if (!model) {
    const error = new Error("Unsupported model for activation.");
    error.statusCode = 400;
    throw error;
  }

  const activation = await requestModelVersionActivation({ runId: String(run._id), modelKey: model.key });
  await setActivePredictionModel(model.key, user);
  run.status = "activated";
  run.newActiveModelKey = model.key;
  run.newActiveModelLabel = model.label;
  run.winnerReason = `Manually activated ${model.label}.`;
  run.activatedArtifactPaths = activation?.artifactPaths || {};
  run.finishedAt = run.finishedAt || new Date();
  await run.save();
  return run;
};

const rollbackTrainingRun = async ({ runId, user }) => {
  const run = await ModelTrainingRun.findById(runId);
  if (!run) {
    const error = new Error("Training run not found");
    error.statusCode = 404;
    throw error;
  }

  const previousModel = findPredictionModel(run.previousActiveModelKey);
  if (!previousModel) {
    const error = new Error("Previous active model is unavailable for rollback.");
    error.statusCode = 400;
    throw error;
  }

  await setActivePredictionModel(previousModel.key, user);
  run.status = "succeeded";
  run.winnerReason = `Rolled back active model to ${previousModel.label}.`;
  await run.save();
  return run;
};

module.exports = {
  AUTO_RETRAIN_THRESHOLD,
  getLearningSummary,
  listTrainingRuns,
  getTrainingRunDetails,
  runRetraining,
  activateTrainingRunModel,
  rollbackTrainingRun,
  upsertValidatedCaseFromPrediction,
};
