# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path
import json
import shutil
import time
import tracemalloc

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    log_loss,
    matthews_corrcoef,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

from model_registry import get_default_model_spec, get_model_catalog, get_model_spec, resolve_model_key
from pipeline_components import (
    TARGET_COLUMN,
    export_preprocessor,
    export_sklearn_pipeline,
    fit_graves_preprocessor,
    load_training_dataset,
)

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent
EXPORT_DIR = BASE_DIR / "exports"
MODEL_VERSION_DIR = EXPORT_DIR / "model_versions"
FEATURES_PATH = EXPORT_DIR / "feature_names.pkl"
RAW_DATA_PATH = BASE_DIR / "data" / "data manule clean.xlsx"
SYNTHETIC_DATASET_PATH = BASE_DIR / "data" / "data_synthetic_500.csv"

try:
    from tensorflow import keras
    TENSORFLOW_AVAILABLE = True
except Exception:
    keras = None
    TENSORFLOW_AVAILABLE = False



def load_sklearn_runtime(pipeline_path: Path):
    pipeline = joblib.load(pipeline_path)
    preprocessor = pipeline.named_steps["preprocessor"]
    classifier = pipeline.named_steps["classifier"]
    feature_names = list(preprocessor.get_feature_names_out())
    return {
        "kind": "sklearn_pipeline",
        "pipeline": pipeline,
        "preprocessor": preprocessor,
        "classifier": classifier,
        "feature_names": feature_names,
    }



def load_dnn_runtime(preprocessor_path: Path, model_path: Path):
    if not TENSORFLOW_AVAILABLE:
        raise RuntimeError("TensorFlow is not installed.")

    preprocessor = joblib.load(preprocessor_path)
    model = keras.models.load_model(model_path)
    feature_names = list(preprocessor.get_feature_names_out())
    return {
        "kind": "keras_bundle",
        "preprocessor": preprocessor,
        "classifier": model,
        "feature_names": feature_names,
    }



def load_model_runtimes():
    runtimes = {}

    for spec in get_model_catalog():
        artifacts = spec.get("artifacts", {})
        key = spec["key"]
        try:
            if spec["kind"] == "sklearn_pipeline":
                candidate_paths = []
                if artifacts.get("pipeline"):
                    candidate_paths.append(EXPORT_DIR / artifacts["pipeline"])
                if artifacts.get("legacy_pipeline"):
                    candidate_paths.append(EXPORT_DIR / artifacts["legacy_pipeline"])

                pipeline_path = next((path for path in candidate_paths if path.exists()), None)
                if not pipeline_path:
                    continue
                runtimes[key] = load_sklearn_runtime(pipeline_path)
                runtimes[key]["artifact_path"] = str(pipeline_path)

            elif spec["kind"] == "keras_bundle":
                preprocessor_path = EXPORT_DIR / artifacts.get("preprocessor", "")
                model_path = EXPORT_DIR / artifacts.get("model", "")
                if not preprocessor_path.exists() or not model_path.exists():
                    continue
                runtimes[key] = load_dnn_runtime(preprocessor_path, model_path)
                runtimes[key]["artifact_path"] = str(model_path)
        except Exception as error:
            print(f"Unable to load {spec['label']}: {error}")

    return runtimes


DEPLOYED_MODELS = load_model_runtimes()
DEFAULT_MODEL_SPEC = get_default_model_spec()

try:
    from codecarbon import EmissionsTracker
    CODECARBON_AVAILABLE = True
except Exception:
    EmissionsTracker = None
    CODECARBON_AVAILABLE = False



def get_active_model_spec(requested_model_key=None):
    requested_spec = get_model_spec(requested_model_key)
    if requested_spec and requested_spec["key"] in DEPLOYED_MODELS:
        return requested_spec

    if DEFAULT_MODEL_SPEC["key"] in DEPLOYED_MODELS:
        return DEFAULT_MODEL_SPEC

    first_deployed_key = next(iter(DEPLOYED_MODELS.keys()), None)
    if first_deployed_key:
        return get_model_spec(first_deployed_key)

    raise RuntimeError("No deployed prediction model is currently available.")



