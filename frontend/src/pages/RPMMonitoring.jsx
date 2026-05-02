import React, { useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  useLatest,
  useHistory,
  useHourly,
  fmtShort,
} from "../hooks/useSensorData";
import { MACHINE_ID } from "../App";

const RPM_TARGET = 1800;
const RPM_MIN = 1000;
const RPM_WARN = 800;
const RPM_MAX_CHART = 2500;

function formatNum(value) {
  return Number(value || 0).toLocaleString();
}

function safeRpm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  if (n > 4000) return null;
  return +n.toFixed(1);
}

function getMachineLabel(liveRpm, avg1Rpm, hasEnoughHistory) {
  if (!hasEnoughHistory) return "STARTING";
  if (liveRpm === 0) return "STOPPED";
  if (liveRpm < RPM_WARN) return "CRITICAL LOW RPM";
  if (liveRpm < RPM_MIN) return "LOW RPM";
  if (avg1Rpm != null && avg1Rpm >= RPM_TARGET) return "ON TARGET";
  return "RUNNING";
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
  liveRpm,
  avg1Rpm,
  runtimePct,
  stopCount,
  longestStopMin,
  online,
}) {
  const performancePct = Math.min((liveRpm / RPM_TARGET) * 100, 100);

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
            background: "#dbeafe",
            color: "#1d4ed8",
            display: "grid",
            placeItems: "center",
            fontSize: "1.4rem",
            fontWeight: 800,
          }}
        >
          R
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
              RPM Monitoring
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
            Clear production view using current RPM, 1-minute average, runtime,
            and stop behavior
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
            Current RPM:{" "}
            <strong style={{ color: "#0f172a" }}>{liveRpm.toFixed(0)}</strong>
          </span>
          <span>Target: {RPM_TARGET}</span>
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
              width: `${performancePct}%`,
              background: "#2563eb",
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
            <div style={{ color: "#94a3b8" }}>Current RPM</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {formatNum(liveRpm)}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>1-Min Avg RPM</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {avg1Rpm != null ? formatNum(avg1Rpm) : "Calculating..."}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Runtime</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {runtimePct.toFixed(1)}%
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
          <div>
            <div style={{ color: "#94a3b8" }}>Stop Count</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>{stopCount}</div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Longest Stop</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {longestStopMin.toFixed(1)} min
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
  liveRpm,
  avg1Rpm,
  hasEnoughHistory,
  minuteProgressSec,
}) {
  if (!online) {
    return {
      title: "Connection Note",
      text: "The dashboard is currently offline. The last received machine values are still shown here.",
    };
  }

  if (!hasEnoughHistory) {
    return {
      title: "Startup Note",
      text: `The dashboard is still collecting initial RPM readings. Early zero or low RPM values are not treated as operating issues yet. Current 1-minute window progress: ${minuteProgressSec.toFixed(1)} seconds.`,
    };
  }

  if (latest?.machine_offline) {
    return {
      title: "Machine Note",
      text: "No recent payloads are being received by the backend. Check machine power, Wi-Fi, or MQTT connectivity.",
    };
  }

  if (latest?.sensor_health?.rpm?.stale) {
    return {
      title: "Sensor Note",
      text: "RPM data is delayed. Check the hall sensor, backend flow, and message freshness.",
    };
  }

  if (liveRpm === 0) {
    return {
      title: "Production Note",
      text: "The machine is currently stopped. Use the stop count and downtime chart below to understand recent interruption behavior.",
    };
  }

  if (avg1Rpm != null && avg1Rpm < RPM_MIN) {
    return {
      title: "Performance Note",
      text: `Average machine speed is below the expected operating level. Current 1-minute average is ${avg1Rpm.toFixed(0)} RPM while the minimum reference is ${RPM_MIN} RPM.`,
    };
  }

  if (
    (latest?.network_health?.buffered_count || 0) > 0 ||
    (latest?.network_health?.consecutive_publish_failures || 0) > 0
  ) {
    return {
      title: "Network Note",
      text: "The ESP32 experienced a connection interruption and buffered messages locally. Stored messages will be sent after reconnect.",
    };
  }

  return {
    title: "System Note",
    text: "RPM data is being received normally. Use the KPIs and charts below to track machine speed, runtime, and stop behavior over time.",
  };
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
      {payload.map((p, i) => (
        <div
          key={i}
          style={{
            color: p.color || p.stroke || p.fill || "#334155",
            marginBottom: 2,
          }}
        >
          {p.name}:{" "}
          <strong>
            {p.value != null
              ? typeof p.value === "number"
                ? p.value.toLocaleString()
                : p.value
              : "—"}
          </strong>
        </div>
      ))}
    </div>
  );
};

