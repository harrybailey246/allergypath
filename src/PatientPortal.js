// src/PatientPortal.js
import React from "react";
import { supabase } from "./supabaseClient";

export default function PatientPortal() {
  const [user, setUser] = React.useState(null);
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [subs, setSubs] = React.useState([]);
  const [appts, setAppts] = React.useState({});
  const [err, setErr] = React.useState("");

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
      if (!user?.email || subs.length === 0) return;
      const map = {};
      for (const s of subs) {
        const { data, error } = await supabase
          .from("appointments")
          .select("id, start_at, end_at, location, notes")
          .eq("submission_id", s.id)
          .order("start_at", { ascending: true });
        map[s.id] = error ? [] : (data || []);
      }
      setAppts(map);
    };
    loadAppts();
  }, [user?.email, subs]);

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
  };

  const getSignedUrl = async (path) => {
    try {
      // assume attachments[] stores storage object paths, e.g. "attachments/uuid/file.pdf"
      const bucket = "attachments";
      const key = path.includes(`${bucket}/`) ? path.split(`${bucket}/`)[1] : path;
      const { data, error } = await supabase
        .storage
        .from(bucket)
        .createSignedUrl(key, 3600); // 1 hour
      if (error) throw error;
      return data.signedUrl;
    } catch (_e) {
      return null;
    }
  };

  if (loading) {
    return <div style={wrap}><Card><div>Loading…</div></Card></div>;
  }

  // Not logged in → show magic-link login
  if (!user) {
    return (
      <div style={wrap}>
        <h1 style={{ marginTop: 0 }}>Patient Portal</h1>
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
                      <AttachmentRow key={i} path={p} getSignedUrl={getSignedUrl} />
                    ))}
                  </div>
                </div>
              )}

              {/* Appointments */}
              <div>
                <div style={{ fontWeight: 600, margin: "6px 0" }}>Appointments</div>
                {appts[s.id] && appts[s.id].length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {appts[s.id].map((a) => (
                      <div key={a.id} style={{ padding: 8, border: "1px solid var(--border)", borderRadius: 8 }}>
                        <div style={{ fontWeight: 600 }}>
                          {fmt(new Date(a.start_at))} – {new Date(a.end_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        {a.location && <div style={{ color: "var(--muted)" }}>📍 {a.location}</div>}
                        {a.notes && <div style={{ color: "var(--muted)" }}>🗒 {a.notes}</div>}
                      </div>
                    ))}
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

function AttachmentRow({ path, getSignedUrl }) {
  const [url, setUrl] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const u = await getSignedUrl(path);
      setUrl(u);
      setLoading(false);
    })();
  }, [path, getSignedUrl]);

  const name = path.split("/").pop();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
        📎 {name}
      </div>
      <div>
        <a
          href={url || "#"}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => { if (!url) e.preventDefault(); }}
          style={{ ...btn, textDecoration: "none" }}
        >
          {loading ? "Preparing…" : "Download"}
        </a>
      </div>
    </div>
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

/* ---- styles ---- */
const wrap = { maxWidth: 900, margin: "24px auto", fontFamily: "system-ui, sans-serif", display: "grid", gap: 16 };
const input = { padding: 12, border: "1px solid var(--border)", borderRadius: 12, width: "100%", background: "var(--card)", color: "var(--text)" };
const btn = { padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--btnBg)", color: "var(--text)", cursor: "pointer", transition: "transform 0.18s ease, box-shadow 0.18s ease" };
function Card({ children }) {
  return <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--card)", marginBottom: 16, boxShadow: "var(--shadow)" }}>{children}</div>;
}
