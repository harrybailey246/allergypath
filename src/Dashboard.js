// src/Dashboard.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { format } from "date-fns";
import { supabase } from "./supabaseClient";
import { createAppointmentICS } from "./utils/calendar";
import { getSignedUrl } from "./storage";
import AttachmentRow from "./components/AttachmentRow";

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
  const [pendingOpen, setPendingOpen] = useState(null);
  const [detailAction, setDetailAction] = useState(null);
  const openFetchAttempted = useRef(false);
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);

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

  const openDetail = useCallback((row, action = null) => {
    setSelected(row);
    setNotes(row.clinician_notes || "");
    setDetailAction(action);
  }, []);

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
    if (searchParams.has("action")) {
      searchParams.delete("action");
      searchChanged = true;
    }

    let nextHash = hash;
    if (hash.includes("?")) {
      const [hashPath, queryString] = hash.split("?");
      const hashParams = new URLSearchParams(queryString);
      if (hashParams.has("open")) {
        hashParams.delete("open");
        hashChanged = true;
      }
      if (hashParams.has("action")) {
        hashParams.delete("action");
        hashChanged = true;
      }
      nextHash = hashParams.toString() ? `${hashPath}?${hashParams.toString()}` : hashPath;
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
    const searchAction = searchParams.get("action");
    if (searchOpen) return { id: searchOpen, action: searchAction };

    const hash = window.location.hash || "";
    if (!hash.includes("?")) return null;
    const [, queryString] = hash.split("?");
    if (!queryString) return null;
    const hashParams = new URLSearchParams(queryString);
    const hashOpen = hashParams.get("open");
    if (!hashOpen) return null;
    return { id: hashOpen, action: hashParams.get("action") };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleNavigation = () => {
      const target = parseOpenParam();
      if (!target) return;
      setPendingOpen((prev) => {
        if (prev?.id === target.id && prev?.action === target.action) return prev;
        return target;
      });
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
    if (!pendingOpen) return;

    const match = rows.find((r) => String(r.id) === String(pendingOpen.id));
    if (match) {
      openDetail(match, pendingOpen.action || null);
      clearOpenParam();
      setPendingOpen(null);
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
        .eq("id", pendingOpen.id)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        openDetail(data, pendingOpen.action || null);
      }
      clearOpenParam();
      setPendingOpen(null);
      openFetchAttempted.current = false;
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingOpen, rows, clearOpenParam, openDetail]);

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
          onClose={() => {
            setSelected(null);
            setDetailAction(null);
          }}
          onUpdate={fetchRows}
          notifyStatusUpdated={notifyStatusUpdated}
          showToast={showToast}
          initialAction={detailAction}
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
    </div>
  );
}

