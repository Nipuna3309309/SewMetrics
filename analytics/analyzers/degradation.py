"""
Model 2 — Linear Regression Degradation Trend Model

Input  : Time-bucketed health indicators derived from all 4 sensors
Purpose: Detect GRADUAL machine deterioration over hours/days

Algorithm: Ordinary Least Squares Linear Regression (numpy.polyfit, degree=1)
  Applied independently to each of 5 health indicators over N time buckets.
  The SLOPE of each regression line is the degradation signal.

  Positive slope on vibration/temperature/anomaly_score = worsening
  Negative slope on spm_efficiency/rpm_stability          = worsening

No labeled data needed. No training phase. Fully explainable.
"The slope is +8 vibration units per hour — it will hit the 3000-unit
danger threshold in approximately 7 hours." — directly usable in a report.

Outputs:
  health_trend_score    (0-100, 100 = no degradation)
  degradation_rate      (positive = worsening, %/hr scale)
  early_warning         (bool)
  projected_failure_hours (float or None)
  per_indicator_trends  (dict of slope, r_squared, direction per indicator)
  bucket_data           (list of bucket summaries for sparkline charts)
  samples_used          (int)
"""

import numpy as np

from .features import compute_feature_vector
from sklearn.ensemble import IsolationForest

N_BUCKETS         = 10
MIN_BUCKET_SIZE   = 5      # minimum readings to compute a valid bucket
DEGRAD_WARNING    = 1.5    # degradation_rate threshold for early warning
R2_TRUST          = 0.60   # R² above this = trend is real, not noise

# Danger thresholds per indicator (used for projected_failure_hours)
THRESHOLDS = {
    "vibration_level":   3000.0,
    "temperature_level": 60.0,
    "spm_efficiency":    0.001,    # lower bound — if it drops here → stopped
    "rpm_stability":     0.001,    # lower bound
    "anomaly_score":     0.85,     # critical IF anomaly level
}


def _r_squared(y_true, y_pred):
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    return float(1 - ss_res / (ss_tot + 1e-9))


def _bucket_health(rpm_docs, stitch_docs, vib_docs, temp_docs, anomaly_model=None):
    """
    Compute health indicators for a single time bucket.
    Returns dict with 5 indicator values.
    """
    rpms  = np.array([d["rpm_live"]          for d in rpm_docs    if d.get("rpm_live")          is not None], dtype=float)
    spms  = np.array([d["spm"]               for d in stitch_docs if d.get("spm")               is not None], dtype=float)
    vibs  = np.array([d["vibration_stable"]  for d in vib_docs    if d.get("vibration_stable")  is not None], dtype=float)
    temps = np.array([d["temperature_c"]     for d in temp_docs   if d.get("temperature_c")     is not None], dtype=float)

    avg_rpm    = float(np.mean(rpms))  if len(rpms)  > 0 else 0.0
    avg_spm    = float(np.mean(spms))  if len(spms)  > 0 else 0.0
    vib_level  = float(np.mean(vibs))  if len(vibs)  > 0 else 0.0
    temp_level = float(np.mean(temps)) if len(temps) > 0 else 25.0
    rpm_std    = float(np.std(rpms))   if len(rpms)  > 1 else 0.0

    # Machine is idle if avg RPM is below threshold — stopping is normal
    is_idle = avg_rpm < 50.0

    spm_efficiency = avg_spm / (avg_rpm + 1e-9)
    rpm_stability  = 1.0 / (rpm_std + 1.0)      # higher = more stable

    # Anomaly score for this bucket via feature engineering + IF
    anomaly_score = 0.0
    if anomaly_model is not None and len(vibs) >= 3 and len(temps) >= 3:
        try:
            vec = compute_feature_vector(rpm_docs, stitch_docs, vib_docs, temp_docs)
            raw = anomaly_model.score_samples(vec.reshape(1, -1))
            # Normalize relative to training data range — just use raw as proxy
            anomaly_score = float(max(0.0, min(1.0, -raw[0] / 0.5)))
        except Exception:
            anomaly_score = 0.0

    return {
        "vibration_level":   round(vib_level,    3),
        "temperature_level": round(temp_level,   3),
        "spm_efficiency":    round(spm_efficiency, 6),
        "rpm_stability":     round(rpm_stability, 4),
        "anomaly_score":     round(anomaly_score, 4),
        "is_idle":           is_idle,
    }


