import React, { useMemo } from "react";
import {
  ComposedChart,
  BarChart,
  Bar,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  useLatest,
  useHistory,
  useHourly,
  useAlerts,
  toG,
  fmtShort,
} from "../hooks/useSensorData";
import { MACHINE_ID, MACHINE_LABEL } from "../App";

const C = {
  running: "#059669",
  ok_bg: "#D1FAE5",
  ok_txt: "#065F46",
  warning: "#D97706",
  wa_bg: "#FEF3C7",
  wa_txt: "#92400E",
  critical: "#DC2626",
  cr_bg: "#FEE2E2",
  cr_txt: "#991B1B",
  idle: "#64748B",
  id_bg: "#F1F5F9",
  id_txt: "#374151",
  blue: "#2563EB",
  bl_bg: "#EFF6FF",
  bl_txt: "#1D4ED8",
  bg: "#F8FAFC",
  card: "#FFFFFF",
  border: "#E2E8F0",
  text: "#0F172A",
  sub: "#64748B",
};

function mStatus(online, rpm, alerts) {
  if (!online)
    return { label: "Offline", dot: C.critical, bg: C.cr_bg, txt: C.cr_txt };
  if (rpm === 0)
    return { label: "Idle", dot: C.idle, bg: C.id_bg, txt: C.id_txt };
  if (alerts.some((a) => a.severity === "warning"))
    return { label: "Warning", dot: C.warning, bg: C.wa_bg, txt: C.wa_txt };
  return { label: "Running", dot: C.running, bg: C.ok_bg, txt: C.ok_txt };
}

function tempSt(t) {
  if (t >= 60)
    return { label: `Critical ${t.toFixed(1)}°C`, bg: C.cr_bg, txt: C.cr_txt };
  if (t >= 50)
    return { label: `Warning ${t.toFixed(1)}°C`, bg: C.wa_bg, txt: C.wa_txt };
  return { label: "Normal", bg: C.ok_bg, txt: C.ok_txt };
}
function vibSt(g) {
  if (g >= 0.2) return { label: "Critical", bg: C.cr_bg, txt: C.cr_txt };
  if (g >= 0.1) return { label: "Warning", bg: C.wa_bg, txt: C.wa_txt };
  return { label: "Normal", bg: C.ok_bg, txt: C.ok_txt };
}
function rpmSt(r) {
  if (r === 0) return { label: "Stopped", bg: C.id_bg, txt: C.id_txt };
  if (r < 800) return { label: "Low RPM", bg: C.wa_bg, txt: C.wa_txt };
  return { label: "Stable", bg: C.ok_bg, txt: C.ok_txt };
}

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: ".78rem",
        boxShadow: "0 4px 12px rgba(0,0,0,.07)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{label}</div>
      {payload
        .filter((p) => p.value != null)
        .map((p, i) => (
          <div key={i} style={{ color: p.fill || p.stroke || C.text }}>
            {p.name}:{" "}
            <strong>
              {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
            </strong>
          </div>
        ))}
    </div>
  );
};

