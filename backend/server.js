require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mqtt = require("mqtt");
const mongoose = require("mongoose");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const MACHINE_OFFLINE_MS = 15000;
const SENSOR_STALE_MS = {
  rpm: 15000,
  stitches: 15000,
  vibration: 10000,
  temperature: 20000,
};

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });

const sensorReadingSchema = new mongoose.Schema(
  {
    machine_id: { type: String, required: true, index: true },
    sensor: { type: String, required: true, index: true },
    topic: { type: String, required: true },

    time_ms: Number,
    received_at: { type: Date, default: Date.now, index: true },

    rpm_live: Number,
    rpm_1min: Number,
    rpm_1min_ready: Boolean,
    minute_progress_sec: Number,
    current_minute_revs: Number,

    stitches_total: Number,
    spm: Number,

    accel_x: Number,
    accel_y: Number,
    accel_z: Number,
    vibration_raw: Number,
    vibration_stable: Number,

    temperature_c: Number,
    temperature_raw_c: Number,
    temperature_stable_c: Number,
    humidity: Number,

    wifi_connected: Boolean,
    mqtt_connected: Boolean,
    buffered_count: Number,
    publish_fail_count: Number,
    consecutive_publish_failures: Number,
    dropped_buffered_messages: Number,

    sensor_status: String,
    sensor_reason: String,

    raw_payload: { type: mongoose.Schema.Types.Mixed },
  },
  {
    collection: "sensor_readings",
  },
);

const SensorReading = mongoose.model("SensorReading", sensorReadingSchema);

const latestByMachine = {};

const mqttUrl = `mqtts://${process.env.MQTT_HOST}:${process.env.MQTT_PORT}`;

const mqttClient = mqtt.connect(mqttUrl, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 2000,
  connectTimeout: 10000,
});

mqttClient.on("connect", () => {
  console.log("MQTT connected");

  const topicFilter = process.env.MQTT_TOPIC_FILTER || "factory/machine/+/+";

  mqttClient.subscribe(topicFilter, (err) => {
    if (err) {
      console.error("MQTT subscribe error:", err.message);
    } else {
      console.log("Subscribed to:", topicFilter);
    }
  });
});

mqttClient.on("reconnect", () => {
  console.log("MQTT reconnecting...");
});

mqttClient.on("error", (err) => {
  console.error("MQTT error:", err.message);
});

function inferSensorFromTopic(topic) {
  const parts = topic.split("/");
  return parts[3] || "unknown";
}

function getMachineIdFromTopic(topic) {
  const parts = topic.split("/");
  return parts[2] || "unknown";
}

function msSince(isoString) {
  if (!isoString) return null;
  return Date.now() - new Date(isoString).getTime();
}

function isStale(isoString, thresholdMs) {
  const diff = msSince(isoString);
  if (diff === null) return true;
  return diff > thresholdMs;
}

function createMachineState(machineId) {
  return {
    machine_id: machineId,
    last_received_at: null,
    sensor_last_received_at: {},
  };
}

