// src/PatientPortal.js
import React from "react";
import { supabase } from "./supabaseClient";
import { createAppointmentICS } from "./utils/calendar";
import AttachmentRow from "./components/AttachmentRow";
import { getSignedUrl as getAttachmentSignedUrl } from "./storage";

export default function PatientPortal() {
  const [user, setUser] = React.useState(null);
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [subs, setSubs] = React.useState([]);
  const [appts, setAppts] = React.useState({});
  const [requests, setRequests] = React.useState({});
  const [err, setErr] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const toastTimeoutRef = React.useRef(null);
  const [requestingAppt, setRequestingAppt] = React.useState(null);
  const [requestType, setRequestType] = React.useState("reschedule");
  const [requestMessage, setRequestMessage] = React.useState("");
  const [requestSubmitting, setRequestSubmitting] = React.useState(false);

  const showToast = React.useCallback((tone, message) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ tone, message });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // who am I?
  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user ?? null);
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // load my submissions when logged in
  React.useEffect(() => {
    const load = async () => {
      if (!user?.email) return;
      setErr("");
      setLoading(true);
      const { data, error } = await supabase
        .from("submissions")
        .select("id, created_at, first_name, surname, email, status, spt_ready, high_risk, flags, symptoms, food_triggers, attachments")
        .eq("email", user.email)
        .order("created_at", { ascending: false });
      if (error) {
        setErr(error.message);
        setSubs([]);
      } else {
        setSubs(data || []);
      }
      setLoading(false);
    };
    load();
  }, [user?.email]);

  // load appointments for each submission
  React.useEffect(() => {
    const loadAppts = async () => {
      if (!user?.email || subs.length === 0) {
        setAppts({});
        setRequests({});
        return;
      }

      const submissionIds = subs.map((s) => s.id);
      const { data, error } = await supabase
        .from("appointments")
        .select("id, submission_id, start_at, end_at, location, notes")
        .in("submission_id", submissionIds)
        .order("start_at", { ascending: true });

      if (error) {
        setAppts({});
        return;
      }

      const map = submissionIds.reduce((acc, id) => {
        acc[id] = [];
        return acc;
      }, {});

      (data || []).forEach((appt) => {
        if (!map[appt.submission_id]) {
          map[appt.submission_id] = [];
        }
        map[appt.submission_id].push(appt);
      });

      setAppts(map);
    };
    loadAppts();
  }, [user?.email, subs]);

  React.useEffect(() => {
    const loadRequests = async () => {
      if (!user?.email || subs.length === 0) {
        setRequests({});
        return;
      }

      const submissionIds = subs.map((s) => s.id);

      try {
        const { data, error } = await supabase
          .from("appointment_requests")
          .select(
            "id, submission_id, appointment_id, request_type, message, status, handled_at, created_at"
          )
          .in("submission_id", submissionIds)
          .eq("patient_email", user.email)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const map = submissionIds.reduce((acc, id) => {
          acc[id] = [];
          return acc;
        }, {});

        (data || []).forEach((request) => {
          if (!map[request.submission_id]) {
            map[request.submission_id] = [];
          }
          map[request.submission_id].push(request);
        });

        setRequests(map);
      } catch (error) {
        setRequests({});
        showToast("error", error?.message || "Unable to load requests.");
      }
    };

    loadRequests();
  }, [user?.email, subs, showToast]);

  React.useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const sendMagicLink = async (e) => {
    e.preventDefault();
    setErr("");
    if (!email.trim()) return;
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname + "#patientPortal",
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (er) {
      setErr(er.message || "Failed to send link");
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSent(false);
    setEmail("");
    setSubs([]);
    setAppts({});
    setRequests({});
  };

  const handleAddToCalendar = (appointment, submission) => {
    try {
      const { blob, filename } = createAppointmentICS(appointment, submission);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast("success", "Calendar event downloaded.");
    } catch (error) {
      showToast("error", error?.message || "Unable to prepare calendar event.");
    }
  };

  const openRequestForm = (appointmentId) => {
    setRequestingAppt(appointmentId);
    setRequestType("reschedule");
    setRequestMessage("");
  };

  const closeRequestForm = () => {
    setRequestingAppt(null);
    setRequestType("reschedule");
    setRequestMessage("");
    setRequestSubmitting(false);
  };

  const submitRequest = async (submission, appointment) => {
    if (!user?.email) {
      showToast("error", "Please sign in again to send a request.");
      return;
    }
    setRequestSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("appointment_requests")
        .insert([
          {
            submission_id: submission.id,
            appointment_id: appointment.id,
            patient_email: user.email,
            request_type: requestType,
            message: requestMessage.trim() || null,
          },
        ])
        .select(
          "id, submission_id, appointment_id, request_type, message, status, handled_at, created_at"
        )
        .single();
      if (error) throw error;
      if (data) {
        setRequests((prev) => {
          const existing = prev[submission.id] || [];
          return {
            ...prev,
            [submission.id]: [data, ...existing],
          };
        });
      }
      showToast("success", "Request sent to the clinic.");
      closeRequestForm();
    } catch (e) {
      showToast("error", e?.message || "Unable to send request.");
    } finally {
      setRequestSubmitting(false);
    }
  };

  const getSignedUrl = React.useCallback(async (path) => {
    if (!path) throw new Error("Missing attachment path");
    return getAttachmentSignedUrl(path);
  }, []);

  if (loading) {
    return <div style={wrap}><Card><div>Loading…</div></Card></div>;
  }

  // Not logged in → show magic-link login
  if (!user) {
    return (
      <div style={wrap}>
        <h1 style={{ marginTop: 0 }}>Patient Portal</h1>
        {toast && (
          <div style={toastToneStyles(toast)}>
            <span style={{ fontWeight: 600 }}>
              {toast.tone === "success" ? "✅" : "❌"}
            </span>
            <span>{toast.message}</span>
          </div>
        )}
        <Card>
          <p style={{ color: "var(--muted)" }}>
            Enter the email you used on the AllergyPath form and we’ll send you a one-time sign-in link.
          </p>
          <form onSubmit={sendMagicLink} style={{ display: "grid", gap: 8 }}>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={input}
              required
            />
            <button type="submit" style={btn} disabled={sent}>
              {sent ? "Link sent — check your inbox" : "Send magic link"}
            </button>
            {err && <div style={{ color: "var(--danger)" }}>❌ {err}</div>}
          </form>
        </Card>
      </div>
    );
  }

  // Logged in → show their submissions + appts
  return (
    <div style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>My Allergy Submissions</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ alignSelf: "center", color: "var(--muted)", fontSize: 12 }}>{user.email}</span>
          <button onClick={signOut} style={btn}>Sign out</button>
        </div>
      </div>

      {toast && (
        <div style={toastToneStyles(toast)}>
          <span style={{ fontWeight: 600 }}>
            {toast.tone === "success" ? "✅" : "❌"}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      {err && <div style={{ color: "var(--danger)", margin: "8px 0" }}>❌ {err}</div>}

      {subs.length === 0 ? (
        <Card>
          <div style={{ color: "var(--muted)" }}>No submissions found for this email.</div>
        </Card>
      ) : (
        subs.map((s) => (
          <Card key={s.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {s.first_name} {s.surname}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  Submitted {new Date(s.created_at).toLocaleString("en-GB")}
                </div>
              </div>
              <StatusChip value={s.status} />
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <Row label="Skin-prick test readiness">
                {s.spt_ready ? <Badge color="var(--success)">Ready</Badge> : <Badge color="var(--warning)">Hold</Badge>}
              </Row>
              <Row label="Risk">{s.high_risk ? <Badge color="var(--danger)">High</Badge> : <Badge color="var(--success)">Normal</Badge>}</Row>
              <Row label="Symptoms">
                {Array.isArray(s.symptoms) && s.symptoms.length ? s.symptoms.join(", ") : "—"}
              </Row>
              <Row label="Potential food triggers">
                {Array.isArray(s.food_triggers) && s.food_triggers.length ? s.food_triggers.join(", ") : "—"}
              </Row>

              {/* Attachments (if any) */}
              {Array.isArray(s.attachments) && s.attachments.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, margin: "6px 0" }}>Files you’ve uploaded</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {s.attachments.map((p, i) => (
                      <PatientAttachmentRow key={i} path={p} getSignedUrl={getSignedUrl} />
                    ))}
                  </div>
                </div>
              )}

              {/* Appointments */}
              <div>
                <div style={{ fontWeight: 600, margin: "6px 0" }}>Appointments</div>
                {appts[s.id] && appts[s.id].length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {appts[s.id].map((a) => {
                      const relevantRequests = (requests[s.id] || []).filter(
                        (r) => r.appointment_id === a.id
                      );
                      return (
                        <div key={a.id} style={{ padding: 8, border: "1px solid var(--border)", borderRadius: 8 }}>
                          <div style={{ fontWeight: 600 }}>
                            {fmt(new Date(a.start_at))} – {new Date(a.end_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          {a.location && <div style={{ color: "var(--muted)" }}>📍 {a.location}</div>}
                          {a.notes && <div style={{ color: "var(--muted)" }}>🗒 {a.notes}</div>}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                            <button onClick={() => handleAddToCalendar(a, s)} style={btn}>Add to calendar</button>
                            <button onClick={() => openRequestForm(a.id)} style={btn}>
                              Request change
                            </button>
                          </div>
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Requests</div>
                            {relevantRequests.length ? (
                              <div style={{ display: "grid", gap: 6 }}>
                                {relevantRequests.map((r) => (
                                  <div
                                    key={r.id}
                                    style={{
                                      border: "1px solid var(--border)",
                                      borderRadius: 8,
                                      padding: 8,
                                      background: "var(--card)",
                                      display: "grid",
                                      gap: 6,
                                    }}
                                  >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                      <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{r.request_type}</span>
                                      <span style={{ color: "var(--muted)", fontSize: 12 }}>
                                        {new Date(r.created_at).toLocaleString("en-GB")}
                                      </span>
                                    </div>
                                    {r.message && <div>{r.message}</div>}
                                    <div style={{ color: "var(--muted)", fontSize: 12, display: "grid", gap: 2 }}>
                                      <span>
                                        Status: {r.status ? r.status.replace(/_/g, " ") : "Pending"}
                                      </span>
                                      <span>
                                        Handled: {r.handled_at ? new Date(r.handled_at).toLocaleString("en-GB") : "—"}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ color: "var(--muted)", fontSize: 12 }}>No requests yet.</div>
                            )}
                          </div>
                          {requestingAppt === a.id && (
                            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                              <div style={{ display: "grid", gap: 6 }}>
                                <label style={{ fontSize: 12, color: "var(--muted)" }}>Request type</label>
                                <select value={requestType} onChange={(e) => setRequestType(e.target.value)} style={{ ...input }}>
                                  <option value="reschedule">Reschedule</option>
                                  <option value="cancel">Cancel</option>
                                  <option value="other">Other</option>
                                </select>
                              </div>
                              <div style={{ display: "grid", gap: 6 }}>
                                <label style={{ fontSize: 12, color: "var(--muted)" }}>Notes (optional)</label>
                                <textarea
                                  value={requestMessage}
                                  onChange={(e) => setRequestMessage(e.target.value)}
                                  placeholder="Let us know what you need"
                                  style={{ ...input, minHeight: 80 }}
                                />
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                  onClick={() => submitRequest(s, a)}
                                  style={btn}
                                  disabled={requestSubmitting}
                                >
                                  {requestSubmitting ? "Sending…" : "Send request"}
                                </button>
                                <button onClick={closeRequestForm} style={btn}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)" }}>No appointments yet.</div>
                )}
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

/* ---- tiny presentational bits ---- */
function Row({ label, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 8 }}>
      <div style={{ color: "var(--muted)" }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

function PatientAttachmentRow({ path, getSignedUrl }) {
  const [url, setUrl] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const fetchUrl = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextUrl = await getSignedUrl(path);
      setUrl(nextUrl);
    } catch (err) {
      console.error("attachment signed url", err);
      setUrl(null);
      setError(err?.message ? `Unable to prepare download: ${err.message}` : "Unable to prepare download.");
    } finally {
      setLoading(false);
    }
  }, [path, getSignedUrl]);

  React.useEffect(() => {
    fetchUrl();
  }, [fetchUrl]);

  return (
    <AttachmentRow
      path={path}
      url={url}
      loading={loading}
      error={error}
      onRetry={fetchUrl}
      buttonStyle={btn}
    />
  );
}

function Badge({ children, color }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 12, color: "white", background: color }}>
      {children}
    </span>
  );
}
function StatusChip({ value }) {
  const map = {
    new: { label: "New", bg: "var(--muted)" },
    ready_spt: { label: "Ready for SPT", bg: "var(--success)" },
    needs_review: { label: "Needs Review", bg: "var(--warning)" },
    completed: { label: "Completed", bg: "var(--primary)" },
  };
  const m = map[value] || map.new;
  return <Badge color={m.bg}>{m.label}</Badge>;
}
function fmt(d) {
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function toastToneStyles(toast) {
  const palette =
    toast?.tone === "success"
      ? { background: "#ecfdf5", border: "1px solid #bbf7d0", color: "#047857" }
      : { background: "#fee2e2", border: "1px solid #fecaca", color: "#b91c1c" };
  return {
    ...palette,
    display: "flex",
    gap: 8,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 12,
    fontSize: 14,
  };
}

/* ---- styles ---- */
const wrap = { maxWidth: 900, margin: "24px auto", fontFamily: "system-ui, sans-serif", display: "grid", gap: 16 };
const input = { padding: 12, border: "1px solid var(--border)", borderRadius: 12, width: "100%", background: "var(--card)", color: "var(--text)" };
const btn = { padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--btnBg)", color: "var(--text)", cursor: "pointer", transition: "transform 0.18s ease, box-shadow 0.18s ease" };
function Card({ children }) {
  return <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--card)", marginBottom: 16, boxShadow: "var(--shadow)" }}>{children}</div>;
}
