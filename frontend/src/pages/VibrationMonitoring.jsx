import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useLatest, useHistory, fmtShort } from "../hooks/useSensorData";
import { MACHINE_ID } from "../App";

const G_WARN = 0.3
const G_ALERT = 0.5;
const G_MAX_CHART = 0.6;
const AXIS_G_MAX = 2.0;

function safeVibrationG(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const g = n / 16384;
  if (!Number.isFinite(g) || g < 0 || g > 2) return null;
  return +g.toFixed(4);
}

function safeAxisG(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const g = n / 16384;
  if (!Number.isFinite(g) || Math.abs(g) > 4) return null;
  return +g.toFixed(3);
}

function getMachineLabel(vibrationG, rpmLive, spm, hasEnoughHistory) {
  if (!hasEnoughHistory) return "STARTING";
  if (vibrationG == null) return "SENSOR CHECK";
  if ((rpmLive || 0) === 0 && (spm || 0) === 0) return "IDLE";
  if (vibrationG >= G_ALERT) return "CRITICAL";
  if (vibrationG >= G_WARN) return "WARNING";
  if ((rpmLive || 0) > 0 && (spm || 0) === 0) return "CHANGEOVER";
  return "NORMAL";
}

function KpiCard({ label, value, sub }) {
  return (
    <div className="card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div style={{ fontSize: ".78rem", color: "#94a3b8", marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

function StatusBanner({
  machineLabel,
  currentG,
  peakG,
  avgG,
  dominantAxis,
  dominantAxisValue,
  online,
}) {
  const riskPct =
    currentG != null ? Math.min((currentG / G_ALERT) * 100, 100) : 0;

  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 14,
        padding: "18px 22px",
        marginBottom: 20,
        display: "flex",
        justifyContent: "space-between",
        gap: 20,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: "#dcfce7",
            color: "#16a34a",
            display: "grid",
            placeItems: "center",
            fontSize: "1.4rem",
            fontWeight: 800,
          }}
        >
          V
        </div>

        <div>
          <div
            style={{
              fontSize: ".78rem",
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: ".05em",
            }}
          >
            Machine Overview
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 2,
            }}
          >
            <div
              style={{
                fontSize: "1.45rem",
                fontWeight: 800,
                color: "#0f172a",
                lineHeight: 1.2,
              }}
            >
              Vibration Monitoring
            </div>

            <span
              style={{
                fontSize: ".72rem",
                fontWeight: 700,
                color: "#1e293b",
                background: "#e2e8f0",
                borderRadius: 999,
                padding: "4px 10px",
                letterSpacing: ".04em",
              }}
            >
              {machineLabel}
            </span>
          </div>

          <div style={{ fontSize: ".86rem", color: "#64748b", marginTop: 4 }}>
            Clean vibration view using RMS vibration and X/Y/Z axis movement
          </div>
        </div>
      </div>

      <div style={{ minWidth: 280, flex: 1, maxWidth: 460 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: ".8rem",
            color: "#64748b",
            marginBottom: 6,
          }}
        >
          <span>
            Current RMS:{" "}
            <strong style={{ color: "#0f172a" }}>
              {currentG != null ? `${currentG.toFixed(4)} g` : "—"}
            </strong>
          </span>
          <span>Alert: {G_ALERT} g</span>
        </div>

        <div
          style={{
            height: 10,
            background: "#e2e8f0",
            borderRadius: 999,
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${riskPct}%`,
              background: "#22c55e",
              borderRadius: 999,
              transition: "width .4s ease",
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
            gap: 10,
            fontSize: ".82rem",
          }}
        >
          <div>
            <div style={{ color: "#94a3b8" }}>Current RMS</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {currentG != null ? `${currentG.toFixed(4)} g` : "—"}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Peak RMS</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {peakG != null ? `${peakG.toFixed(4)} g` : "—"}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Average RMS</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {avgG != null ? `${avgG.toFixed(4)} g` : "—"}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Dominant Axis</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {dominantAxis}{" "}
              {dominantAxisValue != null
                ? `(${dominantAxisValue.toFixed(3)} g)`
                : ""}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Connection</div>
            <div
              style={{
                fontWeight: 700,
                color: online ? "#166534" : "#b91c1c",
              }}
            >
              {online ? "Live" : "Offline"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OperationalNote({ title, text }) {
  return (
    <div
      style={{
        marginBottom: 20,
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: ".78rem",
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: ".05em",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: ".92rem",
          color: "#334155",
          lineHeight: 1.7,
        }}
      >
        {text}
      </div>
    </div>
  );
}

function getOperationalNote({
  latest,
  online,
  currentG,
  peakG,
  hasEnoughHistory,
  rpmLive,
  spm,
}) {
  if (!online)
    return { title: "Connection Note", text: "The dashboard is currently offline. The last received vibration values are still shown here." };
  if (!hasEnoughHistory)
    return { title: "Startup Note", text: "The dashboard is still collecting initial vibration readings. Early values are not treated as a machine issue yet." };
  if (latest?.machine_offline)
    return { title: "Machine Note", text: "No recent payloads are being received by the backend. Check machine power, Wi-Fi, or MQTT connectivity." };
  if (latest?.sensor_health?.vibration?.stale)
    return { title: "Sensor Note", text: "Vibration data is delayed. Check the MPU6050 wiring, backend flow, and data freshness." };
  if (currentG == null)
    return { title: "Sensor Note", text: "Vibration data is not currently available. Check the MPU6050 connection and I2C communication." };
  if (currentG >= G_ALERT)
    return { title: "Critical Note", text: `Current RMS vibration is ${currentG.toFixed(4)} g, which is above the critical reference of ${G_ALERT} g. Immediate inspection is recommended.` };
  if (currentG >= G_WARN)
    return { title: "Performance Note", text: `Current RMS vibration is ${currentG.toFixed(4)} g. This is above the warning reference of ${G_WARN} g, so the machine should be monitored closely.` };
  if ((rpmLive || 0) === 0 && (spm || 0) === 0)
    return { title: "Idle Note", text: "The machine is currently idle. Use the RMS trend and axis movement charts below to confirm whether vibration remains low while stopped." };
  if ((rpmLive || 0) > 0 && (spm || 0) === 0)
    return { title: "Process Note", text: "The machine is rotating without stitching. This can happen during changeover or thread handling, so vibration should be checked together with RPM and stitch status." };
  if ((latest?.network_health?.buffered_count || 0) > 0 || (latest?.network_health?.consecutive_publish_failures || 0) > 0)
    return { title: "Network Note", text: "The ESP32 experienced a connection interruption and buffered messages locally. Stored messages will be sent after reconnect." };
  return { title: "System Note", text: `Vibration data is being received normally. Current RMS is ${currentG.toFixed(4)} g and peak RMS in the visible history is ${peakG != null ? `${peakG.toFixed(4)} g` : "—"}. Use the charts below to track machine stability and axis movement over time.` };
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: ".82rem",
        boxShadow: "0 8px 24px rgba(15,23,42,.08)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload
        .filter((p) => p.value != null)
        .map((p, i) => {
          const isG =
            p.name.toLowerCase().includes("rms") ||
            p.name.toLowerCase().includes("axis") ||
            p.name.toLowerCase().includes("(g)");
          return (
            <div key={i} style={{ color: p.color || p.stroke || p.fill || "#334155", marginBottom: 2 }}>
              {p.name}:{" "}
              <strong>
                {typeof p.value === "number"
                  ? isG ? `${p.value.toFixed(4)} g` : p.value.toLocaleString()
                  : p.value}
              </strong>
            </div>
          );
        })}
    </div>
  );
};

export default function VibrationMonitoring() {
  const { data: d, online } = useLatest(MACHINE_ID, 2500);
  const hist = useHistory(MACHINE_ID, "vibration", 300, 4000);

  const v = d || {};
  const currentG = safeVibrationG(v.vibration_stable);
  const instantG = safeVibrationG(v.vibration_raw);

  const axisCurrent = {
    x: safeAxisG(v.accel_x),
    y: safeAxisG(v.accel_y),
    z: safeAxisG(v.accel_z),
  };

  const historyAsc = useMemo(
    () =>
      [...hist].sort(
        (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
      ),
    [hist],
  );

  const chartData = useMemo(
    () =>
      historyAsc.map((r) => ({
        time: fmtShort(r.received_at),
        rms: safeVibrationG(r.vibration_stable),
        ax: safeAxisG(r.accel_x),
        ay: safeAxisG(r.accel_y),
        az: safeAxisG(r.accel_z),
      })),
    [historyAsc],
  );

  const validRms = useMemo(
    () => chartData.map((r) => r.rms).filter((x) => x != null),
    [chartData],
  );

  const avgG = useMemo(
    () => validRms.length ? validRms.reduce((sum, x) => sum + x, 0) / validRms.length : null,
    [validRms],
  );

  const peakG = useMemo(
    () => validRms.length ? Math.max(...validRms) : currentG,
    [validRms, currentG],
  );

  const dominantAxisInfo = useMemo(() => {
    return (
      [
        { label: "X", value: Math.abs(axisCurrent.x || 0) },
        { label: "Y", value: Math.abs(axisCurrent.y || 0) },
        { label: "Z", value: Math.abs(axisCurrent.z || 0) },
      ].sort((a, b) => b.value - a.value)[0] || { label: "—", value: null }
    );
  }, [axisCurrent]);

  const axisBarData = [
    { axis: "X", value: axisCurrent.x, color: "#ef4444" },
    { axis: "Y", value: axisCurrent.y, color: "#22c55e" },
    { axis: "Z", value: axisCurrent.z, color: "#2563eb" },
  ];

  const hasEnoughHistory = chartData.length >= 6;
  const machineLabel = getMachineLabel(currentG, v.rpm_live, v.spm, hasEnoughHistory);

  const note = getOperationalNote({
    latest: v, online, currentG, peakG, hasEnoughHistory,
    rpmLive: v.rpm_live, spm: v.spm,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="section-title">Vibration Monitoring</div>
          <div className="section-sub">
            Clean vibration view using RMS vibration and X/Y/Z axis movement
          </div>
        </div>
        <div className="header-actions">
          <span className={"conn-pill " + (online ? "conn-ok" : "conn-off")}>
            {online ? "● Live" : "● Offline"}
          </span>
        </div>
      </div>

      <StatusBanner
        machineLabel={machineLabel}
        currentG={currentG}
        peakG={peakG}
        avgG={avgG}
        dominantAxis={dominantAxisInfo.label}
        dominantAxisValue={dominantAxisInfo.value}
        online={online}
      />

      <OperationalNote title={note.title} text={note.text} />

      <div className="kpi-grid">
        <KpiCard
          label="Current RMS Vibration"
          value={currentG != null ? `${currentG.toFixed(4)} g` : "—"}
          sub={`Normal < ${G_WARN} g • Warning ≥ ${G_WARN} g • Critical ≥ ${G_ALERT} g`}
        />
        <KpiCard
          label="Average RMS Vibration"
          value={avgG != null ? `${avgG.toFixed(4)} g` : "—"}
          sub="Average across visible history"
        />
        <KpiCard
          label="Peak RMS Vibration"
          value={peakG != null ? `${peakG.toFixed(4)} g` : "—"}
          sub="Highest RMS level in visible history"
        />
        <KpiCard
          label="Dominant Axis"
          value={dominantAxisInfo.label}
          sub={
            dominantAxisInfo.value != null
              ? `Current axis movement ${dominantAxisInfo.value.toFixed(3)} g`
              : "Current axis movement unavailable"
          }
        />
      </div>

      <div className="card full">
        <div className="chart-title">RMS Vibration Trend</div>
        <div style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}>
          Green area shows stable RMS vibration. Dashed lines show the warning
          and alert references.
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ left: 0, right: 16, top: 8, bottom: 5 }}>
            <defs>
              <linearGradient id="vibrationFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} domain={[0, G_MAX_CHART]} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={G_WARN} stroke="#f59e0b" strokeDasharray="5 3" strokeWidth={1.5}
              label={{ value: `Warning ${G_WARN} g`, position: "insideTopRight", fontSize: 10, fill: "#b45309" }} />
            <ReferenceLine y={G_ALERT} stroke="#dc2626" strokeDasharray="5 3" strokeWidth={1.5}
              label={{ value: `Critical ${G_ALERT} g`, position: "insideTopRight", fontSize: 10, fill: "#b91c1c" }} />
            <Area type="monotone" dataKey="rms" name="RMS Vibration (g)"
              stroke="#22c55e" fill="url(#vibrationFill)" strokeWidth={2.5} dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="chart-title">X / Y / Z Axis Trend</div>
          <div style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}>
            Tracks accelerometer axis movement in g over time.
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} domain={[-AXIS_G_MAX, AXIS_G_MAX]} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="ax" name="X Axis (g)" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="ay" name="Y Axis (g)" stroke="#22c55e" strokeWidth={2} dot={false} connectNulls />
              <Line type="monotone" dataKey="az" name="Z Axis (g)" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="chart-title">Current X / Y / Z Values</div>
          <div style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}>
            Shows the current accelerometer axis values in g.
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={axisBarData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="axis" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[-AXIS_G_MAX, AXIS_G_MAX]} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Current Axis (g)" radius={[4, 4, 0, 0]}>
                {axisBarData.map((row, i) => (
                  <Cell key={i} fill={row.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card full" style={{ marginTop: 18 }}>
        <div className="chart-title">Line Manager Summary</div>
        <div style={{ fontSize: ".95rem", lineHeight: 1.8, color: "#334155" }}>
          <strong>Machine status:</strong> {machineLabel} &nbsp;|&nbsp;
          <strong>Current RMS vibration:</strong>{" "}
          {currentG != null ? `${currentG.toFixed(4)} g` : "—"} &nbsp;|&nbsp;
          <strong>Average RMS vibration:</strong>{" "}
          {avgG != null ? `${avgG.toFixed(4)} g` : "—"} &nbsp;|&nbsp;
          <strong>Peak RMS vibration:</strong>{" "}
          {peakG != null ? `${peakG.toFixed(4)} g` : "—"} &nbsp;|&nbsp;
          <strong>Instant vibration:</strong>{" "}
          {instantG != null ? `${instantG.toFixed(4)} g` : "—"} &nbsp;|&nbsp;
          <strong>Dominant axis:</strong> {dominantAxisInfo.label}
        </div>
      </div>
    </div>
  );
}