function mergeLatest(machineId, sensor, payload) {
  if (!latestByMachine[machineId]) {
    latestByMachine[machineId] = createMachineState(machineId);
  }

  const current = latestByMachine[machineId];
  const nowIso = new Date().toISOString();

  current.machine_id = machineId;
  current.last_received_at = nowIso;
  current.sensor_last_received_at[sensor] = nowIso;

  if (sensor === "rpm") {
    current.rpm_live = payload.rpm_live ?? current.rpm_live ?? null;
    current.rpm_1min = payload.rpm_1min ?? current.rpm_1min ?? null;
    current.rpm_1min_ready =
      payload.rpm_1min_ready ?? current.rpm_1min_ready ?? false;
    current.minute_progress_sec =
      payload.minute_progress_sec ?? current.minute_progress_sec ?? null;
    current.current_minute_revs =
      payload.current_minute_revs ?? current.current_minute_revs ?? null;
    current.rpm_status = payload.sensor_status ?? current.rpm_status ?? null;
    current.rpm_reason = payload.sensor_reason ?? current.rpm_reason ?? null;
  }

  if (sensor === "stitches") {
    current.stitches_total =
      payload.stitches_total ?? current.stitches_total ?? null;
    current.spm = payload.spm ?? current.spm ?? null;
    current.stitch_status =
      payload.sensor_status ?? current.stitch_status ?? null;
    current.stitch_reason =
      payload.sensor_reason ?? current.stitch_reason ?? null;
  }

  if (sensor === "vibration") {
    current.accel_x = payload.accel_x ?? current.accel_x ?? null;
    current.accel_y = payload.accel_y ?? current.accel_y ?? null;
    current.accel_z = payload.accel_z ?? current.accel_z ?? null;
    current.vibration_raw =
      payload.vibration_raw ?? current.vibration_raw ?? null;
    current.vibration_stable =
      payload.vibration_stable ?? current.vibration_stable ?? null;
    current.vibration_status =
      payload.sensor_status ?? current.vibration_status ?? null;
    current.vibration_reason =
      payload.sensor_reason ?? current.vibration_reason ?? null;
  }

  if (sensor === "temperature") {
    current.temperature_c =
      payload.temperature_c ?? current.temperature_c ?? null;
    current.temperature_raw_c =
      payload.temperature_raw_c ?? current.temperature_raw_c ?? null;
    current.temperature_stable_c =
      payload.temperature_stable_c ?? current.temperature_stable_c ?? null;
    current.humidity = payload.humidity ?? current.humidity ?? null;
    current.temperature_status =
      payload.sensor_status ?? current.temperature_status ?? null;
    current.temperature_reason =
      payload.sensor_reason ?? current.temperature_reason ?? null;
  }

  if (typeof payload.wifi_connected !== "undefined") {
    current.wifi_connected = payload.wifi_connected;
  }

  if (typeof payload.mqtt_connected !== "undefined") {
    current.mqtt_connected = payload.mqtt_connected;
  }

  if (typeof payload.buffered_messages !== "undefined") {
    current.buffered_count = payload.buffered_messages;
  }

  if (typeof payload.publish_fail_count !== "undefined") {
    current.publish_fail_count = payload.publish_fail_count;
  }

  if (typeof payload.consecutive_publish_failures !== "undefined") {
    current.consecutive_publish_failures = payload.consecutive_publish_failures;
  }

  if (typeof payload.dropped_buffered_messages !== "undefined") {
    current.dropped_buffered_messages = payload.dropped_buffered_messages;
  }

  if (typeof payload.time_ms !== "undefined") {
    current.time_ms = payload.time_ms;
  }
}

function buildDocument(topic, payload) {
  const machineId = payload.machine_id || getMachineIdFromTopic(topic);
  const sensor = payload.sensor || inferSensorFromTopic(topic);

  return {
    machine_id: machineId,
    sensor,
    topic,

    time_ms: payload.time_ms,
    wifi_connected: payload.wifi_connected,
    mqtt_connected: payload.mqtt_connected,
    buffered_count: payload.buffered_messages,
    publish_fail_count: payload.publish_fail_count,
    consecutive_publish_failures: payload.consecutive_publish_failures,
    dropped_buffered_messages: payload.dropped_buffered_messages,

    rpm_live: payload.rpm_live,
    rpm_1min: payload.rpm_1min,
    rpm_1min_ready: payload.rpm_1min_ready,
    minute_progress_sec: payload.minute_progress_sec,
    current_minute_revs: payload.current_minute_revs,

    stitches_total: payload.stitches_total,
    spm: payload.spm,

    accel_x: payload.accel_x,
    accel_y: payload.accel_y,
    accel_z: payload.accel_z,
    vibration_raw: payload.vibration_raw,
    vibration_stable: payload.vibration_stable,

    temperature_c: payload.temperature_c,
    temperature_raw_c: payload.temperature_raw_c,
    temperature_stable_c: payload.temperature_stable_c,
    humidity: payload.humidity,

    sensor_status: payload.sensor_status,
    sensor_reason: payload.sensor_reason,

    raw_payload: payload,
  };
}