/* ---- Detail Panel ---- */
function DetailPanel({ row, notes, setNotes, onClose, onUpdate, notifyStatusUpdated, showToast, initialAction }) {
  // notes & status
  const saveNotes = async () => {
    const { error } = await supabase
      .from("submissions")
      .update({
        clinician_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) alert("Failed to save: " + error.message);
    else onUpdate();
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
      onUpdate();
      notifyStatusUpdated(data, data?.status ?? next);
    }
  };

  const attachments = React.useMemo(
    () => (Array.isArray(row.attachments) ? row.attachments.filter(Boolean) : []),
    [row.attachments]
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

  // scheduling state + loaders
  const [appointments, setAppointments] = React.useState([]);
  const [appointmentRequests, setAppointmentRequests] = React.useState([]);
  const [startAt, setStartAt] = React.useState("");
  const [endAt, setEndAt] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [apptNotes, setApptNotes] = React.useState("");

  const nextRecommendation = planSnapshot?.next_recommendation || null;

  const openDoseEditor = React.useCallback(
    (dose) => {
      setActiveDoseId(dose.id || null);
      hydrateDoseForm(dose);
    },
    [hydrateDoseForm]
  );

  const handleDoseFieldChange = (field) => (event) => {
    const value = event.target.value;
    setDoseForm((prev) => ({ ...prev, [field]: value }));
  };

  const clearDoseForm = React.useCallback(() => {
    setActiveDoseId(null);
    hydrateDoseForm(null);
  }, [hydrateDoseForm]);

  const saveDoseAdjustment = React.useCallback(async () => {
    if (!activeDoseId) {
      showToast?.("error", "Select a dose to update.");
      return;
    }

    let plannedValue = null;
    let administeredValue = null;
    if (doseForm.plannedDose.trim() !== "") {
      plannedValue = Number(doseForm.plannedDose);
      if (Number.isNaN(plannedValue)) {
        showToast?.("error", "Planned dose must be numeric.");
        return;
      }
    }
    if (doseForm.administeredDose.trim() !== "") {
      administeredValue = Number(doseForm.administeredDose);
      if (Number.isNaN(administeredValue)) {
        showToast?.("error", "Administered dose must be numeric.");
        return;
      }
    }

    setDoseSaving(true);
    try {
      const payload = {
        planned_dose: plannedValue,
        administered_dose: administeredValue,
        scheduled_at: doseForm.scheduledAt ? new Date(doseForm.scheduledAt).toISOString() : null,
        administered_at: doseForm.administeredAt ? new Date(doseForm.administeredAt).toISOString() : null,
        lot_number: doseForm.lotNumber || null,
        lot_expiration_date: doseForm.lotExpiry || null,
      };
      const { error } = await supabase
        .from("immunotherapy_doses")
        .update(payload)
        .eq("id", activeDoseId);
      if (error) throw error;
      showToast?.("success", "Dose updated");
      await fetchPlan();
    } catch (err) {
      console.error("update dose", err);
      showToast?.("error", err instanceof Error ? err.message : "Failed to update dose");
    } finally {
      setDoseSaving(false);
    }
  }, [activeDoseId, doseForm, showToast, fetchPlan]);

  const applyRecommendation = React.useCallback(() => {
    if (!nextRecommendation) return;
    const nextId = nextRecommendation.dose_id || null;
    setActiveDoseId(nextId);
    const target = Array.isArray(planSnapshot?.doses)
      ? planSnapshot.doses.find((dose) => dose.id === nextId) || nextRecommendation
      : nextRecommendation;
    hydrateDoseForm(target);
    if (nextRecommendation.scheduled_at) {
      setStartAt(toLocalDateTimeInput(nextRecommendation.scheduled_at));
    }
    showToast?.("success", "Applied next dose recommendation.");
  }, [nextRecommendation, planSnapshot, hydrateDoseForm, showToast, toLocalDateTimeInput]);

  React.useEffect(() => {
    if (!initialAction) return;
    if (initialAction === "adjust-dose" && nextRecommendation) {
      const nextId = nextRecommendation.dose_id || null;
      setActiveDoseId(nextId);
      const target = Array.isArray(planSnapshot?.doses)
        ? planSnapshot.doses.find((dose) => dose.id === nextId) || nextRecommendation
        : nextRecommendation;
      hydrateDoseForm(target);
    }
    if (initialAction === "reschedule" && nextRecommendation?.scheduled_at) {
      setStartAt(toLocalDateTimeInput(nextRecommendation.scheduled_at));
    }
  }, [initialAction, nextRecommendation, planSnapshot, hydrateDoseForm, toLocalDateTimeInput]);

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
    if (!startAt || !endAt) {
      alert("Please set start and end.");
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    const { data: appointment, error } = await supabase
      .from("appointments")
      .insert([
        {
          submission_id: row.id,
          start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(),
          location: location || null,
          notes: apptNotes || null,
          created_by: user?.id ?? null,
        },
      ])
      .select("id,start_at,end_at,location,notes")
      .single();
    if (error) {
      alert("Failed to create: " + error.message);
      return;
    }
    setLocation("");
    setApptNotes("");
    fetchAppointments();
    try {
      const appointmentPayload =
        appointment ?? {
          id: "",
          start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(),
          location: location || null,
          notes: apptNotes || null,
        };
      const { error: notifyError } = await supabase.functions.invoke("notify-email", {
        body: {
          type: "appointment_created",
          submission: {
            id: row.id,
            first_name: row.first_name,
            surname: row.surname,
            email: row.email,
            clinician_email: row.clinician_email,
          },
          appointment: appointmentPayload,
          actorEmail: user?.email ?? null,
        },
      });
      if (notifyError) throw notifyError;
    } catch (err) {
      console.error("notify-email appointment_created failed", err);
      showToast?.("error", "Appointment created, but email notification failed to send.");
    }
  };

  const updateRequestStatus = async (request, status) => {
    const { error, data: updated } = await supabase
      .from("appointment_requests")
      .update({
        status,
        handled_at: status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", request.id)
      .select("id, appointment_id, request_type, message, status, patient_email, handled_at")
      .single();
    if (error) {
      alert("Failed to update request: " + error.message);
    } else {
      fetchAppointmentRequests();
      if (!updated) return;
      const appointment =
        updated.appointment_id && appointments
          ? appointments.find((a) => String(a.id) === String(updated.appointment_id)) || null
          : null;
      try {
        const { data: authData } = await supabase.auth.getUser();
        const actorEmail = authData?.user?.email ?? null;
        const { error: notifyError } = await supabase.functions.invoke("notify-email", {
          body: {
            type: "appointment_request_resolved",
            submission: {
              id: row.id,
              first_name: row.first_name,
              surname: row.surname,
              email: row.email,
              clinician_email: row.clinician_email,
            },
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
      const { blob, filename } = createAppointmentICS(appt, row);
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

  const planDetails = planSnapshot?.plan || null;
  const planDoses = Array.isArray(planSnapshot?.doses) ? planSnapshot.doses : [];

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

      {attachments.length > 0 && (
        <>
          <h4>Attachments</h4>
          {attachmentsLoading && <p style={{ color: "#6b7280" }}>Preparing attachments…</p>}
          {attachmentsErrored && (
            <p style={{ color: "#b91c1c", fontSize: 12 }}>
              Some attachments couldn’t be prepared. Try again below.
            </p>
          )}
          <div style={{ display: "grid", gap: 6 }}>
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
        </>
      )}

      <h4 style={{ marginTop: 16 }}>Immunotherapy plan</h4>
      {planLoading ? (
        <div style={{ color: "#6b7280" }}>Loading immunotherapy plan…</div>
      ) : planError ? (
        <div style={{ color: "#b91c1c", border: "1px solid #fecaca", background: "#fee2e2", padding: 10, borderRadius: 8 }}>
          {planError}
        </div>
      ) : planDetails ? (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{planDetails.regimen_stage}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Status: {planDetails.status}</div>
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              Progress: {planDetails.completed_doses ?? 0}/{planDetails.planned_total_doses ?? "—"}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Allowed gap: {planDetails.allowed_gap_days ?? "—"} days
            {planDetails.recommended_gap_action && (
              <>
                {" • "}
                {planDetails.recommended_gap_action}
              </>
            )}
          </div>
          {planSnapshot?.overdue_count > 0 && (
            <div style={{ color: "#b91c1c", fontSize: 12 }}>
              ⚠️ {planSnapshot.overdue_count} dose{planSnapshot.overdue_count === 1 ? "" : "s"} overdue
            </div>
          )}
          {nextRecommendation && (
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 600 }}>Next dose #{nextRecommendation.dose_number}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>
                {nextRecommendation.scheduled_at
                  ? `Scheduled ${new Date(nextRecommendation.scheduled_at).toLocaleString("en-GB")}`
                  : "Scheduling pending"}
              </div>
              {nextRecommendation.gap_flag && (
                <div style={{ color: "#b91c1c", fontSize: 12 }}>
                  🚨 Gap flagged ({nextRecommendation.gap_days ?? "?"} days)
                </div>
              )}
              <div>{nextRecommendation.recommendation}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={applyRecommendation} style={btn}>Apply recommendation</button>
              </div>
            </div>
          )}
          <div>
            <h5 style={{ margin: "4px 0" }}>Recorded doses</h5>
            {planDoses.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: 12 }}>No doses tracked yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {planDoses.map((dose) => (
                  <div
                    key={dose.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 10,
                      background: activeDoseId === dose.id ? "#f0f9ff" : "white",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ fontWeight: 600 }}>Dose #{dose.dose_number}</div>
                      <button style={{ ...btn, padding: "4px 8px", fontSize: 12 }} onClick={() => openDoseEditor(dose)}>
                        Edit
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: "#475569" }}>
                      Planned: {dose.planned_dose ?? "—"}
                      {dose.planned_dose_unit ? ` ${dose.planned_dose_unit}` : ""}
                      {dose.scheduled_at && (
                        <>
                          {" • "}
                          Scheduled {new Date(dose.scheduled_at).toLocaleString("en-GB")}
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#475569" }}>
                      Administered: {dose.administered_dose ?? "—"}
                      {dose.administered_dose_unit ? ` ${dose.administered_dose_unit}` : ""}
                      {dose.administered_at && (
                        <>
                          {" • "}
                          {new Date(dose.administered_at).toLocaleString("en-GB")}
                        </>
                      )}
                    </div>
                    {dose.gap_flag && (
                      <div style={{ color: "#b91c1c", fontSize: 12 }}>
                        ⚠️ Gap {dose.gap_days ?? "?"} days – {dose.recommendation || "Review protocol."}
                      </div>
                    )}
                    {dose.lot_number && (
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        Lot {dose.lot_number}
                        {dose.lot_expiration_date && ` (exp. ${dose.lot_expiration_date})`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h5 style={{ margin: "4px 0" }}>Dose adjustments</h5>
            {activeDoseId ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <div>
                    <Label>Scheduled</Label>
                    <input
                      type="datetime-local"
                      value={doseForm.scheduledAt}
                      onChange={handleDoseFieldChange("scheduledAt")}
                      style={input}
                    />
                  </div>
                  <div>
                    <Label>Administered at</Label>
                    <input
                      type="datetime-local"
                      value={doseForm.administeredAt}
                      onChange={handleDoseFieldChange("administeredAt")}
                      style={input}
                    />
                  </div>
                  <div>
                    <Label>Planned dose</Label>
                    <input
                      value={doseForm.plannedDose}
                      onChange={handleDoseFieldChange("plannedDose")}
                      placeholder="e.g. 0.5"
                      style={input}
                    />
                  </div>
                  <div>
                    <Label>Administered dose</Label>
                    <input
                      value={doseForm.administeredDose}
                      onChange={handleDoseFieldChange("administeredDose")}
                      placeholder="e.g. 0.4"
                      style={input}
                    />
                  </div>
                  <div>
                    <Label>Lot number</Label>
                    <input value={doseForm.lotNumber} onChange={handleDoseFieldChange("lotNumber")} style={input} />
                  </div>
                  <div>
                    <Label>Lot expiry</Label>
                    <input type="date" value={doseForm.lotExpiry} onChange={handleDoseFieldChange("lotExpiry")} style={input} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={saveDoseAdjustment}
                    style={{ ...btn, opacity: doseSaving ? 0.7 : 1 }}
                    disabled={doseSaving}
                  >
                    {doseSaving ? "Saving…" : "Save adjustments"}
                  </button>
                  <button onClick={clearDoseForm} style={btn}>Clear</button>
                </div>
              </div>
            ) : (
              <div style={{ color: "#6b7280", fontSize: 12 }}>Select a dose above to edit dosing details.</div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ color: "#6b7280" }}>No immunotherapy plan linked yet.</div>
      )}

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
  const [planSnapshot, setPlanSnapshot] = React.useState(null);
  const [planLoading, setPlanLoading] = React.useState(false);
  const [planError, setPlanError] = React.useState(null);
  const [activeDoseId, setActiveDoseId] = React.useState(null);
  const [doseForm, setDoseForm] = React.useState({
    scheduledAt: "",
    administeredAt: "",
    plannedDose: "",
    administeredDose: "",
    lotNumber: "",
    lotExpiry: "",
  });
  const [doseSaving, setDoseSaving] = React.useState(false);

  const toLocalDateTimeInput = React.useCallback((value) => {
    if (!value) return "";
    try {
      return format(new Date(value), "yyyy-MM-dd'T'HH:mm");
    } catch (err) {
      return "";
    }
  }, []);

  const hydrateDoseForm = React.useCallback(
    (dose) => {
      if (!dose) {
        setDoseForm({
          scheduledAt: "",
          administeredAt: "",
          plannedDose: "",
          administeredDose: "",
          lotNumber: "",
          lotExpiry: "",
        });
        return;
      }
      setDoseForm({
        scheduledAt: toLocalDateTimeInput(dose.scheduled_at),
        administeredAt: toLocalDateTimeInput(dose.administered_at),
        plannedDose: dose.planned_dose !== null && dose.planned_dose !== undefined ? String(dose.planned_dose) : "",
        administeredDose:
          dose.administered_dose !== null && dose.administered_dose !== undefined
            ? String(dose.administered_dose)
            : "",
        lotNumber: dose.lot_number || "",
        lotExpiry: dose.lot_expiration_date || "",
      });
    },
    [toLocalDateTimeInput]
  );

  const fetchPlan = React.useCallback(async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const { data, error } = await supabase.rpc("immunotherapy_plan_snapshot", { submission_id: row.id });
      if (error) throw error;
      setPlanSnapshot(data);
      if (!data) {
        setActiveDoseId(null);
        hydrateDoseForm(null);
        return;
      }
      if (data?.next_recommendation) {
        const nextId = data.next_recommendation.dose_id || null;
        setActiveDoseId((prev) => (prev === null ? nextId : prev));
        const target = Array.isArray(data?.doses)
          ? data.doses.find((dose) => dose.id === nextId) || data.next_recommendation
          : data.next_recommendation;
        if (activeDoseId === null || activeDoseId === nextId) {
          hydrateDoseForm(target);
        }
      } else if (activeDoseId === null) {
        hydrateDoseForm(null);
      }
    } catch (err) {
      console.error("plan snapshot", err);
      setPlanSnapshot(null);
      setActiveDoseId(null);
      hydrateDoseForm(null);
      setPlanError(err instanceof Error ? err.message : "Unable to load immunotherapy plan.");
    } finally {
      setPlanLoading(false);
    }
  }, [row.id, hydrateDoseForm, activeDoseId]);

  React.useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  React.useEffect(() => {
    const channel = supabase
      .channel(`immunotherapy-${row.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "immunotherapy_doses", filter: `submission_id=eq.${row.id}` },
        fetchPlan
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "immunotherapy_plans", filter: `submission_id=eq.${row.id}` },
        fetchPlan
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPlan, row.id]);
