const PREDICTION_MODELS = [
  {
    key: "logistic_regression",
    label: "Logistic Regression",
    description: "Fast linear baseline for structured relapse scoring.",
    aliases: ["LogisticRegression", "LR", "logistic regression"],
  },
  {
    key: "random_forest",
    label: "Random Forest",
    description: "Tree-based ensemble that captures non-linear feature patterns.",
    aliases: ["RandomForest", "RF", "random forest"],
  },
  {
    key: "deep_neural_network",
    label: "Deep Neural Network",
    description: "High-capacity model for complex signal interactions in the review layer.",
    aliases: ["DeepNeuralNetwork", "DNN", "deep neural network"],
  },
];

const DEFAULT_PREDICTION_MODEL_KEY = "logistic_regression";

const normalizeModelValue = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

const getPredictionModels = () => PREDICTION_MODELS.map((model) => ({ ...model }));

const findPredictionModel = (value) => {
  const normalized = normalizeModelValue(value);
  if (!normalized) return null;

  return (
    PREDICTION_MODELS.find((model) => normalizeModelValue(model.key) === normalized) ||
    PREDICTION_MODELS.find((model) => normalizeModelValue(model.label) === normalized) ||
    PREDICTION_MODELS.find((model) =>
      Array.isArray(model.aliases)
        ? model.aliases.some((alias) => normalizeModelValue(alias) === normalized)
        : false
    ) ||
    null
  );
};

const getDefaultPredictionModel = () =>
  findPredictionModel(DEFAULT_PREDICTION_MODEL_KEY) || { ...PREDICTION_MODELS[0] };

module.exports = {
  DEFAULT_PREDICTION_MODEL_KEY,
  getPredictionModels,
  findPredictionModel,
  getDefaultPredictionModel,
};
