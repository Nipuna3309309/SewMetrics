import React, { useEffect, useRef, useMemo, useState } from "react";
import { useLatest, useHistory, fmtShort } from "../hooks/useSensorData";
import { MACHINE_ID, MACHINE_LABEL } from "../App";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";

const TEMP_WARN = 40;
const TEMP_ALERT = 50;
const VIB_WARN = 0.3;
const VIB_ALERT = 0.5;
const TEMP_MAX_CHART = 80;
const VIB_MAX_CHART = 0.6;

function safeTemp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > TEMP_MAX_CHART) return null;
  return +n.toFixed(1);
}

function rawToG(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const g = n / 16384;
  if (!Number.isFinite(g) || g < 0 || g > 2) return null;
  return +g.toFixed(4);
}

function formatNum(value) {
  return Number(value || 0).toLocaleString();
}

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5)  return "just now";
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min !== 1 ? "s" : ""} ago`;
  const hr = Math.floor(min / 60);
  if (hr  < 24) return `${hr} hour${hr !== 1 ? "s" : ""} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day !== 1 ? "s" : ""} ago`;
}

const LS_KEY = "sewmetrics_alert_history";

function getStatusLabel({
  temp,
  vibG,
  activeCount,
  criticalCount,
  hasEnoughData,
}) {
  if (!hasEnoughData) return "STARTING";
  if (criticalCount > 0) return "IMMEDIATE ATTENTION";
  if (activeCount > 0) return "MAINTENANCE CHECK";
  if (temp == null || vibG == null) return "SENSOR CHECK";
  return "NORMAL";
}

function buildMaintenanceAlerts(v) {
  const alerts = [];
  const temp = safeTemp(v.temperature_c);
  const vibG = rawToG(v.vibration_stable);
  const rpmLive = Number(v.rpm_live || 0);
  const spm = Number(v.spm || 0);

  if (v.machine_offline) {
    alerts.push({
      key: "machine_offline",
      type: "Machine Offline",
      severity: "critical",
      message: "No recent payloads are being received from the machine.",
    });
  }

  if (temp != null && temp >= TEMP_ALERT) {
    alerts.push({
      key: "temperature_critical",
      type: "High Temperature",
      severity: "critical",
      message: `Machine temperature is ${temp.toFixed(1)}°C, above the critical reference of ${TEMP_ALERT}°C.`,
    });
  } else if (temp != null && temp >= TEMP_WARN) {
    alerts.push({
      key: "temperature_warning",
      type: "Temperature Warning",
      severity: "warning",
      message: `Machine temperature is ${temp.toFixed(1)}°C, above the warning reference of ${TEMP_WARN}°C.`,
    });
  }

  if (vibG != null && vibG >= VIB_ALERT) {
    alerts.push({
      key: "vibration_critical",
      type: "High Vibration",
      severity: "critical",
      message: `RMS vibration is ${vibG.toFixed(4)} g, above the critical reference of ${VIB_ALERT} g.`,
    });
  } else if (vibG != null && vibG >= VIB_WARN) {
    alerts.push({
      key: "vibration_warning",
      type: "Vibration Warning",
      severity: "warning",
      message: `RMS vibration is ${vibG.toFixed(4)} g, above the warning reference of ${VIB_WARN} g.`,
    });
  }

  if (rpmLive > 0 && spm === 0) {
    alerts.push({
      key: "rpm_stitch_mismatch",
      type: "RPM / Stitch Mismatch",
      severity: "warning",
      message: "Machine is rotating, but stitch rate is zero.",
    });
  }

  return alerts;
}

function buildRecommendedActions(v) {
  const temp = safeTemp(v.temperature_c);
  const vibG = rawToG(v.vibration_stable);
  const rpmLive = Number(v.rpm_live || 0);
  const spm = Number(v.spm || 0);

  const actions = [];

  if (temp != null && temp >= TEMP_WARN) {
    actions.push("Check motor cooling, airflow, and load condition.");
  }

  if (vibG != null && vibG >= VIB_WARN) {
    actions.push("Inspect bearings, mounting, alignment, and loose parts.");
  }

  if (rpmLive > 0 && spm === 0) {
    actions.push("Check stitch sensor alignment and thread engagement.");
  }

  if (v.machine_offline) {
    actions.push("Check machine power, Wi-Fi, and MQTT connectivity.");
  }

  return actions.slice(0, 4);
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
  temp,
  vibG,
  activeCount,
  criticalCount,
  online,
}) {
  const riskPct = Math.min(
    Math.max(
      criticalCount > 0
        ? 100
        : activeCount > 0
          ? 65
          : Math.max(
              temp != null ? (temp / TEMP_ALERT) * 100 : 0,
              vibG != null ? (vibG / VIB_ALERT) * 100 : 0,
            ),
      0,
    ),
    100,
  );

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
            background: "#fff7ed",
            color: "#c2410c",
            display: "grid",
            placeItems: "center",
            fontSize: "1.4rem",
            fontWeight: 800,
          }}
        >
          M
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
              Maintenance Alerts
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
            Clear maintenance view using temperature, vibration, and key service
            alerts
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
            Active Alerts:{" "}
            <strong style={{ color: "#0f172a" }}>{activeCount}</strong>
          </span>
          <span>Critical: {criticalCount}</span>
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
              background: "#ea580c",
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
            <div style={{ color: "#94a3b8" }}>Temperature</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {temp != null ? `${temp.toFixed(1)}°C` : "—"}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>RMS Vibration</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {vibG != null ? `${vibG.toFixed(4)} g` : "—"}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Machine</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {MACHINE_LABEL || MACHINE_ID}
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

function getOperationalNote({ online, alerts, hasEnoughData, temp, vibG }) {
  if (!online) {
    return {
      title: "Connection Note",
      text: "The dashboard is currently offline. The last received maintenance values are still shown here.",
    };
  }

  if (!hasEnoughData) {
    return {
      title: "Startup Note",
      text: "The dashboard is still collecting initial maintenance readings. Early values are not treated as service issues yet.",
    };
  }

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  if (criticalCount > 0) {
    return {
      title: "Critical Note",
      text: "At least one critical maintenance alert is active. Immediate inspection is recommended before continuing long production runs.",
    };
  }

  if (alerts.length > 0) {
    return {
      title: "Maintenance Note",
      text: "A maintenance-related warning is active. Review temperature, vibration, and the recommended actions below.",
    };
  }

  return {
    title: "System Note",
    text: `No active maintenance alerts. Current temperature is ${
      temp != null ? `${temp.toFixed(1)}°C` : "—"
    } and RMS vibration is ${vibG != null ? `${vibG.toFixed(4)} g` : "—"}.`,
  };
}

function SeverityPill({ severity }) {
  const styleMap = {
    critical: {
      bg: "#fef2f2",
      color: "#b91c1c",
      label: "Critical",
    },
    warning: {
      bg: "#fffbeb",
      color: "#b45309",
      label: "Warning",
    },
    info: {
      bg: "#eff6ff",
      color: "#1d4ed8",
      label: "Info",
    },
  };

  const s = styleMap[severity] || styleMap.info;

  return (
    <span
      style={{
        fontSize: ".68rem",
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 999,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

function AlertRow({ title, message, severity, time, resolved }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${resolved ? "#e2e8f0" : severity === "critical" ? "#fecaca" : "#fde68a"}`,
        background: resolved ? "#f8fafc" : severity === "critical" ? "#fff5f5" : "#fffdf0",
        opacity: resolved ? 0.72 : 1,
        transition: "opacity .3s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: ".84rem", color: resolved ? "#64748b" : "#0f172a" }}>
            {title}
          </div>
          <div style={{ fontSize: ".76rem", color: "#64748b", marginTop: 4 }}>
            {message}
          </div>
          {time && (
            <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: 6 }}>
              {time}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <SeverityPill severity={severity} />
          {resolved && (
            <span style={{ fontSize: ".65rem", fontWeight: 700, color: "#22c55e", background: "#f0fdf4", padding: "2px 7px", borderRadius: 999 }}>
              ✓ Resolved
            </span>
          )}
        </div>
      </div>
    </div>
  );
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
        .map((p, i) => (
          <div
            key={i}
            style={{
              color: p.color || p.stroke || p.fill || "#334155",
              marginBottom: 2,
            }}
          >
            {p.name}:{" "}
            <strong>
              {typeof p.value === "number"
                ? p.name.includes("Temperature")
                  ? `${p.value.toFixed(1)}°C`
                  : `${p.value.toFixed(4)} g`
                : p.value}
            </strong>
          </div>
        ))}
    </div>
  );
};

