import json
import uuid
from pathlib import Path


NOTEBOOK_PATH = Path(r"D:\Test IA\Data-synthetic\RF-LR-DNN.ipynb")
BACKUP_PATH = Path(r"D:\Test IA\Data-synthetic\RF-LR-DNN.french-structured-backup.ipynb")


def to_source(text: str):
    lines = text.splitlines(keepends=True)
    if not lines:
        return [""]
    if not text.endswith("\n"):
        lines[-1] = lines[-1].rstrip("\n")
    return lines


def md(text: str):
    return {
        "cell_type": "markdown",
        "id": uuid.uuid4().hex[:8],
        "metadata": {},
        "source": to_source(text),
    }


def code(text: str):
    return {
        "cell_type": "code",
        "execution_count": None,
        "id": uuid.uuid4().hex[:8],
        "metadata": {},
        "outputs": [],
        "source": to_source(text),
    }


def main():
    notebook = json.loads(NOTEBOOK_PATH.read_text(encoding="utf-8"))
    BACKUP_PATH.write_text(json.dumps(notebook, ensure_ascii=False, indent=1), encoding="utf-8")

    cells = []

    cells.append(
        md(
            """# Benchmark RF, LR et DNN sur les donnees synthetiques

Ce notebook compare trois methodes de classification sur quatre jeux de donnees synthetiques :
- `Random Forest (RF)`
- `Logistic Regression (LR)`
- `Deep Neural Network (DNN)`

Datasets utilises :
- `data_synthetic_500.csv`
- `data_synthetic_1K.csv`
- `data_synthetic_5K.csv`
- `data_synthetic_10K.csv`

Variable cible : `Recidive`

Objectifs de cette version :
- notebook organise en sections claires
- commentaires simples en francais dans le code
- graphiques propres et lisibles
- export CSV des resultats
"""
        )
    )

    cells.append(md("""## 1. Importation des bibliotheques"""))

    cells.append(
        code(
            """# Bibliotheques generales
from pathlib import Path
from time import perf_counter
import random
import tracemalloc
import warnings

# Bibliotheques scientifiques
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# Modeles de machine learning
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression

# Metriques d'evaluation
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
    roc_curve,
)

# Validation et split
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import LabelEncoder

warnings.filterwarnings("ignore")

# Import optionnel de TensorFlow pour le DNN
try:
    import tensorflow as tf
    from tensorflow.keras import Sequential
    from tensorflow.keras.callbacks import EarlyStopping
    from tensorflow.keras.layers import Dense, Input
    TF_AVAILABLE = True
except Exception:
    tf = None
    Sequential = None
    EarlyStopping = None
    Dense = None
    Input = None
    TF_AVAILABLE = False

# Parametres globaux
SEED = 42
TEST_SIZE = 0.20
EPOCHS = 50
BATCH_SIZE = 32
CV_SPLITS = 5
DATASET_DIAGNOSTIC = "Synthetic 10K"

random.seed(SEED)
np.random.seed(SEED)
if TF_AVAILABLE:
    tf.random.set_seed(SEED)
"""
        )
    )

    cells.append(md("""## 2. Definition des chemins et parametres"""))

    cells.append(
        code(
            """# Nom de la variable cible
TARGET_COLUMN = "Recidive"

# Fichiers synthetiques utilises dans le benchmark
DATASET_FILES = {
    "Synthetic 500": "data_synthetic_500.csv",
    "Synthetic 1K": "data_synthetic_1K.csv",
    "Synthetic 5K": "data_synthetic_5K.csv",
    "Synthetic 10K": "data_synthetic_10K.csv",
}


def resolve_dataset_path(filename):
    # Recherche du fichier dans plusieurs emplacements possibles
    candidates = [
        Path(filename),
        Path("Data-synthetic") / filename,
        Path("..") / "Data-synthetic" / filename,
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return candidates[0]


DATASETS = {name: resolve_dataset_path(filename) for name, filename in DATASET_FILES.items()}

availability_df = pd.DataFrame(
    [
        {
            "Dataset": dataset_name,
            "Path": str(dataset_path),
            "Exists": dataset_path.exists(),
        }
        for dataset_name, dataset_path in DATASETS.items()
    ]
)

display(availability_df)
"""
        )
    )

    cells.append(md("""## 3. Fonctions utilitaires"""))

    cells.append(
        code(
            """def find_target_column(df, target_name=TARGET_COLUMN):
    # Recherche simple de la colonne cible
    if target_name in df.columns:
        return target_name

    lowered = {col.strip().lower(): col for col in df.columns}
    lookup = target_name.strip().lower()

    if lookup in lowered:
        return lowered[lookup]

    raise KeyError(f"Target column '{target_name}' was not found in the dataset.")


def validate_preprocessed_features(X):
    # Les donnees synthetiques doivent deja etre numeriques et sans valeurs manquantes
    non_numeric_columns = X.select_dtypes(exclude=[np.number]).columns.tolist()
    if non_numeric_columns:
        raise ValueError(f"Non-numeric columns found: {non_numeric_columns}")

    if X.isnull().any().any():
        missing_total = int(X.isnull().sum().sum())
        raise ValueError(f"Found {missing_total} missing feature value(s).")


def load_dataset(path):
    # Chargement du dataset et separation X / y
    df = pd.read_csv(path)
    target_col = find_target_column(df)
    df = df.dropna(subset=[target_col]).copy()

    X = df.drop(columns=[target_col])
    validate_preprocessed_features(X)
    y_raw = df[target_col]

    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(y_raw.astype(str))

    dataset_info = {
        "Rows": len(df),
        "Columns": df.shape[1],
        "Features": X.shape[1],
        "Class 0 Count": int((y == 0).sum()),
        "Class 1 Count": int((y == 1).sum()),
    }

    return df, X, y, dataset_info


def safe_train_test_split(X, y):
    # Decoupage train/test avec stratification si possible
    class_counts = pd.Series(y).value_counts()
    stratify_target = y if class_counts.min() >= 2 else None

    return train_test_split(
        X,
        y,
        test_size=TEST_SIZE,
        random_state=SEED,
        stratify=stratify_target,
    )


def safe_metric(metric_function, *args, **kwargs):
    # Retourne NaN si une metrique echoue
    try:
        return metric_function(*args, **kwargs)
    except Exception:
        return np.nan


def compute_common_metrics(y_true, y_pred, y_prob=None):
    # Calcul des metriques principales
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    specificity = tn / (tn + fp) if (tn + fp) > 0 else np.nan
    npv = tn / (tn + fn) if (tn + fn) > 0 else np.nan

    return {
        "Accuracy": accuracy_score(y_true, y_pred),
        "Balanced Accuracy": balanced_accuracy_score(y_true, y_pred),
        "Precision": precision_score(y_true, y_pred, zero_division=0),
        "Recall": recall_score(y_true, y_pred, zero_division=0),
        "Specificity": specificity,
        "NPV": npv,
        "F1 Score": f1_score(y_true, y_pred, zero_division=0),
        "MCC": matthews_corrcoef(y_true, y_pred),
        "AUC-ROC": safe_metric(roc_auc_score, y_true, y_prob) if y_prob is not None else np.nan,
        "Log Loss": safe_metric(log_loss, y_true, y_prob, labels=[0, 1]) if y_prob is not None else np.nan,
    }


def compute_dnn_extra_metrics(y_true, y_prob):
    # Metriques supplementaires pour le DNN
    y_true = np.asarray(y_true).astype(int)
    mse_value = mean_squared_error(y_true, y_prob)

    return {
        "MSE": mse_value,
        "RMSE": np.sqrt(mse_value),
        "MAE": mean_absolute_error(y_true, y_prob),
        "R2": safe_metric(r2_score, y_true, y_prob),
        "Confusion Matrix": str(confusion_matrix(y_true, (np.asarray(y_prob) >= 0.5).astype(int), labels=[0, 1]).tolist()),
    }


def base_result(dataset_name, model_name):
    # Structure standard d'un resultat
    return {
        "Dataset": dataset_name,
        "Model": model_name,
        "Status": "Not run",
        "Error": None,
        "Accuracy": np.nan,
        "Balanced Accuracy": np.nan,
        "Precision": np.nan,
        "Recall": np.nan,
        "Specificity": np.nan,
        "NPV": np.nan,
        "F1 Score": np.nan,
        "MCC": np.nan,
        "AUC-ROC": np.nan,
        "Log Loss": np.nan,
        "Confusion Matrix": None,
        "MSE": np.nan,
        "RMSE": np.nan,
        "MAE": np.nan,
        "R2": np.nan,
        "Execution Time (s)": np.nan,
        "Peak Memory (MB)": np.nan,
    }


def get_model_registry():
    # Definition des modeles
    return {
        "RF": RandomForestClassifier(n_estimators=300, random_state=SEED, n_jobs=-1),
        "LR": LogisticRegression(max_iter=1000, random_state=SEED),
    }


def fit_sklearn_classifier(model, X_train, y_train, X_test):
    # Entrainement d'un modele sklearn
    model_instance = clone(model)
    model_instance.fit(X_train, y_train)
    y_pred = model_instance.predict(X_test)

    y_prob = None
    if hasattr(model_instance, "predict_proba"):
        y_prob = model_instance.predict_proba(X_test)[:, 1]

    return model_instance, y_pred, y_prob


def build_dnn_model(input_dim):
    # Architecture simple du DNN
    model = Sequential(
        [
            Input(shape=(input_dim,)),
            Dense(64, activation="relu"),
            Dense(32, activation="relu"),
            Dense(1, activation="sigmoid"),
        ]
    )

    model.compile(
        optimizer="adam",
        loss="binary_crossentropy",
        metrics=[
            "accuracy",
            tf.keras.metrics.Precision(name="precision"),
            tf.keras.metrics.Recall(name="recall"),
            tf.keras.metrics.AUC(name="auc"),
        ],
    )
    return model


def fit_dnn_classifier(X_train, y_train, X_test, verbose=0):
    # Entrainement du DNN
    if not TF_AVAILABLE:
        raise RuntimeError("TensorFlow is not available in this environment.")

    X_train_ready = np.asarray(X_train, dtype=np.float32)
    X_test_ready = np.asarray(X_test, dtype=np.float32)
    y_train_ready = np.asarray(y_train, dtype=np.float32)

    model = build_dnn_model(X_train_ready.shape[1])
    early_stopping = EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True)

    history = model.fit(
        X_train_ready,
        y_train_ready,
        validation_split=0.20,
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        verbose=verbose,
        callbacks=[early_stopping],
    )

    y_prob = model.predict(X_test_ready, verbose=0).ravel()
    y_pred = (y_prob >= 0.5).astype(int)
    return model, history, y_pred, y_prob
"""
        )
    )

    cells.append(md("""## 4. Inspection des datasets"""))

    cells.append(
        code(
            """# Resume simple des quatre datasets
dataset_overviews = []

for dataset_name, dataset_path in DATASETS.items():
    overview = {
        "Dataset": dataset_name,
        "Path": str(dataset_path),
        "Exists": dataset_path.exists(),
    }

    if dataset_path.exists():
        try:
            _, _, _, info = load_dataset(dataset_path)
            overview.update(info)
        except Exception as exc:
            overview["Error"] = f"{type(exc).__name__}: {exc}"
    else:
        overview["Error"] = f"File not found: {dataset_path}"

    dataset_overviews.append(overview)

dataset_overview_df = pd.DataFrame(dataset_overviews)
display(dataset_overview_df)
"""
        )
    )

    cells.append(md("""## 5. Execution du benchmark sur les 4 datasets synthetiques"""))

    cells.append(
        code(
            """# Evaluation des trois modeles sur chaque dataset
all_results = []

for dataset_name, dataset_path in DATASETS.items():
    print(f"Execution pour {dataset_name} ...")

    if not dataset_path.exists():
        missing_error = f"File not found: {dataset_path}"
        for model_name in ["RF", "LR", "DNN"]:
            failed_result = base_result(dataset_name, model_name)
            failed_result["Status"] = "Failed"
            failed_result["Error"] = missing_error
            all_results.append(failed_result)
        continue

    try:
        _, X, y, info = load_dataset(dataset_path)
        X_train, X_test, y_train, y_test = safe_train_test_split(X, y)
        models = get_model_registry()

        # Random Forest
        rf_result = base_result(dataset_name, "RF")
        start_time = perf_counter()
        tracemalloc.start()
        try:
            _, y_pred, y_prob = fit_sklearn_classifier(models["RF"], X_train, y_train, X_test)
            rf_result.update(compute_common_metrics(y_test, y_pred, y_prob))
            rf_result["Status"] = "Success"
        except Exception as exc:
            rf_result["Status"] = "Failed"
            rf_result["Error"] = f"{type(exc).__name__}: {exc}"
        finally:
            _, peak_memory = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            rf_result["Execution Time (s)"] = perf_counter() - start_time
            rf_result["Peak Memory (MB)"] = peak_memory / (1024 ** 2)

        # Logistic Regression
        lr_result = base_result(dataset_name, "LR")
        start_time = perf_counter()
        tracemalloc.start()
        try:
            _, y_pred, y_prob = fit_sklearn_classifier(models["LR"], X_train, y_train, X_test)
            lr_result.update(compute_common_metrics(y_test, y_pred, y_prob))
            lr_result["Status"] = "Success"
        except Exception as exc:
            lr_result["Status"] = "Failed"
            lr_result["Error"] = f"{type(exc).__name__}: {exc}"
        finally:
            _, peak_memory = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            lr_result["Execution Time (s)"] = perf_counter() - start_time
            lr_result["Peak Memory (MB)"] = peak_memory / (1024 ** 2)

        # DNN
        dnn_result = base_result(dataset_name, "DNN")
        start_time = perf_counter()
        tracemalloc.start()
        try:
            _, _, y_pred, y_prob = fit_dnn_classifier(X_train, y_train, X_test, verbose=0)
            dnn_result.update(compute_common_metrics(y_test, y_pred, y_prob))
            dnn_result.update(compute_dnn_extra_metrics(y_test, y_prob))
            dnn_result["Status"] = "Success"
        except Exception as exc:
            dnn_result["Status"] = "Failed"
            dnn_result["Error"] = f"{type(exc).__name__}: {exc}"
        finally:
            _, peak_memory = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            dnn_result["Execution Time (s)"] = perf_counter() - start_time
            dnn_result["Peak Memory (MB)"] = peak_memory / (1024 ** 2)
            if TF_AVAILABLE:
                tf.keras.backend.clear_session()

        for result in [rf_result, lr_result, dnn_result]:
            result["Rows"] = info["Rows"]
            result["Features"] = info["Features"]
            all_results.append(result)

    except Exception as exc:
        run_error = f"{type(exc).__name__}: {exc}"
        for model_name in ["RF", "LR", "DNN"]:
            failed_result = base_result(dataset_name, model_name)
            failed_result["Status"] = "Failed"
            failed_result["Error"] = run_error
            all_results.append(failed_result)

results_df = pd.DataFrame(all_results)
display_df = results_df.copy()
numeric_columns = display_df.select_dtypes(include=[np.number]).columns
display_df[numeric_columns] = display_df[numeric_columns].round(6)
display(display_df)
"""
        )
    )

    cells.append(md("""## 6. Construction des tableaux de resultats"""))

    cells.append(
        code(
            """# Tableaux de synthese
results_df["Rows"] = pd.to_numeric(results_df.get("Rows"), errors="coerce")
results_df["Features"] = pd.to_numeric(results_df.get("Features"), errors="coerce")

rf_lr_results_df = results_df[results_df["Model"].isin(["RF", "LR"])].copy()
dnn_results_df = results_df[results_df["Model"] == "DNN"].copy()

common_metrics = [
    "Accuracy",
    "Balanced Accuracy",
    "Precision",
    "Recall",
    "Specificity",
    "NPV",
    "F1 Score",
    "MCC",
    "AUC-ROC",
    "Execution Time (s)",
    "Peak Memory (MB)",
]

method_comparison_df = (
    results_df.groupby("Model")[common_metrics]
    .mean(numeric_only=True)
    .round(6)
    .sort_values(by=["F1 Score", "Accuracy"], ascending=False)
)

dataset_comparison_df = (
    results_df.groupby("Dataset")[common_metrics]
    .mean(numeric_only=True)
    .round(6)
    .sort_values(by=["F1 Score", "Accuracy"], ascending=False)
)

final_summary_df = results_df.sort_values(by=["Dataset", "Model"]).reset_index(drop=True)

print("Resultats detailles RF et LR")
display(rf_lr_results_df.round(6))

print("Resultats detailles DNN")
display(dnn_results_df.round(6))

print("Comparaison moyenne par modele")
display(method_comparison_df.reset_index())

print("Comparaison moyenne par dataset")
display(dataset_comparison_df.reset_index())

print("Tableau final global")
display(final_summary_df.round(6))
"""
        )
    )

    cells.append(md("""## 7. Preparation des visualisations"""))

    cells.append(
        code(
            """# Palette et fonctions utiles pour les graphiques
MODEL_PALETTE = {
    "RF": "#0F4C81",
    "LR": "#2E8B57",
    "DNN": "#C0392B",
}

PERFORMANCE_METRICS = ["Accuracy", "Precision", "Recall", "F1 Score"]


def set_plot_theme():
    sns.set_theme(style="whitegrid", context="talk")
    plt.rcParams["figure.figsize"] = (12, 6)
    plt.rcParams["axes.titlesize"] = 16
    plt.rcParams["axes.labelsize"] = 12


def save_figure(fig, filename):
    figure_dir = Path("benchmark_outputs") / "figures"
    figure_dir.mkdir(parents=True, exist_ok=True)
    fig.savefig(figure_dir / filename, dpi=300, bbox_inches="tight")


def annotate_bars(ax):
    for container in ax.containers:
        labels = []
        for bar in container:
            height = bar.get_height()
            labels.append("" if pd.isna(height) else f"{height:.3f}")
        ax.bar_label(container, labels=labels, padding=3, fontsize=9)


def min_max_normalize(series, invert=False):
    series = series.astype(float)
    minimum = series.min()
    maximum = series.max()
    if pd.isna(minimum) or pd.isna(maximum) or minimum == maximum:
        normalized = pd.Series(np.ones(len(series)), index=series.index)
    else:
        normalized = (series - minimum) / (maximum - minimum)
    return 1 - normalized if invert else normalized


set_plot_theme()
plot_results_df = results_df[results_df["Status"] == "Success"].copy()
plot_results_df["Rows"] = pd.to_numeric(plot_results_df["Rows"], errors="coerce")
"""
        )
    )

    cells.append(md("""## 8. Graphiques de performance globale"""))

    cells.append(
        code(
            """if plot_results_df.empty:
    print("Aucun resultat valide pour les graphes.")
else:
    # Barres groupees : comparaison des metriques principales
    avg_metric_df = (
        plot_results_df.groupby("Model")[PERFORMANCE_METRICS]
        .mean(numeric_only=True)
        .reset_index()
        .melt(id_vars="Model", var_name="Metric", value_name="Score")
    )

    fig, ax = plt.subplots(figsize=(14, 7))
    sns.barplot(data=avg_metric_df, x="Metric", y="Score", hue="Model", palette=MODEL_PALETTE, ax=ax)
    annotate_bars(ax)
    ax.set_title("Performance moyenne par modele")
    ax.set_ylim(0, 1.05)
    plt.tight_layout()
    save_figure(fig, "01_grouped_bar_overall_performance.png")
    plt.show()

    # Courbes : evolution selon le volume des donnees
    fig, axes = plt.subplots(1, 2, figsize=(18, 6), sharex=True)
    for ax, metric in zip(axes, ["Accuracy", "F1 Score"]):
        sns.lineplot(
            data=plot_results_df.sort_values("Rows"),
            x="Rows",
            y=metric,
            hue="Model",
            style="Model",
            markers=True,
            dashes=False,
            palette=MODEL_PALETTE,
            ax=ax,
        )
        ax.set_title(f"{metric} selon le volume des donnees")
        ax.set_xlabel("Nombre de lignes")
        ax.set_ylabel(metric)

    plt.tight_layout()
    save_figure(fig, "02_lineplot_score_vs_volume.png")
    plt.show()

    # Heatmaps : comparaison compacte
    fig, axes = plt.subplots(2, 2, figsize=(18, 12))
    for ax, metric in zip(axes.flatten(), PERFORMANCE_METRICS):
        metric_matrix = plot_results_df.pivot(index="Dataset", columns="Model", values=metric)
        sns.heatmap(metric_matrix, annot=True, fmt=".3f", cmap="YlGnBu", linewidths=0.5, cbar=False, ax=ax)
        ax.set_title(f"Heatmap - {metric}")

    plt.tight_layout()
    save_figure(fig, "03_heatmaps_performance.png")
    plt.show()
"""
        )
    )

    cells.append(md("""## 9. Graphiques de fiabilite et de robustesse"""))

    cells.append(
        code(
            """cv_results_df = pd.DataFrame()
cv_summary_df = pd.DataFrame()
diagnostic_runs = []

if DATASET_DIAGNOSTIC not in DATASETS:
    print(f"Dataset de diagnostic introuvable : {DATASET_DIAGNOSTIC}")
else:
    try:
        # Validation croisee sur un dataset representatif
        cv_results_df = pd.DataFrame()
        dataset_path = DATASETS[DATASET_DIAGNOSTIC]
        _, X, y, _ = load_dataset(dataset_path)
        splitter = StratifiedKFold(n_splits=CV_SPLITS, shuffle=True, random_state=SEED)

        cv_records = []
        for fold_idx, (train_idx, test_idx) in enumerate(splitter.split(X, y), start=1):
            X_train = X.iloc[train_idx]
            X_test = X.iloc[test_idx]
            y_train = y[train_idx]
            y_test = y[test_idx]

            for model_name, model in get_model_registry().items():
                _, y_pred, y_prob = fit_sklearn_classifier(model, X_train, y_train, X_test)
                metrics = compute_common_metrics(y_test, y_pred, y_prob)
                cv_records.append(
                    {
                        "Dataset": DATASET_DIAGNOSTIC,
                        "Fold": fold_idx,
                        "Model": model_name,
                        "Accuracy": metrics["Accuracy"],
                        "Recall": metrics["Recall"],
                        "F1 Score": metrics["F1 Score"],
                        "AUC-ROC": metrics["AUC-ROC"],
                    }
                )

            if TF_AVAILABLE:
                _, _, y_pred, y_prob = fit_dnn_classifier(X_train, y_train, X_test, verbose=0)
                metrics = compute_common_metrics(y_test, y_pred, y_prob)
                cv_records.append(
                    {
                        "Dataset": DATASET_DIAGNOSTIC,
                        "Fold": fold_idx,
                        "Model": "DNN",
                        "Accuracy": metrics["Accuracy"],
                        "Recall": metrics["Recall"],
                        "F1 Score": metrics["F1 Score"],
                        "AUC-ROC": metrics["AUC-ROC"],
                    }
                )
                tf.keras.backend.clear_session()

        cv_results_df = pd.DataFrame(cv_records)

        if not cv_results_df.empty:
            cv_summary_df = (
                cv_results_df.groupby("Model")[["Accuracy", "Recall", "F1 Score", "AUC-ROC"]]
                .agg(["mean", "std"])
                .round(4)
            )
            display(cv_summary_df)

            cv_plot_df = cv_results_df.melt(
                id_vars=["Dataset", "Fold", "Model"],
                value_vars=["Accuracy", "Recall", "F1 Score", "AUC-ROC"],
                var_name="Metric",
                value_name="Score",
            )

            fig, axes = plt.subplots(2, 2, figsize=(18, 12), sharey=True)
            for ax, metric in zip(axes.flatten(), ["Accuracy", "Recall", "F1 Score", "AUC-ROC"]):
                metric_slice = cv_plot_df[cv_plot_df["Metric"] == metric]
                sns.boxplot(data=metric_slice, x="Model", y="Score", palette=MODEL_PALETTE, ax=ax)
                sns.stripplot(data=metric_slice, x="Model", y="Score", color="black", size=4, alpha=0.55, ax=ax)
                ax.set_title(f"Distribution de {metric}")
                ax.set_ylim(0, 1.05)

            plt.tight_layout()
            save_figure(fig, "04_boxplots_cv_results.png")
            plt.show()

        # ROC curves et matrices de confusion
        _, X, y, info = load_dataset(DATASETS[DATASET_DIAGNOSTIC])
        X_train, X_test, y_train, y_test = safe_train_test_split(X, y)

        for model_name, model in get_model_registry().items():
            fitted_model, y_pred, y_prob = fit_sklearn_classifier(model, X_train, y_train, X_test)
            fpr, tpr, _ = roc_curve(y_test, y_prob)
            diagnostic_runs.append(
                {
                    "Model": model_name,
                    "AUC-ROC": safe_metric(roc_auc_score, y_test, y_prob),
                    "Confusion Matrix": confusion_matrix(y_test, y_pred, labels=[0, 1]),
                    "FPR": fpr,
                    "TPR": tpr,
                    "Feature Names": X.columns.tolist(),
                    "Fitted Model": fitted_model,
                    "Class Names": ["0", "1"],
                }
            )

        if TF_AVAILABLE:
            _, _, y_pred, y_prob = fit_dnn_classifier(X_train, y_train, X_test, verbose=0)
            fpr, tpr, _ = roc_curve(y_test, y_prob)
            diagnostic_runs.append(
                {
                    "Model": "DNN",
                    "AUC-ROC": safe_metric(roc_auc_score, y_test, y_prob),
                    "Confusion Matrix": confusion_matrix(y_test, y_pred, labels=[0, 1]),
                    "FPR": fpr,
                    "TPR": tpr,
                    "Feature Names": X.columns.tolist(),
                    "Fitted Model": None,
                    "Class Names": ["0", "1"],
                }
            )
            tf.keras.backend.clear_session()

        fig, ax = plt.subplots(figsize=(10, 8))
        for run in diagnostic_runs:
            ax.plot(run["FPR"], run["TPR"], label=f"{run['Model']} (AUC = {run['AUC-ROC']:.3f})", linewidth=2)
        ax.plot([0, 1], [0, 1], linestyle="--", color="gray", linewidth=1)
        ax.set_title(f"Courbes ROC sur {DATASET_DIAGNOSTIC}")
        ax.legend(loc="lower right")
        plt.tight_layout()
        save_figure(fig, "05_roc_curves_models.png")
        plt.show()

        fig, axes = plt.subplots(1, len(diagnostic_runs), figsize=(6 * len(diagnostic_runs), 5))
        if len(diagnostic_runs) == 1:
            axes = [axes]

        for ax, run in zip(axes, diagnostic_runs):
            sns.heatmap(run["Confusion Matrix"], annot=True, fmt="d", cmap="Blues", cbar=False, ax=ax)
            ax.set_title(f"Matrice de confusion - {run['Model']}")

        plt.tight_layout()
        save_figure(fig, "06_confusion_matrices_models.png")
        plt.show()

    except Exception as exc:
        print(f"Section robustesse en erreur : {type(exc).__name__}: {exc}")
"""
        )
    )

    cells.append(md("""## 10. Graphiques de cout computationnel"""))

    cells.append(
        code(
            """if plot_results_df.empty:
    print("Aucun resultat valide pour les graphes de cout.")
else:
    # Temps d'execution vs accuracy
    fig, ax = plt.subplots(figsize=(11, 7))
    sns.scatterplot(
        data=plot_results_df,
        x="Execution Time (s)",
        y="Accuracy",
        hue="Model",
        style="Dataset",
        size="Rows",
        sizes=(120, 400),
        palette=MODEL_PALETTE,
        ax=ax,
    )
    ax.set_title("Temps d'execution vs Accuracy")
    plt.tight_layout()
    save_figure(fig, "07_training_time_vs_accuracy.png")
    plt.show()

    # Memoire vs F1 Score
    fig, ax = plt.subplots(figsize=(11, 7))
    sns.scatterplot(
        data=plot_results_df,
        x="Peak Memory (MB)",
        y="F1 Score",
        hue="Model",
        style="Dataset",
        size="Rows",
        sizes=(120, 400),
        palette=MODEL_PALETTE,
        ax=ax,
    )
    ax.set_title("Performance vs cout memoire")
    plt.tight_layout()
    save_figure(fig, "08_performance_vs_memory_cost.png")
    plt.show()

    # Radar chart de synthese
    radar_df = method_comparison_df[["Accuracy", "Recall", "F1 Score", "Execution Time (s)", "Peak Memory (MB)"]].copy()
    radar_df["Execution Time (s)"] = min_max_normalize(radar_df["Execution Time (s)"], invert=True)
    radar_df["Peak Memory (MB)"] = min_max_normalize(radar_df["Peak Memory (MB)"], invert=True)
    radar_df["Accuracy"] = min_max_normalize(radar_df["Accuracy"])
    radar_df["Recall"] = min_max_normalize(radar_df["Recall"])
    radar_df["F1 Score"] = min_max_normalize(radar_df["F1 Score"])

    radar_labels = ["Accuracy", "Recall", "F1 Score", "Faible temps", "Faible memoire"]
    radar_values_df = radar_df.copy()
    radar_values_df.columns = radar_labels

    angles = np.linspace(0, 2 * np.pi, len(radar_labels), endpoint=False).tolist()
    angles += angles[:1]

    fig, ax = plt.subplots(figsize=(9, 9), subplot_kw=dict(polar=True))
    for model_name, row in radar_values_df.iterrows():
        values = row.tolist()
        values += values[:1]
        ax.plot(angles, values, linewidth=2, label=model_name, color=MODEL_PALETTE.get(model_name))
        ax.fill(angles, values, alpha=0.10, color=MODEL_PALETTE.get(model_name))

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(radar_labels)
    ax.set_yticklabels([])
    ax.set_title("Radar chart : resume performance / cout", pad=20)
    ax.legend(loc="upper right", bbox_to_anchor=(1.25, 1.15))
    plt.tight_layout()
    save_figure(fig, "09_radar_chart_summary.png")
    plt.show()
"""
        )
    )

    cells.append(md("""## 11. Graphiques optionnels pour Random Forest"""))

    cells.append(
        code(
            """# Ces graphes sont utiles si tu veux expliquer RF dans le memoire
rf_diagnostic = next((run for run in diagnostic_runs if run.get("Model") == "RF"), None)

if rf_diagnostic is None:
    print("Graphes RF non disponibles.")
else:
    # Importance des variables
    importance_df = pd.DataFrame(
        {
            "Feature": rf_diagnostic["Feature Names"],
            "Importance": rf_diagnostic["Fitted Model"].feature_importances_,
        }
    ).sort_values("Importance", ascending=False).head(15)

    fig, ax = plt.subplots(figsize=(12, 8))
    sns.barplot(data=importance_df, x="Importance", y="Feature", color=MODEL_PALETTE["RF"], ax=ax)
    ax.set_title(f"Top 15 des variables importantes - RF ({DATASET_DIAGNOSTIC})")
    plt.tight_layout()
    save_figure(fig, "10_rf_feature_importance.png")
    plt.show()
"""
        )
    )

    cells.append(md("""## 12. Export CSV des resultats"""))

    cells.append(
        code(
            """# Sauvegarde des tableaux de resultats
output_dir = Path("benchmark_outputs")
output_dir.mkdir(parents=True, exist_ok=True)

dataset_overview_df.to_csv(output_dir / "dataset_overview.csv", index=False)
results_df.to_csv(output_dir / "all_model_results.csv", index=False)
rf_lr_results_df.to_csv(output_dir / "rf_lr_results.csv", index=False)
dnn_results_df.to_csv(output_dir / "dnn_results.csv", index=False)
method_comparison_df.to_csv(output_dir / "method_comparison.csv")
dataset_comparison_df.to_csv(output_dir / "dataset_comparison.csv")
final_summary_df.to_csv(output_dir / "final_summary.csv", index=False)

if not cv_results_df.empty:
    cv_results_df.to_csv(output_dir / "cv_results.csv", index=False)
if not cv_summary_df.empty:
    cv_summary_df.to_csv(output_dir / "cv_summary.csv")

print(f"Resultats CSV sauvegardes dans : {output_dir.resolve()}")
"""
        )
    )

    cells.append(
        md(
            """## 13. Notes finales

- Le notebook est maintenant organise en sections claires.
- Les commentaires dans le code sont simples et en francais.
- Les resultats sont exportes en CSV.
- Tu n'as pas besoin d'ajouter tous les graphes possibles.
- Les graphes deja presents sont suffisants pour une comparaison propre et professionnelle.
"""
        )
    )

    notebook["cells"] = cells
    NOTEBOOK_PATH.write_text(json.dumps(notebook, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"Notebook mis a jour : {NOTEBOOK_PATH}")
    print(f"Sauvegarde creee : {BACKUP_PATH}")


if __name__ == "__main__":
    main()
