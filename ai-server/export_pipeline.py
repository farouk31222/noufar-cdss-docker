# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression

from pipeline_components import (
    export_preprocessor,
    export_sklearn_pipeline,
    fit_graves_preprocessor,
    load_training_dataset,
)

BASE_DIR = Path(__file__).resolve().parent
EXPORT_DIR = BASE_DIR / "exports"
RAW_DATA_PATH = BASE_DIR / "data" / "data manule clean.xlsx"
TRAINING_DATASET_PATH = Path(
    os.getenv(
        "TRAINING_DATASET_PATH",
        str(BASE_DIR / "data" / "data_synthetic_500.csv"),
    )
)
FEATURES_PATH = EXPORT_DIR / "feature_names.pkl"
LEGACY_MODEL_PATH = EXPORT_DIR / "model.pkl"
LEGACY_PIPELINE_PATH = EXPORT_DIR / "pipeline.pkl"
LR_PIPELINE_PATH = EXPORT_DIR / "lr_pipeline.pkl"
RF_PIPELINE_PATH = EXPORT_DIR / "rf_pipeline.pkl"
DNN_PREPROCESSOR_PATH = EXPORT_DIR / "dnn_preprocessor.pkl"
DNN_MODEL_PATH = EXPORT_DIR / "dnn_model.keras"
MANIFEST_PATH = EXPORT_DIR / "model_manifest.json"
SEED = 42
DNN_EPOCHS = 50
DNN_BATCH_SIZE = 32


def load_feature_names():
    return list(joblib.load(FEATURES_PATH))



def export_logistic_regression(feature_names):
    X_train, y_train = load_training_dataset(TRAINING_DATASET_PATH, feature_names)
    model = LogisticRegression(max_iter=1000, random_state=SEED)
    model.fit(X_train, y_train)

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, LEGACY_MODEL_PATH)
    export_sklearn_pipeline(
        model=model,
        feature_names=feature_names,
        raw_data_path=RAW_DATA_PATH,
        output_path=LR_PIPELINE_PATH,
    )
    export_sklearn_pipeline(
        model=model,
        feature_names=feature_names,
        raw_data_path=RAW_DATA_PATH,
        output_path=LEGACY_PIPELINE_PATH,
    )

    return {
        "key": "logistic_regression",
        "label": "Logistic Regression",
        "status": "deployed",
        "trainingDataset": TRAINING_DATASET_PATH.name,
        "trainingRows": int(len(X_train)),
        "hyperparameters": {
            "max_iter": 1000,
            "random_state": SEED,
        },
        "artifacts": [LEGACY_MODEL_PATH.name, LR_PIPELINE_PATH.name, LEGACY_PIPELINE_PATH.name],
    }



def export_random_forest(feature_names):
    X_train, y_train = load_training_dataset(TRAINING_DATASET_PATH, feature_names)
    model = RandomForestClassifier(
        n_estimators=300,
        random_state=SEED,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)
    export_sklearn_pipeline(
        model=model,
        feature_names=feature_names,
        raw_data_path=RAW_DATA_PATH,
        output_path=RF_PIPELINE_PATH,
    )
    return {
        "key": "random_forest",
        "label": "Random Forest",
        "status": "deployed",
        "trainingDataset": TRAINING_DATASET_PATH.name,
        "trainingRows": int(len(X_train)),
        "hyperparameters": {
            "n_estimators": 300,
            "random_state": SEED,
            "n_jobs": -1,
        },
        "artifacts": [RF_PIPELINE_PATH.name],
    }



def export_deep_neural_network(feature_names):
    try:
        import tensorflow as tf
        from tensorflow.keras import Sequential
        from tensorflow.keras.callbacks import EarlyStopping
        from tensorflow.keras.layers import Dense, Input
    except Exception as exc:
        return {
            "key": "deep_neural_network",
            "label": "Deep Neural Network",
            "status": "unavailable",
            "trainingDataset": TRAINING_DATASET_PATH.name,
            "reason": f"TensorFlow unavailable: {exc}",
            "artifacts": [],
        }

    preprocessor = fit_graves_preprocessor(feature_names=feature_names, raw_data_path=RAW_DATA_PATH)
    X_train, y_train = load_training_dataset(TRAINING_DATASET_PATH, feature_names)
    X_ready = X_train.to_numpy(dtype="float32")
    y_ready = y_train.to_numpy(dtype="float32")

    np.random.seed(SEED)
    tf.random.set_seed(SEED)

    model = Sequential(
        [
            Input(shape=(X_ready.shape[1],)),
            Dense(64, activation="relu"),
            Dense(32, activation="relu"),
            Dense(1, activation="sigmoid"),
        ]
    )
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])

    callbacks = [
        EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True)
    ]

    model.fit(
        X_ready,
        y_ready,
        validation_split=0.20,
        epochs=DNN_EPOCHS,
        batch_size=DNN_BATCH_SIZE,
        verbose=0,
        callbacks=callbacks,
    )

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    export_preprocessor(preprocessor, DNN_PREPROCESSOR_PATH)
    model.save(DNN_MODEL_PATH)

    return {
        "key": "deep_neural_network",
        "label": "Deep Neural Network",
        "status": "deployed",
        "trainingDataset": TRAINING_DATASET_PATH.name,
        "trainingRows": int(len(X_train)),
        "hyperparameters": {
            "layers": [64, 32, 1],
            "activation": "relu/sigmoid",
            "epochs": DNN_EPOCHS,
            "batch_size": DNN_BATCH_SIZE,
            "validation_split": 0.20,
            "early_stopping_patience": 5,
            "optimizer": "adam",
        },
        "artifacts": [DNN_PREPROCESSOR_PATH.name, DNN_MODEL_PATH.name],
    }



def write_manifest(entries):
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "trainingDataset": TRAINING_DATASET_PATH.name,
        "rawInferenceDataset": RAW_DATA_PATH.name,
        "featureNamesArtifact": FEATURES_PATH.name,
        "models": entries,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")



def main():
    feature_names = load_feature_names()
    exports = [
        export_logistic_regression(feature_names),
        export_random_forest(feature_names),
        export_deep_neural_network(feature_names),
    ]
    write_manifest(exports)

    print("Model deployment export complete:")
    for item in exports:
        status = item.get("status", "unknown")
        label = item.get("label", item.get("key"))
        reason = item.get("reason")
        print(f"- {label}: {status}")
        print(f"  dataset: {item.get('trainingDataset', TRAINING_DATASET_PATH.name)}")
        if reason:
            print(f"  reason: {reason}")
        if item.get("artifacts"):
            print(f"  artifacts: {', '.join(item['artifacts'])}")


if __name__ == "__main__":
    main()