export default function MaintenanceAlerts() {
  const { data: d, online } = useLatest(MACHINE_ID, 2500);
  const tempHist = useHistory(MACHINE_ID, "temperature", 120, 4000);
  const vibHist = useHistory(MACHINE_ID, "vibration", 120, 4000);

  const STICKY_MS = 30_000; // keep resolved alerts visible for 30 s

  const [displayAlerts, setDisplayAlerts] = useState([]);
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
  });
  const [, setTick] = useState(0);
  const prevKeysRef = useRef([]);

  // tick every second so relative times update live
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const v = d || {};
  const temp = safeTemp(v.temperature_c);
  const vibG = rawToG(v.vibration_stable);

  const tempHistoryAsc = useMemo(
    () =>
      [...tempHist].sort(
        (a, b) =>
          new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
      ),
    [tempHist],
  );

  const vibHistoryAsc = useMemo(
    () =>
      [...vibHist].sort(
        (a, b) =>
          new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
      ),
    [vibHist],
  );

  const tempChartData = useMemo(
    () =>
      tempHistoryAsc.map((r) => ({
        time: fmtShort(r.received_at),
        temperature: safeTemp(r.temperature_c),
      })),
    [tempHistoryAsc],
  );

  const vibChartData = useMemo(
    () =>
      vibHistoryAsc.map((r) => ({
        time: fmtShort(r.received_at),
        vibration: rawToG(r.vibration_stable),
      })),
    [vibHistoryAsc],
  );

  const activeAlerts = useMemo(() => buildMaintenanceAlerts(v), [v]);

  // ── Sticky display alerts (persist 30 s after condition clears) ──────────────
  useEffect(() => {
    const now = Date.now();
    const activeKeys = new Set(activeAlerts.map((a) => a.key));

    setDisplayAlerts((prev) => {
      // refresh active ones; extend expiry on re-trigger
      const updated = prev.map((da) =>
        activeKeys.has(da.key)
          ? { ...da, resolved: false, expiresAt: now + STICKY_MS }
          : { ...da, resolved: true },
      );
      // add brand-new alerts
      const existingKeys = new Set(updated.map((a) => a.key));
      activeAlerts.forEach((a) => {
        if (!existingKeys.has(a.key))
          updated.push({ ...a, resolved: false, expiresAt: now + STICKY_MS, firedAtTs: now });
      });
      // drop truly expired resolved ones
      return updated.filter((da) => !da.resolved || da.expiresAt > now);
    });
  }, [activeAlerts, STICKY_MS]);

  // periodic cleanup of expired resolved alerts
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setDisplayAlerts((prev) => prev.filter((da) => !da.resolved || da.expiresAt > now));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // ── Persist history to localStorage ──────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(history.slice(0, 50))); } catch {}
  }, [history]);

  // ── Session history log ────────────────────────────────────────────────────
  useEffect(() => {
    const currentKeys = activeAlerts.map((a) => `${a.key}:${a.message}`);
    const newAlerts = activeAlerts.filter(
      (a) => !prevKeysRef.current.includes(`${a.key}:${a.message}`),
    );
    if (newAlerts.length > 0) {
      setHistory((prev) =>
        [
          ...newAlerts.map((a) => ({
            ...a,
            firedAtTs: Date.now(),
            id: `${Date.now()}_${Math.random()}`,
          })),
          ...prev,
        ].slice(0, 50),
      );
    }
    prevKeysRef.current = currentKeys;
  }, [activeAlerts]);

  const actions = useMemo(() => buildRecommendedActions(v), [v]);

  const criticalCount = activeAlerts.filter(
    (a) => a.severity === "critical",
  ).length;
  const warningCount = activeAlerts.filter(
    (a) => a.severity === "warning",
  ).length;
  const hasEnoughData = tempChartData.length >= 6 || vibChartData.length >= 6;

  const machineLabel = getStatusLabel({
    temp,
    vibG,
    activeCount: activeAlerts.length,
    criticalCount,
    hasEnoughData,
  });

  const note = getOperationalNote({
    online,
    alerts: activeAlerts,
    hasEnoughData,
    temp,
    vibG,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="section-title">Maintenance Alerts</div>
          <div className="section-sub">
            Clear maintenance view using only the most important service alerts
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
        temp={temp}
        vibG={vibG}
        activeCount={activeAlerts.length}
        criticalCount={criticalCount}
        online={online}
      />

      <OperationalNote title={note.title} text={note.text} />

      <div className="kpi-grid">
        <KpiCard
          label="Current Temperature"
          value={temp != null ? `${temp.toFixed(1)}°C` : "—"}
          sub={`Warning ${TEMP_WARN}°C • Alert ${TEMP_ALERT}°C`}
        />

        <KpiCard
          label="Current RMS Vibration"
          value={vibG != null ? `${vibG.toFixed(4)} g` : "—"}
          sub={`Normal < ${VIB_WARN} g • Warning ≥ ${VIB_WARN} g • Critical ≥ ${VIB_ALERT} g`}
        />

        <KpiCard
          label="Active Alerts"
          value={formatNum(activeAlerts.length)}
          sub={`${warningCount} warning • ${criticalCount} critical`}
        />

        <KpiCard
          label="Recent Alert History"
          value={formatNum(history.length)}
          sub="Session-based maintenance event log"
        />
      </div>

      <div className="two-col">
        <div className="card">
          <div className="chart-title">Live Maintenance Alerts</div>
          <div
            style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}
          >
            Shows only the necessary current maintenance conditions.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {displayAlerts.length === 0 ? (
              <div style={{ padding: "14px 16px", borderRadius: 10, background: "#f0fdf4", color: "#166534", fontWeight: 700, fontSize: ".82rem" }}>
                ✓ No active maintenance alerts
              </div>
            ) : (
              displayAlerts.map((a) => (
                <AlertRow
                  key={a.key}
                  title={a.type}
                  message={a.message}
                  severity={a.severity}
                  time={a.resolved
                    ? `Condition cleared · triggered ${timeAgo(a.firedAtTs)}`
                    : `Triggered ${timeAgo(a.firedAtTs)}`}
                  resolved={a.resolved}
                />
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="chart-title">Recommended Actions</div>
          <div
            style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}
          >
            Short maintenance actions based on the current machine condition.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {actions.length === 0 ? (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  background: "#f8fafc",
                  color: "#334155",
                  fontWeight: 600,
                  fontSize: ".82rem",
                }}
              >
                No immediate maintenance action is required.
              </div>
            ) : (
              actions.map((action, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    fontSize: ".82rem",
                    color: "#334155",
                    fontWeight: 600,
                  }}
                >
                  {action}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="chart-title">Temperature Trend</div>
          <div
            style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}
          >
            Temperature trend with warning and alert references.
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={tempChartData}
              margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
            >
              <defs>
                <linearGradient id="maintTempFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10 }} domain={[0, TEMP_MAX_CHART]} />
              <Tooltip content={<CustomTooltip />} />

              <ReferenceLine
                y={TEMP_WARN}
                stroke="#f59e0b"
                strokeDasharray="5 3"
                strokeWidth={1.5}
              />
              <ReferenceLine
                y={TEMP_ALERT}
                stroke="#dc2626"
                strokeDasharray="5 3"
                strokeWidth={1.5}
              />

              <Area
                type="monotone"
                dataKey="temperature"
                name="Temperature"
                stroke="#ef4444"
                fill="url(#maintTempFill)"
                strokeWidth={2.4}
                dot={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="chart-title">Vibration RMS Trend</div>
          <div
            style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}
          >
            RMS vibration trend with warning and alert references.
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={vibChartData}
              margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
            >
              <defs>
                <linearGradient id="maintVibFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10 }} domain={[0, VIB_MAX_CHART]} />
              <Tooltip content={<CustomTooltip />} />

              <ReferenceLine
                y={VIB_WARN}
                stroke="#f59e0b"
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{
                  value: `Warning ${VIB_WARN} g`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "#b45309",
                }}
              />
              <ReferenceLine
                y={VIB_ALERT}
                stroke="#dc2626"
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{
                  value: `Critical ${VIB_ALERT} g`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "#b91c1c",
                }}
              />

              <Area
                type="monotone"
                dataKey="vibration"
                name="Vibration"
                stroke="#7c3aed"
                fill="url(#maintVibFill)"
                strokeWidth={2.4}
                dot={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card full" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div className="chart-title" style={{ marginBottom: 2 }}>Alert History</div>
            <div style={{ fontSize: ".75rem", color: "#9ca3af" }}>
              Saved across sessions via localStorage · last {history.length} alerts
            </div>
          </div>
          {history.length > 0 && (
            <button
              onClick={() => {
                setHistory([]);
                try { localStorage.removeItem(LS_KEY); } catch {}
              }}
              style={{ padding: "5px 14px", fontSize: ".78rem", borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer" }}
            >
              Clear
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div style={{ padding: "14px 16px", borderRadius: 10, background: "#f8fafc", color: "#334155", fontWeight: 600, fontSize: ".82rem" }}>
            No maintenance alerts recorded yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {history.map((a) => (
              <AlertRow
                key={a.id}
                title={a.type}
                message={a.message}
                severity={a.severity}
                time={`${timeAgo(a.firedAtTs)} · ${new Date(a.firedAtTs).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="card full" style={{ marginTop: 18 }}>
        <div className="chart-title">Line Manager Summary</div>
        <div
          style={{
            fontSize: ".95rem",
            lineHeight: 1.8,
            color: "#334155",
          }}
        >
          <strong>Machine status:</strong> {machineLabel} &nbsp;|&nbsp;
          <strong>Current temperature:</strong>{" "}
          {temp != null ? `${temp.toFixed(1)}°C` : "—"} &nbsp;|&nbsp;
          <strong>Current RMS vibration:</strong>{" "}
          {vibG != null ? `${vibG.toFixed(4)} g` : "—"} &nbsp;|&nbsp;
          <strong>Active alerts:</strong> {activeAlerts.length} &nbsp;|&nbsp;
          <strong>Critical alerts:</strong> {criticalCount}
        </div>
      </div>
    </div>
  );
}
