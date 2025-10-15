// src/AdminAnalytics.js
import React from "react";
import { supabase } from "./supabaseClient";

export default function AdminAnalytics({ onBack }) {
  // date-range controls
  const [preset, setPreset] = React.useState("30d"); // "7d" | "30d" | "90d" | "all" | "custom"
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");

  // data
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  // derived summary
  const [readiness, setReadiness] = React.useState({
    total_submissions: 0,
    spt_ready_count: 0,
    high_risk_count: 0,
  });

  // -------- helpers
  function nowUtc() { return new Date(); }
  function isoDate(d) { return d.toISOString().slice(0, 10); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

  function rangeFromPreset(p) {
    const today = nowUtc();
    if (p === "7d")  return { start: isoDate(addDays(today, -6)),  end: isoDate(today) };
    if (p === "30d") return { start: isoDate(addDays(today, -29)), end: isoDate(today) };
    if (p === "90d") return { start: isoDate(addDays(today, -89)), end: isoDate(today) };
    if (p === "all") return { start: null, end: null };
    // custom
    return { start: startDate || null, end: endDate || null };
  }

  function labelForPreset(p) {
    switch (p) {
      case "7d": return "Last 7 days";
      case "30d": return "Last 30 days";
      case "90d": return "Last 90 days";
      case "all": return "All time";
      case "custom": return "Custom range";
      default: return p;
    }
  }

  function pct(part, denom) {
    if (!denom || denom <= 0) return "0%";
    return `${Math.round((part / denom) * 100)}%`;
  }

  // -------- load data
  const fetchRows = async () => {
    setErr("");
    setLoading(true);
    try {
      const { start, end } = rangeFromPreset(preset);

      let query = supabase
        .from("submissions")
        .select("created_at,status,spt_ready,high_risk", { count: "exact" });

      if (start) query = query.gte("created_at", `${start}T00:00:00Z`);
      if (end)   query = query.lte("created_at", `${end}T23:59:59Z`);

      const { data, error } = await query.order("created_at", { ascending: true });
      if (error) throw error;

      setRows(data || []);
    } catch (e) {
      setErr(e.message || "Failed to load analytics");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    // for "custom", wait until both dates are chosen
    if (preset === "custom" && (!startDate || !endDate)) return;
    fetchRows();
    // eslint-disable-next-line
  }, [preset, startDate, endDate]);

  // -------- derive summary counts from rows
  React.useEffect(() => {
    const total = rows.length;
    const spt = rows.filter(r => !!r.spt_ready).length;
    const risk = rows.filter(r => !!r.high_risk).length;
    setReadiness({
      total_submissions: total,
      spt_ready_count: spt,
      high_risk_count: risk,
    });
  }, [rows]);

  const total = readiness.total_submissions;
  const sptPct = pct(readiness.spt_ready_count, total);
  const riskPct = pct(readiness.high_risk_count, total);

  // -------- UI
  return (
    <div style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Admin Analytics</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={fetchRows} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button style={btn} onClick={onBack}>← Back to Dashboard</button>
        </div>
      </div>

      {/* filters */}
      <div style={filtersRow}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["7d", "30d", "90d", "all", "custom"].map(p => (
            <button
              key={p}
              style={{ ...chip, ...(preset === p ? chipActive : {}) }}
              onClick={() => setPreset(p)}
            >
              {labelForPreset(p)}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={lbl}>From</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={input}
            />
            <label style={lbl}>To</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={input}
            />
            <button style={btn} onClick={fetchRows} disabled={!startDate || !endDate}>Apply</button>
          </div>
        )}
      </div>

      {err && <div style={{ color: "#b91c1c", marginBottom: 8 }}>❌ {err}</div>}

      {/* summary cards with percentages */}
      <div style={grid3}>
        <Card title="Total submissions">
          <Big>{total || "—"}</Big>
        </Card>

        <Card title="SPT ready">
          <Big>{readiness.spt_ready_count}</Big>
          <SmallMuted>{sptPct} of selected range</SmallMuted>
        </Card>

        <Card title="High risk">
          <Big>{readiness.high_risk_count}</Big>
          <SmallMuted>{riskPct} of selected range</SmallMuted>
        </Card>
      </div>
    </div>
  );
}

/* ---- tiny presentational bits ---- */
function Card({ title, children, style }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, ...style }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function Big({ children }) {
  return <div style={{ fontSize: 32, fontWeight: 700 }}>{children}</div>;
}
function SmallMuted({ children }) {
  return <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{children}</div>;
}

/* ---- styles ---- */
const wrap = { maxWidth: 1000, margin: "24px auto", fontFamily: "system-ui, sans-serif" };
const btn = { padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };
const input = { padding: 8, border: "1px solid #ddd", borderRadius: 8 };
const lbl = { fontSize: 12, color: "#6b7280" };
const filtersRow = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 };
const chip = { padding: "6px 10px", borderRadius: 999, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };
const chipActive = { border: "1px solid #111827", background: "#111827", color: "#fff" };
const grid3 = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 };