def describe_models():
    active_spec = get_active_model_spec()
    options = []
    for spec in get_model_catalog():
        options.append(
            {
                "key": spec["key"],
                "label": spec["label"],
                "description": spec["description"],
                "deployed": spec["key"] in DEPLOYED_MODELS,
            }
        )
    return {
        "activeModelKey": active_spec["key"],
        "activeModelLabel": active_spec["label"],
        "options": options,
    }



def compute_top_factors(runtime, transformed_input):
    feature_names = runtime["feature_names"]
    values = transformed_input.iloc[0].to_numpy(dtype=float)
    classifier = runtime["classifier"]

    if runtime["kind"] == "sklearn_pipeline":
        if hasattr(classifier, "coef_"):
            impacts = classifier.coef_[0] * values
        elif hasattr(classifier, "feature_importances_"):
            impacts = classifier.feature_importances_ * np.abs(values)
        else:
            impacts = np.abs(values)
    else:
        try:
            first_layer = classifier.layers[0]
            weights = first_layer.get_weights()[0]
            feature_weights = np.mean(np.abs(weights), axis=1)
            impacts = feature_weights * np.abs(values)
        except Exception:
            impacts = np.abs(values)

    ranked = sorted(zip(feature_names, impacts), key=lambda item: abs(float(item[1])), reverse=True)[:5]
    return [
        {"feature": feature, "impact": round(float(impact), 4)}
        for feature, impact in ranked
    ]



def run_prediction(form_data):
    model_spec = get_active_model_spec(form_data.get("modelKey"))
    runtime = DEPLOYED_MODELS[model_spec["key"]]
    raw_input = pd.DataFrame([form_data])
    transformed_input = runtime["preprocessor"].transform(raw_input)

    if runtime["kind"] == "sklearn_pipeline":
        probability = float(runtime["pipeline"].predict_proba(raw_input)[0][1])
        prediction = int(runtime["pipeline"].predict(raw_input)[0])
    else:
        probability = float(runtime["classifier"].predict(transformed_input.to_numpy(dtype="float32"), verbose=0)[0][0])
        prediction = int(probability >= 0.5)

    if probability >= 0.70:
        risk_level = "HIGH"
    elif probability >= 0.40:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return {
        "model": model_spec["label"],
        "modelKey": model_spec["key"],
        "probability": round(probability, 4),
        "prediction": prediction,
        "risk_level": risk_level,
        "top_factors": compute_top_factors(runtime, transformed_input),
    }


def safe_metric(callback, *args, **kwargs):
    try:
        value = callback(*args, **kwargs)
        if value is None or not np.isfinite(value):
            return None
        return float(value)
    except Exception:
        return None


def round_metric(value):
    if value is None:
        return None
    try:
        if not np.isfinite(value):
            return None
        return round(float(value), 6)
    except Exception:
        return None


def start_energy_tracker(label):
    if not CODECARBON_AVAILABLE:
        return None
    try:
        tracker = EmissionsTracker(
            project_name=label,
            save_to_file=False,
            log_level="error",
            measure_power_secs=1,
        )
        tracker.start()
        return tracker
    except Exception:
        return None


def stop_energy_tracker(tracker):
    if not tracker:
        return {"kwh": None, "joules": None, "status": "unavailable"}
    try:
        tracker.stop()
        data = getattr(tracker, "final_emissions_data", None)
        kwh = getattr(data, "energy_consumed", None) if data else None
        if kwh is None:
            return {"kwh": None, "joules": None, "status": "unavailable"}
        joules = float(kwh) * 3_600_000
        return {"kwh": float(kwh), "joules": joules, "status": "estimated"}
    except Exception:
        return {"kwh": None, "joules": None, "status": "unavailable"}


