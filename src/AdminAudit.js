import React from "react";
import { supabase } from "./supabaseClient";

const eventDefaults = () => ({
  event_type: "",
  occurred_at: new Date().toISOString().slice(0, 16),
  location: "",
  description: "",
  staff_raw: "",
  outcomes: "",
  outcome_status: "pass",
  attachments_raw: "",
});

const checklistDefaults = () => ({
  checklist_type: "emergency_drug_check",
  performed_on: new Date().toISOString().slice(0, 10),
  location: "",
  outcome_status: "pass",
  staff_raw: "",
  outcomes: "",
  corrective_actions: "",
  next_steps: "",
  attachments_raw: "",
});

function parseParticipants(input) {
  return input
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

function parseAttachments(input) {
  return input
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, url] = line.split("|");
      if (url) {
        return { label: label.trim(), url: url.trim() };
      }
      return { label: label.trim(), url: label.trim() };
    });
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-GB", { dateStyle: "medium" });
  } catch (err) {
    return value;
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch (err) {
    return value;
  }
}

export default function AdminAudit({ onBack }) {
  const [events, setEvents] = React.useState([]);
  const [checklists, setChecklists] = React.useState([]);
  const [compliance, setCompliance] = React.useState([]);
  const [summary, setSummary] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const [eventForm, setEventForm] = React.useState(() => eventDefaults());
  const [checklistForm, setChecklistForm] = React.useState(() => checklistDefaults());
  const [tab, setTab] = React.useState("events");

  const loadData = React.useCallback(async () => {
    setError("");
    setLoading(true);
    const [eventRes, checklistRes, complianceRes, summaryRes] = await Promise.all([
      supabase
        .from("audit_events")
        .select(
          "id,event_type,occurred_at,location,outcome_status,staff_participants,attachments,description,outcomes"
        )
        .order("occurred_at", { ascending: false })
        .limit(12),
      supabase
        .from("emergency_checklists")
        .select(
          "id,checklist_type,performed_on,outcome_status,location,staff_participants,attachments,corrective_actions,outcomes,next_steps"
        )
        .order("performed_on", { ascending: false })
        .limit(12),
      supabase.from("analytics_emergency_compliance").select("*"),
      supabase.from("analytics_audit_event_summary").select("*").order("event_type"),
    ]);

    const firstError =
      eventRes.error || checklistRes.error || complianceRes.error || summaryRes.error;
    if (firstError) {
      setError(firstError.message || "Failed to load audit data");
      setEvents([]);
      setChecklists([]);
      setCompliance([]);
      setSummary([]);
    } else {
      setEvents(eventRes.data || []);
      setChecklists(checklistRes.data || []);
      setCompliance(complianceRes.data || []);
      setSummary(summaryRes.data || []);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const submitEvent = async (e) => {
    e.preventDefault();
    setError("");
    const payload = {
      event_type: eventForm.event_type.trim(),
      occurred_at: eventForm.occurred_at ? new Date(eventForm.occurred_at).toISOString() : null,
      location: eventForm.location || null,
      description: eventForm.description || null,
      outcomes: eventForm.outcomes || null,
      outcome_status: eventForm.outcome_status || null,
      staff_participants: parseParticipants(eventForm.staff_raw),
      attachments: parseAttachments(eventForm.attachments_raw),
    };

    const { error: insertError } = await supabase.from("audit_events").insert(payload);
    if (insertError) {
      setError(insertError.message || "Could not save audit event");
      return;
    }

    setEventForm(eventDefaults());
    loadData();
  };

  const submitChecklist = async (e) => {
    e.preventDefault();
    setError("");
    const payload = {
      checklist_type: checklistForm.checklist_type,
      performed_on: checklistForm.performed_on || null,
      location: checklistForm.location || null,
      outcome_status: checklistForm.outcome_status || null,
      outcomes: checklistForm.outcomes || null,
      corrective_actions: checklistForm.corrective_actions || null,
      next_steps: checklistForm.next_steps || null,
      staff_participants: parseParticipants(checklistForm.staff_raw),
      attachments: parseAttachments(checklistForm.attachments_raw),
    };

    const { error: insertError } = await supabase
      .from("emergency_checklists")
      .insert(payload);
    if (insertError) {
      setError(insertError.message || "Could not save checklist entry");
      return;
    }

    setChecklistForm(checklistDefaults());
    loadData();
  };

  const overdue = compliance.filter((row) => row.is_overdue);

  const exportSummary = () => {
    const lines = [];
    lines.push("AllergyPath Emergency Preparedness Summary");
    lines.push(`Generated: ${new Date().toLocaleString("en-GB")}`);
    lines.push("");
    lines.push("Compliance");
    compliance.forEach((row) => {
      const label = row.checklist_type.replace(/_/g, " ");
      const complianceText = row.compliance_rate != null ? `${row.compliance_rate}%` : "n/a";
      const nextDue = row.next_due_on ? formatDate(row.next_due_on) : "overdue now";
      const base = `• ${label}: ${complianceText} compliance`;
      const detail = row.last_performed_on
        ? ` (last done ${formatDate(row.last_performed_on)}, next due ${nextDue})`
        : " (no record)";
      lines.push(base + detail);
    });
    lines.push("");
    lines.push("Recent Audit Events");
    events.forEach((ev) => {
      lines.push(
        `• ${formatDateTime(ev.occurred_at)} – ${ev.event_type} (${ev.outcome_status || "status unknown"})`
      );
    });
    lines.push("");
    lines.push("Event Summaries");
    summary.forEach((row) => {
      lines.push(
        `• ${row.event_type}: ${row.event_count} recorded (last ${formatDateTime(
          row.last_occurred_at
        )})`
      );
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cqc-summary-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={wrap}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Audit & Emergency Readiness</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={loadData} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button style={btn} onClick={exportSummary}>
            Export CQC Summary
          </button>
          {onBack && (
            <button style={btn} onClick={onBack}>
              ← Back
            </button>
          )}
        </div>
      </header>

      {error && <div style={{ color: "#b91c1c", marginTop: 12 }}>❌ {error}</div>}

      <section style={{ marginTop: 18 }}>
        <h2 style={{ marginBottom: 12 }}>Compliance at a glance</h2>
        <div style={grid3}>
          {compliance.map((row) => (
            <div key={row.checklist_type} style={card}>
              <div style={{ fontWeight: 600, textTransform: "capitalize" }}>
                {row.checklist_type.replace(/_/g, " ")}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, margin: "8px 0" }}>
                {row.compliance_rate != null ? `${row.compliance_rate}%` : "—"}
              </div>
              <div style={muted}>
                Last: {row.last_performed_on ? formatDate(row.last_performed_on) : "never"}
              </div>
              <div style={muted}>
                Next due: {row.next_due_on ? formatDate(row.next_due_on) : "overdue"}
              </div>
              {row.is_overdue && (
                <div style={{ color: "#b91c1c", marginTop: 6 }}>
                  ⚠️ Overdue {row.days_overdue ? `by ${row.days_overdue} days` : "now"}
                </div>
              )}
            </div>
          ))}
          {compliance.length === 0 && <div style={muted}>No checklist data yet.</div>}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 12 }}>Overdue tasks</h2>
        {overdue.length === 0 ? (
          <div style={card}>All scheduled checks are in date ✅</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {overdue.map((row) => (
              <div key={row.checklist_type} style={card}>
                <div style={{ fontWeight: 600 }}>{row.checklist_type.replace(/_/g, " ")}</div>
                <div style={{ color: "#b91c1c" }}>
                  Overdue since {row.next_due_on ? formatDate(row.next_due_on) : "unknown"}
                </div>
                <div style={muted}>
                  Last completed: {row.last_performed_on ? formatDate(row.last_performed_on) : "never"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            style={{ ...btn, ...(tab === "events" ? btnActive : {}) }}
            onClick={() => setTab("events")}
          >
            Log Drill / Event
          </button>
          <button
            style={{ ...btn, ...(tab === "checklists" ? btnActive : {}) }}
            onClick={() => setTab("checklists")}
          >
            Emergency Checklist
          </button>
        </div>

        {tab === "events" ? (
          <form onSubmit={submitEvent} style={form}>
            <div style={fieldRow}>
              <label style={label}>Event type</label>
              <input
                required
                value={eventForm.event_type}
                onChange={(e) => setEventForm((f) => ({ ...f, event_type: e.target.value }))}
                placeholder="e.g. fire drill"
              />
            </div>
            <div style={fieldRow}>
              <label style={label}>Occurred at</label>
              <input
                type="datetime-local"
                value={eventForm.occurred_at}
                onChange={(e) => setEventForm((f) => ({ ...f, occurred_at: e.target.value }))}
              />
            </div>
          <div style={fieldRow}>
            <label style={label}>Location</label>
            <input
              value={eventForm.location}
              onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Clinic room, practice, etc"
            />
          </div>
          <div style={fieldRow}>
            <label style={label}>Description</label>
            <textarea
              value={eventForm.description}
              onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What was rehearsed or inspected?"
            />
          </div>
            <div style={fieldRow}>
              <label style={label}>Participants</label>
              <textarea
                value={eventForm.staff_raw}
                onChange={(e) => setEventForm((f) => ({ ...f, staff_raw: e.target.value }))}
                placeholder="One name per line or comma separated"
              />
            </div>
            <div style={fieldRow}>
              <label style={label}>Outcome</label>
              <textarea
                value={eventForm.outcomes}
                onChange={(e) => setEventForm((f) => ({ ...f, outcomes: e.target.value }))}
                placeholder="Summary of findings"
              />
            </div>
            <div style={fieldRow}>
              <label style={label}>Outcome status</label>
              <select
                value={eventForm.outcome_status}
                onChange={(e) => setEventForm((f) => ({ ...f, outcome_status: e.target.value }))}
              >
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="follow_up">Follow up</option>
                <option value="in_progress">In progress</option>
              </select>
            </div>
            <div style={fieldRow}>
              <label style={label}>Attachments</label>
              <textarea
                value={eventForm.attachments_raw}
                onChange={(e) => setEventForm((f) => ({ ...f, attachments_raw: e.target.value }))}
                placeholder="Optional. One per line, label|https://link"
              />
            </div>
            <button type="submit" style={{ ...btn, alignSelf: "flex-start" }}>
              Save event
            </button>
          </form>
        ) : (
          <form onSubmit={submitChecklist} style={form}>
            <div style={fieldRow}>
              <label style={label}>Checklist type</label>
              <select
                value={checklistForm.checklist_type}
                onChange={(e) => setChecklistForm((f) => ({ ...f, checklist_type: e.target.value }))}
              >
                <option value="emergency_drug_check">Emergency drug stock</option>
                <option value="evacuation_drill">Evacuation drill</option>
                <option value="equipment_check">Emergency equipment</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div style={fieldRow}>
              <label style={label}>Performed on</label>
              <input
                type="date"
                value={checklistForm.performed_on}
                onChange={(e) => setChecklistForm((f) => ({ ...f, performed_on: e.target.value }))}
              />
            </div>
            <div style={fieldRow}>
              <label style={label}>Location</label>
              <input
                value={checklistForm.location}
                onChange={(e) => setChecklistForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Where the check took place"
              />
            </div>
            <div style={fieldRow}>
              <label style={label}>Outcome status</label>
              <select
                value={checklistForm.outcome_status}
                onChange={(e) => setChecklistForm((f) => ({ ...f, outcome_status: e.target.value }))}
              >
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="follow_up">Follow up</option>
              </select>
            </div>
            <div style={fieldRow}>
              <label style={label}>Participants</label>
              <textarea
                value={checklistForm.staff_raw}
                onChange={(e) =>
                  setChecklistForm((f) => ({ ...f, staff_raw: e.target.value }))
                }
                placeholder="One name per line or comma separated"
              />
            </div>
            <div style={fieldRow}>
              <label style={label}>Findings</label>
              <textarea
                value={checklistForm.outcomes}
                onChange={(e) => setChecklistForm((f) => ({ ...f, outcomes: e.target.value }))}
                placeholder="What did you check and what was found?"
              />
            </div>
            <div style={fieldRow}>
              <label style={label}>Corrective actions</label>
              <textarea
                value={checklistForm.corrective_actions}
                onChange={(e) =>
                  setChecklistForm((f) => ({ ...f, corrective_actions: e.target.value }))
                }
                placeholder="Any remedial actions taken"
              />
            </div>
            <div style={fieldRow}>
              <label style={label}>Next steps</label>
              <textarea
                value={checklistForm.next_steps}
                onChange={(e) => setChecklistForm((f) => ({ ...f, next_steps: e.target.value }))}
                placeholder="Follow-up tasks or deadlines"
              />
            </div>
            <div style={fieldRow}>
              <label style={label}>Attachments</label>
              <textarea
                value={checklistForm.attachments_raw}
                onChange={(e) =>
                  setChecklistForm((f) => ({ ...f, attachments_raw: e.target.value }))
                }
                placeholder="Optional. One per line, label|https://link"
              />
            </div>
            <button type="submit" style={{ ...btn, alignSelf: "flex-start" }}>
              Save checklist
            </button>
          </form>
        )}
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 style={{ marginBottom: 12 }}>Recent activity</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {events.map((ev) => (
            <div key={ev.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{ev.event_type}</strong>
                <span style={pill(ev.outcome_status)}>{ev.outcome_status || "n/a"}</span>
              </div>
              <div style={muted}>Occurred: {formatDateTime(ev.occurred_at)}</div>
              {ev.location && <div style={muted}>Location: {ev.location}</div>}
              {ev.description && (
                <div style={{ marginTop: 6 }}>
                  <strong>Description:</strong> {ev.description}
                </div>
              )}
              {ev.outcomes && (
                <div style={{ marginTop: 6 }}>
                  <strong>Outcome notes:</strong> {ev.outcomes}
                </div>
              )}
              {Array.isArray(ev.staff_participants) && ev.staff_participants.length > 0 && (
                <div style={muted}>
                  Team: {ev.staff_participants.map((p) => p.name || p).join(", ")}
                </div>
              )}
              {Array.isArray(ev.attachments) && ev.attachments.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  Attachments:
                  <ul>
                    {ev.attachments.map((att, idx) => (
                      <li key={idx}>
                        <a href={att.url || att.label} target="_blank" rel="noreferrer">
                          {att.label || att.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {events.length === 0 && <div style={muted}>No drills logged yet.</div>}
        </div>
      </section>

      <section style={{ marginTop: 32, marginBottom: 60 }}>
        <h2 style={{ marginBottom: 12 }}>Emergency checklists</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {checklists.map((row) => (
            <div key={row.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{row.checklist_type.replace(/_/g, " ")}</strong>
                <span style={pill(row.outcome_status)}>{row.outcome_status}</span>
              </div>
              <div style={muted}>Performed: {formatDate(row.performed_on)}</div>
              {row.location && <div style={muted}>Location: {row.location}</div>}
              {Array.isArray(row.staff_participants) && row.staff_participants.length > 0 && (
                <div style={muted}>
                  Team: {row.staff_participants.map((p) => p.name || p).join(", ")}
                </div>
              )}
              {row.corrective_actions && (
                <div style={{ marginTop: 6 }}>
                  <strong>Corrective actions:</strong> {row.corrective_actions}
                </div>
              )}
              {row.outcomes && (
                <div style={{ marginTop: 6 }}>
                  <strong>Findings:</strong> {row.outcomes}
                </div>
              )}
              {row.next_steps && (
                <div style={{ marginTop: 6 }}>
                  <strong>Next steps:</strong> {row.next_steps}
                </div>
              )}
              {Array.isArray(row.attachments) && row.attachments.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  Attachments:
                  <ul>
                    {row.attachments.map((att, idx) => (
                      <li key={idx}>
                        <a href={att.url || att.label} target="_blank" rel="noreferrer">
                          {att.label || att.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {checklists.length === 0 && <div style={muted}>No emergency checklists captured yet.</div>}
        </div>
      </section>
    </div>
  );
}

const wrap = {
  maxWidth: 1000,
  margin: "24px auto",
  padding: "0 16px",
  fontFamily: "system-ui, sans-serif",
};

const grid3 = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const card = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 14,
  background: "#fff",
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
};

const btn = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "white",
  cursor: "pointer",
};

const btnActive = {
  background: "#111827",
  color: "white",
};

const form = {
  display: "grid",
  gap: 12,
  maxWidth: 640,
};

const fieldRow = {
  display: "grid",
  gap: 6,
};

const label = {
  fontSize: 12,
  fontWeight: 600,
  color: "#4b5563",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const muted = {
  fontSize: 12,
  color: "#6b7280",
};

const pill = (status) => ({
  fontSize: 12,
  textTransform: "uppercase",
  padding: "2px 8px",
  borderRadius: 999,
  background:
    status === "pass"
      ? "rgba(22, 163, 74, 0.12)"
      : status === "fail"
      ? "rgba(239, 68, 68, 0.12)"
      : "rgba(59, 130, 246, 0.12)",
  color:
    status === "pass"
      ? "#15803d"
      : status === "fail"
      ? "#b91c1c"
      : "#1d4ed8",
});

