import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import { useAnalytics } from '../hooks/useSensorData';
import { MACHINE_ID, MACHINE_LABEL } from '../App';

// ── color helpers ────────────────────────────────────────────────────────────
const mhsColor = (s) => s >= 80 ? '#16a34a' : s >= 65 ? '#d97706' : s >= 45 ? '#ea580c' : '#dc2626';
const mhsBg    = (s) => s >= 80 ? '#f0fdf4' : s >= 65 ? '#fffbeb' : s >= 45 ? '#fff7ed' : '#fef2f2';
const mhsBdr   = (s) => s >= 80 ? '#86efac' : s >= 65 ? '#fcd34d' : s >= 45 ? '#fb923c' : '#fca5a5';

const priorityConfig = {
  none:   { bg:'#f0fdf4', color:'#166534', border:'#86efac', label:'No Action Needed' },
  low:    { bg:'#eff6ff', color:'#1e40af', border:'#93c5fd', label:'Low Priority' },
  medium: { bg:'#fffbeb', color:'#92400e', border:'#fcd34d', label:'Medium Priority' },
  high:   { bg:'#fff7ed', color:'#9a3412', border:'#fb923c', label:'High Priority' },
  urgent: { bg:'#fef2f2', color:'#991b1b', border:'#fca5a5', label:'URGENT' },
};

const statusConfig = {
  healthy:  { icon:'✅', color:'#16a34a', label:'Healthy' },
  watch:    { icon:'👁', color:'#d97706', label:'Watch' },
  warning:  { icon:'⚠️', color:'#ea580c', label:'Warning' },
  critical: { icon:'🔴', color:'#dc2626', label:'Critical' },
  offline:  { icon:'⚫', color:'#64748b', label:'Offline' },
};

const sevConfig = {
  watch:    { bg:'#eff6ff', bdr:'#93c5fd', bl:'#3b82f6', color:'#1d4ed8', icon:'👁' },
  warning:  { bg:'#fffbeb', bdr:'#fcd34d', bl:'#f59e0b', color:'#b45309', icon:'⚠️' },
  critical: { bg:'#fef2f2', bdr:'#fca5a5', bl:'#ef4444', color:'#dc2626', icon:'🔴' },
};

const IND_COLORS = {
  vibration_level:   '#8b5cf6',
  temperature_level: '#ef4444',
  spm_efficiency:    '#22c55e',
  rpm_stability:     '#3b82f6',
  anomaly_score:     '#f97316',
};

const IND_LABELS = {
  vibration_level:   'Vibration',
  temperature_level: 'Temperature',
  spm_efficiency:    'SPM Efficiency',
  rpm_stability:     'RPM Stability',
  anomaly_score:     'Anomaly Score',
};