def build_classification_metrics(y_true, y_pred, y_prob, extra_regression=False):
    y_true = np.asarray(y_true).astype(int)
    y_pred = np.asarray(y_pred).astype(int)
    y_prob = np.asarray(y_prob).astype(float) if y_prob is not None else None
    matrix = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = matrix.ravel()
    specificity = tn / (tn + fp) if (tn + fp) else None
    npv = tn / (tn + fn) if (tn + fn) else None

    metrics = {
        "accuracy": round_metric(accuracy_score(y_true, y_pred)),
        "balancedAccuracy": round_metric(balanced_accuracy_score(y_true, y_pred)),
        "precision": round_metric(precision_score(y_true, y_pred, zero_division=0)),
        "recall": round_metric(recall_score(y_true, y_pred, zero_division=0)),
        "specificity": round_metric(specificity),
        "npv": round_metric(npv),
        "f1Score": round_metric(f1_score(y_true, y_pred, zero_division=0)),
        "mcc": round_metric(matthews_corrcoef(y_true, y_pred)),
        "aucRoc": round_metric(safe_metric(roc_auc_score, y_true, y_prob)) if y_prob is not None else None,
        "logLoss": round_metric(safe_metric(log_loss, y_true, y_prob, labels=[0, 1])) if y_prob is not None else None,
        "confusionMatrix": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
        },
    }

    if extra_regression and y_prob is not None:
        mse = safe_metric(mean_squared_error, y_true, y_prob)
        metrics.update(
            {
                "mse": round_metric(mse),
                "rmse": round_metric(np.sqrt(mse)) if mse is not None else None,
                "mae": round_metric(safe_metric(mean_absolute_error, y_true, y_prob)),
                "r2": round_metric(safe_metric(r2_score, y_true, y_prob)),
            }
        )

    return metrics


def with_resource_metrics(label, callback):
    tracemalloc.start()
    start = time.perf_counter()
    tracker = start_energy_tracker(label)
    result = callback()
    energy = stop_energy_tracker(tracker)
    elapsed = time.perf_counter() - start
    _, peak_memory = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return result, elapsed, peak_memory / (1024 ** 2), energy


def add_runtime_metrics(metrics, train_time, test_time, peak_memory, train_energy, test_energy, prediction_count):
    train_j = train_energy.get("joules")
    test_j = test_energy.get("joules")
    total_j = (train_j or 0) + (test_j or 0)
    denominator = total_j if total_j > 0 else None

    metrics.update(
        {
            "trainExecutionTimeSeconds": round_metric(train_time),
            "testExecutionTimeSeconds": round_metric(test_time),
            "totalExecutionTimeSeconds": round_metric((train_time or 0) + (test_time or 0)),
            "peakMemoryMb": round_metric(peak_memory),
            "trainEnergyKwh": round_metric(train_energy.get("kwh")),
            "trainEnergyJ": round_metric(train_j),
            "testEnergyKwh": round_metric(test_energy.get("kwh")),
            "testEnergyJ": round_metric(test_j),
            "energyPerPredictionJ": round_metric(test_j / prediction_count) if test_j and prediction_count else None,
            "accuracyPerJoule": round_metric(metrics.get("accuracy") / denominator) if denominator else None,
            "f1PerJoule": round_metric(metrics.get("f1Score") / denominator) if denominator else None,
            "energyMeasurementStatus": (
                "estimated"
                if train_energy.get("status") == "estimated" or test_energy.get("status") == "estimated"
                else "unavailable"
            ),
        }
    )
    return metrics


def predict_with_runtime(runtime, x_test):
    if runtime["kind"] == "sklearn_pipeline":
        classifier = runtime["classifier"]
        y_prob = classifier.predict_proba(x_test)[:, 1]
        y_pred = (y_prob >= 0.5).astype(int)
        return y_pred, y_prob
    y_prob = runtime["classifier"].predict(x_test.to_numpy(dtype="float32"), verbose=0).reshape(-1)
    y_pred = (y_prob >= 0.5).astype(int)
    return y_pred, y_prob


def benchmark_runtime_model(model_key, runtime, x_test, y_test):
    label = get_model_spec(model_key)["label"]

    def _predict():
        return predict_with_runtime(runtime, x_test)

    (y_pred, y_prob), test_time, peak_memory, test_energy = with_resource_metrics(
        f"old_{model_key}_test",
        _predict,
    )
    metrics = build_classification_metrics(
        y_test,
        y_pred,
        y_prob,
        extra_regression=model_key == "deep_neural_network",
    )
    metrics = add_runtime_metrics(
        metrics,
        train_time=None,
        test_time=test_time,
        peak_memory=peak_memory,
        train_energy={"kwh": None, "joules": None, "status": "unavailable"},
        test_energy=test_energy,
        prediction_count=len(y_test),
    )
    return {
        "modelKey": model_key,
        "modelLabel": label,
        "versionType": "old",
        "status": "available",
        "metrics": metrics,
        "artifactPaths": {"active": runtime.get("artifact_path", "")},
    }


