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
} from "recharts";
import { useLatest, useHistory, fmtShort } from "../hooks/useSensorData";
import { MACHINE_ID } from "../App";

const SPM_TARGET = 2500;
const SPM_WARN = 1500;

const DAILY_MIN    = 750_000;
const DAILY_TARGET = 1_000_000;
const DAILY_MAX    = 1_400_000;

function formatNum(value) {
  return Number(value || 0).toLocaleString();
}

function getMachineLabel(spm, rpmLive, hasEnoughHistory) {
  if (!hasEnoughHistory) return "STARTING";
  if (spm === 0 && rpmLive > 0) return "RUNNING / NO STITCHES";
  if (spm === 0) return "IDLE";
  if (spm < SPM_WARN) return "LOW OUTPUT";
  if (spm < SPM_TARGET) return "RUNNING";
  return "ON TARGET";
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
  spm,
  avgSpm,
  totalStitches,
  recentGain,
  activePct,
  online,
}) {
  const performancePct = Math.min((spm / SPM_TARGET) * 100, 100);

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
            background: "#e0f2fe",
            color: "#0369a1",
            display: "grid",
            placeItems: "center",
            fontSize: "1.4rem",
            fontWeight: 800,
          }}
        >
          S
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
              Stitch Monitoring
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
            Clean production view using total stitches and stitches per minute
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
            Current SPM:{" "}
            <strong style={{ color: "#0f172a" }}>{spm.toFixed(0)}</strong>
          </span>
          <span>Target: {SPM_TARGET}</span>
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
            <div style={{ color: "#94a3b8" }}>Total Stitches</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {formatNum(totalStitches)}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Average SPM</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {avgSpm.toFixed(0)}
            </div>
          </div>
          <div>
            <div style={{ color: "#94a3b8" }}>Recent Stitch Gain</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {formatNum(recentGain)}
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
            <div style={{ color: "#94a3b8" }}>Active Time</div>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>
              {activePct.toFixed(1)}%
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
  spm,
  rpmLive,
  avgSpm,
  hasEnoughHistory,
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
      text: "The dashboard is still collecting initial readings. Early zero or low SPM values are not treated as production issues yet.",
    };
  }

  if (latest?.machine_offline) {
    return {
      title: "Machine Note",
      text: "No recent payloads are being received by the backend. Check machine power, Wi-Fi, or MQTT connectivity.",
    };
  }

  if (latest?.sensor_health?.stitches?.stale) {
    return {
      title: "Sensor Note",
      text: "Stitch data is delayed. Check the stitch sensor connection and backend message flow.",
    };
  }

  if (spm === 0 && rpmLive > 0) {
    return {
      title: "Production Note",
      text: "The machine is rotating, but stitches are not being detected. Check thread flow, stitch sensor position, or detection alignment.",
    };
  }

  if (avgSpm > 0 && avgSpm < SPM_WARN) {
    return {
      title: "Performance Note",
      text: `Output is below the expected operating level. Average production is ${avgSpm.toFixed(0)} SPM, while the warning reference is ${SPM_WARN} SPM.`,
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
    text: "Stitch data is being received normally. Use the KPIs and charts below to track current speed, total output, and stitch growth over time.",
  };
}