// ── MHS Gauge ────────────────────────────────────────────────────────────────
function MHSGauge({ score, status, anomalyHealth, trendHealth }) {
  const c  = mhsColor(score);
  const bg = mhsBg(score);
  const bd = mhsBdr(score);
  const sc = statusConfig[status] || statusConfig.offline;

  return (
    <div style={{ background:bg, border:`2px solid ${bd}`, borderRadius:16, padding:'24px 32px',
      display:'flex', alignItems:'center', gap:40, flexWrap:'wrap' }}>

      <div style={{ position:'relative', width:140, height:140, flexShrink:0 }}>
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="58" fill="none" stroke="#e2e8f0" strokeWidth="14" />
          <circle cx="70" cy="70" r="58" fill="none" stroke={c} strokeWidth="14"
            strokeDasharray={`${(Math.min(100, score) / 100) * 364.4} 364.4`}
            strokeLinecap="round" transform="rotate(-90 70 70)" />
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center' }}>
          <div style={{ fontSize:'2rem', fontWeight:800, color:c, lineHeight:1 }}>{score.toFixed(0)}</div>
          <div style={{ fontSize:'.72rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em' }}>/ 100</div>
        </div>
      </div>

      <div style={{ flex:1, minWidth:180 }}>
        <div style={{ fontSize:'.75rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>
          Machine Health Score
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          <span style={{ fontSize:'1.8rem' }}>{sc.icon}</span>
          <span style={{ fontSize:'1.5rem', fontWeight:800, color:sc.color }}>{sc.label.toUpperCase()}</span>
        </div>
        <div style={{ fontSize:'.82rem', color:'#6b7280', marginBottom:8 }}>{MACHINE_LABEL} — {MACHINE_ID}</div>

        {/* Model contributions */}
        <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:'.68rem', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em' }}>Model 1 — Anomaly</div>
            <div style={{ fontSize:'1rem', fontWeight:700,
              color: anomalyHealth >= 80 ? '#16a34a' : anomalyHealth >= 60 ? '#d97706' : '#dc2626' }}>
              {anomalyHealth?.toFixed(0) ?? '—'}%
            </div>
          </div>
          <div style={{ borderLeft:'1px solid #e2e8f0', paddingLeft:16 }}>
            <div style={{ fontSize:'.68rem', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.04em' }}>Model 2 — Trend</div>
            <div style={{ fontSize:'1rem', fontWeight:700,
              color: trendHealth >= 80 ? '#16a34a' : trendHealth >= 60 ? '#d97706' : '#dc2626' }}>
              {trendHealth?.toFixed(0) ?? '—'}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Model 1 — Anomaly card ───────────────────────────────────────────────────
function AnomalyCard({ anomaly }) {
  if (!anomaly) return null;

  const scoreColor = anomaly.anomaly_score >= 0.85 ? '#dc2626' : anomaly.anomaly_score >= 0.70 ? '#ea580c'
    : anomaly.anomaly_score >= 0.50 ? '#d97706' : '#16a34a';
  const scorePct = (anomaly.anomaly_score * 100).toFixed(1);

  const radarData = Object.entries(anomaly.feature_z_scores || {}).map(([k, v]) => ({
    subject: k.replace('_', ' ').replace('avg ', '').replace('vibration ', 'vib '),
    z: Math.min(4, Math.abs(v)),
  }));

  return (
    <div className="card">
      <div className="chart-title">Model 1 — Real-time Anomaly Detection</div>
      <div style={{ fontSize:'.75rem', color:'#9ca3af', marginBottom:12 }}>
        Isolation Forest · {anomaly.samples_used} samples · {anomaly.windows_trained} windows · {anomaly.model}
      </div>

      {/* Score + status badge */}
      <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
        <div style={{ background: anomaly.anomaly_flag ? '#fef2f2' : '#f0fdf4', borderRadius:10,
          padding:'12px 18px', border:`1px solid ${anomaly.anomaly_flag ? '#fca5a5' : '#86efac'}`, flexShrink:0 }}>
          <div style={{ fontSize:'.7rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>Anomaly Score</div>
          <div style={{ fontSize:'1.8rem', fontWeight:800, color:scoreColor, lineHeight:1 }}>{scorePct}%</div>
          <div style={{ fontSize:'.75rem', color:'#6b7280', marginTop:3 }}>
            {anomaly.anomaly_flag ? 'ANOMALY' : 'NORMAL'} · {anomaly.status}
          </div>
        </div>

        <div style={{ flex:1 }}>
          <div style={{ fontSize:'.72rem', color:'#64748b', marginBottom:6 }}>Component flags</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {Object.entries(anomaly.component_flags || {}).map(([comp, flagged]) => (
              <span key={comp} style={{
                fontSize:'.72rem', fontWeight:700, padding:'3px 10px', borderRadius:20,
                background: flagged ? '#fef2f2' : '#f0fdf4',
                color: flagged ? '#dc2626' : '#166534',
                border: `1px solid ${flagged ? '#fca5a5' : '#86efac'}`
              }}>
                {comp.charAt(0).toUpperCase() + comp.slice(1)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Top contributors */}
      {anomaly.top_contributors?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:'.72rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:6 }}>
            Top Contributing Features
          </div>
          {anomaly.top_contributors.map((c, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:'.82rem' }}>
              <span style={{ fontWeight:600, color:'#374151' }}>{c.feature}</span>
              <span style={{ color:'#6b7280', fontSize:'.75rem' }}>{c.component}</span>
              <span style={{ fontWeight:700, color: c.abs_z > 3 ? '#dc2626' : c.abs_z > 2 ? '#d97706' : '#16a34a' }}>
                z = {c.z_score > 0 ? '+' : ''}{c.z_score}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* z-score radar */}
      <div style={{ fontSize:'.72rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>
        Feature Deviation Radar (|z|)
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <RadarChart data={radarData} margin={{ top:5, right:20, bottom:5, left:20 }}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize:9 }} />
          <Radar name="z" dataKey="z" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Model 2 — Degradation card ───────────────────────────────────────────────
function DegradationCard({ degradation }) {
  if (!degradation) return null;

  const ts = degradation.trend_status;
  const tsBg    = ts === 'stable' ? '#f0fdf4' : ts === 'minor_degradation' ? '#fffbeb' : ts === 'moderate_degradation' ? '#fff7ed' : '#fef2f2';
  const tsBdr   = ts === 'stable' ? '#86efac' : ts === 'minor_degradation' ? '#fcd34d' : ts === 'moderate_degradation' ? '#fb923c' : '#fca5a5';
  const tsColor = ts === 'stable' ? '#166534' : ts === 'minor_degradation' ? '#92400e' : ts === 'moderate_degradation' ? '#9a3412' : '#dc2626';

  // Bucket sparkline data
  const sparkData = (degradation.bucket_data || []).map((b, i) => ({ i, ...b }));

  return (
    <div className="card">
      <div className="chart-title">Model 2 — Degradation Trend Analysis</div>
      <div style={{ fontSize:'.75rem', color:'#9ca3af', marginBottom:12 }}>
        Linear Regression · {degradation.buckets_analysed} buckets · {degradation.samples_used} samples
      </div>

      {/* Summary row */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
        <div style={{ background:tsBg, border:`1px solid ${tsBdr}`, borderRadius:10, padding:'10px 14px', flex:1, minWidth:120 }}>
          <div style={{ fontSize:'.68rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>Trend Status</div>
          <div style={{ fontSize:'.95rem', fontWeight:800, color:tsColor }}>
            {ts?.replace(/_/g, ' ').toUpperCase() || '—'}
          </div>
        </div>
        <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', flex:1, minWidth:100 }}>
          <div style={{ fontSize:'.68rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>Degrad. Rate</div>
          <div style={{ fontSize:'.95rem', fontWeight:800,
            color: degradation.degradation_rate > 5 ? '#dc2626' : degradation.degradation_rate > 2 ? '#d97706' : '#16a34a' }}>
            {degradation.degradation_rate?.toFixed(2)}%/hr
          </div>
        </div>
        <div style={{ background: degradation.early_warning ? '#fef2f2' : '#f0fdf4',
          border:`1px solid ${degradation.early_warning ? '#fca5a5' : '#86efac'}`, borderRadius:10, padding:'10px 14px', flex:1, minWidth:100 }}>
          <div style={{ fontSize:'.68rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>Early Warning</div>
          <div style={{ fontSize:'.95rem', fontWeight:800, color: degradation.early_warning ? '#dc2626' : '#16a34a' }}>
            {degradation.early_warning ? 'ACTIVE' : 'CLEAR'}
          </div>
        </div>
        {degradation.projected_failure_hours != null && (
          <div style={{ background:'#fff7ed', border:'1px solid #fb923c', borderRadius:10, padding:'10px 14px', flex:1, minWidth:100 }}>
            <div style={{ fontSize:'.68rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>Est. Failure</div>
            <div style={{ fontSize:'.95rem', fontWeight:800, color:'#ea580c' }}>
              ~{degradation.projected_failure_hours}h
            </div>
          </div>
        )}
      </div>

      {/* Per-indicator table */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:'.72rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:6 }}>
          Per-Indicator Trends
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Indicator</th>
              <th>Direction</th>
              <th>Slope</th>
              <th>R²</th>
              <th>ETA</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(degradation.per_indicator_trends || {}).map(([ind, info]) => (
              <tr key={ind}>
                <td style={{ fontWeight:600, fontSize:'.78rem' }}>
                  <span style={{ display:'inline-block', width:8, height:8, borderRadius:2,
                    background: IND_COLORS[ind] || '#94a3b8', marginRight:6, verticalAlign:'middle' }} />
                  {IND_LABELS[ind] || ind}
                </td>
                <td>
                  <span style={{ fontSize:'.72rem', fontWeight:700, padding:'2px 8px', borderRadius:12,
                    background: info.direction === 'degrading' ? '#fef2f2' : '#f0fdf4',
                    color: info.direction === 'degrading' ? '#dc2626' : '#16a34a' }}>
                    {info.direction === 'degrading' ? '▼ Degrading' : '~ Stable'}
                  </span>
                </td>
                <td style={{ fontSize:'.78rem', color: info.direction === 'degrading' ? '#dc2626' : '#374151' }}>
                  {info.slope > 0 ? '+' : ''}{info.slope?.toFixed(4)}
                </td>
                <td style={{ fontSize:'.78rem', color: info.r_squared >= 0.6 ? '#16a34a' : '#9ca3af' }}>
                  {info.r_squared?.toFixed(2)}
                </td>
                <td style={{ fontSize:'.78rem', fontWeight: info.projected_hours != null ? 700 : 400,
                  color: info.projected_hours != null && info.projected_hours < 4 ? '#dc2626' : '#374151' }}>
                  {info.projected_hours != null ? `~${info.projected_hours}h` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sparklines */}
      {sparkData.length > 2 && (
        <>
          <div style={{ fontSize:'.72rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>
            Health Indicator Trends (bucket sparklines)
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {['vibration_level', 'temperature_level', 'spm_efficiency', 'rpm_stability'].map(ind => (
              <div key={ind}>
                <div style={{ fontSize:'.68rem', color: IND_COLORS[ind], fontWeight:600, marginBottom:2 }}>
                  {IND_LABELS[ind]}
                </div>
                <ResponsiveContainer width="100%" height={48}>
                  <LineChart data={sparkData} margin={{ top:2, right:4, bottom:2, left:4 }}>
                    <Line type="monotone" dataKey={ind} stroke={IND_COLORS[ind]} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Issues list ───────────────────────────────────────────────────────────────
function IssuesList({ issues }) {
  if (!issues || issues.length === 0) {
    return (
      <div className="card">
        <div className="chart-title">Active Issues</div>
        <div style={{ padding:'16px 0', color:'#22c55e', fontWeight:600, fontSize:'.9rem' }}>
          ✓ No active issues detected
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="chart-title">Active Issues ({issues.length})</div>
      <div style={{ marginTop:8 }}>
        {issues.map((issue, i) => {
          const cfg = sevConfig[issue.severity] || sevConfig.watch;
          return (
            <div key={i} style={{ display:'flex', gap:12, alignItems:'flex-start',
              background:cfg.bg, border:`1px solid ${cfg.bdr}`, borderLeft:`5px solid ${cfg.bl}`,
              borderRadius:8, padding:'12px 14px', marginBottom:8 }}>
              <span style={{ fontSize:'1rem', flexShrink:0 }}>{cfg.icon}</span>
              <div>
                <div style={{ fontWeight:700, fontSize:'.82rem', color:cfg.color, textTransform:'uppercase', letterSpacing:'.03em' }}>
                  {issue.component}
                </div>
                <div style={{ fontSize:'.8rem', color:'#374151', marginTop:2 }}>{issue.message}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Maintenance card ──────────────────────────────────────────────────────────
function MaintenanceCard({ rul, priority }) {
  const pc = priorityConfig[priority] || priorityConfig.none;

  return (
    <div className="card">
      <div className="chart-title">Maintenance Forecast</div>
      <div style={{ marginTop:8 }}>
        <div style={{ background:pc.bg, border:`1px solid ${pc.border}`, borderRadius:10, padding:'14px 16px', marginBottom:12 }}>
          <div style={{ fontSize:'.72rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Priority</div>
          <div style={{ fontSize:'1.1rem', fontWeight:800, color:pc.color }}>{pc.label}</div>
        </div>

        <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'14px 16px' }}>
          <div style={{ fontSize:'.72rem', color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>
            Projected Failure Horizon
          </div>
          {rul != null ? (
            <>
              <div style={{ fontSize:'1.5rem', fontWeight:800,
                color: rul < 2 ? '#dc2626' : rul < 8 ? '#d97706' : '#16a34a' }}>
                {rul.toFixed(1)} hrs
              </div>
              <div style={{ fontSize:'.78rem', color:'#6b7280', marginTop:3 }}>
                {rul < 2 ? 'Stop machine — immediate inspection' :
                 rul < 8 ? 'Schedule maintenance this shift' :
                 'Operating within normal range'}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize:'1.5rem', fontWeight:800, color:'#16a34a' }}>Normal</div>
              <div style={{ fontSize:'.78rem', color:'#6b7280', marginTop:3 }}>No degradation trend detected</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Analytics() {
  const { data: sys, loading, error } = useAnalytics(MACHINE_ID, 'system', 20000);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="section-title">ML Analytics — System Health</div>
          <div className="section-sub">
            <span className="ldot" />
            Model 1: Isolation Forest · Model 2: Degradation Trend · Combined MHS
          </div>
        </div>
        <div className="header-actions">
          <span style={{ fontSize:'.78rem', color:'#9ca3af' }}>
            {loading ? 'Running models…' : error ? 'Service unavailable' : 'Refreshes every 20s'}
          </span>
        </div>
      </div>

      {loading && (
        <div className="card" style={{ color:'#9ca3af', fontSize:'.9rem', padding:32 }}>
          Running ML models… this may take a moment on first load.
        </div>
      )}

      {error && !loading && (
        <div className="card" style={{ color:'#dc2626', fontSize:'.9rem', padding:32 }}>
          Analytics service unavailable. Make sure the Python service is running on port 5003.
        </div>
      )}

      {sys && !loading && (
        <>
          {/* MHS Gauge — full width */}
          <div style={{ marginBottom:20 }}>
            <MHSGauge
              score={sys.machine_health_score}
              status={sys.overall_status}
              anomalyHealth={sys.anomaly_health}
              trendHealth={sys.trend_health}
            />
          </div>

          {/* Model 1 + Model 2 side by side */}
          <div className="two-col" style={{ marginBottom:0 }}>
            <AnomalyCard anomaly={sys.anomaly} />
            <DegradationCard degradation={sys.degradation} />
          </div>

          {/* Maintenance + Issues */}
          <div className="two-col" style={{ marginTop:20 }}>
            <MaintenanceCard rul={sys.rul_hours} priority={sys.maintenance_priority} />
            <IssuesList issues={sys.issues} />
          </div>
        </>
      )}
    </div>
  );
}