export default function RPMMonitoring() {
  const { data: d, online } = useLatest(MACHINE_ID, 2500);
  const hist = useHistory(MACHINE_ID, "rpm", 1800, 5000);
  const { buckets = [] } = useHourly(MACHINE_ID, 60000);

  const v = d || {};
  const liveRpm = safeRpm(v.rpm_live) ?? 0;
  const avg1Rpm = v.rpm_1min_ready ? safeRpm(v.rpm_1min) : null;
  const minuteProgressSec = +(v.minute_progress_sec || 0).toFixed(1);

  const historyAsc = useMemo(
    () =>
      [...hist].sort(
        (a, b) =>
          new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
      ),
    [hist],
  );

  const typicalIntervalMs = useMemo(() => {
    if (historyAsc.length < 2) return 5000;

    const diffs = [];
    for (let i = 1; i < historyAsc.length; i++) {
      const prev = new Date(historyAsc[i - 1].received_at).getTime();
      const curr = new Date(historyAsc[i].received_at).getTime();
      const diff = curr - prev;
      if (diff > 0) diffs.push(diff);
    }

    if (!diffs.length) return 5000;
    return diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
  }, [historyAsc]);

  const chartData = useMemo(
    () =>
      historyAsc.map((r) => ({
        time: fmtShort(r.received_at),
        live: safeRpm(r.rpm_live),
        avg1: safeRpm(r.rpm_1min),
      })),
    [historyAsc],
  );

  const runtimePct = useMemo(() => {
    if (!chartData.length) return 0;
    const activeCount = chartData.filter((row) => (row.live || 0) > 0).length;
    return (activeCount / chartData.length) * 100;
  }, [chartData]);

  const stopEvents = useMemo(() => {
    const events = [];
    let startIdx = null;
    let seenRunning = false;

    for (let i = 0; i < historyAsc.length; i++) {
      const row = historyAsc[i];
      const rpm = safeRpm(row.rpm_live) ?? 0;
      const isStopped = rpm === 0;

      if (rpm > 0) {
        seenRunning = true;
      }

      if (seenRunning && isStopped && startIdx === null) {
        startIdx = i;
      }

      const shouldCloseStop =
        startIdx !== null && (!isStopped || i === historyAsc.length - 1);

      if (shouldCloseStop) {
        const endIdx = !isStopped ? i - 1 : i;

        if (endIdx >= startIdx) {
          const startTs = new Date(historyAsc[startIdx].received_at).getTime();
          const endTs =
            new Date(historyAsc[endIdx].received_at).getTime() +
            typicalIntervalMs;

          const durationMin = Math.max(
            typicalIntervalMs / 60000,
            (endTs - startTs) / 60000,
          );

          if (durationMin >= 0.2) {
            let type = "Micro-stop";
            if (durationMin >= 5) type = "Long stop";
            else if (durationMin >= 1) type = "Short stop";

            events.push({
              startLabel: fmtShort(historyAsc[startIdx].received_at),
              endLabel: fmtShort(historyAsc[endIdx].received_at),
              durationMin,
              type,
            });
          }
        }

        startIdx = null;
      }
    }

    return events;
  }, [historyAsc, typicalIntervalMs]);

  const stopCount = stopEvents.length;

  const downtimeByHour = useMemo(() => {
    if (buckets.length) {
      return buckets.map((b) => ({
        hour: `${String(b.hour).padStart(2, "0")}:00`,
        pct: b.uptime_pct != null ? +(100 - b.uptime_pct).toFixed(1) : 0,
      }));
    }

    if (!historyAsc.length) return [];

    const grouped = {};
    historyAsc.forEach((r) => {
      const h = new Date(r.received_at).getHours();
      const rpm = safeRpm(r.rpm_live) ?? 0;
      if (!grouped[h]) grouped[h] = { total: 0, stopped: 0 };
      grouped[h].total += 1;
      if (rpm === 0) grouped[h].stopped += 1;
    });

    return Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b)
      .map((h) => ({
        hour: `${String(h).padStart(2, "0")}:00`,
        pct: +((grouped[h].stopped / grouped[h].total) * 100).toFixed(1),
      }));
  }, [buckets, historyAsc]);

  const stopDurationData = useMemo(
    () =>
      stopEvents.slice(-8).map((s, i) => ({
        name: `Stop ${i + 1}`,
        minutes: +s.durationMin.toFixed(1),
        started: s.startLabel,
        type: s.type,
      })),
    [stopEvents],
  );

  const longestStopMin = useMemo(() => {
    if (!stopEvents.length) return 0;
    return Math.max(...stopEvents.map((s) => s.durationMin));
  }, [stopEvents]);

  const hasEnoughHistory = chartData.length >= 6;
  const machineLabel = getMachineLabel(liveRpm, avg1Rpm, hasEnoughHistory);

  const note = getOperationalNote({
    latest: v,
    online,
    liveRpm,
    avg1Rpm,
    hasEnoughHistory,
    minuteProgressSec,
  });

  const currentPerformancePct = Math.min((liveRpm / RPM_TARGET) * 100, 100);
  const avgPerformancePct =
    avg1Rpm != null ? Math.min((avg1Rpm / RPM_TARGET) * 100, 100) : 0;
  const downtimePct = 100 - runtimePct;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="section-title">RPM Monitoring</div>
          <div className="section-sub">
            Clear production view using current RPM, 1-minute average, runtime,
            and stop behavior
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
        liveRpm={liveRpm}
        avg1Rpm={avg1Rpm}
        runtimePct={runtimePct}
        stopCount={stopCount}
        longestStopMin={longestStopMin}
        online={online}
      />

      <OperationalNote title={note.title} text={note.text} />

      <div className="kpi-grid">
        <KpiCard
          label="Current RPM"
          value={formatNum(liveRpm)}
          sub={`${currentPerformancePct.toFixed(1)}% of target speed`}
        />

        <KpiCard
          label="1-Min Avg RPM"
          value={avg1Rpm != null ? formatNum(avg1Rpm) : "—"}
          sub={
            avg1Rpm != null
              ? `Average machine speed • ${avgPerformancePct.toFixed(1)}% of target`
              : `Building first full 1-minute window • ${minuteProgressSec.toFixed(1)}s elapsed`
          }
        />

        <KpiCard
          label="Runtime"
          value={`${runtimePct.toFixed(1)}%`}
          sub={`Downtime ${downtimePct.toFixed(1)}% across visible history`}
        />

        <KpiCard
          label="Stop Count"
          value={formatNum(stopCount)}
          sub={`Longest stop ${longestStopMin.toFixed(1)} min`}
        />
      </div>

      <div className="card full">
        <div className="chart-title">RPM Trend</div>
        <div style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}>
          Blue area shows live RPM. Solid green line shows the 1-minute average.
          Orange dashed line shows the minimum operating level. Green dashed
          line shows the target RPM.
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={chartData}
            margin={{ left: 0, right: 16, top: 8, bottom: 5 }}
          >
            <defs>
              <linearGradient id="rpmFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 10 }} domain={[0, RPM_MAX_CHART]} />
            <Tooltip content={<CustomTooltip />} />

            <ReferenceLine
              y={RPM_MIN}
              stroke="#f59e0b"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{
                value: `Minimum ${RPM_MIN}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#b45309",
              }}
            />

            <ReferenceLine
              y={RPM_TARGET}
              stroke="#22c55e"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{
                value: `Target ${RPM_TARGET}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#166534",
              }}
            />

            <Area
              type="monotone"
              dataKey="live"
              name="Live RPM"
              stroke="#2563eb"
              fill="url(#rpmFill)"
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />

            <Line
              type="monotone"
              dataKey="avg1"
              name="1-Min Avg RPM"
              stroke="#16a34a"
              strokeWidth={2.4}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="chart-title">Downtime % by Hour</div>
          <div
            style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}
          >
            Lower downtime is better
          </div>
          {downtimeByHour.length === 0 ? (
            <div
              style={{
                height: 220,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#94a3b8",
                fontSize: ".85rem",
              }}
            >
              Collecting hourly RPM data...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={downtimeByHour}
                margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="pct"
                  name="Downtime %"
                  fill="#0f172a"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <div className="chart-title">Recent Stop Durations</div>
          <div
            style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}
          >
            Shows the most recent stop events and how long each one lasted.
          </div>
          {stopDurationData.length === 0 ? (
            <div
              style={{
                height: 220,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#94a3b8",
                fontSize: ".85rem",
              }}
            >
              No stop events detected in the visible history window.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={stopDurationData}
                margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="minutes"
                  name="Stop Minutes"
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
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
          <strong>Current RPM:</strong> {formatNum(liveRpm)} &nbsp;|&nbsp;
          <strong>1-Min Avg RPM:</strong>{" "}
          {avg1Rpm != null ? formatNum(avg1Rpm) : "Calculating..."}{" "}
          &nbsp;|&nbsp;
          <strong>Runtime:</strong> {runtimePct.toFixed(1)}% &nbsp;|&nbsp;
          <strong>Stop count:</strong> {stopCount} &nbsp;|&nbsp;
          <strong>Longest stop:</strong> {longestStopMin.toFixed(1)} min
        </div>
      </div>
    </div>
  );
}