function DailyGoalTracker({ totalStitches, avgSpm }) {
  const barPct    = Math.min((totalStitches / DAILY_MAX) * 100, 100);
  const minMark   = (DAILY_MIN    / DAILY_MAX) * 100;
  const tgtMark   = (DAILY_TARGET / DAILY_MAX) * 100;
  const goalPct   = Math.min((totalStitches / DAILY_TARGET) * 100, 100);

  let status, statusColor, statusBg, barColor;
  if (totalStitches >= DAILY_TARGET) {
    status = "Goal Met";  statusColor = "#166534"; statusBg = "#dcfce7"; barColor = "#22c55e";
  } else if (totalStitches >= DAILY_MIN) {
    status = "On Track";  statusColor = "#92400e"; statusBg = "#fef3c7"; barColor = "#f59e0b";
  } else {
    status = "Behind";    statusColor = "#991b1b"; statusBg = "#fee2e2"; barColor = "#ef4444";
  }

  let etaText = "—";
  if (avgSpm > 0 && totalStitches < DAILY_TARGET) {
    const etaMin = (DAILY_TARGET - totalStitches) / avgSpm;
    if (etaMin < 60) {
      etaText = `${Math.round(etaMin)} min`;
    } else {
      const h = Math.floor(etaMin / 60);
      const m = Math.round(etaMin % 60);
      etaText = `${h}h ${m}m`;
    }
  } else if (totalStitches >= DAILY_TARGET) {
    etaText = "Reached";
  }

  return (
    <div className="card full" style={{ marginBottom: 18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 14 }}>
        <div>
          <div className="chart-title" style={{ marginBottom: 2 }}>Daily Production Goal</div>
          <div style={{ fontSize:".75rem", color:"#9ca3af" }}>
            Industry benchmark — min 750K · target 1M · max 1.4M stitches/shift
          </div>
        </div>
        <span style={{
          fontSize:".8rem", fontWeight:700, color:statusColor,
          background:statusBg, borderRadius:999, padding:"4px 14px",
          whiteSpace:"nowrap",
        }}>
          {status}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ position:"relative", marginBottom: 28 }}>
        <div style={{ height:18, background:"#e2e8f0", borderRadius:999, position:"relative", overflow:"visible" }}>
          <div style={{
            height:"100%", width:`${barPct}%`,
            background: barColor,
            borderRadius:999,
            transition:"width .5s ease",
          }} />
          {/* Min band marker */}
          <div style={{
            position:"absolute", left:`${minMark}%`, top:-3, bottom:-3,
            width:2, background:"#f59e0b", borderRadius:2, zIndex:2,
          }} />
          {/* Target band marker */}
          <div style={{
            position:"absolute", left:`${tgtMark}%`, top:-3, bottom:-3,
            width:2, background:"#22c55e", borderRadius:2, zIndex:2,
          }} />
        </div>

        {/* Band labels */}
        <div style={{ position:"relative", height:18, marginTop:6 }}>
          <span style={{
            position:"absolute", left:`${minMark}%`, transform:"translateX(-50%)",
            fontSize:".7rem", color:"#b45309", whiteSpace:"nowrap",
          }}>
            Min 750K
          </span>
          <span style={{
            position:"absolute", left:`${tgtMark}%`, transform:"translateX(-50%)",
            fontSize:".7rem", color:"#166534", whiteSpace:"nowrap",
          }}>
            Target 1M
          </span>
          <span style={{
            position:"absolute", right:0,
            fontSize:".7rem", color:"#64748b",
          }}>
            Max 1.4M
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:0 }}>
        {[
          { label:"Today's Count",  value: formatNum(totalStitches) },
          { label:"Goal Progress",  value: `${goalPct.toFixed(1)}%` },
          { label:"Remaining",      value: totalStitches >= DAILY_TARGET ? "—" : formatNum(DAILY_TARGET - totalStitches) },
          { label:"ETA to Goal",    value: etaText },
        ].map((s, i, arr) => (
          <div key={s.label} style={{
            textAlign:"center",
            padding:"10px 0",
            borderRight: i < arr.length - 1 ? "1px solid #f1f5f9" : "none",
          }}>
            <div style={{ fontSize:".75rem", color:"#94a3b8", marginBottom:3 }}>{s.label}</div>
            <div style={{ fontSize:"1.2rem", fontWeight:800, color:"#0f172a" }}>{s.value}</div>
          </div>
        ))}
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

