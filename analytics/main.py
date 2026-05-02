import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from db import fetch_sensor, fetch_all_sensors
from analyzers.anomaly import analyze as analyze_anomaly
from analyzers.degradation import analyze as analyze_degradation
from analyzers.system import analyze as analyze_system
from utils import to_python

load_dotenv()

app = FastAPI(title="Sewmetrics Analytics", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ─── Model 1: Real-time multi-sensor anomaly detection ────────────────────────

@app.get("/analytics/anomaly/{machine_id}")
def anomaly_analytics(machine_id: str, limit: int = 200):
    """
    Model 1 — Isolation Forest (real-time multi-sensor anomaly detection).

    Trains on 9 engineered cross-sensor features from all 4 sensors.
    Returns:
      anomaly_flag, anomaly_score (0-1), status (normal/watch/warning/critical),
      top_contributors (features with highest z-score deviation),
      component_flags (which sensor is most anomalous),
      feature_vector, feature_z_scores, model, samples_used
    """
    docs = fetch_all_sensors(machine_id, limit_per_sensor=limit)
    rpm_docs    = docs.get("rpm", [])
    stitch_docs = docs.get("stitches", [])
    vib_docs    = docs.get("vibration", [])
    temp_docs   = docs.get("temperature", [])

    if not any([rpm_docs, stitch_docs, vib_docs, temp_docs]):
        raise HTTPException(404, f"No sensor data for machine {machine_id}")

    return to_python(analyze_anomaly(rpm_docs, stitch_docs, vib_docs, temp_docs))


# ─── Model 2: Long-term degradation trend detection ───────────────────────────

@app.get("/analytics/degradation/{machine_id}")
def degradation_analytics(machine_id: str, limit: int = 500):
    """
    Model 2 — Linear Regression degradation trend model.

    Divides sensor history into time buckets and fits OLS regression on
    5 health indicators: vibration_level, temperature_level, spm_efficiency,
    rpm_stability, anomaly_score.

    Returns:
      health_trend_score (0-100), degradation_rate (%/hr), trend_status,
      early_warning (bool), projected_failure_hours,
      per_indicator_trends (slope, r_squared, direction, projected_hours),
      bucket_data (sparkline data), buckets_analysed, samples_used
    """
    docs = fetch_all_sensors(machine_id, limit_per_sensor=limit)
    rpm_docs    = docs.get("rpm", [])
    stitch_docs = docs.get("stitches", [])
    vib_docs    = docs.get("vibration", [])
    temp_docs   = docs.get("temperature", [])

    if not any([rpm_docs, stitch_docs, vib_docs, temp_docs]):
        raise HTTPException(404, f"No sensor data for machine {machine_id}")

    return to_python(analyze_degradation(rpm_docs, stitch_docs, vib_docs, temp_docs))


# ─── Combined system health endpoint ─────────────────────────────────────────

@app.get("/analytics/system/{machine_id}")
def system_health(machine_id: str, limit: int = 300):
    """
    Combined system health using both Model 1 + Model 2.

    MHS = 50% × (100 - anomaly_score×100) + 50% × health_trend_score

    Returns:
      machine_health_score (0-100), overall_status, maintenance_priority,
      rul_hours, issues (ranked), anomaly (full M1 output), degradation (full M2 output)
    """
    docs = fetch_all_sensors(machine_id, limit_per_sensor=limit)
    if not any(docs.values()):
        raise HTTPException(404, f"No sensor data for machine {machine_id}")

    return to_python(analyze_system(docs))


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "sewmetrics-analytics", "version": "2.0.0"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("ANALYTICS_PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
