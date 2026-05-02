import React, { useState, useMemo } from "react";
import {
  ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { MACHINE_ID } from "../App";

const PAGE_SIZE  = 50;
const WARN_VIB   = 0.3,  CRIT_VIB   = 0.5;
const WARN_TEMP  = 50,   ALERT_TEMP  = 60;

const SENSOR_META = {
  rpm:         { label: "RPM",         color: "#6366f1", bg: "#eef2ff" },
  stitches:    { label: "Stitches",    color: "#10b981", bg: "#ecfdf5" },
  vibration:   { label: "Vibration",   color: "#f59e0b", bg: "#fffbeb" },
  temperature: { label: "Temperature", color: "#ef4444", bg: "#fef2f2" },
};

const LIMITS = [
  { value: 100,  label: "Last 100 / sensor"   },
  { value: 500,  label: "Last 500 / sensor"   },
  { value: 1000, label: "Last 1,000 / sensor" },
];

function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtShort(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function sortDocs(arr) {
  return [...arr].sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
}

function toChartRpm(docs) {
  return docs.map((d) => ({ time: fmtShort(d.received_at), rpm_live: d.rpm_live ?? null, rpm_1min: d.rpm_1min ?? null }));
}
function toChartStitch(docs) {
  return docs.map((d) => ({ time: fmtShort(d.received_at), spm: d.spm ?? null }));
}
function toChartVib(docs) {
  return docs.map((d) => ({
    time: fmtShort(d.received_at),
    vib_g: d.vibration_stable != null ? +(d.vibration_stable / 16384).toFixed(4) : null,
  }));
}
function toChartTemp(docs) {
  return docs.map((d) => ({ time: fmtShort(d.received_at), temp: d.temperature_c ?? null, humidity: d.humidity ?? null }));
}

function toTableRow(doc, sensor) {
  return {
    _ts:      new Date(doc.received_at).getTime(),
    fullTime: fmtDateTime(doc.received_at),
    sensor,
    rpm_live:       doc.rpm_live       ?? null,
    rpm_1min:       doc.rpm_1min       ?? null,
    spm:            doc.spm            ?? null,
    stitches_total: doc.stitches_total ?? null,
    vib_g:  doc.vibration_stable != null ? +(doc.vibration_stable / 16384).toFixed(4) : null,
    temp:    doc.temperature_c ?? null,
    humidity:doc.humidity       ?? null,
  };
}

function exportCSV(tableRows) {
  const hdr = ["Timestamp", "Sensor", "RPM Live", "RPM 1min", "SPM", "Stitches Total", "Vibration (g)", "Temp (°C)", "Humidity (%)"];
  const lines = [hdr.join(",")];
  tableRows.forEach((r) =>
    lines.push([
      r.fullTime, r.sensor,
      r.rpm_live ?? "", r.rpm_1min ?? "",
      r.spm ?? "", r.stitches_total ?? "",
      r.vib_g ?? "", r.temp ?? "", r.humidity ?? "",
    ].join(","))
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `sewmetrics_all_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function MiniChart({ data, color, children, height = 170 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ left: 0, right: 10, top: 6, bottom: 4 }}>
        <defs>
          <linearGradient id={`fill_${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
        <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9 }} width={42} />
        <Tooltip contentStyle={{ fontSize: ".78rem", borderRadius: 8, border: "1px solid #e5e7eb" }} labelFormatter={(l) => `Time: ${l}`} />
        {children}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function Pagination({ page, totalPages, onPrev, onNext }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button disabled={page === 0} onClick={onPrev}
        style={{ padding: "4px 14px", borderRadius: 6, fontSize: ".82rem", border: "1px solid #e2e8f0", background: "#fff", cursor: page === 0 ? "not-allowed" : "pointer", color: page === 0 ? "#cbd5e1" : "#0f172a" }}>
        ← Prev
      </button>
      <span style={{ fontSize: ".82rem", color: "#64748b", minWidth: 64, textAlign: "center" }}>
        {page + 1} / {totalPages}
      </span>
      <button disabled={page >= totalPages - 1} onClick={onNext}
        style={{ padding: "4px 14px", borderRadius: 6, fontSize: ".82rem", border: "1px solid #e2e8f0", background: "#fff", cursor: page >= totalPages - 1 ? "not-allowed" : "pointer", color: page >= totalPages - 1 ? "#cbd5e1" : "#0f172a" }}>
        Next →
      </button>
    </div>
  );
}

const inputStyle = {
  padding: "7px 10px", fontSize: ".85rem", borderRadius: 8,
  border: "1.5px solid #e2e8f0", background: "#fff", color: "#1e293b", cursor: "pointer",
};

export default function HistoricalData() {
  const [limit,    setLimit]    = useState(500);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [rawData,  setRawData]  = useState(null);   // stores raw sorted doc arrays
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [page,     setPage]     = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    setPage(0);
    try {
      const [rR, sR, vR, tR] = await Promise.all([
        fetch(`/api/history/${MACHINE_ID}/rpm?limit=${limit}`),
        fetch(`/api/history/${MACHINE_ID}/stitches?limit=${limit}`),
        fetch(`/api/history/${MACHINE_ID}/vibration?limit=${limit}`),
        fetch(`/api/history/${MACHINE_ID}/temperature?limit=${limit}`),
      ]);
      const [rDocs, sDocs, vDocs, tDocs] = await Promise.all([rR.json(), sR.json(), vR.json(), tR.json()]);
      setRawData({
        rpm:  sortDocs(rDocs),
        st:   sortDocs(sDocs),
        vib:  sortDocs(vDocs),
        temp: sortDocs(tDocs),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function clearDateFilter() {
    setDateFrom("");
    setDateTo("");
    setPage(0);
  }

  // Derive all display data from raw docs + current date filter
  const data = useMemo(() => {
    if (!rawData) return null;

    const fromTs = dateFrom ? new Date(dateFrom).getTime()                   : 0;
    const toTs   = dateTo   ? new Date(dateTo + "T23:59:59.999").getTime()   : Infinity;

    const inRange = (doc) => {
      const ts = new Date(doc.received_at).getTime();
      return ts >= fromTs && ts <= toTs;
    };

    const rpm  = rawData.rpm.filter(inRange);
    const st   = rawData.st.filter(inRange);
    const vib  = rawData.vib.filter(inRange);
    const temp = rawData.temp.filter(inRange);

    const table = [
      ...rpm.map((d)  => toTableRow(d, "rpm")),
      ...st.map((d)   => toTableRow(d, "stitches")),
      ...vib.map((d)  => toTableRow(d, "vibration")),
      ...temp.map((d) => toTableRow(d, "temperature")),
    ].sort((a, b) => a._ts - b._ts);

    return {
      rpmChart:  toChartRpm(rpm),
      stChart:   toChartStitch(st),
      vibChart:  toChartVib(vib),
      tempChart: toChartTemp(temp),
      table,
      counts: { rpm: rpm.length, stitches: st.length, vibration: vib.length, temperature: temp.length },
      timeRange: {
        from: table.length ? table[0].fullTime             : "—",
        to:   table.length ? table[table.length - 1].fullTime : "—",
      },
    };
  }, [rawData, dateFrom, dateTo]);

  const stats = useMemo(() => {
    if (!data) return null;
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const rpmV  = data.rpmChart.map((r) => r.rpm_live).filter((v) => v != null);
    const spmV  = data.stChart.map((r) => r.spm).filter((v) => v != null && v > 0);
    const vibV  = data.vibChart.map((r) => r.vib_g).filter((v) => v != null);
    const tempV = data.tempChart.map((r) => r.temp).filter((v) => v != null);
    return {
      rpm:  { avg: avg(rpmV)?.toFixed(1),  max: rpmV.length  ? Math.max(...rpmV).toFixed(1)  : "—" },
      st:   { avg: avg(spmV)?.toFixed(1),  max: spmV.length  ? Math.max(...spmV).toFixed(1)  : "—" },
      vib:  { avg: avg(vibV)?.toFixed(4),  max: vibV.length  ? Math.max(...vibV).toFixed(4)  : "—" },
      temp: { avg: avg(tempV)?.toFixed(1), max: tempV.length ? Math.max(...tempV).toFixed(1) : "—" },
    };
  }, [data]);

  const totalRows  = data?.table.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageRows   = data?.table.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [];

  const isFiltered = dateFrom || dateTo;

  const TABLE_COLS = [
    { key: "fullTime",       label: "Timestamp",       fmt: (v) => v },
    { key: "sensor",         label: "Sensor",           fmt: (v) => v },
    { key: "rpm_live",       label: "RPM Live",         fmt: (v) => v != null ? v.toFixed(1)        : "—" },
    { key: "rpm_1min",       label: "RPM 1-min",        fmt: (v) => v != null ? v.toFixed(1)        : "—" },
    { key: "spm",            label: "SPM",              fmt: (v) => v != null ? v.toFixed(1)        : "—" },
    { key: "stitches_total", label: "Total Stitches",   fmt: (v) => v != null ? v.toLocaleString()  : "—" },
    { key: "vib_g",          label: "Vibration (g)",    fmt: (v) => v != null ? v.toFixed(4)        : "—" },
    { key: "temp",           label: "Temp (°C)",         fmt: (v) => v != null ? v.toFixed(1)        : "—" },
    { key: "humidity",       label: "Humidity (%)",      fmt: (v) => v != null ? v.toFixed(1)        : "—" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="section-title">Historical Data</div>
          <div className="section-sub">All 4 sensors loaded together — filter by date, view charts and unified table</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>

          {/* Records limit */}
          <div>
            <div style={{ fontSize: ".75rem", color: "#64748b", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Records / Sensor
            </div>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={inputStyle}>
              {LIMITS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          {/* Date From */}
          <div>
            <div style={{ fontSize: ".75rem", color: "#64748b", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
              From Date
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              style={inputStyle}
            />
          </div>

          {/* Date To */}
          <div>
            <div style={{ fontSize: ".75rem", color: "#64748b", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
              To Date
            </div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              style={inputStyle}
            />
          </div>

          {/* Clear filter */}
          {isFiltered && (
            <div style={{ paddingBottom: 1 }}>
              <button onClick={clearDateFilter}
                style={{ padding: "7px 14px", fontSize: ".82rem", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#64748b", cursor: "pointer" }}>
                ✕ Clear Filter
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "flex-end" }}>
            <button onClick={load} disabled={loading}
              style={{ padding: "8px 24px", fontSize: ".85rem", fontWeight: 700, borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer", background: loading ? "#e2e8f0" : "#0f172a", color: loading ? "#94a3b8" : "#fff", transition: "all .15s" }}>
              {loading ? "Loading…" : "Load All Sensors"}
            </button>
            {data && (
              <button onClick={() => exportCSV(data.table)}
                style={{ padding: "8px 18px", fontSize: ".85rem", fontWeight: 700, borderRadius: 8, border: "1.5px solid #e2e8f0", cursor: "pointer", background: "#fff", color: "#0f172a" }}>
                Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Active filter badge */}
        {isFiltered && data && (
          <div style={{ marginTop: 10, fontSize: ".78rem", color: "#6366f1", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#6366f1", display: "inline-block" }} />
            Showing {totalRows.toLocaleString()} rows
            {dateFrom && <> from <strong>{new Date(dateFrom).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</strong></>}
            {dateTo   && <> to <strong>{new Date(dateTo).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</strong></>}
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fee2e2", color: "#b91c1c", marginBottom: 16, fontSize: ".88rem" }}>
          Failed to load: {error}
        </div>
      )}

      {!rawData && !loading && (
        <div style={{ textAlign: "center", padding: "72px 0", color: "#94a3b8", fontSize: ".95rem" }}>
          Click <strong style={{ color: "#64748b" }}>Load All Sensors</strong> to fetch historical data for all 4 sensors at once.
        </div>
      )}

      {data && (
        <>
          {/* KPI cards */}
          <div className="kpi-grid" style={{ marginBottom: 18 }}>
            {Object.entries(data.counts).map(([s, count]) => {
              const m = SENSOR_META[s];
              return (
                <div className="card" key={s}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: m.color, display: "inline-block" }} />
                    <div className="kpi-label" style={{ marginBottom: 0 }}>{m.label}</div>
                  </div>
                  <div className="kpi-value">{count.toLocaleString()}</div>
                  <div style={{ fontSize: ".78rem", color: "#94a3b8", marginTop: 4 }}>
                    {s === "rpm"         && stats && `Avg ${stats.rpm.avg} RPM · Max ${stats.rpm.max}`}
                    {s === "stitches"    && stats && `Avg ${stats.st.avg} SPM · Max ${stats.st.max}`}
                    {s === "vibration"   && stats && `Avg ${stats.vib.avg} g · Max ${stats.vib.max} g`}
                    {s === "temperature" && stats && `Avg ${stats.temp.avg}°C · Max ${stats.temp.max}°C`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time range bar */}
          <div className="card full" style={{ marginBottom: 18, padding: "12px 18px" }}>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", fontSize: ".85rem", color: "#334155" }}>
              <span><span style={{ color: "#94a3b8", marginRight: 6 }}>From</span><strong>{data.timeRange.from}</strong></span>
              <span><span style={{ color: "#94a3b8", marginRight: 6 }}>To</span><strong>{data.timeRange.to}</strong></span>
              <span><span style={{ color: "#94a3b8", marginRight: 6 }}>Total rows</span><strong>{totalRows.toLocaleString()}</strong></span>
            </div>
          </div>

          {/* 4 charts — 2×2 grid */}
          <div className="two-col" style={{ marginBottom: 18 }}>
            <div className="card">
              <div className="chart-title">RPM Trend</div>
              <MiniChart data={data.rpmChart} color="#6366f1">
                <Area type="monotone" dataKey="rpm_live" name="RPM Live" stroke="#6366f1" fill="url(#fill_6366f1)" strokeWidth={1.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="rpm_1min" name="1-min avg" stroke="#a5b4fc" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 2" />
              </MiniChart>
            </div>
            <div className="card">
              <div className="chart-title">Stitches (SPM) Trend</div>
              <MiniChart data={data.stChart} color="#10b981">
                <Area type="monotone" dataKey="spm" name="SPM" stroke="#10b981" fill="url(#fill_10b981)" strokeWidth={1.5} dot={false} connectNulls />
              </MiniChart>
            </div>
          </div>

          <div className="two-col" style={{ marginBottom: 18 }}>
            <div className="card">
              <div className="chart-title">Vibration Trend (g)</div>
              <MiniChart data={data.vibChart} color="#f59e0b">
                <Area type="monotone" dataKey="vib_g" name="Vibration (g)" stroke="#f59e0b" fill="url(#fill_f59e0b)" strokeWidth={1.5} dot={false} connectNulls />
                <ReferenceLine y={WARN_VIB} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: "0.30g", position: "insideTopRight", fontSize: 9, fill: "#b45309" }} />
                <ReferenceLine y={CRIT_VIB} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "0.50g", position: "insideTopRight", fontSize: 9, fill: "#b91c1c" }} />
              </MiniChart>
            </div>
            <div className="card">
              <div className="chart-title">Temperature &amp; Humidity Trend</div>
              <MiniChart data={data.tempChart} color="#ef4444">
                <Area type="monotone" dataKey="temp"     name="Temp (°C)"    stroke="#ef4444" fill="url(#fill_ef4444)" strokeWidth={1.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="humidity" name="Humidity (%)" stroke="#3b82f6" strokeWidth={1.5} dot={false} connectNulls />
                <ReferenceLine y={WARN_TEMP}  stroke="#f59e0b" strokeDasharray="4 2" label={{ value: `${WARN_TEMP}°C`,  position: "insideTopRight", fontSize: 9, fill: "#b45309" }} />
                <ReferenceLine y={ALERT_TEMP} stroke="#ef4444" strokeDasharray="4 2" label={{ value: `${ALERT_TEMP}°C`, position: "insideTopRight", fontSize: 9, fill: "#b91c1c" }} />
              </MiniChart>
            </div>
          </div>

          {/* Unified table */}
          <div className="card full">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div className="chart-title" style={{ marginBottom: 0 }}>All Sensor Readings</div>
                <span style={{ fontSize: ".78rem", color: "#94a3b8" }}>
                  {totalRows > 0
                    ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalRows)} of ${totalRows.toLocaleString()}`
                    : "No records match the selected date range"}
                </span>
              </div>
              <Pagination
                page={page} totalPages={totalPages}
                onPrev={() => setPage((p) => p - 1)}
                onNext={() => setPage((p) => p + 1)}
              />
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".81rem" }}>
                <thead>
                  <tr>
                    {TABLE_COLS.map((col) => (
                      <th key={col.key} style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid #e2e8f0", color: "#64748b", fontWeight: 600, fontSize: ".71rem", textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap", background: "#f8fafc" }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={TABLE_COLS.length} style={{ textAlign: "center", padding: "36px 0", color: "#94a3b8", fontSize: ".88rem" }}>
                        No records in the selected date range.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row, i) => {
                      const m = SENSOR_META[row.sensor];
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                          {TABLE_COLS.map((col) => (
                            <td key={col.key} style={{ padding: "7px 12px", color: "#334155", whiteSpace: "nowrap" }}>
                              {col.key === "sensor" ? (
                                <span style={{ fontSize: ".72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: m.bg, color: m.color }}>
                                  {m.label}
                                </span>
                              ) : (
                                col.fmt(row[col.key])
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <Pagination
                page={page} totalPages={totalPages}
                onPrev={() => setPage((p) => p - 1)}
                onNext={() => setPage((p) => p + 1)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