def analyze(rpm_docs, stitch_docs, vib_docs, temp_docs):
    n = min(len(rpm_docs), len(stitch_docs), len(vib_docs), len(temp_docs))

    if n < MIN_BUCKET_SIZE * 2:
        return _empty("insufficient_data")

    # ── Build time buckets ────────────────────────────────────────────────────
    bucket_size   = max(MIN_BUCKET_SIZE, n // N_BUCKETS)
    actual_buckets = n // bucket_size

    if actual_buckets < 3:
        return _empty("insufficient_history")

    # Train a lightweight IF on full data for per-bucket anomaly scoring
    try:
        from .features import build_feature_matrix
        X_full = build_feature_matrix(rpm_docs, stitch_docs, vib_docs, temp_docs,
                                      window=min(15, bucket_size), stride=3)
        if X_full is not None and X_full.shape[0] >= 5:
            temp_if = IsolationForest(n_estimators=50, contamination=0.05, random_state=42)
            temp_if.fit(X_full)
        else:
            temp_if = None
    except Exception:
        temp_if = None

    bucket_data = []
    for i in range(actual_buckets):
        start = i * bucket_size
        end   = start + bucket_size
        bh = _bucket_health(
            rpm_docs[start:end],
            stitch_docs[start:end],
            vib_docs[start:end],
            temp_docs[start:end],
            anomaly_model=temp_if,
        )
        bh["bucket_index"] = i
        bucket_data.append(bh)

    indicators = ["vibration_level", "temperature_level",
                  "spm_efficiency", "rpm_stability", "anomaly_score"]
    t = np.arange(actual_buckets, dtype=float)

    # ── Fit linear regression per indicator ───────────────────────────────────
    per_indicator = {}
    degrad_contributions = []

    for ind in indicators:
        # spm_efficiency and rpm_stability are meaningless when the machine is
        # stopped (idle) — exclude idle buckets from their regression so that
        # normal operator stops don't look like degradation
        if ind in ("spm_efficiency", "rpm_stability"):
            running_idx = [i for i, b in enumerate(bucket_data) if not b.get("is_idle", False)]
            if len(running_idx) < 3:
                per_indicator[ind] = {
                    "slope": 0.0, "r_squared": 0.0, "direction": "stable",
                    "current_value": 0.0, "projected_hours": None, "is_real_trend": False,
                }
                degrad_contributions.append(0.0)
                continue
            t_use = t[running_idx]
            y = np.array([bucket_data[i][ind] for i in running_idx], dtype=float)
        else:
            t_use = t
            y = np.array([b[ind] for b in bucket_data], dtype=float)

        coeffs    = np.polyfit(t_use, y, 1)
        slope     = float(coeffs[0])
        intercept = float(coeffs[1])
        y_pred    = np.polyval(coeffs, t_use)
        r2        = _r_squared(y, y_pred)

        # Direction: for vibration/temp/anomaly_score, positive slope = worse
        #            for spm_efficiency/rpm_stability, negative slope = worse
        if ind in ("spm_efficiency", "rpm_stability"):
            degrading = slope < 0
            norm_slope = -slope  # flip sign so positive always = degrading
        else:
            degrading = slope > 0
            norm_slope = slope

        # Normalize by threshold scale so all indicators are comparable
        threshold = THRESHOLDS.get(ind, 1.0)
        normalized_contribution = abs(norm_slope) / (threshold / actual_buckets + 1e-9)

        # Only count as real degradation if R² is trustworthy
        if r2 >= R2_TRUST and degrading:
            degrad_contributions.append(normalized_contribution)
        else:
            degrad_contributions.append(0.0)

        # Projected failure: how many more buckets until threshold is crossed?
        projected_hours = None
        bucket_duration_hours = 5 / 60 * bucket_size  # rough: 1 reading/5sec
        if degrading and abs(slope) > 1e-6:
            current_val = y[-1]
            if ind in ("spm_efficiency", "rpm_stability"):
                gap = current_val - THRESHOLDS[ind]
                if gap > 0:
                    buckets_left = gap / abs(slope)
                    projected_hours = round(buckets_left * bucket_duration_hours, 1)
            else:
                gap = THRESHOLDS[ind] - current_val
                if gap > 0:
                    buckets_left = gap / abs(slope)
                    projected_hours = round(buckets_left * bucket_duration_hours, 1)

        per_indicator[ind] = {
            "slope":             round(slope, 6),
            "r_squared":         round(r2, 4),
            "direction":         "degrading" if (degrading and r2 >= R2_TRUST) else "stable",
            "current_value":     round(float(y[-1]), 4),
            "projected_hours":   projected_hours,
            "is_real_trend":     bool(r2 >= R2_TRUST),
        }

    # ── Overall degradation rate ──────────────────────────────────────────────
    degradation_rate = float(np.mean(degrad_contributions) * 100)   # scale to %/hr

    # ── Health trend score (0-100) ────────────────────────────────────────────
    health_trend_score = max(0.0, min(100.0, 100.0 - degradation_rate * 10))

    # ── Early warning ─────────────────────────────────────────────────────────
    real_degrading = sum(1 for c in degrad_contributions if c > 0)
    early_warning  = (
        degradation_rate > DEGRAD_WARNING
        or real_degrading >= 3
        or any(
            per_indicator[ind]["projected_hours"] is not None
            and per_indicator[ind]["projected_hours"] < 8
            for ind in indicators
        )
    )

    # ── Projected failure horizon (minimum across all indicators) ─────────────
    all_horizons = [
        per_indicator[ind]["projected_hours"]
        for ind in indicators
        if per_indicator[ind]["projected_hours"] is not None
    ]
    projected_failure_hours = min(all_horizons) if all_horizons else None

    # ── Degradation status ────────────────────────────────────────────────────
    if health_trend_score >= 85:
        trend_status = "stable"
    elif health_trend_score >= 70:
        trend_status = "minor_degradation"
    elif health_trend_score >= 50:
        trend_status = "moderate_degradation"
    else:
        trend_status = "rapid_degradation"

    return {
        "health_trend_score":      round(health_trend_score, 1),
        "degradation_rate":        round(degradation_rate, 3),
        "trend_status":            trend_status,
        "early_warning":           early_warning,
        "projected_failure_hours": projected_failure_hours,
        "per_indicator_trends":    per_indicator,
        "bucket_data":             bucket_data,
        "buckets_analysed":        actual_buckets,
        "samples_used":            n,
    }


def _empty(reason):
    empty_ind = {
        ind: {"slope": 0.0, "r_squared": 0.0, "direction": "stable",
              "current_value": 0.0, "projected_hours": None, "is_real_trend": False}
        for ind in ["vibration_level", "temperature_level",
                    "spm_efficiency", "rpm_stability", "anomaly_score"]
    }
    return {
        "health_trend_score":      100.0,
        "degradation_rate":        0.0,
        "trend_status":            reason,
        "early_warning":           False,
        "projected_failure_hours": None,
        "per_indicator_trends":    empty_ind,
        "bucket_data":             [],
        "buckets_analysed":        0,
        "samples_used":            0,
    }
