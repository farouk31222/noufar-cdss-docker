const autoSelectionConfig = require("../config/autoModelSelection.config.json");
const { findPredictionModel, getDefaultPredictionModel } = require("../config/predictionModels");

const SUPPORTED_POLICIES = {
  MANUAL: "manual",
  AUTO_BY_COMPLETENESS: "auto_by_completeness",
};

const normalizePolicy = (value) => String(value || "").trim().toLowerCase();

const normalizeText = (value) => String(value ?? "").trim();
const normalizeComparable = (value) => normalizeText(value).toLowerCase();
const POSITIVE_NEGATIVE_VALUES = new Set(["positive", "negative"]);
const YES_NO_VALUES = new Set(["yes", "no"]);

const isFilledValue = (key, value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "boolean") return true;
  if (typeof value === "string") {
    const trimmed = normalizeText(value);
    if (!trimmed.length) return false;
    const normalized = normalizeComparable(trimmed);

    // Explicit clinical answers are valid signal even if they match UI defaults.
    if (YES_NO_VALUES.has(normalized) || POSITIVE_NEGATIVE_VALUES.has(normalized)) {
      return true;
    }

    if (normalized === "not specified") return false;
    if (normalized === "not measured") return false;

    // Numeric strings are considered filled when they are valid numbers.
    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue)) {
      return true;
    }

    return true;
  }
  return true;
};

const toScore = (filledCount, totalCount) => {
  if (!totalCount) return 0;
  const ratio = filledCount / totalCount;
  return Math.max(0, Math.min(1, Number(ratio.toFixed(4))));
};

const resolveCompletenessBucket = (score, buckets = []) =>
  buckets.find((bucket) => score < Number(bucket.maxScoreExclusive)) || buckets[buckets.length - 1] || null;

const evaluateCompleteness = (formData = {}) => {
  const featureKeys = Array.isArray(autoSelectionConfig.featureKeys) ? autoSelectionConfig.featureKeys : [];
  const totalFeatures = featureKeys.length;

  const filledFeatures = featureKeys.filter((key) => isFilledValue(key, formData[key]));
  const score = toScore(filledFeatures.length, totalFeatures);
  const bucket = resolveCompletenessBucket(score, autoSelectionConfig.buckets || []);

  return {
    score,
    totalFeatures,
    filledFeaturesCount: filledFeatures.length,
    bucketName: bucket?.name || "unknown",
    selectedModelKey: String(bucket?.selectedModelKey || "").trim(),
    bucketReason: String(bucket?.reason || "").trim(),
  };
};

const selectModelByCompleteness = (formData = {}) => {
  const completeness = evaluateCompleteness(formData);
  const resolvedModel =
    findPredictionModel(completeness.selectedModelKey) ||
    findPredictionModel(getDefaultPredictionModel().key) ||
    getDefaultPredictionModel();

  return {
    selectedModel: resolvedModel,
    completenessScore: completeness.score,
    completenessBucket: completeness.bucketName,
    selectionReason:
      completeness.bucketReason ||
      `Completeness bucket "${completeness.bucketName}" selected model "${resolvedModel.key}".`,
    completenessDetails: {
      filledFeaturesCount: completeness.filledFeaturesCount,
      totalFeatures: completeness.totalFeatures,
    },
  };
};

const resolveSelectionPolicy = (requestedPolicy, fallbackPolicy = SUPPORTED_POLICIES.MANUAL) => {
  const normalizedRequested = normalizePolicy(requestedPolicy);
  const normalizedFallback = normalizePolicy(fallbackPolicy);

  if (normalizedRequested === SUPPORTED_POLICIES.AUTO_BY_COMPLETENESS) {
    return SUPPORTED_POLICIES.AUTO_BY_COMPLETENESS;
  }

  if (normalizedRequested === SUPPORTED_POLICIES.MANUAL) {
    return SUPPORTED_POLICIES.MANUAL;
  }

  if (normalizedFallback === SUPPORTED_POLICIES.AUTO_BY_COMPLETENESS) {
    return SUPPORTED_POLICIES.AUTO_BY_COMPLETENESS;
  }

  return SUPPORTED_POLICIES.MANUAL;
};

module.exports = {
  SUPPORTED_POLICIES,
  selectModelByCompleteness,
  resolveSelectionPolicy,
};
