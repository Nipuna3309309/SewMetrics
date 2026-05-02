import React, { useMemo } from "react";
import {
  ComposedChart,
  Area,
  Bar,
  Line,
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

const ALERT_C = 60;
const WARN_C = 50;
const HUM_WARN = 85;
const TEMP_MAX_CHART = 80;
const HUM_MAX_CHART = 100;

function safeTemp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  if (n > TEMP_MAX_CHART) return null;
  return +n.toFixed(1);
}

function safeHumidity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  if (n > HUM_MAX_CHART) return null;
  return +n.toFixed(1);
}

function formatNum(value) {
  return Number(value || 0).toLocaleString();
}

function getMachineLabel(temp, hum, hasEnoughHistory) {
  if (!hasEnoughHistory) return "STARTING";
  if (temp == null) return "SENSOR CHECK";
  if (temp >= ALERT_C) return "OVERHEAT";
  if (temp >= WARN_C) return "HIGH TEMP";
  if (hum != null && hum > HUM_WARN) return "HIGH HUMIDITY";
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

function StatusBanner({ machineLabel, temp, hum, avgTemp, maxTemp, online }) {
  const tempPct = temp != null ? Math.min((temp / ALERT_C) * 100, 100) : 0;

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
            background: "#fee2e2",
            color: "#b91c1c",
            display: "grid",
            placeItems: "center",
            fontSize: "1.4rem",
            fontWeight: 800,
          }}
        >
          T
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
              Temperature Monitoring
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
            Clean environmental view using temperature, humidity, and peak heat
            trend
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
            Current Temp:{" "}
            <strong style={{ color: "#0f172a" }}>
              {temp != null ? `${temp.toFixed(1)}°C` : "—"}
            </strong>
          </span>
          <span>Alert: {ALERT_C}°C</span>
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
              width: `${tempPct}%`,
              background: "#ef4444",
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
            <div style={{ color: "#94a3b8" }}>Current Temp</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {temp != null ? `${temp.toFixed(1)}°C` : "—"}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Humidity</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {hum != null ? `${hum.toFixed(1)}%` : "—"}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Average Temp</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {avgTemp != null ? `${avgTemp.toFixed(1)}°C` : "—"}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Peak Temp</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {maxTemp != null ? `${maxTemp.toFixed(1)}°C` : "—"}
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

function getOperationalNote({ latest, online, temp, hum, hasEnoughHistory }) {
  if (!online) {
    return {
      title: "Connection Note",
      text: "The dashboard is currently offline. The last received temperature values are still shown here.",
    };
  }

  if (!hasEnoughHistory) {
    return {
      title: "Startup Note",
      text: "The dashboard is still collecting initial readings. Early values are not treated as a temperature issue yet.",
    };
  }

  if (latest?.machine_offline) {
    return {
      title: "Machine Note",
      text: "No recent payloads are being received by the backend. Check machine power, Wi-Fi, or MQTT connectivity.",
    };
  }

  if (latest?.sensor_health?.temperature?.stale) {
    return {
      title: "Sensor Note",
      text: "Temperature data is delayed. Check the DHT11 sensor, backend message flow, and data freshness.",
    };
  }

  if (temp == null) {
    return {
      title: "Sensor Note",
      text: "Temperature data is not currently available. Check the DHT11 data line and power connection.",
    };
  }

  if (temp >= ALERT_C) {
    return {
      title: "Critical Note",
      text: `Current machine temperature is ${temp.toFixed(1)}°C, which is above the critical reference of ${ALERT_C}°C. Immediate inspection is recommended.`,
    };
  }

  if (temp >= WARN_C) {
    return {
      title: "Performance Note",
      text: `Current machine temperature is ${temp.toFixed(1)}°C. This is above the warning reference of ${WARN_C}°C, so the machine should be monitored closely.`,
    };
  }

  if (hum != null && hum > HUM_WARN) {
    return {
      title: "Humidity Note",
      text: `Humidity is ${hum.toFixed(1)}%, which is above the high-humidity reference of ${HUM_WARN}%. Check for condensation risk around electrical parts.`,
    };
  }

  return {
    title: "System Note",
    text: "Temperature and humidity data are being received normally. Use the KPIs and charts below to monitor current heat, peak temperature, and environmental trend over time.",
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
                ? `${p.value.toFixed(1)}${p.name.includes("Humidity") ? "%" : "°C"}`
                : p.value}
            </strong>
          </div>
        ))}
    </div>
  );
};

