// src/Dashboard.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { format } from "date-fns";
import { createEvent } from "ics";
import { supabase } from "./supabaseClient";
import { logAuditEvent } from "./auditLogs";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "ready_spt", label: "Ready for SPT" },
  { key: "needs_review", label: "Needs Review" },
  { key: "completed", label: "Completed" },
  { key: "my", label: "My queue" },
];

const PAGE_SIZE = 50;

export default function Dashboard({ onOpenAnalytics, onOpenPartner }) {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("new");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [me, setMe] = useState(null);

  // Lock background scroll when a patient is open
  useEffect(() => {
    if (!selected) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selected]);

  // Who am I?
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMe(data?.user || null);
    })();
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("submissions")
      .select(
        "id,created_at,first_name,surname,email,flags,spt_ready,high_risk,status,symptoms,food_triggers,clinician_notes,attachments,clinician_id,clinician_email",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (tab !== "all" && tab !== "my") query = query.eq("status", tab);
    if (tab === "my" && me?.id) query = query.eq("clinician_id", me.id);

    const { data, error, count } = await query;
    if (error) {
      console.error(error);
      setRows([]);
      setTotalCount(0);
    } else {
      setRows(data || []);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [tab, page, me?.id]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Realtime updates
  useEffect(() => {
    const ch = supabase
      .channel("submissions-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions" },
        () => fetchRows()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchRows]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => {
      const name = `${r.first_name || ""} ${r.surname || ""}`.toLowerCase();
      return name.includes(s) || (r.email || "").toLowerCase().includes(s);
    });
  }, [rows, q]);

  const openDetail = (row) => {
    setSelected(row);
    setNotes(row.clinician_notes || "");
  };

  const updateStatus = async (row, next) => {
    const { error } = await supabase
      .from("submissions")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) alert("Failed to update: " + error.message);
    else {
      await logAuditEvent({
        submissionId: row.id,
        action: "status_changed",
        payload: {
          from: row.status,
          to: next,
          surface: "dashboard_list",
        },
      });
      fetchRows();
    }
  };

  const assignToMe = async (row) => {
    if (!me) return alert("Please sign in first.");
    const { error } = await supabase
      .from("submissions")
      .update({
        clinician_id: me.id,
        clinician_email: me.email || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) alert("Assign failed: " + error.message);
    else {
      await logAuditEvent({
        submissionId: row.id,
        action: "assigned_to_clinician",
        payload: {
          clinician_id: me.id,
          clinician_email: me.email || null,
        },
      });
      fetchRows();
    }
  };

  const unassign = async (row) => {
    const { error } = await supabase
      .from("submissions")
      .update({
        clinician_id: null,
        clinician_email: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) alert("Unassign failed: " + error.message);
    else {
      await logAuditEvent({
        submissionId: row.id,
        action: "clinician_unassigned",
        payload: {
          previous_clinician_id: row.clinician_id,
          previous_clinician_email: row.clinician_email,
        },
      });
      fetchRows();
    }
  };

  const exportCSV = () => {
    const headers = [
      "submitted_at",
      "first_name",
      "surname",
      "email",
      "status",
      "spt_ready",
      "high_risk",
      "flags",
      "symptoms",
      "food_triggers",
      "clinician_email",
    ];
    const lines = [headers.join(",")];
    filtered.forEach((r) => {
      const row = [
        new Date(r.created_at).toISOString(),
        safe(r.first_name),
        safe(r.surname),
        safe(r.email),
        safe(r.status),
        r.spt_ready ? "yes" : "no",
        r.high_risk ? "yes" : "no",
        arr(r.flags),
        arr(r.symptoms),
        arr(r.food_triggers),
        safe(r.clinician_email || ""),
      ];
      lines.push(row.map(csvEscape).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `submissions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = page + 1 < totalPages;

  return (
    <div style={wrap}>
      {/* Header with actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Clinician Dashboard</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {onOpenPartner && (
            <button style={btn} onClick={onOpenPartner}>
              Partner Tools
            </button>
          )}
          <button
            style={btn}
            onClick={() => typeof window !== "undefined" && window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            ↑ Top
          </button>
          {onOpenAnalytics && (
            <button style={btn} onClick={onOpenAnalytics}>
              Admin Analytics
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={tabs}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setPage(0);
            }}
            style={{ ...tabBtn, ...(tab === t.key ? tabBtnActive : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + Actions + Pagination */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, margin: "12px 0" }}>
        <input
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={input}
        />
        <button style={btn} onClick={exportCSV}>⬇ Export CSV</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button style={btn} disabled={!canPrev} onClick={() => canPrev && setPage((p) => p - 1)}>
            ◀ Prev
          </button>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Page {page + 1} / {totalPages} {totalCount ? `• ${totalCount} total` : ""}
          </div>
          <button style={btn} disabled={!canNext} onClick={() => canNext && setPage((p) => p + 1)}>
            Next ▶
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={card}>
        {loading ? (
          <table style={table}>
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Patient</th>
                <th>Risk</th>
                <th>SPT</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </tbody>
          </table>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No submissions.</div>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Patient</th>
                <th>Risk</th>
                <th>SPT</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} onClick={() => openDetail(row)} style={{ cursor: "pointer" }}>
                  <td>{new Date(row.created_at).toLocaleString("en-GB")}</td>
                  <td>
                    <div><b>{row.first_name} {row.surname}</b></div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>{row.email}</div>
                  </td>
                  <td>
                    {row.high_risk ? <Badge color="#b91c1c">High</Badge> : <Badge color="#059669">Normal</Badge>}
                    {Array.isArray(row.flags) && row.flags.length > 0 && (
                      <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>
                        {row.flags.join(" • ")}
                      </div>
                    )}
                  </td>
                  <td>{row.spt_ready ? <Badge color="#059669">Ready</Badge> : <Badge color="#d97706">Hold</Badge>}</td>
                  <td><StatusChip value={row.status} /></td>
                  <td>
                    <div style={{ fontSize: 12 }}>
                      {row.clinician_email ? row.clinician_email : <span style={{ color: "#6b7280" }}>—</span>}
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button style={btn} onClick={() => updateStatus(row, "ready_spt")}>Mark Ready</button>
                      <button style={btn} onClick={() => updateStatus(row, "needs_review")}>Needs Review</button>
                      <button style={btn} onClick={() => updateStatus(row, "completed")}>Complete</button>
                      {row.clinician_id ? (
                        <button style={btn} onClick={() => unassign(row)}>Unassign</button>
                      ) : (
                        <button style={btn} onClick={() => assignToMe(row)}>Assign to me</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Backdrop so the panel scrolls, not the page */}
      {selected && <div style={backdrop} onClick={() => setSelected(null)} />}

      {/* Detail Panel */}
      {selected && (
        <DetailPanel
          row={selected}
          notes={notes}
          setNotes={setNotes}
          onClose={() => setSelected(null)}
          onUpdate={fetchRows}
        />
      )}
    </div>
  );
}

/* ---- Detail Panel ---- */
function DetailPanel({ row, notes, setNotes, onClose, onUpdate }) {
  const [auditLogs, setAuditLogs] = React.useState([]);
  const [auditLoading, setAuditLoading] = React.useState(false);

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, action, payload, occurred_at, actor_id")
      .eq("submission_id", row.id)
      .order("occurred_at", { ascending: true });
    if (error) {
      console.error("Failed to load audit logs", error);
    } else {
      setAuditLogs(data || []);
    }
    setAuditLoading(false);
  }, [row.id]);

  React.useEffect(() => {
    fetchAuditLogs();
    const ch = supabase
      .channel(`audit_logs-${row.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_logs", filter: `submission_id=eq.${row.id}` },
        fetchAuditLogs
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchAuditLogs, row.id]);

  // notes & status
  const saveNotes = async () => {
    const { error } = await supabase
      .from("submissions")
      .update({
        clinician_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) {
      alert("Failed to save: " + error.message);
      return;
    }

    await logAuditEvent({
      submissionId: row.id,
      action: "notes_updated",
      payload: {
        characters: notes.length,
      },
    });
    await fetchAuditLogs();
    onUpdate();
  };

  const updateStatus = async (next) => {
    const { error } = await supabase
      .from("submissions")
      .update({
        status: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) {
      alert("Update failed: " + error.message);
      return;
    }

    await logAuditEvent({
      submissionId: row.id,
      action: "status_changed",
      payload: {
        from: row.status,
        to: next,
        surface: "detail_panel",
      },
    });
    await fetchAuditLogs();
    onUpdate();
  };

  // scheduling state + loaders
  const [appointments, setAppointments] = React.useState([]);
  const [startAt, setStartAt] = React.useState("");
  const [endAt, setEndAt] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [apptNotes, setApptNotes] = React.useState("");

  const fetchAppointments = useCallback(async () => {
    const { data, error } = await supabase
      .from("appointments")
      .select("id, created_at, start_at, end_at, location, notes")
      .eq("submission_id", row.id)
      .order("start_at", { ascending: true });
    if (!error) setAppointments(data || []);
  }, [row.id]);

  React.useEffect(() => {
    fetchAppointments();
    const ch = supabase
      .channel(`appointments-${row.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `submission_id=eq.${row.id}` },
        fetchAppointments
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchAppointments, row.id]);

  const createAppointment = async () => {
    if (!startAt || !endAt) {
      alert("Please set start and end.");
      return;
    }
    const user = (await supabase.auth.getUser()).data.user;
    const { error } = await supabase.from("appointments").insert([
      {
        submission_id: row.id,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        location: location || null,
        notes: apptNotes || null,
        created_by: user?.id ?? null,
      },
    ]);
    if (error) {
      alert("Failed to create: " + error.message);
      return;
    }
    setLocation("");
    setApptNotes("");
    fetchAppointments();
  };

  const downloadICS = (appt) => {
    const start = new Date(appt.start_at);
    const end = new Date(appt.end_at);
    const { error, value } = createEvent({
      title: `AllergyPath Appointment – ${row.first_name} ${row.surname}`,
      start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
      end: [end.getFullYear(), end.getMonth() + 1, end.getDate(), end.getHours(), end.getMinutes()],
      location: appt.location || "",
      description: [
        `Patient: ${row.first_name} ${row.surname}`,
        `Email: ${row.email}`,
        row.most_severe_reaction ? `Hx: ${row.most_severe_reaction}` : "",
        appt.notes ? `Notes: ${appt.notes}` : "",
      ].filter(Boolean).join("\n"),
      status: "CONFIRMED",
    });
    if (error) {
      alert("ICS error: " + error.message);
      return;
    }
    const blob = new Blob([value], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fname = `AllergyPath_${row.first_name}_${row.surname}_${format(start, "yyyyMMdd_HHmm")}.ics`;
    a.href = url;
    a.download = fname.replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  };

  // comments thread
  const [comments, setComments] = React.useState([]);
  const [newComment, setNewComment] = React.useState("");

  const fetchComments = useCallback(async () => {
    const { data, error } = await supabase
      .from("comments")
      .select("id, created_at, author_email, body")
      .eq("submission_id", row.id)
      .order("created_at", { ascending: false });
    if (!error) setComments(data || []);
  }, [row.id]);

  React.useEffect(() => {
    fetchComments();
    const ch = supabase
      .channel(`comments-${row.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `submission_id=eq.${row.id}` },
        fetchComments
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchComments, row.id]);

  const addComment = async () => {
    if (!newComment.trim()) return;
    const user = (await supabase.auth.getUser()).data.user;
    const { error } = await supabase.from("comments").insert([
      {
        submission_id: row.id,
        author_id: user?.id ?? null,
        author_email: user?.email ?? null,
        body: newComment.trim(),
      },
    ]);
    if (error) {
      alert("Failed to comment: " + error.message);
      return;
    }
    setNewComment("");
    fetchComments();
  };

  return (
    <div style={panel}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>{row.first_name} {row.surname}</h2>
        <button onClick={onClose} style={btn}>Close ✖</button>
      </div>

      <p style={{ color: "#6b7280" }}>{row.email}</p>

      {/* Summary */}
      <h4>Symptoms</h4>
      <p>{Array.isArray(row.symptoms) ? row.symptoms.join(", ") : row.symptoms}</p>

      <h4>Most Severe Reaction</h4>
      <p>{row.most_severe_reaction}</p>

      <h4>Triggers</h4>
      <p>{Array.isArray(row.food_triggers) ? row.food_triggers.join(", ") : row.food_triggers}</p>

      <h4>Flags</h4>
      <p>{Array.isArray(row.flags) ? row.flags.join(" • ") : "—"}</p>

      {/* Notes */}
      <h4>Clinician Notes</h4>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Enter notes here..."
        style={{ width: "100%", minHeight: 80, borderRadius: 8, border: "1px solid #ddd", padding: 8, marginBottom: 8 }}
      />
      <button onClick={saveNotes} style={btn}>Save Notes</button>

      {/* Status */}
      <h4>Update Status</h4>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => updateStatus("ready_spt")} style={btn}>Mark Ready</button>
        <button onClick={() => updateStatus("needs_review")} style={btn}>Needs Review</button>
        <button onClick={() => updateStatus("completed")} style={btn}>Complete</button>
      </div>

      {/* Audit timeline */}
      <h4 style={{ marginTop: 16 }}>Audit timeline</h4>
      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, marginBottom: 8 }}>
        {auditLoading ? (
          <div style={{ color: "#6b7280" }}>Loading history…</div>
        ) : auditLogs.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No activity recorded yet.</div>
        ) : (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {auditLogs.map((log, index) => (
              <li
                key={log.id}
                style={{
                  padding: "6px 0",
                  borderBottom: index === auditLogs.length - 1 ? "none" : "1px solid #f3f4f6",
                }}
              >
                <div style={{ fontWeight: 600 }}>{describeAuditAction(log)}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {new Date(log.occurred_at).toLocaleString("en-GB")} • {auditActorLabel(log)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Scheduling */}
      <h4 style={{ marginTop: 16 }}>Schedule appointment</h4>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <Label>Start</Label>
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} style={input} />
        </div>
        <div>
          <Label>End</Label>
          <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} style={input} />
        </div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <div>
          <Label>Location</Label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Clinic room 3, 1st floor" style={input} />
        </div>
        <div>
          <Label>Notes</Label>
          <textarea value={apptNotes} onChange={(e) => setApptNotes(e.target.value)} placeholder="Any pre-visit instructions" style={{ ...input, minHeight: 70 }} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={createAppointment} style={btn}>Create appointment</button>
        </div>
      </div>

      {appointments.length > 0 && (
        <>
          <h4 style={{ marginTop: 12 }}>Appointments</h4>
          <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
            {appointments.map((a) => (
              <div key={a.id} style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>
                  {format(new Date(a.start_at), "EEE d MMM yyyy HH:mm")} – {format(new Date(a.end_at), "HH:mm")}
                </div>
                {a.location && <div style={{ color: "#6b7280" }}>📍 {a.location}</div>}
                {a.notes && <div style={{ color: "#6b7280" }}>🗒 {a.notes}</div>}
                <div>
                  <button onClick={() => downloadICS(a)} style={btn}>Download .ics</button>
                </div>
                <hr style={{ border: 0, borderTop: "1px solid #eee" }} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Comments thread */}
      <h4 style={{ marginTop: 16 }}>Clinician thread</h4>
      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, marginBottom: 8 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a note visible to clinicians"
            style={{ ...input, minHeight: 70 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addComment} style={btn}>Post</button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          {comments.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No comments yet.</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {c.author_email || "Unknown"} • {new Date(c.created_at).toLocaleString("en-GB")}
                </div>
                <div>{c.body}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Skeleton row for loading state
function SkeletonRow() {
  const shimmer = {
    height: 10,
    width: "100%",
    borderRadius: 6,
    background: "linear-gradient(90deg, #eceff3, #f5f7fa 40%, #eceff3 80%)",
    backgroundSize: "200% 100%",
    animation: "ap-shimmer 1.2s linear infinite",
  };
  return (
    <tr>
      <td><div style={{ ...shimmer, width: 140 }} /></td>
      <td>
        <div style={{ ...shimmer, width: 160, marginBottom: 6 }} />
        <div style={{ ...shimmer, width: 140 }} />
      </td>
      <td><div style={{ ...shimmer, width: 70 }} /></td>
      <td><div style={{ ...shimmer, width: 60 }} /></td>
      <td><div style={{ ...shimmer, width: 100 }} /></td>
      <td><div style={{ ...shimmer, width: 120 }} /></td>
      <td><div style={{ ...shimmer, width: 240 }} /></td>
    </tr>
  );
}

// Tiny helper used above
function Label({ children }) {
  return <div style={{ fontSize: 14, marginBottom: 6 }}>{children}</div>;
}

/* ---- tiny presentational bits ---- */
function Badge({ children, color }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 12, color: "white", background: color }}>
      {children}
    </span>
  );
}
function StatusChip({ value }) {
  const map = {
    new: { label: "New", bg: "#6b7280" },
    ready_spt: { label: "Ready for SPT", bg: "#059669" },
    needs_review: { label: "Needs Review", bg: "#d97706" },
    completed: { label: "Completed", bg: "#2563eb" },
  };
  const m = map[value] || map.new;
  return <Badge color={m.bg}>{m.label}</Badge>;
}

function describeAuditAction(log) {
  const payload = log && typeof log.payload === "object" && log.payload !== null ? log.payload : {};
  switch (log.action) {
    case "status_changed":
      return `Status changed from ${payload.from || "unknown"} to ${payload.to || "unknown"}`;
    case "assigned_to_clinician":
      return `Assigned to ${payload.clinician_email || payload.clinician_id || "clinician"}`;
    case "clinician_unassigned":
      return "Clinician unassigned";
    case "notes_updated": {
      const suffix = typeof payload.characters === "number" ? ` (${payload.characters} chars)` : "";
      return `Clinical notes updated${suffix}`;
    }
    default:
      return log.action.replace(/_/g, " ");
  }
}

function auditActorLabel(log) {
  const payload = log && typeof log.payload === "object" && log.payload !== null ? log.payload : {};
  return (
    payload.actor_email ||
    payload.clinician_email ||
    payload.assigned_to ||
    (log.actor_id ? `User ${log.actor_id}` : "System")
  );
}

/* ---- styles ---- */
const wrap = { maxWidth: 1000, margin: "24px auto", fontFamily: "system-ui, sans-serif" };
const input = { padding: 10, border: "1px solid #ddd", borderRadius: 10, width: "100%" };
const card = { border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "var(--card)" };
const table = { width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" };
const tabs = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 };
const tabBtn = { padding: "6px 10px", borderRadius: 999, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };
const tabBtnActive = { border: "1px solid #111827", background: "#111827", color: "#fff" };
const btn = { padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };

// Backdrop so the panel scrolls, not the page
const backdrop = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", zIndex: 999 };

const panel = {
  position: "fixed",
  top: 0,
  right: 0,
  width: 380,
  height: "100vh",
  background: "#fff",
  borderLeft: "1px solid #ddd",
  padding: 20,
  boxShadow: "-2px 0 8px rgba(0,0,0,0.1)",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
  zIndex: 1000,
};

/* ---- CSV helpers ---- */
function safe(v) { return (v ?? "").toString(); }
function arr(a) { return Array.isArray(a) ? a.join("|") : safe(a); }
function csvEscape(s) { return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
