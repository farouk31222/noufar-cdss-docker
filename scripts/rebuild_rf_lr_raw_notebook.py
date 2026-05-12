import json
import uuid
from pathlib import Path


NOTEBOOK_PATH = Path(r"D:\Test IA\Data-NOTclean\RF-LR.ipynb")
BACKUP_PATH = Path(r"D:\Test IA\Data-NOTclean\RF-LR.french-structured-backup.ipynb")


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
            """# Comparaison Logistic Regression vs Random Forest sur la base brute

Ce notebook compare :
- `Logistic Regression`
- `Random Forest`

sur le fichier Excel brut, **sans nettoyage ni prétraitement**.

Contraintes respectées :
- aucune suppression de valeurs manquantes
- aucune imputation
- aucune suppression de doublons
- aucune normalisation ou standardisation
- aucune modification manuelle du dataset
"""
        )
    )

    cells.append(
        md(
            """## 1. Importation des bibliothèques

Cette section importe les outils nécessaires pour :
- charger la base brute
- entraîner les deux modèles
- calculer les métriques
- mesurer le temps et la mémoire
- exporter les résultats en CSV
"""
        )
    )

    cells.append(
        code(
            """from pathlib import Path
from time import perf_counter
import tracemalloc
import warnings

import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    matthews_corrcoef,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

warnings.filterwarnings("ignore")

try:
    from codecarbon import EmissionsTracker
    CODECARBON_AVAILABLE = True
except Exception:
    EmissionsTracker = None
    CODECARBON_AVAILABLE = False
"""
        )
    )

    cells.append(
        md(
            """## 2. Définition du fichier source et des paramètres

Ici, on définit :
- le chemin du fichier Excel brut
- la variable cible
- les paramètres du découpage train/test
"""
        )
    )

    cells.append(
        code(
            """DATASET_FILE = "data hyperthyroidie V1.xlsx"
TARGET_COLUMN = "recidive"
TEST_SIZE = 0.20
RANDOM_STATE = 42


def resolve_dataset_path(filename):
    # On cherche le fichier dans plusieurs emplacements possibles.
    candidates = [
        Path(filename),
        Path("Data-NOTclean") / filename,
        Path("..") / "Data-NOTclean" / filename,
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return candidates[0]


DATASET_PATH = resolve_dataset_path(DATASET_FILE)
print(f"Fichier utilisé : {DATASET_PATH}")
"""
        )
    )

    cells.append(
        md(
            """## 3. Chargement et inspection rapide de la base brute

Le fichier est chargé **exactement tel qu'il est**.
On affiche simplement quelques informations descriptives sans rien modifier.
"""
        )
    )

    cells.append(
        code(
            """# Chargement brut du fichier Excel.
df = pd.read_excel(DATASET_PATH)

print("Dimensions du dataset brut :", df.shape)
print("\\nAperçu des 5 premières lignes :")
display(df.head())

print("\\nTypes de variables :")
display(df.dtypes.to_frame(name="dtype"))

print("\\nNombre de valeurs manquantes par colonne :")
display(df.isna().sum().to_frame(name="missing_values"))
"""
        )
    )

    cells.append(
        md(
            """## 4. Séparation de la cible et des variables explicatives

On sépare :
- `X` : les variables explicatives
- `y` : la variable cible `recidive`

Cette étape est faite **sans transformation** des données.
"""
        )
    )

    cells.append(
        code(
            """# Séparation simple entre les variables explicatives et la cible.
X = df.drop(columns=[TARGET_COLUMN])
y = df[TARGET_COLUMN]

print("Shape de X :", X.shape)
print("Shape de y :", y.shape)
print("\\nRépartition de la cible :")
display(y.value_counts(dropna=False).to_frame(name="count"))
"""
        )
    )

    cells.append(
        md(
            """## 5. Fonctions utilitaires pour les métriques

Cette section définit :
- le calcul des métriques de classification
- la gestion du suivi énergétique si `codecarbon` est disponible
"""
        )
    )

    cells.append(
        code(
            """def compute_binary_metrics(y_true, y_pred):
    # Calcul des métriques binaires demandées.
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()

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
    }


def start_energy_tracker(project_name):
    # Démarrage du suivi énergétique si codecarbon est disponible.
    if not CODECARBON_AVAILABLE:
        return None

    try:
        tracker = EmissionsTracker(project_name=project_name, save_to_file=False, log_level="error")
        tracker.start()
        return tracker
    except Exception:
        return None


def stop_energy_tracker(tracker):
    # Arrêt du suivi énergétique.
    if tracker is None:
        return np.nan

    try:
        return tracker.stop()
    except Exception:
        return np.nan
"""
        )
    )

    cells.append(
        md(
            """## 6. Découpage train/test

Le découpage est réalisé une seule fois pour que les deux modèles soient comparés sur le même split.
"""
        )
    )

    cells.append(
        code(
            """split_error = None

try:
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    print("Découpage train/test réussi.")
    print("X_train :", X_train.shape)
    print("X_test  :", X_test.shape)

except Exception as exc:
    split_error = f"{type(exc).__name__}: {exc}"
    print("Le découpage train/test a échoué.")
    print(split_error)
"""
        )
    )

    cells.append(
        md(
            """## 7. Entraînement et évaluation des modèles

On entraîne les deux modèles sur les données brutes :
- `Logistic Regression`
- `Random Forest`

Si un modèle échoue à cause des données brutes, l'erreur est gardée dans le tableau final.
"""
        )
    )

    cells.append(
        code(
            """models = {
    "Logistic Regression": LogisticRegression(max_iter=1000),
    "Random Forest": RandomForestClassifier(random_state=RANDOM_STATE),
}

results = []

if split_error is not None:
    for model_name in models:
        results.append(
            {
                "Model": model_name,
                "Status": "Failed",
                "Error": f"Train/test split failed before model fitting: {split_error}",
                "Accuracy": np.nan,
                "Balanced Accuracy": np.nan,
                "Precision": np.nan,
                "Recall": np.nan,
                "Specificity": np.nan,
                "NPV": np.nan,
                "F1 Score": np.nan,
                "MCC": np.nan,
                "Execution Time (s)": np.nan,
                "Peak Memory (MB)": np.nan,
                "Energy Consumption (kg CO2eq)": np.nan,
            }
        )
else:
    for model_name, model in models.items():
        print(f"\\nExécution de : {model_name}")

        tracker = None
        start_time = perf_counter()
        tracemalloc.start()

        result = {
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
            "Execution Time (s)": np.nan,
            "Peak Memory (MB)": np.nan,
            "Energy Consumption (kg CO2eq)": np.nan,
        }

        try:
            tracker = start_energy_tracker(project_name=f"raw_{model_name.replace(' ', '_')}")

            # Entraînement du modèle sur la base brute.
            model.fit(X_train, y_train)

            # Prédictions sur le jeu de test.
            y_pred = model.predict(X_test)

            # Calcul des métriques.
            result.update(compute_binary_metrics(y_test, y_pred))
            result["Status"] = "Success"

        except Exception as exc:
            result["Status"] = "Failed"
            result["Error"] = f"{type(exc).__name__}: {exc}"

        finally:
            _, peak_memory = tracemalloc.get_traced_memory()
            tracemalloc.stop()

            result["Execution Time (s)"] = perf_counter() - start_time
            result["Peak Memory (MB)"] = peak_memory / (1024 ** 2)
            result["Energy Consumption (kg CO2eq)"] = stop_energy_tracker(tracker)

        results.append(result)

results_df = pd.DataFrame(results)
results_df
"""
        )
    )

    cells.append(
        md(
            """## 8. Affichage propre des résultats

On affiche ici le tableau final de comparaison avec un arrondi des colonnes numériques.
"""
        )
    )

    cells.append(
        code(
            """display_df = results_df.copy()
numeric_columns = display_df.select_dtypes(include=[np.number]).columns
display_df[numeric_columns] = display_df[numeric_columns].round(6)
display(display_df)
"""
        )
    )

    cells.append(
        md(
            """## 9. Export CSV des résultats

Les résultats sont exportés dans un dossier `benchmark_outputs` pour réutilisation dans le mémoire ou dans d'autres scripts.
"""
        )
    )

    cells.append(
        code(
            """output_dir = Path("benchmark_outputs")
output_dir.mkdir(parents=True, exist_ok=True)

results_df.to_csv(output_dir / "raw_rf_lr_results.csv", index=False)
display_df.to_csv(output_dir / "raw_rf_lr_results_rounded.csv", index=False)

print(f"Résultats CSV sauvegardés dans : {output_dir.resolve()}")
"""
        )
    )

    cells.append(
        md(
            """## 10. Notes finales

- Le dataset est utilisé **dans sa forme brute**.
- Si un modèle échoue à cause des valeurs manquantes, des chaînes de caractères ou des types non supportés, l'erreur est gardée dans le tableau final.
- Le notebook a été organisé avec des commentaires simples en français.
- Les résultats sont exportés en CSV à la fin.
"""
        )
    )

    notebook["cells"] = cells
    NOTEBOOK_PATH.write_text(json.dumps(notebook, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"Notebook mis à jour : {NOTEBOOK_PATH}")
    print(f"Sauvegarde créée : {BACKUP_PATH}")


if __name__ == "__main__":
    main()