function Sparkline({ data, color }) {
  if (!data?.length) return null;
  const pts = data.slice(-15).map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={pts}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          dot={false}
          strokeWidth={1.5}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Badge({ label, bg, txt }) {
  return (
    <span
      style={{
        fontSize: ".67rem",
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 20,
        background: bg,
        color: txt,
      }}
    >
      {label}
    </span>
  );
}

export default function Overview() {
  const { data: d, online } = useLatest(MACHINE_ID, 2500);

  const rpmH = useHistory(MACHINE_ID, "rpm", 20, 4000);
  const stH = useHistory(MACHINE_ID, "stitches", 20, 4000);
  const tempH = useHistory(MACHINE_ID, "temperature", 20, 4000);
  const vibH = useHistory(MACHINE_ID, "vibration", 20, 4000);
  const corrH = useHistory(MACHINE_ID, "rpm", 60, 4000);

  const { buckets } = useHourly(MACHINE_ID, 60000);
  const alerts = useAlerts(MACHINE_ID);

  const v = d || {};
  const sh = v.sensor_health || {};
  const rpm = +(v.rpm_live || 0);
  const spm = +(v.spm || 0);
  const temp = +(v.temperature_c || 0);
  const hum = +(v.humidity || 0);
  const vibG = toG(v.vibration_stable || 0);
  const total = v.stitches_total || 0;
  const ms = mStatus(online, rpm, alerts);

  const spmDelta = useMemo(() => {
    if (stH.length < 2) return null;
    const cur = stH[stH.length - 1]?.spm || 0;
    const prev = stH[Math.max(0, stH.length - 5)]?.spm || 0;
    if (!prev) return null;
    return +(((cur - prev) / prev) * 100).toFixed(1);
  }, [stH]);

  const hourlyData = useMemo(
    () =>
      buckets.map((b) => ({
        hour: `${String(b.hour).padStart(2, "0")}:00`,
        stitches: b.avg_spm != null ? Math.round(b.avg_spm * 60) : null,
      })),
    [buckets],
  );

  // Stitch vs RPM correlation — chronological oldest → newest
  const corrData = useMemo(
    () =>
      corrH.map((r) => ({
        time: fmtShort(r.received_at),
        rpm: +(r.rpm_live || 0).toFixed(0),
        spm: +(r.spm || 0).toFixed(0),
      })),
    [corrH],
  );

  const priorityAlerts = useMemo(() => {
    const list = [...alerts];
    if (temp >= 60 && !list.find((a) => a.type === "temperature"))
      list.unshift({
        severity: "warning",
        type: "temperature",
        message: `Motor temp ${temp.toFixed(1)}°C exceeds 60°C threshold`,
      });
    if (vibG >= 0.2 && !list.find((a) => a.type === "vibration"))
      list.unshift({
        severity: "warning",
        type: "vibration",
        message: `Vibration ${vibG.toFixed(3)} g — abnormal pattern detected`,
      });
    if (rpm === 0 && online)
      list.push({
        severity: "info",
        type: "idle",
        message: `${MACHINE_ID} idle — no input for last reading`,
      });
    return list.slice(0, 6);
  }, [alerts, temp, vibG, rpm, online]);

  return (
    <div
      style={{
        padding: "20px 24px",
        background: C.bg,
        minHeight: "100vh",
        fontFamily: "'Inter',system-ui,sans-serif",
        color: C.text,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>
            Smart Apparel Manufacturing Dashboard
          </h1>
          <div
            style={{
              fontSize: ".72rem",
              color: C.sub,
              marginTop: 3,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                display: "inline-block",
                background: online ? C.running : C.critical,
              }}
            />
            ·&nbsp; {MACHINE_LABEL} ({MACHINE_ID})
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: ".8rem", fontWeight: 600, color: C.text }}>
              {new Date().toLocaleDateString("en-US", { dateStyle: "medium" })}
              {" · "}
              {new Date().toLocaleTimeString("en-US", { timeStyle: "short" })}
            </div>
            <div
              style={{
                fontSize: ".68rem",
                fontWeight: 700,
                marginTop: 2,
                color: online ? C.running : C.critical,
              }}
            >
              {online ? "● System Live" : "● Offline"}
            </div>
          </div>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "#E0E7FF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: ".9rem",
              color: C.blue,
            }}
          >
            A
          </div>
        </div>
      </div>

      {/* ── 4 KPI Cards ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 14,
          marginBottom: 18,
        }}
      >
        {/* Stitch Count */}
        <div
          style={{
            background: C.card,
            borderRadius: 12,
            padding: "16px 18px",
            border: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: ".67rem",
                color: C.sub,
                textTransform: "uppercase",
                letterSpacing: ".07em",
                fontWeight: 700,
              }}
            >
              Stitch Count (Session)
            </div>
            {spmDelta != null && (
              <Badge
                label={`${spmDelta >= 0 ? "+" : ""}${spmDelta}%`}
                bg={spmDelta >= 0 ? C.ok_bg : C.cr_bg}
                txt={spmDelta >= 0 ? C.ok_txt : C.cr_txt}
              />
            )}
          </div>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: 800,
              lineHeight: 1,
              marginBottom: 2,
            }}
          >
            {total.toLocaleString()}
          </div>
          <div style={{ fontSize: ".7rem", color: C.sub, marginBottom: 4 }}>
            SPM: <strong style={{ color: C.text }}>{spm.toFixed(0)}</strong>
          </div>
          <Sparkline data={stH.map((r) => r.spm || 0)} color="#3B82F6" />
        </div>

        {/* RPM */}
        <div
          style={{
            background: C.card,
            borderRadius: 12,
            padding: "16px 18px",
            border: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: ".67rem",
                color: C.sub,
                textTransform: "uppercase",
                letterSpacing: ".07em",
                fontWeight: 700,
              }}
            >
              Motor Speed (RPM)
            </div>
            <Badge
              label={rpmSt(rpm).label}
              bg={rpmSt(rpm).bg}
              txt={rpmSt(rpm).txt}
            />
          </div>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: 800,
              lineHeight: 1,
              marginBottom: 2,
              color:
                rpm < 800 && rpm > 0 ? C.warning : rpm === 0 ? C.idle : C.text,
            }}
          >
            {rpm.toFixed(0)}
            <span style={{ fontSize: ".9rem", color: C.sub, fontWeight: 500 }}>
              {" "}
              RPM
            </span>
          </div>
          <div style={{ fontSize: ".7rem", color: C.sub, marginBottom: 4 }}>
            1-min avg:{" "}
            <strong style={{ color: C.text }}>
              {v.rpm_1min_ready ? (v.rpm_1min || 0).toFixed(0) : "Calculating…"}
            </strong>
          </div>
          <Sparkline data={rpmH.map((r) => r.rpm_live || 0)} color="#8B5CF6" />
        </div>

        {/* Temperature */}
        <div
          style={{
            background: C.card,
            borderRadius: 12,
            padding: "16px 18px",
            border: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: ".67rem",
                color: C.sub,
                textTransform: "uppercase",
                letterSpacing: ".07em",
                fontWeight: 700,
              }}
            >
              Motor Temperature
            </div>
            <Badge
              label={tempSt(temp).label}
              bg={tempSt(temp).bg}
              txt={tempSt(temp).txt}
            />
          </div>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: 800,
              lineHeight: 1,
              marginBottom: 2,
              color: temp >= 60 ? C.critical : temp >= 50 ? C.warning : C.text,
            }}
          >
            {temp.toFixed(1)}
            <span style={{ fontSize: ".9rem", color: C.sub, fontWeight: 500 }}>
              {" "}
              °C
            </span>
          </div>
          <div style={{ fontSize: ".7rem", color: C.sub, marginBottom: 4 }}>
            Humidity:{" "}
            <strong style={{ color: C.text }}>{hum.toFixed(0)}%</strong>
            {" · "}Threshold: 60°C
          </div>
          <Sparkline
            data={tempH.map((r) => r.temperature_c || 0)}
            color="#F59E0B"
          />
        </div>

        {/* Vibration */}
        <div
          style={{
            background: C.card,
            borderRadius: 12,
            padding: "16px 18px",
            border: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: ".67rem",
                color: C.sub,
                textTransform: "uppercase",
                letterSpacing: ".07em",
                fontWeight: 700,
              }}
            >
              Machine Vibration
            </div>
            <Badge
              label={vibSt(vibG).label}
              bg={vibSt(vibG).bg}
              txt={vibSt(vibG).txt}
            />
          </div>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: 800,
              lineHeight: 1,
              marginBottom: 2,
              color:
                vibG >= 0.2 ? C.critical : vibG >= 0.1 ? C.warning : C.text,
            }}
          >
            {vibG.toFixed(3)}
            <span style={{ fontSize: ".9rem", color: C.sub, fontWeight: 500 }}>
              {" "}
              g
            </span>
          </div>
          <div style={{ fontSize: ".7rem", color: C.sub, marginBottom: 4 }}>
            Raw:{" "}
            <strong style={{ color: C.text }}>
              {(v.vibration_stable || 0).toFixed(0)}
            </strong>
            {" · "}Status: Within tolerance
          </div>
          <Sparkline
            data={vibH.map((r) => toG(r.vibration_stable || 0))}
            color="#EF4444"
          />
        </div>
      </div>

      {/* ── Main 2-col layout ── */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}
      >
        {/* ── LEFT column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Live Machine Grid */}
          <div
            style={{
              background: C.card,
              borderRadius: 12,
              padding: "18px 20px",
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: ".95rem" }}>
                Live Machine Grid
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Badge
                  label={online ? "Active: 1" : "Active: 0"}
                  bg={C.ok_bg}
                  txt={C.ok_txt}
                />
                <Badge
                  label={!online || rpm === 0 ? "Idle: 1" : "Idle: 0"}
                  bg={C.id_bg}
                  txt={C.id_txt}
                />
                {priorityAlerts.some((a) => a.severity === "warning") && (
                  <Badge label="Alert: 1" bg={C.wa_bg} txt={C.wa_txt} />
                )}
              </div>
            </div>
            <div
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "14px 16px",
                background: "#FAFBFC",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: ".9rem" }}>
                    {MACHINE_ID}
                  </div>
                  <div
                    style={{ fontSize: ".7rem", color: C.sub, marginTop: 2 }}
                  >
                    Sewing Unit · Floor Area A
                  </div>
                </div>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    marginTop: 4,
                    display: "inline-block",
                    background: ms.dot,
                    boxShadow: `0 0 6px ${ms.dot}`,
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4,1fr)",
                  gap: 10,
                }}
              >
                {[
                  {
                    label: "STITCH",
                    value: `${(total / 1000).toFixed(1)}K`,
                    sub: "total",
                  },
                  {
                    label: "RPM",
                    value: rpm.toFixed(0),
                    sub: `avg ${(v.rpm_1min || 0).toFixed(0)}`,
                  },
                  {
                    label: "TEMP",
                    value: `${temp.toFixed(0)}°C`,
                    sub: `${hum.toFixed(0)}% RH`,
                    color:
                      temp >= 60
                        ? C.critical
                        : temp >= 50
                          ? C.warning
                          : undefined,
                  },
                  {
                    label: "VIB",
                    value: `${vibG.toFixed(3)} g`,
                    sub: `raw ${(v.vibration_stable || 0).toFixed(0)}`,
                    color:
                      vibG >= 0.2
                        ? C.critical
                        : vibG >= 0.1
                          ? C.warning
                          : undefined,
                  },
                ].map((kpi) => (
                  <div key={kpi.label}>
                    <div
                      style={{
                        fontSize: ".62rem",
                        color: C.sub,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                      }}
                    >
                      {kpi.label}
                    </div>
                    <div
                      style={{
                        fontSize: "1.05rem",
                        fontWeight: 800,
                        marginTop: 2,
                        color: kpi.color || C.text,
                      }}
                    >
                      {kpi.value}
                    </div>
                    <div style={{ fontSize: ".65rem", color: C.sub }}>
                      {kpi.sub}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <Badge label={ms.label} bg={ms.bg} txt={ms.txt} />
                {v.wifi_connected && (
                  <Badge label="WiFi OK" bg={C.ok_bg} txt={C.ok_txt} />
                )}
              </div>
            </div>
          </div>

          {/* Production Analytics — 24h hourly */}
          <div
            style={{
              background: C.card,
              borderRadius: 12,
              padding: "18px 20px",
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{ fontWeight: 700, fontSize: ".95rem", marginBottom: 3 }}
            >
              Production Analytics (Last 24h)
            </div>
            <div style={{ fontSize: ".7rem", color: C.sub, marginBottom: 14 }}>
              Hourly stitch output &nbsp;·&nbsp;
              <span style={{ color: C.blue }}>■ Stitches / hr</span>&nbsp;&nbsp;
              <span style={{ color: "#93C5FD" }}>■ Previous hours</span>
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart
                data={hourlyData}
                margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#F1F5F9"
                  vertical={false}
                />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 9, fill: C.sub }}
                  interval={Math.max(1, Math.floor(hourlyData.length / 12))}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: C.sub }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<Tip />} />
                <Bar
                  dataKey="stitches"
                  name="Stitches/hr"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                >
                  {hourlyData.map((b, i) => (
                    <Cell
                      key={i}
                      fill={
                        b.stitches == null
                          ? "#E2E8F0"
                          : i === hourlyData.length - 1
                            ? C.blue
                            : "#93C5FD"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Stitch & RPM Correlation */}
          <div
            style={{
              background: C.card,
              borderRadius: 12,
              padding: "18px 20px",
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{ fontWeight: 700, fontSize: ".95rem", marginBottom: 3 }}
            >
              Stitch &amp; RPM Correlation
            </div>
            <div style={{ fontSize: ".7rem", color: C.sub, marginBottom: 14 }}>
              Last 60 readings (~2 min) &nbsp;·&nbsp;
              <span style={{ color: "#8B5CF6" }}>■ RPM</span>&nbsp;&nbsp;
              <span style={{ color: "#22C55E" }}>■ SPM</span>
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <ComposedChart
                data={corrData}
                margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="rpmCorrG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="spmCorrG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#F1F5F9"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 9, fill: C.sub }}
                  interval={Math.max(1, Math.floor(corrData.length / 10))}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: C.sub }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<Tip />} />
                <Area
                  type="monotone"
                  dataKey="rpm"
                  stroke="#8B5CF6"
                  fill="url(#rpmCorrG)"
                  name="RPM"
                  strokeWidth={2}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="spm"
                  stroke="#22C55E"
                  fill="url(#spmCorrG)"
                  name="SPM"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── RIGHT sidebar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Safety & Priority Alerts */}
          <div
            style={{
              background: C.card,
              borderRadius: 12,
              padding: "16px 18px",
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                fontSize: ".67rem",
                color: C.sub,
                textTransform: "uppercase",
                letterSpacing: ".09em",
                fontWeight: 700,
                marginBottom: 12,
              }}
            >
              Safety &amp; Priority Alerts
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {priorityAlerts.length === 0 ? (
                <div
                  style={{
                    padding: "10px 12px",
                    background: "#F0FDF4",
                    borderRadius: 8,
                    fontSize: ".78rem",
                    color: C.ok_txt,
                    fontWeight: 600,
                  }}
                >
                  ✓ No active alerts
                </div>
              ) : (
                priorityAlerts.map((a, i) => {
                  const isCrit =
                    a.severity === "warning" &&
                    (a.type === "temperature" || a.type === "vibration");
                  const bg = isCrit
                    ? C.cr_bg
                    : a.severity === "warning"
                      ? C.wa_bg
                      : C.id_bg;
                  const dot = isCrit
                    ? C.critical
                    : a.severity === "warning"
                      ? C.warning
                      : C.idle;
                  const txt = isCrit
                    ? C.cr_txt
                    : a.severity === "warning"
                      ? C.wa_txt
                      : C.id_txt;
                  return (
                    <div
                      key={i}
                      style={{
                        padding: "9px 12px",
                        borderRadius: 8,
                        background: bg,
                        borderLeft: `3px solid ${dot}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: dot,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: ".75rem",
                            color: txt,
                            textTransform: "uppercase",
                          }}
                        >
                          {a.type?.replace("_", " ")}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: ".7rem",
                          color: C.sub,
                          marginTop: 3,
                          paddingLeft: 13,
                        }}
                      >
                        {a.message}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Machine Details */}
          <div
            style={{
              background: C.card,
              borderRadius: 12,
              padding: "16px 18px",
              border: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                fontSize: ".67rem",
                color: C.sub,
                textTransform: "uppercase",
                letterSpacing: ".09em",
                fontWeight: 700,
                marginBottom: 12,
              }}
            >
              Machine Details
            </div>
            {[
              { label: "Machine ID", val: MACHINE_ID },
              {
                label: "Status",
                val: <Badge label={ms.label} bg={ms.bg} txt={ms.txt} />,
              },
              {
                label: "Minute Progress",
                val: `${(v.minute_progress_sec || 0).toFixed(0)}s / 60s`,
              },
              {
                label: "Current Revs",
                val: (v.current_minute_revs || 0).toLocaleString(),
              },
              {
                label: "Accel X / Y / Z",
                val: `${v.accel_x || 0} / ${v.accel_y || 0} / ${v.accel_z || 0}`,
              },
              { label: "Vibration (g)", val: `${vibG.toFixed(4)} g` },
              {
                label: "Last Seen",
                val: v.last_received_at
                  ? new Date(v.last_received_at).toLocaleTimeString()
                  : "—",
              },
              {
                label: "WiFi",
                val: v.wifi_connected ? (
                  <Badge label="Connected" bg={C.ok_bg} txt={C.ok_txt} />
                ) : (
                  <Badge label="No WiFi" bg={C.cr_bg} txt={C.cr_txt} />
                ),
              },
            ].map((r) => (
              <div
                key={r.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingBottom: 7,
                  marginBottom: 7,
                  borderBottom: `1px solid #F8FAFC`,
                }}
              >
                <span style={{ fontSize: ".75rem", color: C.sub }}>
                  {r.label}
                </span>
                <span
                  style={{ fontSize: ".78rem", fontWeight: 700, color: C.text }}
                >
                  {r.val}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
