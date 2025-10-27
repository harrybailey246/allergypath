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

const PRE_AUTH_STATUS_OPTIONS = [
  { value: "not_requested", label: "Not requested" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "pending", label: "Pending review" },
  { value: "needs_info", label: "Needs info" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
  { value: "cancelled", label: "Cancelled" },
];

const PRE_AUTH_REQUEST_TYPES = [
  { value: "initial", label: "Initial request" },
  { value: "continuation", label: "Continuation" },
  { value: "appeal", label: "Appeal" },
  { value: "retroactive", label: "Retroactive" },
  { value: "other", label: "Other" },
];

const PRE_AUTH_REQUEST_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
  { value: "needs_info", label: "Needs info" },
  { value: "cancelled", label: "Cancelled" },
];

const NOTE_TEMPLATES = [
  {
    key: "initial_pre_auth",
    label: "Initial pre-auth summary",
    body: `Patient: {{patient_name}} (DOB: {{patient_dob}})\nPayer: {{payer_name}}\nPolicy: {{policy_number}}\nStatus: {{pre_auth_status}}\n\nClinical summary:\n{{clinician_notes}}\n\nRequested treatment:\n{{request_summary}}`,
  },
  {
    key: "appeal_follow_up",
    label: "Appeal follow-up",
    body: `Following up on pre-authorisation reference {{latest_payer_reference}} for {{patient_name}}.\nCurrent status: {{latest_pre_auth_status}}.\nPayer response: {{response_notes}}.\n\nAdditional clinical justification:\n{{clinician_notes}}`,
  },
  {
    key: "approval_confirmation",
    label: "Approval confirmation",
    body: `Payer {{payer_name}} has approved pre-authorisation reference {{latest_payer_reference}} for {{patient_name}}.\nDecision received: {{response_received_at}}.\nAuthorisation notes:\n{{response_notes}}`,
  },
];

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
        "id,created_at,first_name,surname,email,flags,spt_ready,high_risk,status,symptoms,food_triggers,clinician_notes,attachments,clinician_id,clinician_email,payer_name,payer_reference,payer_phone,payer_email,policy_holder,policy_number,policy_group,policy_effective_date,policy_expiration_date,pre_auth_status,pre_auth_reference,pre_auth_last_checked",
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
          onClose={() => setSelected(null)}
          onUpdate={fetchRows}
          notifyStatusUpdated={notifyStatusUpdated}
          showToast={showToast}
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
function DetailPanel({ row, notes, setNotes, onClose, onUpdate, notifyStatusUpdated, showToast }) {
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

  const defaultInsurance = React.useMemo(
    () => ({
      payer_name: row.payer_name || "",
      payer_reference: row.payer_reference || "",
      payer_phone: row.payer_phone || "",
      payer_email: row.payer_email || "",
      policy_holder: row.policy_holder || "",
      policy_number: row.policy_number || "",
      policy_group: row.policy_group || "",
      policy_effective_date: row.policy_effective_date || "",
      policy_expiration_date: row.policy_expiration_date || "",
      pre_auth_status: row.pre_auth_status || "not_requested",
      pre_auth_reference: row.pre_auth_reference || "",
      pre_auth_last_checked: row.pre_auth_last_checked || null,
    }),
    [row]
  );

  const [insurance, setInsurance] = React.useState(defaultInsurance);
  const [insuranceLoading, setInsuranceLoading] = React.useState(true);
  const [insuranceDirty, setInsuranceDirty] = React.useState(false);
  const [savingInsurance, setSavingInsurance] = React.useState(false);

  React.useEffect(() => {
    setInsurance(defaultInsurance);
    setInsuranceDirty(false);
  }, [defaultInsurance]);

  React.useEffect(() => {
    let active = true;
    (async () => {
      setInsuranceLoading(true);
      const { data, error } = await supabase
        .from("submissions")
        .select(
          "payer_name,payer_reference,payer_phone,payer_email,policy_holder,policy_number,policy_group,policy_effective_date,policy_expiration_date,pre_auth_status,pre_auth_reference,pre_auth_last_checked"
        )
        .eq("id", row.id)
        .single();
      if (!active) return;
      if (!error && data) {
        setInsurance({
          payer_name: data.payer_name || "",
          payer_reference: data.payer_reference || "",
          payer_phone: data.payer_phone || "",
          payer_email: data.payer_email || "",
          policy_holder: data.policy_holder || "",
          policy_number: data.policy_number || "",
          policy_group: data.policy_group || "",
          policy_effective_date: data.policy_effective_date || "",
          policy_expiration_date: data.policy_expiration_date || "",
          pre_auth_status: data.pre_auth_status || "not_requested",
          pre_auth_reference: data.pre_auth_reference || "",
          pre_auth_last_checked: data.pre_auth_last_checked || null,
        });
        setInsuranceDirty(false);
      }
      setInsuranceLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [row.id]);

  const updateInsuranceField = React.useCallback((field, value) => {
    setInsurance((prev) => ({ ...prev, [field]: value }));
    setInsuranceDirty(true);
  }, []);

  const markPreAuthChecked = React.useCallback(() => {
    updateInsuranceField("pre_auth_last_checked", new Date().toISOString());
  }, [updateInsuranceField]);

  const saveInsurance = React.useCallback(async () => {
    if (!insurance) return;
    setSavingInsurance(true);
    const payload = {
      payer_name: insurance.payer_name || null,
      payer_reference: insurance.payer_reference || null,
      payer_phone: insurance.payer_phone || null,
      payer_email: insurance.payer_email || null,
      policy_holder: insurance.policy_holder || null,
      policy_number: insurance.policy_number || null,
      policy_group: insurance.policy_group || null,
      policy_effective_date: insurance.policy_effective_date || null,
      policy_expiration_date: insurance.policy_expiration_date || null,
      pre_auth_status: insurance.pre_auth_status || "not_requested",
      pre_auth_reference: insurance.pre_auth_reference || null,
      pre_auth_last_checked: insurance.pre_auth_last_checked
        ? new Date(insurance.pre_auth_last_checked).toISOString()
        : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("submissions")
      .update(payload)
      .eq("id", row.id);
    if (error) {
      alert("Failed to save insurance: " + error.message);
    } else {
      setInsuranceDirty(false);
      showToast?.("success", "Insurance details saved.");
      onUpdate();
    }
    setSavingInsurance(false);
  }, [insurance, onUpdate, row.id, showToast]);

  const [preAuthRequests, setPreAuthRequests] = React.useState([]);
  const [preAuthLoading, setPreAuthLoading] = React.useState(true);
  const [requestEdits, setRequestEdits] = React.useState({});
  const [savingPreAuth, setSavingPreAuth] = React.useState(false);
  const [newPreAuth, setNewPreAuth] = React.useState({
    request_type: "initial",
    status: "draft",
    summary: "",
    body: "",
    payer_reference: "",
  });

  const fetchPreAuthRequests = React.useCallback(async () => {
    setPreAuthLoading(true);
    const { data, error } = await supabase
      .from("submission_pre_auth_requests")
      .select(
        "id,submission_id,request_type,requested_at,requested_by_email,status,status_notes,request_payload,payer_reference,response_notes,response_received_at,updated_at"
      )
      .eq("submission_id", row.id)
      .order("requested_at", { ascending: false });
    if (!error) {
      setPreAuthRequests(data || []);
    }
    setPreAuthLoading(false);
  }, [row.id]);

  React.useEffect(() => {
    fetchPreAuthRequests();
    const ch = supabase
      .channel(`pre-auth-${row.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submission_pre_auth_requests",
          filter: `submission_id=eq.${row.id}`,
        },
        fetchPreAuthRequests
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchPreAuthRequests, row.id]);

  React.useEffect(() => {
    setRequestEdits((prev) => {
      const next = { ...prev };
      const ids = new Set(preAuthRequests.map((r) => r.id));
      Object.keys(next).forEach((id) => {
        if (!ids.has(id)) delete next[id];
      });
      preAuthRequests.forEach((req) => {
        if (!next[req.id]) {
          next[req.id] = {
            status: req.status,
            status_notes: req.status_notes || "",
            response_notes: req.response_notes || "",
            response_received_at: req.response_received_at ? toInputDateTime(req.response_received_at) : "",
            payer_reference: req.payer_reference || "",
          };
        }
      });
      return next;
    });
  }, [preAuthRequests]);

  const handleRequestEditChange = React.useCallback((id, field, value) => {
    setRequestEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }, []);

  const saveRequestEdit = React.useCallback(
    async (request) => {
      const edit = requestEdits[request.id];
      if (!edit) return;
      const payload = {
        status: edit.status,
        status_notes: edit.status_notes || null,
        response_notes: edit.response_notes || null,
        payer_reference: edit.payer_reference || null,
        response_received_at: edit.response_received_at
          ? new Date(edit.response_received_at).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("submission_pre_auth_requests")
        .update(payload)
        .eq("id", request.id);
      if (error) {
        alert("Failed to update pre-auth request: " + error.message);
      } else {
        fetchPreAuthRequests();
        showToast?.("success", "Pre-auth request updated.");
      }
    },
    [fetchPreAuthRequests, requestEdits, showToast]
  );

  const resetNewPreAuth = React.useCallback(() => {
    setNewPreAuth({
      request_type: "initial",
      status: "draft",
      summary: "",
      body: "",
      payer_reference: "",
    });
  }, []);

  const saveNewPreAuth = React.useCallback(async () => {
    if (savingPreAuth) return;
    setSavingPreAuth(true);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user || null;
    const insert = {
      submission_id: row.id,
      request_type: newPreAuth.request_type,
      status: newPreAuth.status,
      status_notes: newPreAuth.summary || null,
      request_payload: newPreAuth.body ? { body: newPreAuth.body } : null,
      payer_reference: newPreAuth.payer_reference || null,
      requested_by: user?.id ?? null,
      requested_by_email: user?.email ?? null,
    };
    const { error } = await supabase.from("submission_pre_auth_requests").insert([insert]);
    if (error) {
      alert("Failed to log pre-auth request: " + error.message);
    } else {
      resetNewPreAuth();
      fetchPreAuthRequests();
      showToast?.("success", "Pre-auth request logged.");
    }
    setSavingPreAuth(false);
  }, [fetchPreAuthRequests, newPreAuth, resetNewPreAuth, row.id, savingPreAuth, showToast]);

  const [claimNotes, setClaimNotes] = React.useState([]);
  const [claimNotesLoading, setClaimNotesLoading] = React.useState(true);
  const [claimNoteDraft, setClaimNoteDraft] = React.useState("");
  const [selectedTemplateKey, setSelectedTemplateKey] = React.useState("");
  const [savingClaimNote, setSavingClaimNote] = React.useState(false);

  const fetchClaimNotes = React.useCallback(async () => {
    setClaimNotesLoading(true);
    const { data, error } = await supabase
      .from("submission_claim_notes")
      .select("id,note,template_key,created_at,author_email")
      .eq("submission_id", row.id)
      .order("created_at", { ascending: false });
    if (!error) setClaimNotes(data || []);
    setClaimNotesLoading(false);
  }, [row.id]);

  React.useEffect(() => {
    fetchClaimNotes();
    const ch = supabase
      .channel(`claim-notes-${row.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submission_claim_notes",
          filter: `submission_id=eq.${row.id}`,
        },
        fetchClaimNotes
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchClaimNotes, row.id]);

  const applyTemplateToDraft = React.useCallback(
    (templateKey) => {
      const template = NOTE_TEMPLATES.find((t) => t.key === templateKey);
      if (!template) return;
      setClaimNoteDraft(
        renderTemplate(
          template.body,
          buildTemplateContext({ row, insurance, notes, preAuthRequests, draft: newPreAuth })
        )
      );
    },
    [insurance, newPreAuth, notes, preAuthRequests, row]
  );

  const handleTemplateSelect = React.useCallback(
    (key) => {
      setSelectedTemplateKey(key);
      if (key) applyTemplateToDraft(key);
    },
    [applyTemplateToDraft]
  );

  const reapplyTemplate = React.useCallback(() => {
    if (selectedTemplateKey) applyTemplateToDraft(selectedTemplateKey);
  }, [applyTemplateToDraft, selectedTemplateKey]);

  const saveClaimNote = React.useCallback(async () => {
    if (!claimNoteDraft.trim()) return;
    setSavingClaimNote(true);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user || null;
    const insert = {
      submission_id: row.id,
      note: claimNoteDraft.trim(),
      template_key: selectedTemplateKey || null,
      author_id: user?.id ?? null,
      author_email: user?.email ?? null,
    };
    const { error } = await supabase.from("submission_claim_notes").insert([insert]);
    if (error) {
      alert("Failed to save claim note: " + error.message);
    } else {
      setClaimNoteDraft("");
      setSelectedTemplateKey("");
      fetchClaimNotes();
      showToast?.("success", "Claim note saved.");
    }
    setSavingClaimNote(false);
  }, [claimNoteDraft, fetchClaimNotes, row.id, selectedTemplateKey, showToast]);

  const [healthcodeExports, setHealthcodeExports] = React.useState([]);
  const [healthcodeLoading, setHealthcodeLoading] = React.useState(true);

  const fetchHealthcodeExports = React.useCallback(async () => {
    setHealthcodeLoading(true);
    const { data, error } = await supabase
      .from("submission_healthcode_exports")
      .select(
        "id,batch_id,export_status,exported_at,response,audit_reference,error,healthcode_export_batches(status,exported_at,audit_signed_url,submission_count)"
      )
      .eq("submission_id", row.id)
      .order("exported_at", { ascending: false });
    if (!error) setHealthcodeExports(data || []);
    setHealthcodeLoading(false);
  }, [row.id]);

  React.useEffect(() => {
    fetchHealthcodeExports();
    const ch = supabase
      .channel(`healthcode-exports-${row.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submission_healthcode_exports",
          filter: `submission_id=eq.${row.id}`,
        },
        fetchHealthcodeExports
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchHealthcodeExports, row.id]);

  const markResponseNow = React.useCallback(
    (id) => {
      handleRequestEditChange(id, "response_received_at", toInputDateTime(new Date().toISOString()));
    },
    [handleRequestEditChange]
  );

  // scheduling state + loaders
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

      <h4>Insurance & payer</h4>
      {insuranceLoading ? (
        <p style={{ color: "#6b7280" }}>Loading payer profile…</p>
      ) : (
        <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginBottom: 12, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <Label>Payer name</Label>
              <input
                value={insurance.payer_name}
                onChange={(e) => updateInsuranceField("payer_name", e.target.value)}
                placeholder="Allianz, Bupa, AXA…"
                style={input}
              />
            </div>
            <div>
              <Label>Payer phone</Label>
              <input
                value={insurance.payer_phone}
                onChange={(e) => updateInsuranceField("payer_phone", e.target.value)}
                placeholder="Customer service line"
                style={input}
              />
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <Label>Payer email</Label>
              <input
                value={insurance.payer_email}
                onChange={(e) => updateInsuranceField("payer_email", e.target.value)}
                placeholder="claims@example.com"
                style={input}
              />
            </div>
            <div>
              <Label>Payer reference</Label>
              <input
                value={insurance.payer_reference}
                onChange={(e) => updateInsuranceField("payer_reference", e.target.value)}
                placeholder="Account or portal reference"
                style={input}
              />
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <Label>Policy holder</Label>
              <input
                value={insurance.policy_holder}
                onChange={(e) => updateInsuranceField("policy_holder", e.target.value)}
                placeholder="Parent / guardian"
                style={input}
              />
            </div>
            <div>
              <Label>Policy number</Label>
              <input
                value={insurance.policy_number}
                onChange={(e) => updateInsuranceField("policy_number", e.target.value)}
                placeholder="Policy number"
                style={input}
              />
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <Label>Policy group</Label>
              <input
                value={insurance.policy_group}
                onChange={(e) => updateInsuranceField("policy_group", e.target.value)}
                placeholder="Employer / plan group"
                style={input}
              />
            </div>
            <div>
              <Label>Pre-auth reference</Label>
              <input
                value={insurance.pre_auth_reference}
                onChange={(e) => updateInsuranceField("pre_auth_reference", e.target.value)}
                placeholder="Authorisation ref"
                style={input}
              />
            </div>
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <Label>Policy effective date</Label>
              <input
                type="date"
                value={insurance.policy_effective_date || ""}
                onChange={(e) => updateInsuranceField("policy_effective_date", e.target.value)}
                style={input}
              />
            </div>
            <div>
              <Label>Policy expiry</Label>
              <input
                type="date"
                value={insurance.policy_expiration_date || ""}
                onChange={(e) => updateInsuranceField("policy_expiration_date", e.target.value)}
                style={input}
              />
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <Label>Pre-authorisation status</Label>
              <select
                value={insurance.pre_auth_status}
                onChange={(e) => updateInsuranceField("pre_auth_status", e.target.value)}
                style={{ ...input, appearance: "auto" }}
              >
                {PRE_AUTH_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>
                Last checked: {insurance.pre_auth_last_checked ? formatDateTime(insurance.pre_auth_last_checked) : "Never"}
              </span>
              <button onClick={markPreAuthChecked} style={{ ...btn, padding: "4px 8px" }}>Mark reviewed</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={saveInsurance}
              style={btn}
              disabled={!insuranceDirty || savingInsurance}
            >
              {savingInsurance ? "Saving…" : "Save payer details"}
            </button>
          </div>
        </div>
      )}

      <h4>Pre-authorisation requests</h4>
      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <Label>Request type</Label>
              <select
                value={newPreAuth.request_type}
                onChange={(e) => setNewPreAuth((prev) => ({ ...prev, request_type: e.target.value }))}
                style={{ ...input, appearance: "auto" }}
              >
                {PRE_AUTH_REQUEST_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select
                value={newPreAuth.status}
                onChange={(e) => setNewPreAuth((prev) => ({ ...prev, status: e.target.value }))}
                style={{ ...input, appearance: "auto" }}
              >
                {PRE_AUTH_REQUEST_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label>Payer reference</Label>
            <input
              value={newPreAuth.payer_reference}
              onChange={(e) => setNewPreAuth((prev) => ({ ...prev, payer_reference: e.target.value }))}
              placeholder="Reference supplied to payer"
              style={input}
            />
          </div>
          <div>
            <Label>Summary</Label>
            <textarea
              value={newPreAuth.summary}
              onChange={(e) => setNewPreAuth((prev) => ({ ...prev, summary: e.target.value }))}
              placeholder="Clinical summary sent to payer"
              style={{ ...input, minHeight: 70 }}
            />
          </div>
          <div>
            <Label>Request body</Label>
            <textarea
              value={newPreAuth.body}
              onChange={(e) => setNewPreAuth((prev) => ({ ...prev, body: e.target.value }))}
              placeholder="Exact wording or upload summary of request"
              style={{ ...input, minHeight: 90 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveNewPreAuth} style={btn} disabled={savingPreAuth}>
              {savingPreAuth ? "Saving…" : "Log pre-auth request"}
            </button>
            <button onClick={resetNewPreAuth} style={btn} type="button">
              Reset
            </button>
          </div>
        </div>
        {preAuthLoading ? (
          <p style={{ color: "#6b7280" }}>Loading request history…</p>
        ) : preAuthRequests.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No pre-authorisation activity yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {preAuthRequests.map((request) => {
              const edit = requestEdits[request.id] || {
                status: request.status,
                status_notes: request.status_notes || "",
                response_notes: request.response_notes || "",
                response_received_at: request.response_received_at
                  ? toInputDateTime(request.response_received_at)
                  : "",
                payer_reference: request.payer_reference || "",
              };
              const requestBody = request.request_payload && typeof request.request_payload === "object"
                ? request.request_payload.body || null
                : null;
              return (
                <div key={request.id} style={{ border: "1px solid #f3f4f6", borderRadius: 8, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b7280" }}>
                    <span>
                      {request.request_type.toUpperCase()} • Logged {formatDateTime(request.requested_at) || "—"}
                    </span>
                    <span>{request.requested_by_email || "Unknown"}</span>
                  </div>
                  {request.status_notes && <div style={{ marginTop: 6 }}>{request.status_notes}</div>}
                  {requestBody && (
                    <pre
                      style={{
                        marginTop: 8,
                        background: "#f9fafb",
                        padding: 8,
                        borderRadius: 6,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {requestBody}
                    </pre>
                  )}
                  <div style={{ display: "grid", gap: 8, marginTop: 10, gridTemplateColumns: "1fr 1fr" }}>
                    <div>
                      <Label>Status</Label>
                      <select
                        value={edit.status}
                        onChange={(e) => handleRequestEditChange(request.id, "status", e.target.value)}
                        style={{ ...input, appearance: "auto" }}
                      >
                        {PRE_AUTH_REQUEST_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Payer reference</Label>
                      <input
                        value={edit.payer_reference}
                        onChange={(e) => handleRequestEditChange(request.id, "payer_reference", e.target.value)}
                        placeholder="Reference from payer"
                        style={input}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Label>Status notes</Label>
                    <textarea
                      value={edit.status_notes}
                      onChange={(e) => handleRequestEditChange(request.id, "status_notes", e.target.value)}
                      style={{ ...input, minHeight: 60 }}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Label>Payer response</Label>
                    <textarea
                      value={edit.response_notes}
                      onChange={(e) => handleRequestEditChange(request.id, "response_notes", e.target.value)}
                      placeholder="Decision, outstanding info, etc."
                      style={{ ...input, minHeight: 60 }}
                    />
                  </div>
                  <div style={{ display: "grid", gap: 8, marginTop: 8, gridTemplateColumns: "1fr auto" }}>
                    <div>
                      <Label>Response received</Label>
                      <input
                        type="datetime-local"
                        value={edit.response_received_at}
                        onChange={(e) => handleRequestEditChange(request.id, "response_received_at", e.target.value)}
                        style={input}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button onClick={() => markResponseNow(request.id)} style={btn}>Now</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                    <button onClick={() => saveRequestEdit(request)} style={btn}>
                      Save update
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <h4>Claim notes & templates</h4>
      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <Label>Template</Label>
            <select
              value={selectedTemplateKey}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              style={{ ...input, appearance: "auto" }}
            >
              <option value="">Select a template…</option>
              {NOTE_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Generated note</Label>
            <textarea
              value={claimNoteDraft}
              onChange={(e) => setClaimNoteDraft(e.target.value)}
              placeholder="Compose claim correspondence"
              style={{ ...input, minHeight: 120 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reapplyTemplate} style={btn} disabled={!selectedTemplateKey}>
              Reapply template
            </button>
            <button onClick={saveClaimNote} style={btn} disabled={!claimNoteDraft.trim() || savingClaimNote}>
              {savingClaimNote ? "Saving…" : "Save claim note"}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          {claimNotesLoading ? (
            <p style={{ color: "#6b7280" }}>Loading claim notes…</p>
          ) : claimNotes.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No claim notes recorded yet.</div>
          ) : (
            claimNotes.map((note) => {
              const templateLabel = NOTE_TEMPLATES.find((t) => t.key === note.template_key)?.label || note.template_key;
              return (
                <div key={note.id} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {note.author_email || "Unknown"} • {formatDateTime(note.created_at) || "—"}
                    {templateLabel && (
                      <span style={{ marginLeft: 6, color: "#2563eb" }}>Template: {templateLabel}</span>
                    )}
                  </div>
                  <pre style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{note.note}</pre>
                </div>
              );
            })
          )}
        </div>
      </div>

      <h4>Healthcode export history</h4>
      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        {healthcodeLoading ? (
          <p style={{ color: "#6b7280" }}>Loading export history…</p>
        ) : healthcodeExports.length === 0 ? (
          <div style={{ color: "#6b7280" }}>This submission has not been exported yet.</div>
        ) : (
          healthcodeExports.map((entry) => {
            const batch = entry.healthcode_export_batches || {};
            const batchPrefix = entry.batch_id ? entry.batch_id.slice(0, 8) : "—";
            const exportStatus = entry.export_status ? entry.export_status.toUpperCase() : "UNKNOWN";
            return (
              <div key={entry.id} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Batch {batchPrefix} • {exportStatus} • {formatDateTime(entry.exported_at) || "—"}
                </div>
                {batch.status && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    Batch status: {batch.status} ({batch.submission_count || 0} submissions)
                  </div>
                )}
                {entry.error && (
                  <div style={{ color: "#b91c1c", marginTop: 4 }}>Error: {entry.error}</div>
                )}
                {entry.response && (
                  <pre style={{ whiteSpace: "pre-wrap", marginTop: 6, background: "#f9fafb", padding: 8, borderRadius: 6 }}>
                    {JSON.stringify(entry.response, null, 2)}
                  </pre>
                )}
                {batch.audit_signed_url && (
                  <div style={{ marginTop: 6 }}>
                    <a href={batch.audit_signed_url} target="_blank" rel="noopener noreferrer">
                      Download audit file
                    </a>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Notes */}
      <h4>Internal clinician notes</h4>
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

function buildTemplateContext({ row, insurance, notes, preAuthRequests, draft }) {
  const latest = Array.isArray(preAuthRequests) && preAuthRequests.length > 0 ? preAuthRequests[0] : null;
  const patientName = `${row.first_name || ""} ${row.surname || ""}`.trim() || row.email || "Patient";
  const draftSummary = draft?.summary || "";
  const draftReference = draft?.payer_reference || "";
  return {
    patient_name: patientName,
    patient_email: row.email || "",
    patient_dob: row.date_of_birth || row.dob || "",
    payer_name: insurance?.payer_name || "",
    policy_number: insurance?.policy_number || "",
    policy_holder: insurance?.policy_holder || "",
    policy_group: insurance?.policy_group || "",
    pre_auth_status: insurance?.pre_auth_status || "not_requested",
    request_summary: draftSummary || latest?.status_notes || "",
    clinician_notes: notes || row.clinician_notes || "",
    latest_payer_reference: draftReference || latest?.payer_reference || insurance?.pre_auth_reference || "",
    latest_pre_auth_status: latest?.status || "",
    response_notes: latest?.response_notes || "",
    response_received_at: latest?.response_received_at ? formatDateTime(latest.response_received_at) : "",
  };
}

function renderTemplate(body, context) {
  if (!body) return "";
  return body.replace(/{{(.*?)}}/g, (_, key) => {
    const value = context[String(key).trim()];
    return value == null ? "" : String(value);
  });
}

function formatDateTime(value) {
  if (!value) return "";
  try {
    return format(new Date(value), "d MMM yyyy HH:mm");
  } catch (_err) {
    return value;
  }
}

function toInputDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (v) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ---- CSV helpers ---- */
function safe(v) { return (v ?? "").toString(); }
function arr(a) { return Array.isArray(a) ? a.join("|") : safe(a); }
function csvEscape(s) { return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
