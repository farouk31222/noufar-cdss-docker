# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path
import unicodedata

import joblib
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import RobustScaler, StandardScaler

NUMERIC_INPUT_COLUMNS = ["TSH", "FT4", "TSIlevel", "AntiTPOtotal", "duration", "age"]
ROBUST_INPUT_COLUMNS = ["TSH", "FT4", "TSIlevel", "AntiTPOtotal", "duration"]
TARGET_COLUMN = "Recidive"
BOOLEAN_OUTPUT_COLUMNS = [
    ("stress", "stress"),
    ("palpitations", "palpitations"),
    ("spp", "spp"),
    ("amg", "amg"),
    ("diarrhee", "diarrhee"),
    ("tremors", "temeblements"),
    ("agitation", "agitation"),
    ("moodDisorder", "troublehumeur"),
    ("sleepDisorder", "sommeil"),
    ("excessSweating", "hypersud"),
    ("heatIntolerance", "thermophobie"),
    ("muscleWeakness", "faiblessemusc"),
    ("goiter", "goitre"),
    ("blockAndReplace", "blockandrep"),
    ("surgery", "chirurgie"),
    ("radioactiveIodine", "IRA"),
]


def normalize_label(value):
    text = str(value).strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(character for character in text if not unicodedata.combining(character))
    return text.replace("_", "").replace(" ", "")



def resolve_column(columns, candidates):
    normalized_map = {normalize_label(column): column for column in columns}
    for candidate in candidates:
        match = normalized_map.get(normalize_label(candidate))
        if match:
            return match
    raise KeyError(f"Impossible de trouver la colonne parmi: {candidates}")



def normalize_choice(value):
    return normalize_label(value)



def coerce_boolean(value):
    if isinstance(value, bool):
        return value
    return normalize_choice(value) in {"yes", "true", "1", "on", "positive"}



def get_series(frame, column_name, default_value=""):
    if column_name in frame.columns:
        return frame[column_name]
    return pd.Series([default_value] * len(frame), index=frame.index)



def read_dataframe(path):
    file_path = Path(path)
    suffix = file_path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(file_path)
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(file_path)
    raise ValueError(f"Unsupported dataset format: {file_path}")


class GravesFormPreprocessor(BaseEstimator, TransformerMixin):
    def __init__(self, feature_names):
        self.feature_names = list(feature_names)

    def fit(self, X, y=None):
        frame = self._ensure_dataframe(X)
        numeric_frame = pd.DataFrame(index=frame.index)

        for column in NUMERIC_INPUT_COLUMNS:
            numeric_frame[column] = pd.to_numeric(get_series(frame, column), errors="coerce")

        self.numeric_medians_ = numeric_frame.median(numeric_only=True)
        numeric_frame = numeric_frame.fillna(self.numeric_medians_)

        self.robust_scaler_ = RobustScaler().fit(numeric_frame[ROBUST_INPUT_COLUMNS])
        self.standard_scaler_ = StandardScaler().fit(numeric_frame[["age"]])
        self.feature_names_out_ = list(self.feature_names)
        return self

    def transform(self, X):
        self._ensure_fitted()
        frame = self._ensure_dataframe(X)
        numeric_frame = pd.DataFrame(index=frame.index)

        for column in NUMERIC_INPUT_COLUMNS:
            numeric_frame[column] = pd.to_numeric(get_series(frame, column), errors="coerce")

        numeric_frame = numeric_frame.fillna(self.numeric_medians_)

        robust_values = self.robust_scaler_.transform(numeric_frame[ROBUST_INPUT_COLUMNS])
        age_values = self.standard_scaler_.transform(numeric_frame[["age"]])[:, 0]

        transformed = pd.DataFrame(0.0, index=frame.index, columns=self.feature_names_out_)
        transformed["TSH"] = robust_values[:, 0]
        transformed["FT4"] = robust_values[:, 1]
        transformed["TSItaux"] = robust_values[:, 2]
        transformed["AntiTPOTAUX"] = robust_values[:, 3]
        transformed["duréeATS"] = robust_values[:, 4]
        transformed["AGE"] = age_values

        for input_name, output_name in BOOLEAN_OUTPUT_COLUMNS:
            if output_name in transformed.columns:
                transformed[output_name] = get_series(frame, input_name, False).map(coerce_boolean).astype(float)

        anti_tpo = get_series(frame, "antiTPO", "").map(normalize_choice)
        anti_tg = get_series(frame, "antiTg", "").map(normalize_choice)
        tsi_status = get_series(frame, "TSI", "").map(normalize_choice)
        consult_reason = get_series(frame, "consultReason", "").map(normalize_choice)
        goiter_class = get_series(frame, "goiterClass", "").astype(str).str.strip().str.upper()
        ultrasound = get_series(frame, "ultrasound", "").map(normalize_choice)
        scintigraphy = get_series(frame, "scintigraphy", "").map(normalize_choice)
        therapy = get_series(frame, "therapy", "").map(normalize_choice)

        transformed["AntiTPO_NEGATIFS"] = anti_tpo.eq("negative").astype(float)
        transformed["AntiTPO_POSITIFS"] = anti_tpo.eq("positive").astype(float)
        transformed["AntiTg_NEGATIFS"] = anti_tg.eq("negative").astype(float)
        transformed["AntiTg_POSITIFS"] = anti_tg.eq("positive").astype(float)
        transformed["TSI_NEGATIFS"] = tsi_status.eq("negative").astype(float)
        transformed["TSI_POSITIFS"] = tsi_status.eq("positive").astype(float)

        transformed["motifconsult_DYSTHYROIDIE"] = consult_reason.eq("dysthyroidie").astype(float)
        transformed["motifconsult_Signes de compression"] = consult_reason.isin(
            {"signesdecompression", "compressionsigns"}
        ).astype(float)

        transformed["classifgoitre_0"] = goiter_class.eq("0").astype(float)
        transformed["classifgoitre_1A"] = goiter_class.eq("1A").astype(float)
        transformed["classifgoitre_2"] = goiter_class.eq("2").astype(float)
        transformed["classifgoitre_3"] = goiter_class.eq("3").astype(float)

        transformed["Echographie_goitre"] = ultrasound.isin(
            {"goitre", "goiter", "diffusegoiterwithvascularpattern"}
        ).astype(float)
        transformed["Echographie_goitre + nodules"] = ultrasound.isin(
            {"goitre+nodules", "goiter+nodules", "goiterwithnodules"}
        ).astype(float)
        transformed["Echographie_volume normal"] = ultrasound.isin(
            {"volumenormal", "normalvolume", "normalthyroidvolume", "mildheterogeneoustexture"}
        ).astype(float)

        transformed["Scintigraphie_hypercaptante"] = scintigraphy.isin(
            {"hypercaptante", "highuptake"}
        ).astype(float)
        transformed["Scintigraphie_nodule chaud"] = scintigraphy.isin(
            {"nodulechaud", "hotnodule"}
        ).astype(float)
        transformed["Scintigraphie_normocaptante"] = scintigraphy.isin(
            {"normocaptante", "normaluptake"}
        ).astype(float)

        transformed["Therapie_ATS"] = therapy.eq("ats").astype(float)
        return transformed[self.feature_names_out_]

    def get_feature_names_out(self, input_features=None):
        self._ensure_fitted()
        return list(self.feature_names_out_)

    @staticmethod
    def _ensure_dataframe(X):
        if isinstance(X, pd.DataFrame):
            return X.copy()
        return pd.DataFrame(X)

    def _ensure_fitted(self):
        if not hasattr(self, "feature_names_out_"):
            raise RuntimeError("Le preprocessor doit etre entraine avant utilisation.")



