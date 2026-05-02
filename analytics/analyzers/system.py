"""
System Health Analyzer — Unified 2-Model Machine Health Score

Combines Model 1 (Isolation Forest anomaly) + Model 2 (Linear Regression degradation)
into a single system health assessment.

Machine Health Score (MHS):
  - 50% weight from anomaly_score (inverted: lower anomaly = better health)
  - 50% weight from health_trend_score (degradation model, already 0-100)

Additional outputs:
  - overall_status:       "healthy" | "watch" | "warning" | "critical" | "offline"
  - maintenance_priority: "none" | "low" | "medium" | "high" | "urgent"
  - rul_hours:            projected_failure_hours from degradation model
  - issues:               ranked list of active problems from both models
  - anomaly:              full Model 1 output
  - degradation:          full Model 2 output
"""

from .anomaly import analyze as analyze_anomaly
from .degradation import analyze as analyze_degradation


def analyze(docs_by_sensor: dict) -> dict:
    rpm_docs    = docs_by_sensor.get("rpm", [])
    stitch_docs = docs_by_sensor.get("stitches", [])
    vib_docs    = docs_by_sensor.get("vibration", [])
    temp_docs   = docs_by_sensor.get("temperature", [])

    total_docs = sum(len(v) for v in docs_by_sensor.values())
    if total_docs == 0:
        return _offline()

    # ── Run both models ────────────────────────────────────────────────────────
    r_anomaly    = analyze_anomaly(rpm_docs, stitch_docs, vib_docs, temp_docs)
    r_degradation = analyze_degradation(rpm_docs, stitch_docs, vib_docs, temp_docs)

    # ── Machine Health Score ───────────────────────────────────────────────────
    # Model 1 contributes: 100 - (anomaly_score * 100)
    anomaly_health = round(100.0 - r_anomaly["anomaly_score"] * 100.0, 1)
    # Model 2 contributes: health_trend_score (already 0-100)
    trend_health   = r_degradation["health_trend_score"]

    mhs = round(0.5 * anomaly_health + 0.5 * trend_health, 1)

    # ── Collect issues ─────────────────────────────────────────────────────────
    issues = []

    # From anomaly model
    if r_anomaly["anomaly_flag"]:
        severity = r_anomaly["status"]  # "watch" | "warning" | "critical"
        top = r_anomaly["top_contributors"]
        top_str = ", ".join(f"{c['feature']}(z={c['z_score']})" for c in top[:2])
        issues.append({
            "component": "anomaly",
            "severity": severity,
            "message": f"Multi-sensor anomaly detected — {top_str}",
        })

    # From component flags
    comp_flags = r_anomaly.get("component_flags", {})
    for comp, flagged in comp_flags.items():
        if flagged and not r_anomaly["anomaly_flag"]:
            issues.append({
                "component": comp,
                "severity": "watch",
                "message": f"{comp.capitalize()} readings elevated",
            })

    # From degradation model
    if r_degradation["early_warning"]:
        issues.append({
            "component": "degradation",
            "severity": "warning",
            "message": (
                f"Degradation trend detected — rate={r_degradation['degradation_rate']}%/hr, "
                f"status={r_degradation['trend_status']}"
            ),
        })

    # Indicator-level degradation issues
    for ind, info in r_degradation.get("per_indicator_trends", {}).items():
        if info["direction"] == "degrading" and info.get("projected_hours") is not None:
            ph = info["projected_hours"]
            if ph < 8:
                issues.append({
                    "component": ind,
                    "severity": "warning" if ph > 2 else "critical",
                    "message": f"{ind} projected to reach threshold in ~{ph}h",
                })

    # Deduplicate and sort
    sev_order = {"critical": 0, "warning": 1, "watch": 2, "low": 3}
    issues.sort(key=lambda x: sev_order.get(x["severity"], 9))

    # ── RUL (from degradation model) ──────────────────────────────────────────
    rul_hours = r_degradation.get("projected_failure_hours")

    # ── Overall status ─────────────────────────────────────────────────────────
    # "idle" means the machine is stopped — normal sewing operation, not an alert
    anomaly_status = r_anomaly["status"]
    if anomaly_status == "idle":
        overall_status = "idle"
    elif anomaly_status == "critical" or mhs < 30:
        overall_status = "critical"
    elif anomaly_status == "warning" or mhs < 50:
        overall_status = "warning"
    elif anomaly_status == "watch" or mhs < 70 or r_degradation["early_warning"]:
        overall_status = "watch"
    else:
        overall_status = "healthy"

    # ── Maintenance priority ───────────────────────────────────────────────────
    priority = _maintenance_priority(mhs, rul_hours, issues)

    return {
        "machine_health_score":  mhs,
        "overall_status":        overall_status,
        "maintenance_priority":  priority,
        "rul_hours":             rul_hours,
        "anomaly_health":        anomaly_health,
        "trend_health":          trend_health,
        "issues":                issues,
        "anomaly":               r_anomaly,
        "degradation":           r_degradation,
    }


def _maintenance_priority(mhs: float, rul, issues: list) -> str:
    if mhs < 30 or (rul is not None and rul < 1):
        return "urgent"
    if mhs < 50 or (rul is not None and rul < 4):
        return "high"
    if mhs < 65 or len(issues) >= 2:
        return "medium"
    if mhs < 80:
        return "low"
    return "none"


def _offline() -> dict:
    return {
        "machine_health_score":  0.0,
        "overall_status":        "offline",
        "maintenance_priority":  "none",
        "rul_hours":             None,
        "anomaly_health":        0.0,
        "trend_health":          0.0,
        "issues":                [{"component": "system", "severity": "critical",
                                   "message": "No sensor data received"}],
        "anomaly":               None,
        "degradation":           None,
    }