def train_new_model(model_key, x_train, y_train, version_dir):
    spec = get_model_spec(model_key)
    label = spec["label"]

    if model_key == "logistic_regression":
        model = LogisticRegression(max_iter=1000, random_state=42)

        def _train():
            model.fit(x_train, y_train)
            return model

        trained_model, train_time, peak_memory, train_energy = with_resource_metrics("new_lr_train", _train)
        pipeline_path = version_dir / "lr_pipeline.pkl"
        export_sklearn_pipeline(trained_model, list(x_train.columns), RAW_DATA_PATH, pipeline_path)
        return {
            "model": trained_model,
            "kind": "sklearn",
            "label": label,
            "trainTime": train_time,
            "peakMemory": peak_memory,
            "trainEnergy": train_energy,
            "artifactPaths": {"pipeline": str(pipeline_path)},
        }

    if model_key == "random_forest":
        model = RandomForestClassifier(n_estimators=300, random_state=42, n_jobs=-1)

        def _train():
            model.fit(x_train, y_train)
            return model

        trained_model, train_time, peak_memory, train_energy = with_resource_metrics("new_rf_train", _train)
        pipeline_path = version_dir / "rf_pipeline.pkl"
        export_sklearn_pipeline(trained_model, list(x_train.columns), RAW_DATA_PATH, pipeline_path)
        return {
            "model": trained_model,
            "kind": "sklearn",
            "label": label,
            "trainTime": train_time,
            "peakMemory": peak_memory,
            "trainEnergy": train_energy,
            "artifactPaths": {"pipeline": str(pipeline_path)},
        }

    if model_key == "deep_neural_network":
        if not TENSORFLOW_AVAILABLE:
            raise RuntimeError("TensorFlow is not installed.")
        from tensorflow.keras import Sequential
        from tensorflow.keras.callbacks import EarlyStopping
        from tensorflow.keras.layers import Dense, Input

        np.random.seed(42)
        model = Sequential(
            [
                Input(shape=(x_train.shape[1],)),
                Dense(64, activation="relu"),
                Dense(32, activation="relu"),
                Dense(1, activation="sigmoid"),
            ]
        )
        model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])

        def _train():
            model.fit(
                x_train.to_numpy(dtype="float32"),
                y_train.astype("float32"),
                validation_split=0.2,
                epochs=50,
                batch_size=32,
                verbose=0,
                callbacks=[EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True)],
            )
            return model

        trained_model, train_time, peak_memory, train_energy = with_resource_metrics("new_dnn_train", _train)
        preprocessor_path = version_dir / "dnn_preprocessor.pkl"
        model_path = version_dir / "dnn_model.keras"
        preprocessor = fit_graves_preprocessor(feature_names=list(x_train.columns), raw_data_path=RAW_DATA_PATH)
        export_preprocessor(preprocessor, preprocessor_path)
        trained_model.save(model_path)
        return {
            "model": trained_model,
            "kind": "keras",
            "label": label,
            "trainTime": train_time,
            "peakMemory": peak_memory,
            "trainEnergy": train_energy,
            "artifactPaths": {
                "preprocessor": str(preprocessor_path),
                "model": str(model_path),
            },
        }

    raise RuntimeError(f"Unsupported model key: {model_key}")


def benchmark_new_model(model_key, trained, x_test, y_test):
    def _predict():
        if trained["kind"] == "sklearn":
            y_prob = trained["model"].predict_proba(x_test)[:, 1]
        else:
            y_prob = trained["model"].predict(x_test.to_numpy(dtype="float32"), verbose=0).reshape(-1)
        y_pred = (y_prob >= 0.5).astype(int)
        return y_pred, y_prob

    (y_pred, y_prob), test_time, test_peak_memory, test_energy = with_resource_metrics(
        f"new_{model_key}_test",
        _predict,
    )
    metrics = build_classification_metrics(
        y_test,
        y_pred,
        y_prob,
        extra_regression=model_key == "deep_neural_network",
    )
    peak_memory = max(trained["peakMemory"], test_peak_memory)
    metrics = add_runtime_metrics(
        metrics,
        trained["trainTime"],
        test_time,
        peak_memory,
        trained["trainEnergy"],
        test_energy,
        len(y_test),
    )
    return {
        "modelKey": model_key,
        "modelLabel": trained["label"],
        "versionType": "new",
        "status": "available",
        "metrics": metrics,
        "artifactPaths": trained["artifactPaths"],
    }