def build_numeric_fit_frame(raw_df):
    numeric_columns = {
        "TSH": resolve_column(raw_df.columns, ["TSH"]),
        "FT4": resolve_column(raw_df.columns, ["FT4"]),
        "TSIlevel": resolve_column(raw_df.columns, ["TSItaux", "TSI taux", "TSIlevel"]),
        "AntiTPOtotal": resolve_column(raw_df.columns, ["AntiTPOTAUX", "Anti TPO TAUX", "AntiTPOtotal"]),
        "duration": resolve_column(raw_df.columns, ["duréeATS", "dureeATS", "durée ATS", "duree ATS"]),
        "age": resolve_column(raw_df.columns, ["AGE", "Age"]),
    }

    fit_frame = pd.DataFrame(index=raw_df.index)
    for target_name, source_name in numeric_columns.items():
        fit_frame[target_name] = pd.to_numeric(raw_df[source_name], errors="coerce")

    return fit_frame



def fit_graves_preprocessor(feature_names, raw_data_path):
    raw_df = read_dataframe(raw_data_path)
    fit_frame = build_numeric_fit_frame(raw_df)
    return GravesFormPreprocessor(feature_names=feature_names).fit(fit_frame)



def build_prediction_pipeline_from_model(model, feature_names, raw_data_path):
    preprocessor = fit_graves_preprocessor(feature_names=feature_names, raw_data_path=raw_data_path)
    return Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", model),
    ])



def load_training_dataset(dataset_path, feature_names, target_column=TARGET_COLUMN):
    dataset = read_dataframe(dataset_path)
    if target_column not in dataset.columns:
        raise KeyError(f"La colonne cible '{target_column}' est introuvable dans {dataset_path}.")

    missing_features = [feature for feature in feature_names if feature not in dataset.columns]
    if missing_features:
        raise KeyError(f"Features manquantes dans {dataset_path}: {missing_features}")

    features = dataset[feature_names].apply(pd.to_numeric, errors="coerce").fillna(0.0)
    target = pd.to_numeric(dataset[target_column], errors="coerce").fillna(0).astype(int)
    return features, target



def export_preprocessor(preprocessor, output_path):
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(preprocessor, destination)
    return destination



def export_sklearn_pipeline(model, feature_names, raw_data_path, output_path):
    pipeline = build_prediction_pipeline_from_model(model, feature_names, raw_data_path)
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, destination)
    return pipeline



def build_prediction_pipeline(model_path, feature_names_path, raw_data_path, pipeline_path=None, force_rebuild=False):
    pipeline_file = Path(pipeline_path) if pipeline_path else None

    if pipeline_file and pipeline_file.exists() and not force_rebuild:
        return joblib.load(pipeline_file)

    model = joblib.load(model_path)
    feature_names = joblib.load(feature_names_path)
    pipeline = build_prediction_pipeline_from_model(
        model=model,
        feature_names=feature_names,
        raw_data_path=raw_data_path,
    )

    if pipeline_file:
        pipeline_file.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(pipeline, pipeline_file)

    return pipeline
