// src/AdminAnalytics.js
import React from "react";
import { supabase } from "./supabaseClient";

export default function AdminAnalytics({ onBack }) {
  const [statusCounts, setStatusCounts] = React.useState([]);
  const [readiness, setReadiness] = React.useState(null);
  const [weekly, setWeekly] = React.useState([]);
  const [triggers, setTriggers] = React.useState([]);
  const [symptoms, setSymptoms] = React.useState([]);
  const [compliance, setCompliance] = React.useState([]);
  const [auditSummary, setAuditSummary] = React.useState([]);

  // NEW: TAT / TTFR KPIs from analytics_tat_30d
  const [kpi, setKpi] = React.useState(null);

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

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
        { data: comp, error: e7 },
        { data: audit, error: e8 },
      ] = await Promise.all([
        supabase.from("analytics_status_counts").select("*"),
        supabase.from("analytics_readiness_risk").select("*").maybeSingle(),
        supabase.from("analytics_weekly").select("*").order("week_start", { ascending: true }),
        supabase.from("analytics_top_triggers").select("*"),
        supabase.from("analytics_top_symptoms").select("*"),
        supabase.from("analytics_tat_30d").select("*").maybeSingle(), // ← includes TTFR columns
        supabase.from("analytics_emergency_compliance").select("*"),
        supabase
          .from("analytics_audit_event_summary")
          .select("*")
          .order("last_occurred_at", { ascending: false }),
      ]);

      const firstErr = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8;
      if (firstErr) throw new Error(firstErr.message || "Failed to load analytics");

      setStatusCounts(sc || []);
      setReadiness(rr || null);
      setWeekly(wk || []);
      setTriggers(tg || []);
      setSymptoms(sy || []);
      setKpi(tat30 || null);
      setCompliance(comp || []);
      setAuditSummary(audit || []);
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
  const complianceWithRate = compliance.filter((row) => row.compliance_rate != null);
  const complianceAverage =
    complianceWithRate.length > 0
      ? Math.round(
          (complianceWithRate.reduce((sum, row) => sum + Number(row.compliance_rate || 0), 0) /
            complianceWithRate.length) *
            10
        ) / 10
      : null;
  const overdueChecks = compliance.filter((row) => row.is_overdue);
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  const upcomingDue = compliance.filter((row) => {
    if (!row.next_due_on || row.is_overdue) return false;
    const dueDate = new Date(row.next_due_on);
    return !isNaN(dueDate) && dueDate <= soon;
  });

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

      <Card title="Emergency checklist compliance" style={{ marginTop: 12 }}>
        {compliance.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No emergency checklist data yet.</div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              Overall compliance: {complianceAverage != null ? `${complianceAverage}%` : "—"}
            </div>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Checklist</th>
                  <th style={th}>Compliance</th>
                  <th style={th}>Last completed</th>
                  <th style={th}>Next due</th>
                </tr>
              </thead>
              <tbody>
                {compliance.map((row) => (
                  <tr key={row.checklist_type}>
                    <td style={td}>{row.checklist_type.replace(/_/g, " ")}</td>
                    <td style={td}>{row.compliance_rate != null ? `${row.compliance_rate}%` : "—"}</td>
                    <td style={td}>{shortDate(row.last_performed_on)}</td>
                    <td style={td}>
                      {row.next_due_on ? shortDate(row.next_due_on) : "overdue"}
                      {row.is_overdue && <span style={{ color: "#b91c1c", marginLeft: 6 }}>⚠</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={grid2}>
        <Card title="Overdue checks" style={{ marginTop: 12 }}>
          {overdueChecks.length === 0 ? (
            <div style={{ color: "#16a34a" }}>All checks are in date ✅</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {overdueChecks.map((row) => (
                <li key={row.checklist_type} style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 600 }}>{row.checklist_type.replace(/_/g, " ")}</div>
                  <div style={{ fontSize: 12, color: "#b91c1c" }}>
                    Overdue since {shortDate(row.next_due_on)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Upcoming within 30 days" style={{ marginTop: 12 }}>
          {upcomingDue.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No upcoming deadlines.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {upcomingDue.map((row) => (
                <li key={row.checklist_type} style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 600 }}>{row.checklist_type.replace(/_/g, " ")}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Due {shortDate(row.next_due_on)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Drill coverage" style={{ marginTop: 12 }}>
        {auditSummary.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No audit events recorded.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {auditSummary.map((row) => (
              <div
                key={row.event_type}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, textTransform: "capitalize" }}>
                    {row.event_type.replace(/_/g, " ")}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Last recorded {shortDate(row.last_occurred_at)}
                  </div>
                </div>
                <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  {row.event_count}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

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
function shortDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-GB", { dateStyle: "medium" });
  } catch (err) {
    return value;
  }
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
const table = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const th = { textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "6px 4px", fontWeight: 600 };
const td = { borderBottom: "1px solid #f3f4f6", padding: "6px 4px" };