function buildSensorHealth(latest) {
  const sensorLast = latest.sensor_last_received_at || {};

  const rpmStale = isStale(sensorLast.rpm, SENSOR_STALE_MS.rpm);
  const stitchStale = isStale(sensorLast.stitches, SENSOR_STALE_MS.stitches);
  const vibrationStale = isStale(
    sensorLast.vibration,
    SENSOR_STALE_MS.vibration,
  );
  const temperatureStale = isStale(
    sensorLast.temperature,
    SENSOR_STALE_MS.temperature,
  );

  const sensorHealth = {
    rpm: {
      last_received_at: sensorLast.rpm || null,
      stale: rpmStale,
      status: !sensorLast.rpm
        ? "missing"
        : rpmStale
          ? "stale"
          : latest.rpm_status || "ok",
      explanation: !sensorLast.rpm
        ? "No RPM payload has been received yet"
        : rpmStale
          ? "RPM data has not updated within the allowed freshness window"
          : latest.rpm_reason || "RPM data is fresh",
    },
    stitches: {
      last_received_at: sensorLast.stitches || null,
      stale: stitchStale,
      status: !sensorLast.stitches
        ? "missing"
        : stitchStale
          ? "stale"
          : latest.stitch_status || "ok",
      explanation: !sensorLast.stitches
        ? "No stitch payload has been received yet"
        : stitchStale
          ? "Stitch data has not updated within the allowed freshness window"
          : latest.stitch_reason || "Stitch data is fresh",
    },
    vibration: {
      last_received_at: sensorLast.vibration || null,
      stale: vibrationStale,
      status: !sensorLast.vibration
        ? "missing"
        : vibrationStale
          ? "stale"
          : latest.vibration_status || "ok",
      explanation: !sensorLast.vibration
        ? "No vibration payload has been received yet"
        : vibrationStale
          ? "Vibration data has not updated within the allowed freshness window"
          : latest.vibration_reason || "Vibration data is fresh",
    },
    temperature: {
      last_received_at: sensorLast.temperature || null,
      stale: temperatureStale,
      status: !sensorLast.temperature
        ? "missing"
        : temperatureStale
          ? "stale"
          : latest.temperature_status || "ok",
      explanation: !sensorLast.temperature
        ? "No temperature payload has been received yet"
        : temperatureStale
          ? "Temperature data has not updated within the allowed freshness window"
          : latest.temperature_reason || "Temperature data is fresh",
    },
  };

  return sensorHealth;
}

function buildMachineSnapshot(machineId) {
  const latest = latestByMachine[machineId];
  if (!latest) return null;

  const offline = isStale(latest.last_received_at, MACHINE_OFFLINE_MS);
  const sensorHealth = buildSensorHealth(latest);
  const problematic = Object.values(sensorHealth).some((sensor) =>
    [
      "missing",
      "stale",
      "warning",
      "critical",
      "possible_fault",
      "sensor_error",
    ].includes(sensor.status),
  );

  let machineStatus = "ok";
  if (offline) {
    machineStatus = "offline";
  } else if (
    problematic ||
    latest.wifi_connected === false ||
    latest.mqtt_connected === false ||
    (latest.consecutive_publish_failures || 0) > 0 ||
    (latest.buffered_count || 0) > 0
  ) {
    machineStatus = "degraded";
  }

  return {
    ...latest,
    machine_status: machineStatus,
    machine_offline: offline,
    machine_offline_reason: offline
      ? "No payload received within backend offline timeout"
      : "Machine is currently sending data",
    sensor_health: sensorHealth,
    network_health: {
      wifi_connected: latest.wifi_connected ?? null,
      mqtt_connected: latest.mqtt_connected ?? null,
      buffered_count: latest.buffered_count ?? 0,
      publish_fail_count: latest.publish_fail_count ?? 0,
      consecutive_publish_failures: latest.consecutive_publish_failures ?? 0,
      dropped_buffered_messages: latest.dropped_buffered_messages ?? 0,
    },
  };
}

mqttClient.on("message", async (topic, messageBuffer) => {
  const raw = messageBuffer.toString();

  try {
    const payload = JSON.parse(raw);
    const sensor = payload.sensor || inferSensorFromTopic(topic);
    const machineId = payload.machine_id || getMachineIdFromTopic(topic);

    if (!machineId) {
      throw new Error("machine_id missing");
    }

    const doc = buildDocument(topic, payload);

    await SensorReading.create(doc);
    mergeLatest(machineId, sensor, payload);

    console.log(
      `[MQTT] Saved ${sensor} data for ${machineId} from topic ${topic}`,
    );
  } catch (err) {
    console.error("[MQTT] Invalid message or DB save error:", err.message);
    console.error("Raw message:", raw);
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    mqtt_connected: mqttClient.connected,
    mongodb_ready: mongoose.connection.readyState === 1,
    known_machines: Object.keys(latestByMachine).length,
  });
});

