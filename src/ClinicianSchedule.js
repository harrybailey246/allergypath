// src/ClinicianSchedule.js
import React from "react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { supabase } from "./supabaseClient";

export default function ClinicianSchedule({ onBack }) {
  const [weekStart, setWeekStart] = React.useState(startOfWeek(new Date(), { weekStartsOn: 1 })); // Mon
  const [appts, setAppts] = React.useState([]);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const days = [...Array(7)].map((_, i) => addDays(weekStart, i));

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const from = days[0];
      const to = addDays(days[6], 1); // exclusive
      const { data, error } = await supabase
        .from("appointments")
        .select("id, submission_id, start_at, end_at, location, notes")
        .gte("start_at", from.toISOString())
        .lt("start_at", to.toISOString())
        .order("start_at", { ascending: true });
      if (error) {
        setError(error.message || "Unable to load schedule.");
        setAppts([]);
      } else {
        const base = data || [];
        const submissionIds = Array.from(
          new Set(
            base
              .map((row) => row.submission_id)
              .filter(Boolean)
          )
        );

        let planMap = {};
        if (submissionIds.length > 0) {
          const planResults = await Promise.all(
            submissionIds.map(async (submissionId) => {
              try {
                const { data: planData, error: planError } = await supabase.rpc(
                  "immunotherapy_plan_snapshot",
                  { submission_id: submissionId }
                );
                if (planError) throw planError;
                return [submissionId, planData];
              } catch (planErr) {
                console.error("plan snapshot", planErr);
                return [submissionId, null];
              }
            })
          );
          planMap = Object.fromEntries(planResults);
        }

        setAppts(
          base.map((row) => ({
            ...row,
            plan: row.submission_id ? planMap[row.submission_id] || null : null,
          }))
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load schedule.";
      setError(message);
      setAppts([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart]); // eslint-disable-line

  React.useEffect(() => {
    load();
  }, [load]);

  const gotoDashboard = (submission_id) => {
    if (!submission_id) return;
    // Navigate to dashboard and request it to open the submission drawer
    window.location.hash = `#dashboard?open=${submission_id}`;
  };

  const gotoDashboardWithAction = (submission_id, action) => {
    if (!submission_id) return;
    const base = `#dashboard?open=${submission_id}`;
    window.location.hash = action ? `${base}&action=${action}` : base;
  };

  const handleQuickAction = (event, submission_id, action) => {
    event.stopPropagation();
    gotoDashboardWithAction(submission_id, action);
  };

  return (
    <div style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Clinician Schedule</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={() => setWeekStart(addDays(weekStart, -7))}>◀ Prev</button>
          <button style={btn} onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>This week</button>
          <button style={btn} onClick={() => setWeekStart(addDays(weekStart, 7))}>Next ▶</button>
          <button style={btn} onClick={onBack}>← Back</button>
        </div>
      </div>

      <div style={{ color: "var(--muted)", marginBottom: 8 }}>
        {format(days[0], "EEE d MMM")} – {format(days[6], "EEE d MMM yyyy")}
      </div>

      {error && (
        <div style={errorBanner}>{error}</div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div style={grid7}>
          {days.map((d) => (
            <div key={d.toISOString()} style={col}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                {format(d, "EEE d MMM")}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {appts.filter(a => isSameDay(new Date(a.start_at), d)).length === 0 && (
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>No appointments</div>
                )}
                {appts
                  .filter(a => isSameDay(new Date(a.start_at), d))
                  .map(a => (
                    <div
                      key={a.id}
                      onClick={() => gotoDashboard(a.submission_id)}
                      style={apptCard}
                      title="Open in Dashboard"
                    >
                      <div style={{ fontWeight: 600 }}>
                        {format(new Date(a.start_at), "HH:mm")} – {format(new Date(a.end_at), "HH:mm")}
                      </div>
                      {a.location && <div style={{ color: "var(--muted)" }}>📍 {a.location}</div>}
                      {a.notes && <div style={{ color: "var(--muted)", fontSize: 12 }}>🗒 {a.notes}</div>}
                      <div style={planWrap}>
                        {a.plan?.plan ? (
                          <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                              <span>
                                <span style={{ fontWeight: 600 }}>Plan:</span> {a.plan.plan.status} • Stage {a.plan.plan.regimen_stage}
                              </span>
                              {a.plan.overdue_count > 0 && (
                                <span style={overdueBadge}>
                                  ⚠️ {a.plan.overdue_count} overdue
                                </span>
                              )}
                            </div>
                            {a.plan.next_recommendation ? (
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                Next #{a.plan.next_recommendation.dose_number}
                                {a.plan.next_recommendation.scheduled_at && (
                                  <>
                                    {" "}due {format(new Date(a.plan.next_recommendation.scheduled_at), "EEE d MMM HH:mm")}
                                  </>
                                )}
                                <div style={{ marginTop: 4 }}>
                                  {a.plan.next_recommendation.gap_flag ? "🚨 " : "💉 "}
                                  {a.plan.next_recommendation.recommendation}
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>No remaining doses scheduled.</div>
                            )}
                            <div style={quickActions}>
                              <button
                                style={quickBtn}
                                onClick={(evt) => handleQuickAction(evt, a.submission_id, "reschedule")}
                              >
                                Reschedule
                              </button>
                              <button
                                style={quickBtn}
                                onClick={(evt) => handleQuickAction(evt, a.submission_id, "adjust-dose")}
                              >
                                Adjust dose
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>No immunotherapy plan on file.</div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* styles */
const wrap = { maxWidth: 1100, margin: "24px auto", fontFamily: "system-ui, sans-serif", display: "grid", gap: 20 };
const grid7 = { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12 };
const col = { border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "var(--card)", display: "grid", gap: 8, boxShadow: "var(--shadow)" };
const apptCard = { border: "1px solid var(--border)", borderRadius: 10, padding: 10, cursor: "pointer", background: "var(--card)", transition: "transform 0.18s ease, box-shadow 0.18s ease", display: "grid", gap: 8 };
const btn = { padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--btnBg)", color: "var(--text)", cursor: "pointer", transition: "transform 0.18s ease, box-shadow 0.18s ease" };
const errorBanner = { padding: 12, borderRadius: 10, background: "#ffe5e5", color: "#b00020", border: "1px solid #ffb3b3" };
const planWrap = { borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4 };
const quickActions = { display: "flex", gap: 6, flexWrap: "wrap" };
const quickBtn = { ...btn, padding: "6px 10px", fontSize: 12 };
const overdueBadge = { background: "rgba(239, 68, 68, 0.12)", color: "#b91c1c", padding: "2px 6px", borderRadius: 8, fontSize: 11, fontWeight: 600 };
