from __future__ import annotations

MODEL_SPECS = [
    {
        "key": "logistic_regression",
        "label": "Logistic Regression",
        "description": "Fast linear baseline for structured relapse scoring.",
        "kind": "sklearn_pipeline",
        "artifacts": {
            "pipeline": "lr_pipeline.pkl",
            "legacy_pipeline": "pipeline.pkl",
        },
    },
    {
        "key": "random_forest",
        "label": "Random Forest",
        "description": "Tree-based ensemble that captures non-linear feature patterns.",
        "kind": "sklearn_pipeline",
        "artifacts": {
            "pipeline": "rf_pipeline.pkl",
        },
    },
    {
        "key": "deep_neural_network",
        "label": "Deep Neural Network",
        "description": "High-capacity model for complex signal interactions in the review layer.",
        "kind": "keras_bundle",
        "artifacts": {
            "preprocessor": "dnn_preprocessor.pkl",
            "model": "dnn_model.keras",
        },
    },
]

DEFAULT_MODEL_KEY = "logistic_regression"


def normalize_model_key(value):
    return (
        str(value or "")
        .strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )


MODEL_ALIASES = {
    "lr": "logistic_regression",
    "logistic": "logistic_regression",
    "logistic_regression": "logistic_regression",
    "logisticregression": "logistic_regression",
    "random_forest": "random_forest",
    "randomforest": "random_forest",
    "rf": "random_forest",
    "deep_neural_network": "deep_neural_network",
    "deepneuralnetwork": "deep_neural_network",
    "dnn": "deep_neural_network",
}


def get_model_catalog():
    return [dict(spec) for spec in MODEL_SPECS]



def resolve_model_key(value):
    normalized = normalize_model_key(value)
    if not normalized:
        return DEFAULT_MODEL_KEY
    return MODEL_ALIASES.get(normalized, normalized)



def get_model_spec(value):
    resolved_key = resolve_model_key(value)
    for spec in MODEL_SPECS:
        if spec["key"] == resolved_key:
            return dict(spec)
    return None



def get_default_model_spec():
    return get_model_spec(DEFAULT_MODEL_KEY) or dict(MODEL_SPECS[0])