app.get("/api/latest/:machineId", (req, res) => {
  const machineId = req.params.machineId;
  const snapshot = buildMachineSnapshot(machineId);

  if (!snapshot) {
    return res.status(404).json({ message: "No latest data for this machine" });
  }

  res.json(snapshot);
});

app.get("/api/readings/:machineId", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 200);

    const rows = await SensorReading.find({
      machine_id: req.params.machineId,
    })
      .sort({ received_at: -1 })
      .limit(limit);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/history/:machineId/:sensor", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "100", 10), 2000);

    const rows = await SensorReading.find({
      machine_id: req.params.machineId,
      sensor: req.params.sensor,
    })
      .sort({ received_at: -1 })
      .limit(limit);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/alerts/:machineId", async (req, res) => {
  try {
    const machineId = req.params.machineId;
    const latest = buildMachineSnapshot(machineId);

    if (!latest) {
      return res.status(404).json({ message: "No data for this machine" });
    }

    const alerts = [];

    if (latest.machine_offline) {
      alerts.push({
        type: "machine",
        severity: "critical",
        message: "Machine appears offline: no recent payloads received",
      });
    }

    for (const [sensorName, health] of Object.entries(latest.sensor_health)) {
      if (
        ["missing", "stale", "sensor_error", "possible_fault"].includes(
          health.status,
        )
      ) {
        alerts.push({
          type: sensorName,
          severity: health.status === "sensor_error" ? "critical" : "warning",
          message: health.explanation,
        });
      }
    }

    if (typeof latest.temperature_c === "number" && latest.temperature_c > 60) {
      alerts.push({
        type: "temperature",
        severity: "warning",
        message: `Temperature above threshold: ${latest.temperature_c.toFixed(2)} C`,
      });
    }

    if (typeof latest.vibration_stable === "number") {
      if (latest.vibration_stable > 0.2) {
        alerts.push({
          type: "vibration",
          severity: "critical",
          message: `Critical vibration detected: ${latest.vibration_stable.toFixed(4)} g RMS`,
        });
      } else if (latest.vibration_stable >= 0.1) {
        alerts.push({
          type: "vibration",
          severity: "warning",
          message: `Warning vibration level: ${latest.vibration_stable.toFixed(4)} g RMS`,
        });
      }
    }

    if (
      typeof latest.rpm_live === "number" &&
      latest.rpm_live > 0 &&
      typeof latest.spm === "number" &&
      latest.spm === 0
    ) {
      alerts.push({
        type: "production",
        severity: "info",
        message: "Machine moving but stitch rate is zero",
      });
    }

    if (
      (latest.buffered_count || 0) > 0 ||
      (latest.consecutive_publish_failures || 0) > 0
    ) {
      alerts.push({
        type: "network",
        severity: "warning",
        message:
          "Device is buffering messages or experiencing publish failures",
      });
    }

    res.json({
      machine_id: machineId,
      machine_status: latest.machine_status,
      alerts,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/hourly/:machineId", async (req, res) => {
  try {
    const shiftStart = new Date();
    shiftStart.setHours(8, 0, 0, 0);
    const shiftEnd = new Date();
    shiftEnd.setHours(17, 0, 0, 0);

    const data = await SensorReading.aggregate([
      {
        $match: {
          machine_id: req.params.machineId,
          sensor: "rpm",
          received_at: { $gte: shiftStart, $lte: shiftEnd },
        },
      },
      {
        $group: {
          _id: { $hour: { date: "$received_at", timezone: "Asia/Colombo" } },
          avg_rpm: { $avg: "$rpm_live" },
          running_count: { $sum: { $cond: [{ $gt: ["$rpm_live", 0] }, 1, 0] } },
          total_count: { $sum: 1 },
        },
      },
      {
        $project: {
          hour: "$_id",
          avg_rpm: { $round: ["$avg_rpm", 1] },
          uptime_pct: {
            $round: [
              {
                $multiply: [
                  { $divide: ["$running_count", "$total_count"] },
                  100,
                ],
              },
              1,
            ],
          },
        },
      },
      { $sort: { hour: 1 } },
    ]);

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});