export default function StitchMonitoring() {
  const { data: d, online } = useLatest(MACHINE_ID, 2500);
  const hist = useHistory(MACHINE_ID, "stitches", 60, 4000);

  const v = d || {};
  const totalStitches = v.stitches_total || 0;
  const spm = +(v.spm || 0).toFixed(1);
  const rpmLive = v.rpm_live || 0;

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
        spm: +(r.spm || 0).toFixed(1),
        total: r.stitches_total || 0,
      })),
    [historyAsc],
  );

  const gainData = useMemo(
    () =>
      chartData.map((r, i) => ({
        time: r.time,
        gained: i === 0 ? 0 : Math.max(0, r.total - chartData[i - 1].total),
      })),
    [chartData],
  );

  const avgSpm = useMemo(() => {
    const active = chartData.filter((row) => (row.spm || 0) > 0);
    if (!active.length) return 0;
    const sum = active.reduce((acc, row) => acc + row.spm, 0);
    return sum / active.length;
  }, [chartData]);

  const activePct = useMemo(() => {
    if (!chartData.length) return 0;
    const activeCount = chartData.filter((row) => (row.spm || 0) > 0).length;
    return (activeCount / chartData.length) * 100;
  }, [chartData]);

  const recentGain = useMemo(() => {
    if (chartData.length < 2) return 0;
    return Math.max(
      0,
      (chartData[chartData.length - 1]?.total || 0) -
        (chartData[0]?.total || 0),
    );
  }, [chartData]);

  const hasEnoughHistory = chartData.length >= 6;
  const machineLabel = getMachineLabel(spm, rpmLive, hasEnoughHistory);

  const note = getOperationalNote({
    latest: v,
    online,
    spm,
    rpmLive,
    avgSpm,
    hasEnoughHistory,
  });

  const currentPerformancePct = Math.min((spm / SPM_TARGET) * 100, 100);
  const avgPerformancePct = Math.min((avgSpm / SPM_TARGET) * 100, 100);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="section-title">Stitch Monitoring</div>
          <div className="section-sub">
            Clear production view using total stitches and stitches per minute
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
        spm={spm}
        avgSpm={avgSpm}
        totalStitches={totalStitches}
        recentGain={recentGain}
        activePct={activePct}
        online={online}
      />

      <OperationalNote title={note.title} text={note.text} />

      <div className="kpi-grid">
        <KpiCard
          label="Total Stitches"
          value={formatNum(totalStitches)}
          sub="Main stitch counter from the machine"
        />

        <KpiCard
          label="Current SPM"
          value={spm.toFixed(0)}
          sub={`Current stitching speed • ${currentPerformancePct.toFixed(1)}% of target`}
        />

        <KpiCard
          label="Average SPM"
          value={avgSpm.toFixed(0)}
          sub={`Average over recent history • ${avgPerformancePct.toFixed(1)}% of target`}
        />

        <KpiCard
          label="Active Time"
          value={`${activePct.toFixed(1)}%`}
          sub={`Recent stitch gain ${formatNum(recentGain)} across visible history`}
        />
      </div>

      <DailyGoalTracker totalStitches={totalStitches} avgSpm={avgSpm} />

      <div className="card full">
        <div className="chart-title">SPM Trend</div>
        <div style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}>
          Current stitching speed over time. Reference lines show the warning
          level and target level.
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart
            data={chartData}
            margin={{ left: 0, right: 16, top: 8, bottom: 5 }}
          >
            <defs>
              <linearGradient id="spmFill" x1="0" y1="0" x2="0" y2="1">
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
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />

            <ReferenceLine
              y={SPM_WARN}
              stroke="#f59e0b"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{
                value: `Warning ${SPM_WARN}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#b45309",
              }}
            />

            <ReferenceLine
              y={SPM_TARGET}
              stroke="#22c55e"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{
                value: `Target ${SPM_TARGET}`,
                position: "insideTopRight",
                fontSize: 10,
                fill: "#166534",
              }}
            />

            <Area
              type="monotone"
              dataKey="spm"
              name="SPM"
              stroke="#2563eb"
              fill="url(#spmFill)"
              strokeWidth={2.5}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="chart-title">Total Stitch Count Trend</div>
          <div
            style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}
          >
            This shows the total stitch counter from the machine
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={chartData}
              margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="total"
                name="Total Stitches"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="chart-title">Stitch Gain Per Reading</div>
          <div
            style={{ fontSize: ".75rem", color: "#9ca3af", marginBottom: 10 }}
          >
            Shows how many new stitches were added between consecutive readings.
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={gainData}
              margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="gained"
                name="New Stitches"
                fill="#0f172a"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
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
          <strong>Total stitches:</strong> {formatNum(totalStitches)}{" "}
          &nbsp;|&nbsp;
          <strong>Current SPM:</strong> {spm.toFixed(0)} &nbsp;|&nbsp;
          <strong>Average SPM:</strong> {avgSpm.toFixed(0)} &nbsp;|&nbsp;
          <strong>Recent stitch gain:</strong> {formatNum(recentGain)}{" "}
          &nbsp;|&nbsp;
          <strong>Active time:</strong> {activePct.toFixed(1)}%
        </div>
      </div>

    </div>
  );
}