def build_retraining_dataset(real_cases):
    feature_names = list(joblib.load(FEATURES_PATH))
    synthetic_x, synthetic_y = load_training_dataset(SYNTHETIC_DATASET_PATH, feature_names)
    real_frames = []
    real_targets = []

    if real_cases:
        raw_rows = [case.get("features", {}) for case in real_cases if isinstance(case, dict)]
        targets = [int(case.get("target", 0)) for case in real_cases if isinstance(case, dict)]
        if raw_rows:
            preprocessor = fit_graves_preprocessor(feature_names=feature_names, raw_data_path=RAW_DATA_PATH)
            real_x = preprocessor.transform(pd.DataFrame(raw_rows))
            real_frames.append(real_x)
            real_targets.extend(targets)

    frames = [synthetic_x, *real_frames]
    targets = [synthetic_y, pd.Series(real_targets, dtype=int)] if real_targets else [synthetic_y]
    x = pd.concat(frames, ignore_index=True).fillna(0.0)
    y = pd.concat(targets, ignore_index=True).astype(int)
    return x, y, len(synthetic_x), len(real_targets)


def write_combined_training_dataset(version_dir, x, y):
    dataset = x.copy().reset_index(drop=True)
    dataset[TARGET_COLUMN] = pd.Series(y).reset_index(drop=True).astype(int)
    dataset_path = version_dir / "training_dataset_combined.csv"
    dataset.to_csv(dataset_path, index=False)
    return dataset_path


def write_version_manifest(version_dir, payload):
    manifest_path = version_dir / "model_manifest.json"
    manifest_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def activate_version_artifacts(run_id, model_key):
    version_dir = MODEL_VERSION_DIR / str(run_id)
    if not version_dir.exists():
        raise RuntimeError(f"Model version not found: {run_id}")

    artifact_paths = {}
    if model_key == "logistic_regression":
        source = version_dir / "lr_pipeline.pkl"
        if not source.exists():
            raise RuntimeError("LR artifact is missing for this training run.")
        shutil.copy2(source, EXPORT_DIR / "lr_pipeline.pkl")
        shutil.copy2(source, EXPORT_DIR / "pipeline.pkl")
        artifact_paths = {"pipeline": "lr_pipeline.pkl", "legacyPipeline": "pipeline.pkl"}
    elif model_key == "random_forest":
        source = version_dir / "rf_pipeline.pkl"
        if not source.exists():
            raise RuntimeError("RF artifact is missing for this training run.")
        shutil.copy2(source, EXPORT_DIR / "rf_pipeline.pkl")
        artifact_paths = {"pipeline": "rf_pipeline.pkl"}
    elif model_key == "deep_neural_network":
        model_source = version_dir / "dnn_model.keras"
        preprocessor_source = version_dir / "dnn_preprocessor.pkl"
        if not model_source.exists() or not preprocessor_source.exists():
            raise RuntimeError("DNN artifacts are missing for this training run.")
        shutil.copy2(model_source, EXPORT_DIR / "dnn_model.keras")
        shutil.copy2(preprocessor_source, EXPORT_DIR / "dnn_preprocessor.pkl")
        artifact_paths = {"model": "dnn_model.keras", "preprocessor": "dnn_preprocessor.pkl"}
    else:
        raise RuntimeError(f"Unsupported model key: {model_key}")

    global DEPLOYED_MODELS
    DEPLOYED_MODELS = load_model_runtimes()
    return artifact_paths


@app.route("/models", methods=["GET"])
def models():
    return jsonify(describe_models())


