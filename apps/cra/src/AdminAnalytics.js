// src/AdminAnalytics.js
import React from "react";
import { supabase } from "./supabaseClient";

export default function AdminAnalytics({ onBack }) {
  const [statusCounts, setStatusCounts] = React.useState([]);
  const [readiness, setReadiness] = React.useState(null);
  const [weekly, setWeekly] = React.useState([]);
  const [triggers, setTriggers] = React.useState([]);
  const [symptoms, setSymptoms] = React.useState([]);
  const [labOrders, setLabOrders] = React.useState([]);

  // NEW: TAT / TTFR KPIs from analytics_tat_30d
  const [kpi, setKpi] = React.useState(null);

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  const labTatTrend = React.useMemo(() => computeTatTrend(labOrders), [labOrders]);
  const patientLabHistories = React.useMemo(() => computePatientHistories(labOrders), [labOrders]);

  const fetchAll = async () => {
    setErr("");
    setLoading(true);
    try {
      const [
        { data: sc, error: e1 },
        { data: rr, error: e2 },
        { data: wk, error: e3 },
        { data: tg, error: e4 },
        { data: sy, error: e5 },
        { data: tat30, error: e6 },
        { data: lab, error: e7 },
      ] = await Promise.all([
        supabase.from("analytics_status_counts").select("*"),
        supabase.from("analytics_readiness_risk").select("*").maybeSingle(),
        supabase.from("analytics_weekly").select("*").order("week_start", { ascending: true }),
        supabase.from("analytics_top_triggers").select("*"),
        supabase.from("analytics_top_symptoms").select("*"),
        supabase.from("analytics_tat_30d").select("*").maybeSingle(), // ← includes TTFR columns
        supabase
          .from("lab_orders")
          .select(
            "id, patient_full_name, patient_email, order_status, ordered_at, result_received_at, result_reviewed_at, vendor, external_order_id"
          )
          .order("ordered_at", { ascending: false })
          .limit(200),
      ]);

      const firstErr = e1 || e2 || e3 || e4 || e5 || e6 || e7;
      if (firstErr) throw new Error(firstErr.message || "Failed to load analytics");

      setStatusCounts(sc || []);
      setReadiness(rr || null);
      setWeekly(wk || []);
      setTriggers(tg || []);
      setSymptoms(sy || []);
      setKpi(tat30 || null);
      setLabOrders(lab || []);
    } catch (e) {
      setErr(e.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchAll();
    // eslint-disable-next-line
  }, []);

  const maxWeekly = weekly.reduce((m, r) => Math.max(m, r.count || 0), 0);
  const maxTriggers = triggers.reduce((m, r) => Math.max(m, r.count || 0), 0);
  const maxSymptoms = symptoms.reduce((m, r) => Math.max(m, r.count || 0), 0);
  const maxTatP90 = labTatTrend.reduce((m, r) => Math.max(m, r.p90Minutes || 0), 0);

  return (
    <div style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Admin Analytics</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={fetchAll} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          {onBack && <button style={btn} onClick={onBack}>← Back to Dashboard</button>}
        </div>
      </div>

      {err && <div style={{ color: "#b91c1c", marginBottom: 8 }}>❌ {err}</div>}

      {/* Summary cards */}
      <div style={grid3}>
        <Card title="Total submissions">
          <Big>{readiness?.total_submissions ?? "—"}</Big>
        </Card>
        <Card title="SPT ready">
          <Big>{readiness?.spt_ready_count ?? "—"}</Big>
        </Card>
        <Card title="High risk">
          <Big>{readiness?.high_risk_count ?? "—"}</Big>
        </Card>
      </div>

      {/* Turnaround & First Response KPIs (last 30d) */}
      <Card title="Turnaround & First Response – last 30 days" style={{ marginTop: 12 }}>
        {kpi ? (
          <div style={grid3}>
            <KPI
              title="Avg TAT"
              value={humanizeMinutes(numOrNa(kpi.avg_tat_min))}
              hint="Avg time from submission to completion"
            />
            <KPI title="Median TAT" value={humanizeMinutes(numOrNa(kpi.p50_tat_min))} />
            <KPI title="P90 TAT" value={humanizeMinutes(numOrNa(kpi.p90_tat_min))} />

            <KPI
              title="Avg TTFR"
              value={humanizeMinutes(numOrNa(kpi.avg_ttfr_min))}
              hint="Avg time to first clinician action"
            />
            <KPI title="Median TTFR" value={humanizeMinutes(numOrNa(kpi.p50_ttfr_min))} />
            <KPI title="P90 TTFR" value={humanizeMinutes(numOrNa(kpi.p90_ttfr_min))} />

            <KPI
              title="≤ 7 days completion"
              value={kpi.pct_le_7d != null ? `${round1(kpi.pct_le_7d)}%` : "—"}
            />
            <KPI title="Completed (30d)" value={kpi.completed_count ?? "—"} />
          </div>
        ) : (
          <div style={{ color: "#6b7280" }}>No KPI data.</div>
        )}
      </Card>

      {/* Lab turnaround trend */}
      <Card title="Lab turnaround (last 8 weeks)" style={{ marginTop: 12 }}>
        {labTatTrend.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No lab turnaround data yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {labTatTrend.map((row) => {
              const pct = maxTatP90 ? Math.min(100, (row.p90Minutes / maxTatP90) * 100) : 0;
              return (
                <div
                  key={row.weekLabel}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "120px 1fr auto auto auto auto",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{row.weekLabel}</div>
                  <div style={{ height: 10, background: "#f3f4f6", borderRadius: 999 }}>
                    <div style={{ height: 10, width: `${pct}%`, background: "#111827", borderRadius: 999 }} />
                  </div>
                  <div style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    Avg {humanizeMinutes(row.avgMinutes)}
                  </div>
                  <div style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    P50 {humanizeMinutes(row.medianMinutes)}
                  </div>
                  <div style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    P90 {humanizeMinutes(row.p90Minutes)}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{row.count} orders</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Patient lab history */}
      <Card title="Patient lab history highlights" style={{ marginTop: 12 }}>
        {patientLabHistories.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No lab orders recorded for patients.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {patientLabHistories.map((history) => (
              <div
                key={history.patient}
                style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}
              >
                <div style={{ fontWeight: 600 }}>{history.patient}</div>
                <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                  {history.timeline.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px auto auto",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{entry.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>{entry.status}</div>
                      <div style={{ fontSize: 12, color: entry.tatMinutes != null ? "#059669" : "#b45309" }}>
                        {entry.tatMinutes != null
                          ? `TAT ${humanizeMinutes(entry.tatMinutes)}`
                          : "Awaiting results"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Status counts */}
      <Card title="By status" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {statusCounts.map((row) => (
            <Pill key={row.status} label={row.status} value={row.count} />
          ))}
          {statusCounts.length === 0 && <div style={{ color: "#6b7280" }}>No data.</div>}
        </div>
      </Card>

      {/* Weekly submissions */}
      <Card title="Weekly submissions (last 12 weeks)" style={{ marginTop: 12 }}>
        {weekly.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No data.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {weekly.map((w) => {
              const pct = maxWeekly ? (w.count / maxWeekly) * 100 : 0;
              return (
                <div
                  key={w.week_start}
                  style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 8, alignItems: "center" }}
                >
                  <div style={{ color: "#6b7280", fontSize: 12 }}>
                    {new Date(w.week_start).toLocaleDateString("en-GB")}
                  </div>
                  <div style={{ height: 10, background: "#f3f4f6", borderRadius: 999 }}>
                    <div style={{ height: 10, width: `${pct}%`, background: "#111827", borderRadius: 999 }} />
                  </div>
                  <div style={{ fontVariantNumeric: "tabular-nums" }}>{w.count}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Top triggers & symptoms */}
      <div style={grid2}>
        <Card title="Top triggers" style={{ marginTop: 12 }}>
          {triggers.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No data.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {triggers.map((t) => {
                const pct = maxTriggers ? (t.count / maxTriggers) * 100 : 0;
                return (
                  <RowBar key={t.trigger_name} label={t.trigger_name} value={t.count} pct={pct} />
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Top symptoms" style={{ marginTop: 12 }}>
          {symptoms.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No data.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {symptoms.map((s) => {
                const pct = maxSymptoms ? (s.count / maxSymptoms) * 100 : 0;
                return <RowBar key={s.symptom} label={s.symptom} value={s.count} pct={pct} />;
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------- helpers & tiny UI bits ---------- */
function computeTatTrend(orders) {
  if (!Array.isArray(orders)) return [];
  const buckets = new Map();
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 56);

  for (const order of orders) {
    if (!order?.ordered_at || !order?.result_received_at) continue;
    const orderedAt = new Date(order.ordered_at);
    const resultAt = new Date(order.result_received_at);
    if (Number.isNaN(orderedAt.valueOf()) || Number.isNaN(resultAt.valueOf())) continue;
    if (orderedAt < cutoff || orderedAt > now) continue;
    if (resultAt < orderedAt) continue;

    const durationMinutes = (resultAt.valueOf() - orderedAt.valueOf()) / 60000;
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) continue;

    const start = startOfWeekUtc(orderedAt);
    const key = start.toISOString();
    const bucket = buckets.get(key) || { weekStart: start, durations: [] };
    bucket.durations.push(durationMinutes);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.weekStart - b.weekStart)
    .slice(-8)
    .map((bucket) => {
      const durations = bucket.durations.slice().sort((a, b) => a - b);
      return {
        weekStart: bucket.weekStart,
        weekLabel: `w/c ${bucket.weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
        count: durations.length,
        avgMinutes: average(durations),
        medianMinutes: medianFromSorted(durations),
        p90Minutes: percentileFromSorted(durations, 0.9),
      };
    });
}

function computePatientHistories(orders, limit = 5) {
  if (!Array.isArray(orders) || orders.length === 0) return [];
  const map = new Map();
  for (const order of orders) {
    const key = order?.patient_full_name || order?.patient_email || "Unknown patient";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(order);
  }

  const histories = [];
  for (const [patient, items] of map.entries()) {
    const sorted = items
      .slice()
      .sort((a, b) => new Date(b.ordered_at || 0).valueOf() - new Date(a.ordered_at || 0).valueOf());
    if (sorted.length === 0) continue;
    const timeline = sorted.slice(0, 4).map((order) => {
      const orderedAt = order.ordered_at ? new Date(order.ordered_at) : null;
      const orderedLabel = orderedAt && Number.isFinite(orderedAt.valueOf())
        ? orderedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : "Unknown date";
      const resultAt = order.result_received_at ? new Date(order.result_received_at) : null;
      const tatMinutes = orderedAt && resultAt ? Math.round((resultAt.valueOf() - orderedAt.valueOf()) / 60000) : null;
      const vendorTag = order.vendor ? ` • ${order.vendor}` : "";
      return {
        id: order.id,
        label: `${orderedLabel}${vendorTag}`,
        status: (order.order_status || "unknown").replace(/_/g, " "),
        tatMinutes,
      };
    });

    histories.push({
      patient,
      timeline,
      lastOrderedAt: sorted[0]?.ordered_at || null,
    });
  }

  return histories
    .sort((a, b) => new Date(b.lastOrderedAt || 0).valueOf() - new Date(a.lastOrderedAt || 0).valueOf())
    .slice(0, limit);
}

function startOfWeekUtc(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // convert Sunday=0 to Monday=0
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function average(values) {
  if (!values.length) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

function medianFromSorted(values) {
  if (!values.length) return 0;
  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 0) {
    return (values[mid - 1] + values[mid]) / 2;
  }
  return values[mid];
}

function percentileFromSorted(values, percentile) {
  if (!values.length) return 0;
  const idx = Math.min(values.length - 1, Math.max(0, Math.round(percentile * (values.length - 1))));
  return values[idx];
}

function humanizeMinutes(m) {
  if (m == null || isNaN(m)) return "—";
  if (m < 1) return `${Math.round(m * 60)}s`;
  const hours = Math.floor(m / 60);
  const mins = Math.round(m % 60);
  if (hours === 0) return `${mins}m`;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return `${days}d ${remH}h`;
}
function numOrNa(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function round1(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : "—";
}

function Card({ title, children, style }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, background: "white", ...style }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function Big({ children }) {
  return <div style={{ fontSize: 32, fontWeight: 700 }}>{children}</div>;
}
function SmallMuted({ children }) {
  return <div style={{ fontSize: 12, color: "#6b7280" }}>{children}</div>;
}
function Pill({ label, value }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid #ddd",
        borderRadius: 999,
        padding: "4px 10px",
        background: "white",
      }}
    >
      <span style={{ textTransform: "capitalize" }}>{label}</span>
      <span
        style={{
          background: "#111827",
          color: "#fff",
          borderRadius: 999,
          padding: "2px 8px",
          fontSize: 12,
        }}
      >
        {value}
      </span>
    </div>
  );
}
function RowBar({ label, value, pct }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 12, color: "#6b7280", textTransform: "capitalize" }}>{label}</div>
        <div style={{ height: 10, background: "#f3f4f6", borderRadius: 999 }}>
          <div style={{ height: 10, width: `${pct}%`, background: "#111827", borderRadius: 999 }} />
        </div>
      </div>
      <div style={{ fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
function KPI({ title, value, hint }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, background: "white" }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint && <SmallMuted>{hint}</SmallMuted>}
    </div>
  );
}

/* --- styles --- */
const wrap = { maxWidth: 1000, margin: "24px auto", fontFamily: "system-ui, sans-serif" };
const grid3 = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 };
const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const btn = { padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };
