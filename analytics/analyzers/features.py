"""
Shared feature engineering — used by BOTH Model 1 (Isolation Forest)
and Model 2 (Linear Regression degradation).

Takes the 4 raw sensor doc arrays and computes the 9-feature vector
that represents one time window of machine behaviour.
"""

import numpy as np

FEATURE_NAMES = [
    "avg_rpm",
    "rpm_std",
    "avg_spm",
    "spm_to_rpm_ratio",
    "vibration_rms",
    "vibration_std",
    "avg_temp",
    "temp_rise_rate",
    "humidity",
]

# Which dashboard component owns each feature
FEATURE_TO_COMPONENT = {
    "avg_rpm":          "rpm",
    "rpm_std":          "rpm",
    "avg_spm":          "stitches",
    "spm_to_rpm_ratio": "stitches",
    "vibration_rms":    "vibration",
    "vibration_std":    "vibration",
    "avg_temp":         "temperature",
    "temp_rise_rate":   "temperature",
    "humidity":         "temperature",
}

READINGS_PER_MIN = 12.0   # ~1 reading / 5 sec


def _extract(docs, key):
    return [d[key] for d in docs if d.get(key) is not None]


def compute_feature_vector(rpm_docs, stitch_docs, vib_docs, temp_docs):
    """
    Return a 9-element numpy array for a single time window.
    Returns None if there is not enough data to compute any features.
    """
    rpms   = np.array(_extract(rpm_docs,    "rpm_live"),          dtype=float)
    spms   = np.array(_extract(stitch_docs, "spm"),               dtype=float)
    vibs   = np.array(_extract(vib_docs,    "vibration_stable"),  dtype=float)
    temps  = np.array(_extract(temp_docs,   "temperature_c"),     dtype=float)
    hums   = np.array(_extract(temp_docs,   "humidity"),          dtype=float)

    # ── F1, F2: RPM ──────────────────────────────────────────────────────────
    avg_rpm = float(np.mean(rpms)) if len(rpms) > 0 else 0.0
    rpm_std = float(np.std(rpms))  if len(rpms) > 1 else 0.0

    # ── F3, F4: Stitches ─────────────────────────────────────────────────────
    avg_spm = float(np.mean(spms)) if len(spms) > 0 else 0.0
    spm_to_rpm = avg_spm / (avg_rpm + 1e-9)

    # ── F5, F6: Vibration (RMS + std) ────────────────────────────────────────
    vibration_rms = float(np.sqrt(np.mean(vibs ** 2))) if len(vibs) > 0 else 0.0
    vibration_std = float(np.std(vibs))                if len(vibs) > 1 else 0.0

    # ── F7, F8: Temperature + rate ───────────────────────────────────────────
    avg_temp = float(np.mean(temps)) if len(temps) > 0 else 0.0
    if len(temps) >= 5:
        recent = temps[-20:]
        slope  = float(np.polyfit(np.arange(len(recent)), recent, 1)[0])
        temp_rise_rate = slope * READINGS_PER_MIN   # °C per minute
    else:
        temp_rise_rate = 0.0

    # ── F9: Humidity ─────────────────────────────────────────────────────────
    humidity = float(np.mean(hums)) if len(hums) > 0 else 50.0

    return np.array([
        avg_rpm, rpm_std, avg_spm, spm_to_rpm,
        vibration_rms, vibration_std,
        avg_temp, temp_rise_rate, humidity,
    ], dtype=float)


def build_feature_matrix(rpm_docs, stitch_docs, vib_docs, temp_docs, window=15, stride=5):
    """
    Build feature matrix X by sliding a window over the sensor arrays.
    window : number of readings per window
    stride : step size between windows
    Returns X (shape: N_windows × 9) or None if < 2 windows possible.
    """
    n = min(len(rpm_docs), len(stitch_docs), len(vib_docs), len(temp_docs))
    if n < window:
        # Not enough data — use whatever is available as a single vector
        vec = compute_feature_vector(rpm_docs, stitch_docs, vib_docs, temp_docs)
        return vec.reshape(1, -1)

    rows = []
    for start in range(0, n - window + 1, stride):
        end = start + window
        vec = compute_feature_vector(
            rpm_docs[start:end],
            stitch_docs[start:end],
            vib_docs[start:end],
            temp_docs[start:end],
        )
        rows.append(vec)

    return np.array(rows, dtype=float)  # (N_windows, 9)
