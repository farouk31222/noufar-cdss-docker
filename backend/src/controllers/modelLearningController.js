const {
  getLearningSummary,
  listTrainingRuns,
  getTrainingRunDetails,
  runRetraining,
  activateTrainingRunModel,
  rollbackTrainingRun,
} = require("../services/modelLearningService");

const getModelLearningSummary = async (req, res, next) => {
  try {
    res.status(200).json(await getLearningSummary());
  } catch (error) {
    next(error);
  }
};

const getModelLearningRuns = async (req, res, next) => {
  try {
    res.status(200).json(await listTrainingRuns());
  } catch (error) {
    next(error);
  }
};

const getModelLearningRunById = async (req, res, next) => {
  try {
    res.status(200).json(await getTrainingRunDetails(req.params.id));
  } catch (error) {
    next(error);
  }
};

const createManualRetrainingRun = async (req, res, next) => {
  try {
    const run = await runRetraining({
      trigger: "manual_admin",
      user: req.user,
    });
    res.status(201).json(run);
  } catch (error) {
    next(error);
  }
};

const activateModelLearningRun = async (req, res, next) => {
  try {
    const run = await activateTrainingRunModel({
      runId: req.params.id,
      modelKey: req.body?.modelKey,
      user: req.user,
    });
    res.status(200).json(run);
  } catch (error) {
    next(error);
  }
};

const rollbackModelLearningRun = async (req, res, next) => {
  try {
    const run = await rollbackTrainingRun({
      runId: req.params.id,
      user: req.user,
    });
    res.status(200).json(run);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getModelLearningSummary,
  getModelLearningRuns,
  getModelLearningRunById,
  createManualRetrainingRun,
  activateModelLearningRun,
  rollbackModelLearningRun,
};
