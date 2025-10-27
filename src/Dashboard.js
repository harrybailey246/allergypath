// src/Dashboard.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { format } from "date-fns";
import { supabase } from "./supabaseClient";
import { createAppointmentICS } from "./utils/calendar";
import { getSignedUrl, getActionPlanUrl, uploadActionPlan, deleteActionPlan } from "./storage";
import AttachmentRow from "./components/AttachmentRow";
import LabOrders from "./components/LabOrders";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "ready_spt", label: "Ready for SPT" },
  { key: "needs_review", label: "Needs Review" },
  { key: "completed", label: "Completed" },
  { key: "my", label: "My queue" },
];

const PAGE_SIZE = 50;

export default function Dashboard({
  isAdmin,
  onOpenAdminSettings,
  onOpenAnalytics,
  onOpenPartner,
  onOpenSchedule,
}) {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("new");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [me, setMe] = useState(null);
  const [pendingOpenId, setPendingOpenId] = useState(null);
  const openFetchAttempted = useRef(false);
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  const [complianceTasks, setComplianceTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState(null);
  const [includeResolvedTasks, setIncludeResolvedTasks] = useState(false);
  const [resolvingTaskId, setResolvingTaskId] = useState(null);
  const [labOrdersOpen, setLabOrdersOpen] = useState(false);

  const showToast = useCallback((tone, message) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ tone, message });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const fetchComplianceTasks = useCallback(
    async ({ refresh = false, includeClosed } = {}) => {
      const includeFlag = typeof includeClosed === "boolean" ? includeClosed : includeResolvedTasks;
      setTasksLoading(true);
      setTasksError(null);
      try {
        const { data, error } = await supabase.functions.invoke("compliance-reminders", {
          body: {
            action: refresh ? "refresh" : "list",
            includeClosed: includeFlag,
          },
        });
        if (error) throw error;
        setComplianceTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      } catch (err) {
        console.error("compliance reminders", err);
        setTasksError(err?.message || "Unable to load compliance tasks.");
      } finally {
        setTasksLoading(false);
      }
    },
    [includeResolvedTasks]
  );

  useEffect(() => {
    fetchComplianceTasks();
  }, [fetchComplianceTasks]);

  const resolveComplianceTask = useCallback(
    async (taskId, resolutionNotes = "") => {
      if (!taskId) return;
      setResolvingTaskId(taskId);
      try {
        const { data, error } = await supabase.functions.invoke("compliance-reminders", {
          body: {
            action: "resolve",
            taskId,
            resolutionNotes: resolutionNotes || null,
            resolvedBy: me?.id || null,
            includeClosed: includeResolvedTasks,
          },
        });
        if (error) throw error;
        setComplianceTasks(Array.isArray(data?.tasks) ? data.tasks : []);
        showToast("success", "Task marked as resolved.");
      } catch (err) {
        console.error("resolve compliance task", err);
        setTasksError(err?.message || "Unable to resolve task.");
        showToast("error", "Unable to resolve compliance task.");
      } finally {
        setResolvingTaskId(null);
      }
    },
    [includeResolvedTasks, me?.id, showToast]
  );

  const exportComplianceCSV = useCallback(() => {
    if (!complianceTasks.length) return;
    const headers = [
      "task_id",
      "task_type",
      "title",
      "status",
      "due_at",
      "details",
      "patient_name",
      "patient_email",
      "severity",
      "created_at",
      "resolved_at",
    ];
    const lines = [headers.join(",")];
    complianceTasks.forEach((task) => {
      const submission = task.submission || {};
      const name = `${submission.first_name || ""} ${submission.surname || ""}`.trim();
      const row = [
        safe(task.id),
        safe(task.task_type),
        safe(task.title),
        safe(task.status),
        task.due_at ? new Date(task.due_at).toISOString() : "",
        safe(task.details || ""),
        safe(name),
        safe(submission.email || ""),
        safe((task.metadata && task.metadata.severity) || ""),
        task.created_at ? new Date(task.created_at).toISOString() : "",
        task.resolved_at ? new Date(task.resolved_at).toISOString() : "",
      ];
      lines.push(row.map(csvEscape).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance_tasks_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [complianceTasks]);

  const notifyStatusUpdated = useCallback(
    async (submission, nextStatus) => {
      if (!submission) return;
      try {
        await supabase.functions.invoke("notify-email", {
          body: {
            type: "status_updated",
            submission,
            newStatus: nextStatus,
            actorEmail: me?.email || null,
          },
        });
      } catch (err) {
        console.error("notify-email invocation failed", err);
        showToast("error", "Status updated, but email notification failed to send.");
      }
    },
    [me?.email, showToast]
  );

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
        "id,created_at,first_name,surname,email,flags,spt_ready,high_risk,status,symptoms,food_triggers,clinician_notes,attachments,clinician_id,clinician_email,guardian_contacts,consent_signed_at,consent_expires_at,safeguarding_notes,safeguarding_follow_up_at,document_references",
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

  const openDetail = useCallback((row) => {
    setSelected(row);
    setNotes(row.clinician_notes || "");
  }, []);

  const openTaskSubmission = useCallback(
    (task) => {
      if (!task) return;
      const match = rows.find((r) => r.id === task.submission_id);
      if (match) {
        openDetail(match);
      } else if (task.submission_id) {
        setPendingOpenId(task.submission_id);
      }
    },
    [rows, openDetail]
  );

  const clearOpenParam = useCallback(() => {
    if (typeof window === "undefined") return;

    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash || "";
    let searchChanged = false;
    let hashChanged = false;
    if (searchParams.has("open")) {
      searchParams.delete("open");
      searchChanged = true;
    }

    let nextHash = hash;
    if (hash.includes("?")) {
      const [hashPath, queryString] = hash.split("?");
      const hashParams = new URLSearchParams(queryString);
      if (hashParams.has("open")) {
        hashParams.delete("open");
        nextHash = hashParams.toString() ? `${hashPath}?${hashParams.toString()}` : hashPath;
        hashChanged = true;
      }
    }

    if (searchChanged || hashChanged) {
      const nextSearch = searchParams.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  const parseOpenParam = useCallback(() => {
    if (typeof window === "undefined") return null;

    const searchParams = new URLSearchParams(window.location.search);
    const searchOpen = searchParams.get("open");
    if (searchOpen) return searchOpen;

    const hash = window.location.hash || "";
    if (!hash.includes("?")) return null;
    const [, queryString] = hash.split("?");
    if (!queryString) return null;
    const hashParams = new URLSearchParams(queryString);
    return hashParams.get("open");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleNavigation = () => {
      const openId = parseOpenParam();
      if (!openId) return;
      setPendingOpenId((prev) => (prev === openId ? prev : openId));
      openFetchAttempted.current = false;
    };

    handleNavigation();
    window.addEventListener("hashchange", handleNavigation);
    window.addEventListener("popstate", handleNavigation);
    return () => {
      window.removeEventListener("hashchange", handleNavigation);
      window.removeEventListener("popstate", handleNavigation);
    };
  }, [parseOpenParam]);

  useEffect(() => {
    if (!pendingOpenId) return;

    const match = rows.find((r) => String(r.id) === String(pendingOpenId));
    if (match) {
      openDetail(match);
      clearOpenParam();
      setPendingOpenId(null);
      openFetchAttempted.current = false;
      return;
    }

    if (openFetchAttempted.current) return;
    openFetchAttempted.current = true;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .eq("id", pendingOpenId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        openDetail(data);
      }
      clearOpenParam();
      setPendingOpenId(null);
      openFetchAttempted.current = false;
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingOpenId, rows, clearOpenParam, openDetail]);

  const updateStatus = async (id, next) => {
    const { data, error } = await supabase
      .from("submissions")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) alert("Failed to update: " + error.message);
    else {
      fetchRows();
      notifyStatusUpdated(data, data?.status ?? next);
    }
  };

  const assignToMe = async (row) => {
    if (!me) return alert("Please sign in first.");
    const { data, error } = await supabase
      .from("submissions")
      .update({
        clinician_id: me.id,
        clinician_email: me.email || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) alert("Assign failed: " + error.message);
    else {
      fetchRows();
      notifyStatusUpdated(data, data?.status ?? row.status);
    }
  };

  const unassign = async (row) => {
    const { data, error } = await supabase
      .from("submissions")
      .update({
        clinician_id: null,
        clinician_email: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) alert("Unassign failed: " + error.message);
    else {
      fetchRows();
      notifyStatusUpdated(data, data?.status ?? row.status);
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
          {onOpenSchedule && (
            <button style={btn} onClick={onOpenSchedule}>
              Clinician Schedule
            </button>
          )}
          {onOpenPartner && (
            <button style={btn} onClick={onOpenPartner}>
              Partner Tools
            </button>
          )}
          <button style={btn} onClick={() => setLabOrdersOpen(true)}>
            Lab Orders
          </button>
          <button
            style={btn}
            onClick={() => typeof window !== "undefined" && window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            ↑ Top
          </button>
          {isAdmin && onOpenAdminSettings && (
            <button style={btn} onClick={onOpenAdminSettings}>
              Admin Settings
            </button>
          )}
          {isAdmin && onOpenAnalytics && (
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

      {/* Compliance tasks */}
      <div style={{ ...card, marginBottom: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Compliance tasks</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              style={btn}
              onClick={() => fetchComplianceTasks({ refresh: true })}
              disabled={tasksLoading}
            >
              {tasksLoading ? "Syncing…" : "Sync tasks"}
            </button>
            <button style={btn} onClick={exportComplianceCSV} disabled={!complianceTasks.length}>
              Export report
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: "#6b7280" }}>
            <input
              type="checkbox"
              checked={includeResolvedTasks}
              onChange={(e) => {
                setIncludeResolvedTasks(e.target.checked);
                fetchComplianceTasks({ refresh: true, includeClosed: e.target.checked });
              }}
            />
            Include resolved
          </label>
          <button style={btn} onClick={() => fetchComplianceTasks()} disabled={tasksLoading}>
            Reload list
          </button>
        </div>
        {tasksError && <div style={{ color: "#b91c1c", fontSize: 12 }}>{tasksError}</div>}
        {tasksLoading && complianceTasks.length === 0 ? (
          <div style={{ color: "#6b7280" }}>Loading tasks…</div>
        ) : complianceTasks.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No outstanding tasks.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {complianceTasks.map((task) => {
              const submission = task.submission || {};
              const due = task.due_at ? new Date(task.due_at) : null;
              const dueText = due ? format(due, "EEE d MMM yyyy HH:mm") : "Not set";
              const now = new Date();
              const severity = task.metadata?.severity || (due && due < now ? "overdue" : "upcoming");
              const severityColor = severity === "overdue" ? "#b91c1c" : severity === "due_soon" ? "#d97706" : "#059669";
              const statusColor = task.status === "resolved" ? "#059669" : task.status === "pending" ? "#3b82f6" : "#d97706";
              return (
                <div key={task.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontWeight: 600 }}>{task.title}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                        {submission.first_name || submission.surname
                          ? `${submission.first_name || ""} ${submission.surname || ""}`.trim()
                          : "Unlinked submission"}
                        {task.task_type ? ` • ${task.task_type.replace(/_/g, " ")}` : ""}
                      </div>
                      {task.details && <div style={{ marginTop: 6 }}>{task.details}</div>}
                      <div style={{ fontSize: 12, color: severityColor, marginTop: 6 }}>
                        Due {dueText}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                      <Badge color={statusColor}>{task.status}</Badge>
                      <button style={btn} onClick={() => openTaskSubmission(task)}>View submission</button>
                      {task.status === "open" && (
                        <button
                          style={{ ...btn, background: "#111827", color: "#fff" }}
                          onClick={() => {
                            const notes = window.prompt("Resolution notes (optional)", "");
                            resolveComplianceTask(task.id, notes || "");
                          }}
                          disabled={resolvingTaskId === task.id}
                        >
                          {resolvingTaskId === task.id ? "Resolving…" : "Mark resolved"}
                        </button>
                      )}
                    </div>
                  </div>
                  {task.metadata?.severity === "overdue" && (
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>This task is overdue and should be prioritised.</div>
                  )}
                  {task.resolved_at && (
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Resolved at {new Date(task.resolved_at).toLocaleString("en-GB")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
                      <button style={btn} onClick={() => updateStatus(row.id, "ready_spt")}>Mark Ready</button>
                      <button style={btn} onClick={() => updateStatus(row.id, "needs_review")}>Needs Review</button>
                      <button style={btn} onClick={() => updateStatus(row.id, "completed")}>Complete</button>
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
          notifyStatusUpdated={notifyStatusUpdated}
          showToast={showToast}
          refreshTasks={fetchComplianceTasks}
        />
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            background: toast.tone === "success" ? "rgba(16, 185, 129, 0.95)" : "rgba(239, 68, 68, 0.95)",
            color: "white",
            padding: "10px 14px",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.15)",
            display: "flex",
            gap: 8,
            alignItems: "center",
            zIndex: 9999,
          }}
        >
          <span>{toast.tone === "success" ? "✅" : "⚠️"}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {labOrdersOpen && <LabOrders onClose={() => setLabOrdersOpen(false)} clinician={me} />}
    </div>
  );
}

/* ---- Detail Panel ---- */
function DetailPanel({ row, notes, setNotes, onClose, onUpdate, notifyStatusUpdated, showToast, refreshTasks }) {
  const [localRow, setLocalRow] = React.useState(row);

  React.useEffect(() => {
    setLocalRow(row);
  }, [row]);

  const saveNotes = async () => {
    const { error } = await supabase
      .from("submissions")
      .update({
        clinician_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) alert("Failed to save: " + error.message);
    else {
      setLocalRow((prev) => ({ ...prev, clinician_notes: notes }));
      onUpdate();
    }
  };

  const updateStatus = async (next) => {
    const { data, error } = await supabase
      .from("submissions")
      .update({
        status: next,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) alert("Update failed: " + error.message);
    else {
      setLocalRow((prev) => ({ ...prev, ...(data || {}), status: data?.status ?? next }));
      onUpdate();
      notifyStatusUpdated(data, data?.status ?? next);
    }
  };

  const attachments = React.useMemo(
    () => (Array.isArray(localRow.attachments) ? localRow.attachments.filter(Boolean) : []),
    [localRow.attachments]
  );
  const [attachmentState, setAttachmentState] = React.useState({});
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    setAttachmentState((prev) => {
      const next = {};
      attachments.forEach((path) => {
        if (prev[path]) next[path] = prev[path];
      });
      return next;
    });
  }, [attachments]);

  const loadAttachment = React.useCallback(async (path) => {
    try {
      const url = await getSignedUrl(path);
      if (!mountedRef.current) return;
      setAttachmentState((prev) => ({
        ...prev,
        [path]: { url, loading: false, error: null },
      }));
    } catch (err) {
      console.error("attachment download url", err);
      if (!mountedRef.current) return;
      setAttachmentState((prev) => ({
        ...prev,
        [path]: {
          url: null,
          loading: false,
          error: err?.message ? `Unable to prepare download: ${err.message}` : "Unable to prepare download.",
        },
      }));
    }
  }, []);

  React.useEffect(() => {
    if (attachments.length === 0) return;
    const missing = attachments.filter((path) => !attachmentState[path]);
    if (missing.length === 0) return;
    missing.forEach((path) => {
      setAttachmentState((prev) => ({
        ...prev,
        [path]: { url: null, loading: true, error: null },
      }));
      loadAttachment(path);
    });
  }, [attachments, attachmentState, loadAttachment]);

  const retryAttachment = React.useCallback(
    (path) => {
      setAttachmentState((prev) => ({
        ...prev,
        [path]: { url: prev[path]?.url ?? null, loading: true, error: null },
      }));
      loadAttachment(path);
    },
    [loadAttachment]
  );

  const attachmentsLoading = attachments.some((path) => attachmentState[path]?.loading);
  const attachmentsErrored = attachments.some((path) => attachmentState[path]?.error);

  const guardians = React.useMemo(
    () => (Array.isArray(localRow.guardian_contacts) ? localRow.guardian_contacts : []),
    [localRow.guardian_contacts]
  );

  const [consentSignedDraft, setConsentSignedDraft] = React.useState("");
  const [consentExpiresDraft, setConsentExpiresDraft] = React.useState("");
  const [safeguardingNotesDraft, setSafeguardingNotesDraft] = React.useState("");
  const [safeguardingFollowUpDraft, setSafeguardingFollowUpDraft] = React.useState("");
  const [documentRefsDraft, setDocumentRefsDraft] = React.useState("");
  const [savingCompliance, setSavingCompliance] = React.useState(false);

  React.useEffect(() => {
    setConsentSignedDraft(toLocalInput(localRow.consent_signed_at));
    setConsentExpiresDraft(toLocalInput(localRow.consent_expires_at));
    setSafeguardingNotesDraft(localRow.safeguarding_notes || "");
    setSafeguardingFollowUpDraft(toLocalInput(localRow.safeguarding_follow_up_at));
    setDocumentRefsDraft(
      Array.isArray(localRow.document_references) ? localRow.document_references.join("\n") : ""
    );
  }, [localRow]);

  const saveCompliance = async () => {
    setSavingCompliance(true);
    try {
      const refs = documentRefsDraft
        .split(/\r?\n|,/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
      const payload = {
        consent_signed_at: consentSignedDraft ? new Date(consentSignedDraft).toISOString() : null,
        consent_expires_at: consentExpiresDraft ? new Date(consentExpiresDraft).toISOString() : null,
        safeguarding_notes: safeguardingNotesDraft.trim() || null,
        safeguarding_follow_up_at: safeguardingFollowUpDraft
          ? new Date(safeguardingFollowUpDraft).toISOString()
          : null,
        document_references: refs,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("submissions")
        .update(payload)
        .eq("id", row.id)
        .select("*")
        .single();
      if (error) throw error;
      setLocalRow((prev) => ({ ...prev, ...(data || {}) }));
      onUpdate();
      refreshTasks?.({ refresh: true });
      showToast?.("success", "Compliance details saved.");
    } catch (err) {
      console.error("save compliance", err);
      alert("Failed to save compliance details: " + (err?.message || err));
    } finally {
      setSavingCompliance(false);
    }
  };

  const [actionPlans, setActionPlans] = React.useState([]);
  const [actionPlansLoading, setActionPlansLoading] = React.useState(false);
  const [actionPlanError, setActionPlanError] = React.useState(null);
  const [actionPlanFile, setActionPlanFile] = React.useState(null);
  const [actionPlanCategory, setActionPlanCategory] = React.useState("general");
  const [actionPlanLinks, setActionPlanLinks] = React.useState({});
  const [actionPlanUploading, setActionPlanUploading] = React.useState(false);

  const fetchActionPlans = useCallback(async () => {
    setActionPlansLoading(true);
    setActionPlanError(null);
    const { data, error } = await supabase
      .from("action_plans")
      .select("id, category, storage_path, created_at, uploaded_email, uploaded_by")
      .eq("submission_id", row.id)
      .order("created_at", { ascending: false });
    if (error) {
      setActionPlanError(error.message);
      setActionPlans([]);
    } else {
      setActionPlans(data || []);
    }
    setActionPlansLoading(false);
  }, [row.id]);

  React.useEffect(() => {
    fetchActionPlans();
    const ch = supabase
      .channel(`action-plans-${row.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "action_plans", filter: `submission_id=eq.${row.id}` },
        fetchActionPlans
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchActionPlans, row.id]);

  React.useEffect(() => {
    setActionPlanLinks((prev) => {
      const next = {};
      actionPlans.forEach((plan) => {
        next[plan.id] = prev[plan.id] || { url: null, loading: false, error: null };
      });
      return next;
    });
  }, [actionPlans]);

  const loadActionPlanLink = React.useCallback(async (plan) => {
    if (!plan) return;
    setActionPlanLinks((prev) => ({
      ...prev,
      [plan.id]: { ...(prev[plan.id] || {}), loading: true, error: null },
    }));
    try {
      const url = await getActionPlanUrl(plan.storage_path);
      setActionPlanLinks((prev) => ({
        ...prev,
        [plan.id]: { url, loading: false, error: null },
      }));
    } catch (err) {
      setActionPlanLinks((prev) => ({
        ...prev,
        [plan.id]: {
          url: null,
          loading: false,
          error: err?.message ? `Unable to prepare download: ${err.message}` : "Unable to prepare download.",
        },
      }));
    }
  }, []);

  React.useEffect(() => {
    actionPlans.forEach((plan) => {
      const entry = actionPlanLinks[plan.id];
      if (!entry || (!entry.url && !entry.loading && !entry.error)) {
        loadActionPlanLink(plan);
      }
    });
  }, [actionPlans, actionPlanLinks, loadActionPlanLink]);

  const uploadActionPlanFile = async () => {
    if (!actionPlanFile) {
      setActionPlanError("Select a file to upload.");
      return;
    }
    setActionPlanUploading(true);
    setActionPlanError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { path } = await uploadActionPlan(actionPlanFile, {
        submissionId: row.id,
        category: actionPlanCategory,
      });
      const { error } = await supabase.from("action_plans").insert([
        {
          submission_id: row.id,
          category: actionPlanCategory,
          storage_path: path,
          uploaded_by: userData?.user?.id ?? null,
          uploaded_email: userData?.user?.email ?? null,
        },
      ]);
      if (error) throw error;
      setActionPlanFile(null);
      showToast?.("success", "Action plan uploaded.");
      fetchActionPlans();
    } catch (err) {
      console.error("upload action plan", err);
      setActionPlanError(err?.message || "Unable to upload action plan.");
    } finally {
      setActionPlanUploading(false);
    }
  };

  const removeActionPlan = async (plan) => {
    if (!plan) return;
    const confirmed = window.confirm("Remove this action plan?");
    if (!confirmed) return;
    try {
      await deleteActionPlan(plan.storage_path);
    } catch (err) {
      console.error("delete action plan file", err);
    }
    const { error } = await supabase.from("action_plans").delete().eq("id", plan.id);
    if (error) {
      alert("Failed to delete action plan: " + error.message);
      return;
    }
    fetchActionPlans();
    showToast?.("success", "Action plan removed.");
  };

  const [appointments, setAppointments] = React.useState([]);
  const [appointmentRequests, setAppointmentRequests] = React.useState([]);
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

  const fetchAppointmentRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from("appointment_requests")
      .select("id, created_at, appointment_id, request_type, message, status, patient_email, handled_at")
      .eq("submission_id", row.id)
      .order("created_at", { ascending: false });
    if (!error) setAppointmentRequests(data || []);
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

  React.useEffect(() => {
    fetchAppointmentRequests();
    const ch = supabase
      .channel(`appointment-requests-${row.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointment_requests", filter: `submission_id=eq.${row.id}` },
        fetchAppointmentRequests
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchAppointmentRequests, row.id]);

  const createAppointment = async () => {
    if (!startAt || !endAt) return alert("Provide start and end times.");
    try {
      const { data, error } = await supabase
        .from("appointments")
        .insert([
          {
            submission_id: row.id,
            start_at: new Date(startAt).toISOString(),
            end_at: new Date(endAt).toISOString(),
            location: location || null,
            notes: apptNotes || null,
          },
        ])
        .select("*")
        .single();
      if (error) throw error;
      fetchAppointments();
      setStartAt("");
      setEndAt("");
      setLocation("");
      setApptNotes("");
      try {
        const { data: userData } = await supabase.auth.getUser();
        const actorEmail = userData?.user?.email || null;
        await supabase.functions.invoke("notify-email", {
          body: {
            type: "appointment_created",
            submission: localRow,
            appointment: data,
            actorEmail,
          },
        });
      } catch (err) {
        console.error("notify-email appointment_created failed", err);
        showToast?.("error", "Appointment saved, but email notification failed to send.");
      }
    } catch (error) {
      alert("Appointment error: " + (error?.message || error));
    }
  };

  const updateRequestStatus = async (request, status) => {
    const { data: updated, error } = await supabase
      .from("appointment_requests")
      .update({ status, handled_at: new Date().toISOString() })
      .eq("id", request.id)
      .select("*")
      .single();
    if (error) {
      alert("Update failed: " + error.message);
      return;
    }
    fetchAppointmentRequests();
    if (status === "resolved") {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const actorEmail = userData?.user?.email || null;
        let appointment = null;
        if (updated.appointment_id) {
          const { data: appt } = await supabase
            .from("appointments")
            .select("id, start_at, end_at, location, notes")
            .eq("id", updated.appointment_id)
            .maybeSingle();
          appointment = appt || null;
        }
        const { error: notifyError } = await supabase.functions.invoke("notify-email", {
          body: {
            type: "appointment_request_resolved",
            submission: localRow,
            request: updated,
            appointment,
            actorEmail,
          },
        });
        if (notifyError) throw notifyError;
      } catch (err) {
        console.error("notify-email appointment_request_resolved failed", err);
        showToast?.("error", "Request updated, but email notification failed to send.");
      }
    }
  };

  const downloadICS = (appt) => {
    try {
      const { blob, filename } = createAppointmentICS(appt, localRow);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("ICS error: " + (error?.message || "Unable to generate file"));
    }
  };

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
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>{localRow.first_name} {localRow.surname}</h2>
        <button onClick={onClose} style={btn}>Close ✖</button>
      </div>

      <p style={{ color: "#6b7280" }}>{localRow.email}</p>

      <h4>Symptoms</h4>
      <p>{Array.isArray(localRow.symptoms) ? localRow.symptoms.join(", ") : localRow.symptoms}</p>

      <h4>Most Severe Reaction</h4>
      <p>{localRow.most_severe_reaction}</p>

      <h4>Triggers</h4>
      <p>{Array.isArray(localRow.food_triggers) ? localRow.food_triggers.join(", ") : localRow.food_triggers}</p>

      <h4>Flags</h4>
      <p>{Array.isArray(localRow.flags) ? localRow.flags.join(" • ") : "—"}</p>

      <h4>Guardian contacts</h4>
      {guardians.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No guardian contacts recorded.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {guardians.map((g, idx) => (
            <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 600 }}>{g.name || "Unknown"}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{g.relationship || "Relationship not provided"}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                {g.phone ? `📞 ${g.phone}` : ""}
                {g.phone && g.email ? " • " : ""}
                {g.email ? `✉️ ${g.email}` : g.phone ? "" : "No contact details"}
              </div>
            </div>
          ))}
        </div>
      )}

      <h4>Consent & safeguarding</h4>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <Label>Consent signed</Label>
            <input
              type="datetime-local"
              value={consentSignedDraft}
              onChange={(e) => setConsentSignedDraft(e.target.value)}
              style={input}
            />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <Label>Consent expires</Label>
            <input
              type="datetime-local"
              value={consentExpiresDraft}
              onChange={(e) => setConsentExpiresDraft(e.target.value)}
              style={input}
            />
          </div>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <Label>Safeguarding notes</Label>
          <textarea
            value={safeguardingNotesDraft}
            onChange={(e) => setSafeguardingNotesDraft(e.target.value)}
            style={{ ...input, minHeight: 80 }}
          />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <Label>Follow-up due</Label>
          <input
            type="datetime-local"
            value={safeguardingFollowUpDraft}
            onChange={(e) => setSafeguardingFollowUpDraft(e.target.value)}
            style={input}
          />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <Label>Document references</Label>
          <textarea
            value={documentRefsDraft}
            onChange={(e) => setDocumentRefsDraft(e.target.value)}
            placeholder="One reference per line"
            style={{ ...input, minHeight: 70 }}
          />
          {Array.isArray(localRow.document_references) && localRow.document_references.length > 0 && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Current references: {localRow.document_references.join(" • ")}
            </div>
          )}
        </div>
        <div>
          <button
            onClick={saveCompliance}
            style={{ ...btn, background: "#111827", color: "#fff" }}
            disabled={savingCompliance}
          >
            {savingCompliance ? "Saving…" : "Save compliance details"}
          </button>
        </div>
      </div>

      <h4>Attachments</h4>
      {attachments.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No patient attachments.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {attachmentsLoading && <p style={{ color: "#6b7280" }}>Preparing attachments…</p>}
          {attachmentsErrored && (
            <p style={{ color: "#b91c1c", fontSize: 12 }}>
              Some attachments couldn’t be prepared. Try again below.
            </p>
          )}
          {attachments.map((path) => {
            const entry = attachmentState[path] || { url: null, loading: true, error: null };
            return (
              <AttachmentRow
                key={path}
                path={path}
                url={entry.url}
                loading={entry.loading}
                error={entry.error}
                onRetry={() => retryAttachment(path)}
                buttonStyle={btn}
              />
            );
          })}
        </div>
      )}

      <h4>Action plans</h4>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <Label>Upload new plan</Label>
          <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <select
              value={actionPlanCategory}
              onChange={(e) => setActionPlanCategory(e.target.value)}
              style={input}
            >
              <option value="general">General</option>
              <option value="anaphylaxis">Anaphylaxis</option>
              <option value="school">School</option>
              <option value="travel">Travel</option>
            </select>
            <input
              type="file"
              onChange={(e) => setActionPlanFile(e.target.files?.[0] || null)}
              style={input}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={uploadActionPlanFile}
              style={btn}
              disabled={!actionPlanFile || actionPlanUploading}
            >
              {actionPlanUploading ? "Uploading…" : "Upload"}
            </button>
            {actionPlanFile && (
              <span style={{ fontSize: 12, color: "#6b7280" }}>{actionPlanFile.name}</span>
            )}
          </div>
        </div>
        {actionPlanError && <div style={{ color: "#b91c1c", fontSize: 12 }}>{actionPlanError}</div>}
        {actionPlansLoading && <div style={{ color: "#6b7280" }}>Loading action plans…</div>}
        {!actionPlansLoading && actionPlans.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No action plans uploaded yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {actionPlans.map((plan) => {
              const entry = actionPlanLinks[plan.id] || { url: null, loading: true, error: null };
              return (
                <div key={plan.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <strong style={{ textTransform: "capitalize" }}>{plan.category}</strong>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      {new Date(plan.created_at).toLocaleString("en-GB")}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {plan.uploaded_email ? `Uploaded by ${plan.uploaded_email}` : "Uploader unknown"}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {entry.error ? (
                      <button style={btn} onClick={() => loadActionPlanLink(plan)}>Retry link</button>
                    ) : (
                      <a
                        href={entry.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          if (!entry.url) e.preventDefault();
                        }}
                        style={{
                          ...btn,
                          textDecoration: "none",
                          opacity: entry.loading ? 0.6 : 1,
                        }}
                      >
                        {entry.loading ? "Preparing…" : "Download"}
                      </a>
                    )}
                    <button style={btn} onClick={() => removeActionPlan(plan)}>Delete</button>
                  </div>
                  {entry.error && <div style={{ color: "#b91c1c", fontSize: 12 }}>{entry.error}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <h4>Clinician Notes</h4>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Enter notes here..."
        style={{ width: "100%", minHeight: 80, borderRadius: 8, border: "1px solid #ddd", padding: 8, marginBottom: 8 }}
      />
      <button onClick={saveNotes} style={btn}>Save Notes</button>

      <h4>Update Status</h4>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => updateStatus("ready_spt")} style={btn}>Mark Ready</button>
        <button onClick={() => updateStatus("needs_review")} style={btn}>Needs Review</button>
        <button onClick={() => updateStatus("completed")} style={btn}>Complete</button>
      </div>

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

      <h4 style={{ marginTop: 16 }}>Patient requests</h4>
      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, display: "grid", gap: 8 }}>
        {appointmentRequests.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No requests yet.</div>
        ) : (
          appointmentRequests.map((req) => {
            const appt = appointments.find((a) => a.id === req.appointment_id);
            return (
              <div key={req.id} style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 8, marginBottom: 4 }}>
                <div style={{ fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ textTransform: "capitalize" }}>{req.request_type}</span>
                  <Badge color={req.status === "resolved" ? "#059669" : "#d97706"}>{req.status}</Badge>
                </div>
                <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                  {new Date(req.created_at).toLocaleString("en-GB")} • {req.patient_email || "Unknown"}
                </div>
                {appt && (
                  <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                    Related appointment: {format(new Date(appt.start_at), "EEE d MMM yyyy HH:mm")}
                  </div>
                )}
                {req.message && <div style={{ marginTop: 6 }}>{req.message}</div>}
                {req.status !== "resolved" && (
                  <div style={{ marginTop: 8 }}>
                    <button onClick={() => updateRequestStatus(req, "resolved")} style={btn}>Mark resolved</button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

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

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/* ---- CSV helpers ---- */
function safe(v) { return (v ?? "").toString(); }
function arr(a) { return Array.isArray(a) ? a.join("|") : safe(a); }
function csvEscape(s) { return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
