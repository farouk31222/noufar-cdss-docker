# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

from model_registry import get_default_model_spec, get_model_catalog, get_model_spec, resolve_model_key

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent
EXPORT_DIR = BASE_DIR / "exports"

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
