const fs = require("fs");
const path = require("path");

const DEFAULT_INPUT = path.resolve(process.cwd(), "scripts", "benchmark_model_by_completeness.csv");
const DEFAULT_OUTPUT = path.resolve(
  process.cwd(),
  "backend",
  "src",
  "config",
  "autoModelSelection.config.json"
);

const EXPECTED_MODELS = ["logistic_regression", "random_forest", "deep_neural_network"];

const parseCsv = (content) => {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 2) {
    throw new Error("Benchmark CSV is empty. Expected header + data rows.");
  }

  const headers = rows[0].split(",").map((h) => h.trim());
  return rows.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    return headers.reduce((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {});
  });
};

const normalizeModelKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const buildBuckets = (rows) => {
  const grouped = new Map();

  for (const row of rows) {
    const bucket = String(row.bucket || "").trim().toLowerCase();
    const modelKey = normalizeModelKey(row.modelKey || row.model || row.model_key);
    const metric = toNumber(row.metric || row.accuracy || row.f1 || row.score);
    const maxScoreExclusive = toNumber(row.maxScoreExclusive || row.max_score_exclusive);
    const reason = String(row.reason || "").trim();

    if (!bucket || Number.isNaN(metric) || Number.isNaN(maxScoreExclusive) || !EXPECTED_MODELS.includes(modelKey)) {
      continue;
    }

    if (!grouped.has(bucket)) {
      grouped.set(bucket, { maxScoreExclusive, reason, scores: [] });
    }

    const current = grouped.get(bucket);
    current.maxScoreExclusive = maxScoreExclusive;
    if (reason) current.reason = reason;
    current.scores.push({ modelKey, metric });
  }

  const orderedBuckets = ["low", "medium", "high"];
  return orderedBuckets
    .map((bucketName) => {
      const bucket = grouped.get(bucketName);
      if (!bucket || !bucket.scores.length) return null;

      const winner = bucket.scores.sort((a, b) => b.metric - a.metric)[0];
      return {
        name: bucketName,
        maxScoreExclusive: Number(bucket.maxScoreExclusive.toFixed(4)),
        selectedModelKey: winner.modelKey,
        reason: `Benchmark winner (F1=${winner.metric.toFixed(4)})`,
      };
    })
    .filter(Boolean);
};

const main = () => {
  const inputPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : DEFAULT_INPUT;
  const outputPath = process.argv[3] ? path.resolve(process.cwd(), process.argv[3]) : DEFAULT_OUTPUT;

  const csvContent = fs.readFileSync(inputPath, "utf8");
  const rows = parseCsv(csvContent);
  const buckets = buildBuckets(rows);
  let previousConfig = {};

  if (fs.existsSync(outputPath)) {
    try {
      previousConfig = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    } catch (error) {
      previousConfig = {};
    }
  }

  if (buckets.length !== 3) {
    throw new Error(
      "Unable to build complete low/medium/high mapping from benchmark CSV. Check bucket/model/metric columns."
    );
  }

  const config = {
    version: new Date().toISOString().slice(0, 10),
    objective: "max_accuracy",
    featureKeys: Array.isArray(previousConfig.featureKeys) && previousConfig.featureKeys.length ? previousConfig.featureKeys : [
      "age",
      "consultationReason",
      "duration",
      "tsh",
      "ft4",
      "tsiLevel",
      "antiTpoTotal",
      "stress",
      "palpitations",
      "spp",
      "amg",
      "diarrhea",
      "tremors",
      "agitation",
      "moodDisorder",
      "sleepDisorder",
      "sweating",
      "heatIntolerance",
      "muscleWeakness",
      "goiter",
      "blockReplace",
      "surgery",
      "radioactiveIodine",
      "antiTpo",
      "antiTg",
      "tsi",
      "goiterClassification",
      "ultrasound",
      "scintigraphy",
      "therapy",
    ],
    ...(previousConfig.defaultUiValues && typeof previousConfig.defaultUiValues === "object"
      ? { defaultUiValues: previousConfig.defaultUiValues }
      : {}),
    buckets,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  process.stdout.write(`Auto-selection config generated: ${outputPath}\n`);
};

main();