function TempGauge({ temp }) {
  const CX = 150, CY = 118, R = 98, SW = 20, MAX = 80;

  const toRad = (t) =>
    ((180 - (Math.min(Math.max(t, 0), MAX) / MAX) * 180) * Math.PI) / 180;

  const pt = (t) => {
    const a = toRad(t);
    return [+(CX + R * Math.cos(a)).toFixed(2), +(CY - R * Math.sin(a)).toFixed(2)];
  };

  const arc = (t1, t2) => {
    const [x1, y1] = pt(t1);
    const [x2, y2] = pt(t2);
    const large = ((t2 - t1) / MAX) * 180 > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
  };

  const safeT = temp != null ? Math.min(Math.max(temp, 0), MAX) : 0;
  const na = toRad(safeT);
  const nx = +(CX + 78 * Math.cos(na)).toFixed(2);
  const ny = +(CY - 78 * Math.sin(na)).toFixed(2);

  const zoneIdx = safeT >= 60 ? 3 : safeT >= 50 ? 2 : safeT >= 40 ? 1 : 0;
  const zones = [
    { label: "Safe",     from: 0,  to: 40,  stroke: "#22c55e", color: "#15803d", bg: "#dcfce7" },
    { label: "Watch",    from: 40, to: 50,  stroke: "#eab308", color: "#854d0e", bg: "#fef9c3" },
    { label: "Warning",  from: 50, to: 60,  stroke: "#f97316", color: "#9a3412", bg: "#ffedd5" },
    { label: "Critical", from: 60, to: MAX, stroke: "#dc2626", color: "#b91c1c", bg: "#fee2e2" },
  ];
  const zone = zones[zoneIdx];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "4px 0" }}>
      <svg viewBox="0 0 300 155" style={{ width: "100%", maxHeight: 160 }}>
        {/* Background arc */}
        <path d={arc(0, MAX)} fill="none" stroke="#f1f5f9" strokeWidth={SW} strokeLinecap="butt" />
        {/* Zone arcs */}
        {zones.map((z) => (
          <path key={z.label} d={arc(z.from, z.to)} fill="none" stroke={z.stroke} strokeWidth={SW} strokeLinecap="butt" />
        ))}
        {/* White gap dots at zone boundaries */}
        {[40, 50, 60].map((t) => {
          const [x, y] = pt(t);
          return <circle key={t} cx={x} cy={y} r={SW / 2 + 2} fill="white" />;
        })}
        {/* Needle */}
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#1e293b" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={7} fill="#1e293b" />
        <circle cx={CX} cy={CY} r={3} fill="white" />
        {/* Temperature value */}
        <text x={CX} y={CY + 20} textAnchor="middle" fontSize="26" fontWeight="800" fill={zone.color}>
          {temp != null ? `${temp.toFixed(1)}°C` : "—"}
        </text>
      </svg>
      {/* Zone chips */}
      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>
        {zones.map((z, i) => (
          <span
            key={z.label}
            style={{
              fontSize: ".7rem",
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 999,
              background: z.bg,
              color: z.color,
              border: `1.5px solid ${i === zoneIdx ? z.color : "transparent"}`,
              opacity: i === zoneIdx ? 1 : 0.45,
            }}
          >
            {z.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function TemperatureMonitoring() {
  const { data: d, online } = useLatest(MACHINE_ID, 2500);
  const hist = useHistory(MACHINE_ID, "temperature", 300, 4000);

  const v = d || {};
  const temp = safeTemp(v.temperature_c);
  const hum = safeHumidity(v.humidity);

  const historyAsc = useMemo(
    () =>
      [...hist].sort(
        (a, b) =>
          new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
      ),
    [hist],
  );

  const chartData = useMemo(
    () =>
      historyAsc.map((r) => ({
        time: fmtShort(r.received_at),
        temp: safeTemp(r.temperature_c),
        hum: safeHumidity(r.humidity),
      })),
    [historyAsc],
  );

  const validTemps = useMemo(
    () => chartData.map((r) => r.temp).filter((v) => v != null),
    [chartData],
  );

  const validHums = useMemo(
    () => chartData.map((r) => r.hum).filter((v) => v != null),
    [chartData],
  );

  const avgTemp = useMemo(() => {
    if (!validTemps.length) return null;
    return validTemps.reduce((sum, v) => sum + v, 0) / validTemps.length;
  }, [validTemps]);

  const maxTemp = useMemo(() => {
    if (validTemps.length) return Math.max(...validTemps);
    return temp;
  }, [validTemps, temp]);

  const minTemp = useMemo(() => {
    if (validTemps.length) return Math.min(...validTemps);
    return temp;
  }, [validTemps, temp]);

  const rangeTemp = useMemo(() => {
    if (maxTemp == null || minTemp == null) return null;
    return +(maxTemp - minTemp).toFixed(1);
  }, [maxTemp, minTemp]);

  const avgHumidity = useMemo(() => {
    if (!validHums.length) return null;
    return validHums.reduce((sum, v) => sum + v, 0) / validHums.length;
  }, [validHums]);

  const heatIndexApprox = useMemo(() => {
    if (temp == null || hum == null) return null;
    // Steadman apparent temperature (°C): AT = T + 0.33·e − 4.00
    // where e = vapour pressure (kPa) = (hum/100) · 6.105 · exp(17.27·T/(237.7+T))
    const e = (hum / 100) * 6.105 * Math.exp((17.27 * temp) / (237.7 + temp));
    return +(temp + 0.33 * e - 4.0).toFixed(1);
  }, [temp, hum]);

  // Temperature rise rate: delta between consecutive readings (°C change)
  const riseRateData = useMemo(
    () =>
      chartData.slice(1).map((r, i) => ({
        time: r.time,
        delta:
          r.temp != null && chartData[i].temp != null
            ? +(r.temp - chartData[i].temp).toFixed(2)
            : null,
      })),
    [chartData],
  );

  const hasEnoughHistory = chartData.length >= 6;
  const machineLabel = getMachineLabel(temp, hum, hasEnoughHistory);

  const note = getOperationalNote({
    latest: v,
    online,
    temp,
    hum,
    hasEnoughHistory,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="section-title">Temperature Monitoring</div>
          <div className="section-sub">
            Clear environmental view using temperature, humidity, and peak heat
            trend
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
        hum={hum}
        avgTemp={avgTemp}
        maxTemp={maxTemp}
        online={online}
      />

      <OperationalNote title={note.title} text={note.text} />

      <div className="kpi-grid">
        <KpiCard
          label="Current Temperature"
          value={temp != null ? `${temp.toFixed(1)}°C` : "—"}
          sub={`Warning ${WARN_C}°C • Alert ${ALERT_C}°C`}
        />

        <KpiCard
          label="Humidity"
          value={hum != null ? `${hum.toFixed(1)}%` : "—"}
          sub={`Average humidity ${avgHumidity != null ? `${avgHumidity.toFixed(1)}%` : "—"}`}
        />

        <KpiCard
          label="Average Temperature"
          value={avgTemp != null ? `${avgTemp.toFixed(1)}°C` : "—"}
          sub={`Temperature range ${rangeTemp != null ? `${rangeTemp.toFixed(1)}°C` : "—"}`}
        />

        <KpiCard
          label="Peak Temperature"
          value={maxTemp != null ? `${maxTemp.toFixed(1)}°C` : "—"}
          sub={`Heat index approx. ${heatIndexApprox != null ? `${heatIndexApprox.toFixed(1)}°C` : "—"}`}
        />
      </div>

      <div className="card full">
        <div className="chart-title">Temperature & Humidity Trend</div>
        <div style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}>
          Red area shows temperature. Blue line shows humidity. Dashed lines
          show the warning and alert temperature references.
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={chartData}
            margin={{ left: 0, right: 16, top: 8, bottom: 5 }}
          >
            <defs>
              <linearGradient id="tempFillMain" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10 }}
              domain={[0, TEMP_MAX_CHART]}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10 }}
              domain={[0, HUM_MAX_CHART]}
            />
            <Tooltip content={<CustomTooltip />} />

            <ReferenceLine
              yAxisId="left"
              y={WARN_C}
              stroke="#f59e0b"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{
                value: `Warn ${WARN_C}°C`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#b45309",
              }}
            />

            <ReferenceLine
              yAxisId="left"
              y={ALERT_C}
              stroke="#dc2626"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{
                value: `Alert ${ALERT_C}°C`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#b91c1c",
              }}
            />

            <Area
              yAxisId="left"
              type="monotone"
              dataKey="temp"
              name="Temperature"
              stroke="#ef4444"
              fill="url(#tempFillMain)"
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />

            <Line
              yAxisId="right"
              type="monotone"
              dataKey="hum"
              name="Humidity"
              stroke="#2563eb"
              strokeWidth={2.2}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="chart-title">Temperature Rise Rate</div>
          <div
            style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}
          >
            Change in temperature between consecutive readings (°C). Orange bars
            = rising, blue bars = cooling. Flat bars mean stable temperature.
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart
              data={riseRateData}
              margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v) =>
                  v != null
                    ? [`${v > 0 ? "+" : ""}${v.toFixed(2)}°C`, "Temp Change"]
                    : ["—", "Temp Change"]
                }
                labelFormatter={(l) => `Time: ${l}`}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
              <Bar dataKey="delta" name="Temp Change" radius={[2, 2, 0, 0]}>
                {riseRateData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.delta == null
                        ? "#e2e8f0"
                        : entry.delta > 0
                          ? "#f97316"
                          : "#3b82f6"
                    }
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="chart-title">Temperature Status Gauge</div>
          <div
            style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}
          >
            Current temperature mapped to its safety zone. Needle shows live
            reading. Safe &lt;40°C · Watch 40–50°C · Warning 50–60°C · Critical
            ≥60°C.
          </div>
          <TempGauge temp={temp} />
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
          <strong>Current temperature:</strong>{" "}
          {temp != null ? `${temp.toFixed(1)}°C` : "—"} &nbsp;|&nbsp;
          <strong>Humidity:</strong> {hum != null ? `${hum.toFixed(1)}%` : "—"}{" "}
          &nbsp;|&nbsp;
          <strong>Average temperature:</strong>{" "}
          {avgTemp != null ? `${avgTemp.toFixed(1)}°C` : "—"} &nbsp;|&nbsp;
          <strong>Peak temperature:</strong>{" "}
          {maxTemp != null ? `${maxTemp.toFixed(1)}°C` : "—"} &nbsp;|&nbsp;
          <strong>Temperature range:</strong>{" "}
          {rangeTemp != null ? `${rangeTemp.toFixed(1)}°C` : "—"}
        </div>
      </div>

    </div>
  );
}
