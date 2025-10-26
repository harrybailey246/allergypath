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
        setAppts(data || []);
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
const apptCard = { border: "1px solid var(--border)", borderRadius: 10, padding: 10, cursor: "pointer", background: "var(--card)", transition: "transform 0.18s ease, box-shadow 0.18s ease" };
const btn = { padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--btnBg)", color: "var(--text)", cursor: "pointer", transition: "transform 0.18s ease, box-shadow 0.18s ease" };
const errorBanner = { padding: 12, borderRadius: 10, background: "#ffe5e5", color: "#b00020", border: "1px solid #ffb3b3" };