@app.route("/predict", methods=["POST"])
def predict():
    try:
        form_data = request.get_json() or {}
        if not form_data:
            return jsonify({"error": "Aucune donnee recue"}), 400

        return jsonify(run_prediction(form_data))
    except KeyError as error:
        return jsonify({"error": f"Champ manquant : {str(error)}"}), 422
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 503
    except Exception as error:
        return jsonify({"error": str(error)}), 500


@app.route("/retrain", methods=["POST"])
def retrain():
    try:
        body = request.get_json() or {}
        run_id = str(body.get("runId") or f"manual-{int(time.time())}").strip()
        real_cases = body.get("realCases") or []
        version_dir = MODEL_VERSION_DIR / run_id
        version_dir.mkdir(parents=True, exist_ok=True)

        x, y, synthetic_rows, real_rows = build_retraining_dataset(real_cases)
        training_dataset_path = write_combined_training_dataset(version_dir, x, y)
        stratify = y if y.nunique() > 1 and y.value_counts().min() >= 2 else None
        x_train, x_test, y_train, y_test = train_test_split(
            x,
            y,
            test_size=0.2,
            random_state=42,
            stratify=stratify,
        )

        results = []
        for model_key in ["logistic_regression", "random_forest", "deep_neural_network"]:
            runtime = DEPLOYED_MODELS.get(model_key)
            if runtime:
                try:
                    results.append(benchmark_runtime_model(model_key, runtime, x_test, y_test))
                except Exception as error:
                    spec = get_model_spec(model_key)
                    results.append(
                        {
                            "modelKey": model_key,
                            "modelLabel": spec["label"] if spec else model_key,
                            "versionType": "old",
                            "status": "failed",
                            "metrics": {"error": str(error)},
                            "artifactPaths": {},
                        }
                    )
            else:
                spec = get_model_spec(model_key)
                results.append(
                    {
                        "modelKey": model_key,
                        "modelLabel": spec["label"] if spec else model_key,
                        "versionType": "old",
                        "status": "unavailable",
                        "metrics": {"error": "Model is not currently deployed."},
                        "artifactPaths": {},
                    }
                )

            try:
                trained = train_new_model(model_key, x_train, y_train, version_dir)
                results.append(benchmark_new_model(model_key, trained, x_test, y_test))
            except Exception as error:
                spec = get_model_spec(model_key)
                results.append(
                    {
                        "modelKey": model_key,
                        "modelLabel": spec["label"] if spec else model_key,
                        "versionType": "new",
                        "status": "failed",
                        "metrics": {"error": str(error)},
                        "artifactPaths": {},
                    }
                )

        manifest = {
            "runId": run_id,
            "candidateVersion": run_id,
            "syntheticRows": synthetic_rows,
            "realValidatedRows": real_rows,
            "trainingDatasetArtifact": str(training_dataset_path),
            "testRows": int(len(x_test)),
            "trainRows": int(len(x_train)),
            "results": results,
            "generatedAt": pd.Timestamp.utcnow().isoformat(),
        }
        write_version_manifest(version_dir, manifest)
        return jsonify(manifest)
    except Exception as error:
        return jsonify({"error": str(error)}), 500


@app.route("/models/activate-version", methods=["POST"])
def activate_model_version():
    try:
        body = request.get_json() or {}
        run_id = str(body.get("runId") or "").strip()
        model_key = resolve_model_key(body.get("modelKey"))
        if not run_id:
            return jsonify({"error": "runId is required"}), 400
        artifact_paths = activate_version_artifacts(run_id, model_key)
        return jsonify(
            {
                "message": f"{model_key} artifacts activated.",
                "runId": run_id,
                "modelKey": model_key,
                "artifactPaths": artifact_paths,
                "deployedCount": len(DEPLOYED_MODELS),
            }
        )
    except Exception as error:
        return jsonify({"error": str(error)}), 500


@app.route("/health", methods=["GET"])
def health():
    payload = describe_models()
    payload.update(
        {
            "status": "ok" if DEPLOYED_MODELS else "degraded",
            "tensorflow": TENSORFLOW_AVAILABLE,
            "deployedCount": len(DEPLOYED_MODELS),
        }
    )
    return jsonify(payload)


if __name__ == "__main__":
    print(f"Deployed models: {', '.join(DEPLOYED_MODELS.keys()) or 'none'}")
    app.run(host='0.0.0.0', port=5001, debug=False)
