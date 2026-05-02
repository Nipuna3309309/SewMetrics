# Sewmetrics System Architecture & Machine Learning Overview (v2.0)

## 1. System Architecture Overview
The Sewmetrics system is an end-to-end IoT and Predictive Analytics platform designed to monitor the health and performance of sewing machines in real-time. It consists of three primary layers:

### A. Edge Layer (IoT / ESP32)
- **File:** `Arduino.ino`
- **Role:** Hardware data collection and transmission.
- **Details:** The ESP32 microcontroller collects data from 4 physical sensors every ~5 seconds:
  - **RPM (Hall Effect Sensor):** Measures motor revolutions per minute via magnetic pulse counting.
  - **Stitches (IR Sensor):** Counts needle stitches and computes stitches per minute (SPM).
  - **Vibration (MPU6050 Accelerometer):** Captures X, Y, Z acceleration to monitor machine balance and bearing wear.
  - **Temperature & Humidity (DHT11):** Monitors ambient and motor temperature.
- **Networking:** The ESP32 streams sensor data as JSON via MQTT (TLS, port 8883) to a HiveMQ Cloud broker under topics like `factory/machine/SM_01/rpm`.

### B. Backend Layer (Node.js)
- **File:** `backend/server.js`
- **Role:** Main application API and data gateway.
- **Details:** Subscribes to the MQTT broker, stores incoming sensor JSON payloads into MongoDB, and serves data to the UI. Proxies all `/api/analytics/*` requests to the Python analytics microservice.

### C. Analytics Microservice (Python / FastAPI v2.0)
- **Files:** `analytics/main.py`, `analytics/analyzers/features.py`, `analytics/analyzers/anomaly.py`, `analytics/analyzers/degradation.py`, `analytics/analyzers/system.py`
- **Role:** Real-time Predictive Maintenance using exactly 2 unified ML models.
- **Details:** A Python microservice on port 5002. Fetches sensor history from MongoDB, runs shared feature engineering across all 4 sensors, then feeds the result into either or both ML models.

---

## 2. Directory Structure & Key Files

- `Arduino.ino`: ESP32 firmware — sensor reading and MQTT publishing.
- `backend/`: Node.js Express server handling the API, MQTT ingestion, and MongoDB storage.
- `frontend/`: React dashboard showing real-time sensor data and ML health outputs.
- `analytics/`: The Python ML microservice (v2.0, 2-model architecture).
  - `main.py`: FastAPI server exposing 3 endpoints: `/analytics/anomaly/{id}`, `/analytics/degradation/{id}`, `/analytics/system/{id}`.
  - `db.py`: MongoDB connection and `fetch_all_sensors(machine_id, limit)` helper.
  - `utils.py`: `to_python()` — converts numpy types to native Python for JSON serialization.
  - `analyzers/features.py`: **Shared feature engineering.** Computes the 9-feature vector from a window of multi-sensor readings. Used by both Model 1 and Model 2.
  - `analyzers/anomaly.py`: **Model 1 — Isolation Forest.** Real-time multi-sensor anomaly detection.
  - `analyzers/degradation.py`: **Model 2 — Linear Regression.** Long-term degradation trend analysis.
  - `analyzers/system.py`: **Combined health.** Calls both models and merges into Machine Health Score.

---

## 3. Machine Learning Models (v2.0 — 2 Unified Models)

The v2.0 analytics engine uses exactly 2 models. Both receive data from **all 4 sensors combined** via a shared 9-feature vector — not one sensor each.

### The 9-Feature Vector (shared input for both models)
Computed by `features.py` from a sliding window W=15 readings (~75 seconds):

| # | Feature | What it captures |
|---|---------|-----------------|
| F1 | `avg_rpm` | Mean motor speed |
| F2 | `rpm_std` | RPM stability — high std = erratic motor |
| F3 | `avg_spm` | Mean stitches per minute |
| F4 | `spm_to_rpm_ratio` | **Key cross-sensor feature.** RPM=1400, SPM=0 → ratio=0 → thread jam |
| F5 | `vibration_rms` | RMS vibration energy (ISO 10816 standard metric) |
| F6 | `vibration_std` | Vibration consistency — erratic = fault |
| F7 | `avg_temp` | Mean temperature |
| F8 | `temp_rise_rate` | °C/min from regression slope — rising = early warning |
| F9 | `humidity` | Latest humidity % — affects motor insulation |

---

### Model 1 — Isolation Forest (Real-time Anomaly Detection)
- **File:** `analytics/analyzers/anomaly.py`
- **Endpoint:** `GET /analytics/anomaly/{machine_id}`
- **Question answered:** "Is the machine behaving abnormally RIGHT NOW?"
- **Algorithm:** Isolation Forest (Liu et al., 2008). Unsupervised. No labeled data needed.
- **How it works:**
  1. Fetch last 200 readings per sensor.
  2. Apply feature engineering: build feature matrix X (shape: N_windows × 9).
  3. Train `IsolationForest(n_estimators=100, contamination=0.05)` on X.
  4. Score the latest window — short isolation path = anomaly.
  5. Normalize score to 0-1 (higher = more anomalous).
  6. Compute z-scores for each feature to identify top contributors.
  7. Map features back to sensor components (rpm / stitches / vibration / temperature).
