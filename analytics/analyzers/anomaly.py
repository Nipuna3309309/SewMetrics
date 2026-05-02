"""
Model 1 — Isolation Forest (Real-time Multi-sensor Anomaly Detection)

Input  : 9 engineered features from ALL 4 sensors combined (see features.py)
Purpose: Detect when the machine is behaving abnormally RIGHT NOW

Algorithm: Isolation Forest (Liu et al., 2008)
  - Unsupervised — no labeled failure data required
  - Naturally handles multivariate, non-Gaussian data
  - Trained on rolling window of recent readings → adaptive baseline
  - Anomaly score normalized to 0-1 for dashboard gauge

Feature importance proxy: z-score deviation analysis
  - For each feature, compute how many σ it deviates from its training mean
  - Features with highest |z| are "top contributors" to the anomaly
  - Maps back to component names (rpm / stitches / vibration / temperature)
  - Fully explainable to examiner or operator

Outputs:
  anomaly_flag      (bool)
  anomaly_score     (float 0-1, higher = more anomalous)
  status            ("normal" | "watch" | "warning" | "critical" | "idle")
  top_contributors  (list of {feature, z_score, component})
  component_flags   ({rpm, stitches, vibration, temperature} → bool)
  feature_vector    (the 9 raw feature values for the latest window)
  feature_z_scores  (z-score of each feature vs training distribution)
  model             ("isolation_forest" | "zscore_fallback")
  samples_used      (int)
"""

import numpy as np
from sklearn.ensemble import IsolationForest

from .features import (
    build_feature_matrix,
    FEATURE_NAMES,
    FEATURE_TO_COMPONENT,
)

CONTAMINATION    = 0.05    # assume ≤5% of windows are anomalous
N_ESTIMATORS     = 100
SCORE_WATCH      = 0.50
SCORE_WARNING    = 0.70
SCORE_CRITICAL   = 0.85
Z_CONTRIB_THRESH = 2.0     # |z| > 2 counts as a contributing feature

# avg_rpm (feature index 0) below this → machine is stopped/idle
IDLE_RPM_THRESH  = 50.0


def analyze(rpm_docs, stitch_docs, vib_docs, temp_docs):
    if not (rpm_docs or stitch_docs or vib_docs or temp_docs):
        return _empty("no_data")

    X = build_feature_matrix(rpm_docs, stitch_docs, vib_docs, temp_docs,
                              window=15, stride=5)

    if X is None or X.shape[0] < 2:
        return _empty("insufficient_data")

    # ── Idle detection: if the machine is currently stopped, don't score it ───
    # avg_rpm is feature index 0 (see features.py FEATURE_NAMES)
    current_rpm = float(X[-1, 0])
    if current_rpm < IDLE_RPM_THRESH:
        return _idle_result(X)

    # ── Only train on running windows so idle stops don't distort the baseline ─
    running_mask = X[:, 0] >= IDLE_RPM_THRESH
    X_running = X[running_mask]

    if X_running.shape[0] < 2:
        return _empty("insufficient_running_data")

    n_samples = X_running.shape[0]

    # ── Train + Score ─────────────────────────────────────────────────────────
    if n_samples >= 10:
        model = IsolationForest(
            n_estimators=N_ESTIMATORS,
            contamination=CONTAMINATION,
            random_state=42,
        )
        model.fit(X_running)
        raw_scores = model.score_samples(X_running)  # lower = more anomalous
        predictions = model.predict(X_running)        # -1 = anomaly, 1 = normal
        anomaly_flag = bool(predictions[-1] == -1)

        # Normalize anomaly score to 0-1 (higher = more anomalous)
        s_min, s_max = raw_scores.min(), raw_scores.max()
        if s_max > s_min:
            norm_score = float(1.0 - (raw_scores[-1] - s_min) / (s_max - s_min))
        else:
            norm_score = 0.0
        used_model = "isolation_forest"
    else:
        # Cold start: z-score fallback on running windows only
        mu = X_running.mean(axis=0)
        sigma = X_running.std(axis=0) + 1e-9
        z = (X_running[-1] - mu) / sigma
        max_abs_z = float(np.max(np.abs(z)))
        norm_score = float(min(1.0, max_abs_z / 4.0))
        anomaly_flag = max_abs_z > 2.5
        used_model = "zscore_fallback"

    # ── Feature importance via z-score deviation ──────────────────────────────
    mu = X_running.mean(axis=0)
    sigma = X_running.std(axis=0) + 1e-9
    z_scores = (X_running[-1] - mu) / sigma

    contributions = []
    for i, name in enumerate(FEATURE_NAMES):
        contributions.append({
            "feature":   name,
            "z_score":   round(float(z_scores[i]), 3),
            "abs_z":     round(float(abs(z_scores[i])), 3),
            "component": FEATURE_TO_COMPONENT[name],
            "value":     round(float(X_running[-1, i]), 4),
        })
    contributions.sort(key=lambda x: x["abs_z"], reverse=True)
    top_contributors = contributions[:3]

    # ── Component-level flags ─────────────────────────────────────────────────
    component_max_z = {}
    for c in contributions:
        comp = c["component"]
        component_max_z[comp] = max(component_max_z.get(comp, 0), c["abs_z"])

    component_flags = {
        comp: (z_val >= Z_CONTRIB_THRESH)
        for comp, z_val in component_max_z.items()
    }
    for comp in ("rpm", "stitches", "vibration", "temperature"):
        component_flags.setdefault(comp, False)

    # ── Status ────────────────────────────────────────────────────────────────
    if norm_score >= SCORE_CRITICAL:
        status = "critical"
    elif norm_score >= SCORE_WARNING:
        status = "warning"
    elif norm_score >= SCORE_WATCH:
        status = "watch"
    else:
        status = "normal"

    return {
        "anomaly_flag":     anomaly_flag,
        "anomaly_score":    round(norm_score, 4),
        "status":           status,
        "top_contributors": top_contributors,
        "component_flags":  component_flags,
        "feature_vector":   {name: round(float(X_running[-1, i]), 4)
                             for i, name in enumerate(FEATURE_NAMES)},
        "feature_z_scores": {name: round(float(z_scores[i]), 3)
                             for i, name in enumerate(FEATURE_NAMES)},
        "model":            used_model,
        "samples_used":     n_samples,
        "windows_trained":  n_samples,
    }


def _idle_result(X):
    """
    Machine is currently stopped (avg_rpm < IDLE_RPM_THRESH).
    Stopping is a normal sewing machine operation — not an anomaly.
    Return score=0, status='idle', no contributors.
    """
    return {
        "anomaly_flag":     False,
        "anomaly_score":    0.0,
        "status":           "idle",
        "top_contributors": [],
        "component_flags":  {"rpm": False, "stitches": False,
                             "vibration": False, "temperature": False},
        "feature_vector":   {name: round(float(X[-1, i]), 4)
                             for i, name in enumerate(FEATURE_NAMES)},
        "feature_z_scores": {name: 0.0 for name in FEATURE_NAMES},
        "model":            "idle_bypass",
        "samples_used":     X.shape[0],
        "windows_trained":  0,
    }


def _empty(reason):
    return {
        "anomaly_flag":     False,
        "anomaly_score":    0.0,
        "status":           reason,
        "top_contributors": [],
        "component_flags":  {"rpm": False, "stitches": False,
                             "vibration": False, "temperature": False},
        "feature_vector":   {n: 0.0 for n in FEATURE_NAMES},
        "feature_z_scores": {n: 0.0 for n in FEATURE_NAMES},
        "model":            "none",
        "samples_used":     0,
        "windows_trained":  0,
    }
