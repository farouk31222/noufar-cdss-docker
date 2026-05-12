from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import StratifiedKFold


try:
    import tensorflow as tf
    from tensorflow.keras import Sequential
    from tensorflow.keras.layers import Dense, Input
except Exception as exc:  # pragma: no cover
    raise RuntimeError(
        "TensorFlow is required for DNN benchmark. Install tensorflow in this environment."
    ) from exc


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = PROJECT_ROOT / "ai-server" / "data" / "data_synthetic_500.csv"
OUT_DIR = PROJECT_ROOT / "scripts" / "benchmark_outputs"
OUT_DETAILED = OUT_DIR / "auto_selection_detailed.csv"
OUT_SUMMARY = PROJECT_ROOT / "scripts" / "benchmark_model_by_completeness.csv"

TARGET_COLUMN = "Recidive"
SEED = 42
N_SPLITS = 5


@dataclass(frozen=True)
class Bucket:
    name: str
    min_ratio: float
    max_score_exclusive: float
    keep_ratio: float


BUCKETS: List[Bucket] = [
    Bucket("low", 0.0, 0.45, 0.35),
    Bucket("medium", 0.45, 0.75, 0.65),
    Bucket("high", 0.75, 1.01, 0.90),
]


def load_dataset(dataset_path: Path) -> Tuple[pd.DataFrame, pd.Series]:
    data = pd.read_csv(dataset_path)
    if TARGET_COLUMN not in data.columns:
        raise KeyError(f"Missing target column '{TARGET_COLUMN}' in {dataset_path}")

    y = pd.to_numeric(data[TARGET_COLUMN], errors="coerce").fillna(0).astype(int)
    x = data.drop(columns=[TARGET_COLUMN]).apply(pd.to_numeric, errors="coerce").fillna(0.0)
    return x, y


def apply_missingness(x: pd.DataFrame, keep_ratio: float, rng: np.random.Generator) -> pd.DataFrame:
    masked = x.copy()
    n_features = masked.shape[1]
    n_keep = max(1, int(round(n_features * keep_ratio)))

    for row_idx in range(masked.shape[0]):
        keep_idx = rng.choice(n_features, size=n_keep, replace=False)
        drop_mask = np.ones(n_features, dtype=bool)
        drop_mask[keep_idx] = False
        row_values = masked.iloc[row_idx].to_numpy(copy=True)
        row_values[drop_mask] = 0.0
        masked.iloc[row_idx] = row_values

    return masked


def build_dnn(input_dim: int) -> Sequential:
    tf.random.set_seed(SEED)
    model = Sequential(
        [
            Input(shape=(input_dim,)),
            Dense(64, activation="relu"),
            Dense(32, activation="relu"),
            Dense(1, activation="sigmoid"),
        ]
    )
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])
    return model


def score_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    return {
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
    }


def benchmark() -> Tuple[List[Dict[str, object]], List[Dict[str, object]]]:
    x, y = load_dataset(DEFAULT_DATASET)
    skf = StratifiedKFold(n_splits=N_SPLITS, shuffle=True, random_state=SEED)

    detailed_rows: List[Dict[str, object]] = []
    summary_rows: List[Dict[str, object]] = []

    for fold_idx, (train_idx, test_idx) in enumerate(skf.split(x, y), start=1):
        x_train, x_test = x.iloc[train_idx], x.iloc[test_idx]
        y_train, y_test = y.iloc[train_idx].to_numpy(), y.iloc[test_idx].to_numpy()

        for bucket in BUCKETS:
            rng = np.random.default_rng(SEED + fold_idx * 100 + int(bucket.keep_ratio * 100))
            x_train_bucket = apply_missingness(x_train, bucket.keep_ratio, rng)
            x_test_bucket = apply_missingness(x_test, bucket.keep_ratio, rng)

            train_non_zero = np.count_nonzero(x_train_bucket.to_numpy())
            train_total = x_train_bucket.shape[0] * x_train_bucket.shape[1]
            completeness_score = train_non_zero / train_total if train_total else 0.0

            lr = LogisticRegression(max_iter=1000, random_state=SEED)
            lr.fit(x_train_bucket, y_train)
            lr_pred = lr.predict(x_test_bucket)
            lr_metrics = score_metrics(y_test, lr_pred)

            rf = RandomForestClassifier(n_estimators=300, random_state=SEED, n_jobs=-1)
            rf.fit(x_train_bucket, y_train)
            rf_pred = rf.predict(x_test_bucket)
            rf_metrics = score_metrics(y_test, rf_pred)

            dnn = build_dnn(x_train_bucket.shape[1])
            dnn.fit(
                x_train_bucket.to_numpy(dtype="float32"),
                y_train.astype("float32"),
                validation_split=0.2,
                epochs=35,
                batch_size=32,
                verbose=0,
            )
            dnn_prob = dnn.predict(x_test_bucket.to_numpy(dtype="float32"), verbose=0).reshape(-1)
            dnn_pred = (dnn_prob >= 0.5).astype(int)
            dnn_metrics = score_metrics(y_test, dnn_pred)

            for model_key, metrics in [
                ("logistic_regression", lr_metrics),
                ("random_forest", rf_metrics),
                ("deep_neural_network", dnn_metrics),
            ]:
                detailed_rows.append(
                    {
                        "fold": fold_idx,
                        "bucket": bucket.name,
                        "modelKey": model_key,
                        "completenessScore": round(completeness_score, 4),
                        "f1": round(metrics["f1"], 6),
                        "accuracy": round(metrics["accuracy"], 6),
                        "recall": round(metrics["recall"], 6),
                        "precision": round(metrics["precision"], 6),
                    }
                )

    detailed_df = pd.DataFrame(detailed_rows)
    grouped = detailed_df.groupby(["bucket", "modelKey"], as_index=False).agg(
        metric=("f1", "mean"),
        f1_std=("f1", "std"),
        accuracy=("accuracy", "mean"),
        recall=("recall", "mean"),
        precision=("precision", "mean"),
    )

    bucket_meta = {bucket.name: bucket for bucket in BUCKETS}
    for bucket_name in ["low", "medium", "high"]:
        subset = grouped[grouped["bucket"] == bucket_name].sort_values("metric", ascending=False)
        for _, row in subset.iterrows():
            b = bucket_meta[bucket_name]
            summary_rows.append(
                {
                    "bucket": bucket_name,
                    "maxScoreExclusive": b.max_score_exclusive,
                    "modelKey": row["modelKey"],
                    "metric": round(float(row["metric"]), 6),
                    "reason": f"F1 mean={row['metric']:.4f} | std={0.0 if pd.isna(row['f1_std']) else row['f1_std']:.4f}",
                }
            )

    return detailed_rows, summary_rows


def write_csv(rows: List[Dict[str, object]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        raise RuntimeError(f"No rows to write for {path}")
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    if not DEFAULT_DATASET.exists():
        raise FileNotFoundError(f"Dataset not found: {DEFAULT_DATASET}")

    detailed_rows, summary_rows = benchmark()
    write_csv(detailed_rows, OUT_DETAILED)
    write_csv(summary_rows, OUT_SUMMARY)
    print(f"Detailed benchmark written to: {OUT_DETAILED}")
    print(f"Summary benchmark written to: {OUT_SUMMARY}")


if __name__ == "__main__":
    main()