- **Cold start:** Falls back to z-score if fewer than 30 samples available.
- **Training:** Rolling window retraining on every call — automatically adapts to current machine state after maintenance or shifts.
- **Outputs:** `anomaly_flag`, `anomaly_score` (0-1), `status` (normal/watch/warning/critical), `top_contributors` (z-scored features), `component_flags`, `feature_z_scores`, `samples_used`.

---

### Model 2 — Linear Regression (Degradation Trend Detection)
- **File:** `analytics/analyzers/degradation.py`
- **Endpoint:** `GET /analytics/degradation/{machine_id}`
- **Question answered:** "Is the machine slowly getting WORSE over time?"
- **Algorithm:** OLS Linear Regression (numpy.polyfit, degree=1). Applied to 5 health indicators over time buckets.
- **How it works:**
  1. Fetch last 500 readings per sensor.
  2. Divide history into 10 equal time buckets.
  3. For each bucket, compute 5 health indicators:
     - `vibration_level`: mean vibration per bucket — rising = bearing wear
     - `temperature_level`: mean temperature per bucket — rising = cooling degradation
     - `spm_efficiency`: mean(spm)/mean(rpm) per bucket — falling = mechanical wear
     - `rpm_stability`: 1/(std(rpm)+1) per bucket — falling = power degrading
     - `composite_anomaly_score`: Model 1's IF score applied to each bucket — rising = progressive degradation
  4. Fit a regression line through each indicator over the 10 time points.
  5. The **slope** is the key output: positive on vibration/temp/anomaly = worsening.
  6. Normalize slopes → `degradation_rate` (%/hr). Project forward → `projected_failure_hours`.
- **Outputs:** `health_trend_score` (0-100), `degradation_rate`, `trend_status`, `early_warning`, `projected_failure_hours`, `per_indicator_trends` (slope, r², direction per indicator), `bucket_data` (for sparkline charts).

---

### Combined System Health
- **File:** `analytics/analyzers/system.py`
- **Endpoint:** `GET /analytics/system/{machine_id}`
- **Machine Health Score (MHS):**
  - `MHS = 50% × (100 - anomaly_score × 100) + 50% × health_trend_score`
  - 80-100: Healthy | 65-79: Watch | 45-64: Warning | 0-44: Critical
- **Outputs:** `machine_health_score`, `overall_status`, `maintenance_priority`, `rul_hours`, `issues` (ranked list), plus full outputs of both models.

---

## 4. Why 2 Models vs the Old 4-Model Design

| Aspect | Old v1.0 (4 models) | New v2.0 (2 models) |
|--------|---------------------|---------------------|
| Sensors per model | 1 each | All 4 combined |
| Cross-sensor features | None | `spm_to_rpm_ratio`, combos |
| Degradation detection | Partial (RPM only) | 5 indicators, all sensors |
| Feature importance | None | Z-score deviation analysis |
| Failure projection | Temperature only | All 5 indicators |
| DB queries per request | 4 separate | 1 shared fetch |
| Code complexity | ~486 lines | ~280 lines |

The biggest gain: the `spm_to_rpm_ratio` cross-sensor feature. RPM=1400 and SPM=0 means the motor is spinning but no stitches are being made — a thread jam or needle failure. No single-sensor model can detect this. The unified feature vector catches it immediately.

---

## 5. API Endpoints Reference

### Node.js Backend (port 4000)
| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | MQTT + MongoDB status |
| `GET /api/latest/:machineId` | Merged live snapshot of all 4 sensors |
| `GET /api/readings/:machineId?limit=N` | Last N sensor documents |
| `GET /api/history/:machineId/:sensor?limit=N` | Last N of one sensor type |
| `GET /api/alerts/:machineId` | Threshold-based alerts |
| `GET /api/analytics/:type/:machineId` | Proxy to Python (types: anomaly, degradation, system) |

### Python Analytics Service (port 5002)
| Endpoint | Model | Key outputs |
|----------|-------|-------------|
| `GET /analytics/anomaly/{id}` | Model 1 (IF) | anomaly_score, status, top_contributors |
| `GET /analytics/degradation/{id}` | Model 2 (LR) | health_trend_score, degradation_rate, projected_failure_hours |
| `GET /analytics/system/{id}` | Both models | machine_health_score, overall_status, rul_hours, issues |
| `GET /health` | — | version: "2.0.0" |

---

## 6. Technology Stack

| Layer | Technology |
|-------|------------|
| Hardware | ESP32, Hall-effect, IR sensor, MPU6050, DHT11 |
| Protocol | MQTT over TLS → HiveMQ Cloud |
| Backend | Node.js 18+, Express 5, Mongoose 9, mqtt.js |
| Database | MongoDB Atlas — collection: `sensor_readings` |
| Analytics | Python 3.13, FastAPI, Uvicorn, scikit-learn, NumPy, SciPy |
| Frontend | React 18, React Router 6, Recharts |
| ML Algorithms | Isolation Forest (Model 1) + OLS Linear Regression (Model 2) |
