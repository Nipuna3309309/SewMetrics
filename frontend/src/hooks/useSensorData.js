import { useState, useEffect, useCallback, useRef } from "react";

// ── All API calls proxy to http://localhost:4000 via CRA proxy ──────────────

export function useLatest(machineId, intervalMs = 2500) {
  const [data, setData] = useState(null);
  const [online, setOnline] = useState(false);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`/api/latest/${machineId}`);
      if (!res.ok) {
        setOnline(false);
        return;
      }
      setData(await res.json());
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [machineId]);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, intervalMs);
    return () => clearInterval(id);
  }, [fetch_, intervalMs]);

  return { data, online };
}

export function useHistory(machineId, sensor, limit = 60, intervalMs = 4000) {
  const [data, setData] = useState([]);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/history/${machineId}/${sensor}?limit=${limit}`,
      );
      if (!res.ok) return;
      const rows = await res.json();
      setData(rows.reverse()); // oldest first → correct chart direction
    } catch {}
  }, [machineId, sensor, limit]);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, intervalMs);
    return () => clearInterval(id);
  }, [fetch_, intervalMs]);

  return data;
}

export function useAlerts(machineId, intervalMs = 4000) {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/alerts/${machineId}`);
        if (!res.ok) return;
        const json = await res.json();
        setAlerts(json.alerts || []);
      } catch {}
    };
    fetch_();
    const id = setInterval(fetch_, intervalMs);
    return () => clearInterval(id);
  }, [machineId, intervalMs]);

  return alerts;
}

export function useHourly(machineId, ms = 60000) {
  const [buckets, setBuckets] = useState([]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const r = await fetch(`/api/hourly/${machineId}`);
        const data = await r.json();
        if (active) {
          // Fill all 9 shift hours (8–16) so chart has no gaps
          const filled = Array.from({ length: 9 }, (_, i) => {
            const h = i + 8;
            return (
              data.find((b) => b.hour === h) || {
                hour: h,
                avg_rpm: null,
                uptime_pct: null,
              }
            );
          });
          setBuckets(filled);
        }
      } catch (_) {}
    };
    run();
    const id = setInterval(run, ms);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [machineId, ms]);

  return { buckets };
}

export function useAnalytics(machineId, type, intervalMs = 20000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/${type}/${machineId}`);
      if (!res.ok) { setError("unavailable"); setLoading(false); return; }
      setData(await res.json());
      setError(null);
    } catch {
      setError("unavailable");
    } finally {
      setLoading(false);
    }
  }, [machineId, type]);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, intervalMs);
    return () => clearInterval(id);
  }, [fetch_, intervalMs]);

  return { data, loading, error };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
export const toG = (raw) => +(raw / 16384).toFixed(3); // MPU6050 ±2g
export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
export const fmtShort = (iso) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
