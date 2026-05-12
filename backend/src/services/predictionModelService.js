const SystemPreference = require("../models/SystemPreference");
const {
  DEFAULT_PREDICTION_MODEL_KEY,
  getPredictionModels,
  findPredictionModel,
  getDefaultPredictionModel,
} = require("../config/predictionModels");

const ACTIVE_PREDICTION_MODEL_KEY = "activePredictionModel";
const PREDICTION_SELECTION_POLICY_KEY = "predictionSelectionPolicy";
const DEFAULT_SELECTION_POLICY = "manual";

const getPredictionModelOptions = () =>
  getPredictionModels().map(({ key, label, description }) => ({
    key,
    label,
    description,
  }));

const getActivePredictionModel = async () => {
  const defaultModel = getDefaultPredictionModel();
  // pour récupérer le modèle actif
  const preference = await SystemPreference.findOne({ key: ACTIVE_PREDICTION_MODEL_KEY }).lean();
  const resolvedModel = findPredictionModel(preference?.value);

  return resolvedModel || defaultModel;
};

const getPredictionSelectionPolicy = async () => {
  const preference = await SystemPreference.findOne({ key: PREDICTION_SELECTION_POLICY_KEY }).lean();
  const value = String(preference?.value || "").trim().toLowerCase();

  if (value === "auto_by_completeness") {
    return "auto_by_completeness";
  }

  return DEFAULT_SELECTION_POLICY;
};

const setPredictionSelectionPolicy = async (policyValue, user = null) => {
  const normalized = String(policyValue || "").trim().toLowerCase();
  const nextPolicy = normalized === "auto_by_completeness" ? "auto_by_completeness" : "manual";

  await SystemPreference.findOneAndUpdate(
    { key: PREDICTION_SELECTION_POLICY_KEY },
    {
      key: PREDICTION_SELECTION_POLICY_KEY,
      value: nextPolicy,
      updatedBy: user?._id || null,
      updatedByName: user?.name || user?.email || "",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return nextPolicy;
};

const setActivePredictionModel = async (modelValue, user = null) => {
  const nextModel = findPredictionModel(modelValue);

  if (!nextModel) {
    const error = new Error("Unsupported prediction model.");
    error.status = 400;
    throw error;
  }
  // pour changer le modèle actif
  await SystemPreference.findOneAndUpdate(
    { key: ACTIVE_PREDICTION_MODEL_KEY },
    {
      key: ACTIVE_PREDICTION_MODEL_KEY,
      value: nextModel.key,
      updatedBy: user?._id || null,
      updatedByName: user?.name || user?.email || "",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return nextModel;
};

module.exports = {
  ACTIVE_PREDICTION_MODEL_KEY,
  PREDICTION_SELECTION_POLICY_KEY,
  DEFAULT_SELECTION_POLICY,
  getPredictionModelOptions,
  getActivePredictionModel,
  getPredictionSelectionPolicy,
  setPredictionSelectionPolicy,
  setActivePredictionModel,
  DEFAULT_PREDICTION_MODEL_KEY,
};
