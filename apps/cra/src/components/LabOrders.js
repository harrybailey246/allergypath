import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(17, 24, 39, 0.45)",
  display: "flex",
  justifyContent: "center",
  alignItems: "stretch",
  zIndex: 9999,
};

const panel = {
  width: "min(1100px, 96vw)",
  background: "#fff",
  borderRadius: 14,
  margin: "20px 0",
  padding: 24,
  overflow: "auto",
  boxShadow: "0 20px 45px rgba(15, 23, 42, 0.25)",
  fontFamily: "system-ui, sans-serif",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const sectionCard = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  background: "#f9fafb",
};

const inputStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle = { fontSize: 12, fontWeight: 600, color: "#374151", textTransform: "uppercase" };
const buttonStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 12px",
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  textTransform: "capitalize",
  background: "#e5e7eb",
  color: "#111827",
};

const statusColors = {
  draft: "#9ca3af",
  submitted: "#2563eb",
  in_transit: "#7c3aed",
  results_received: "#059669",
  results_reviewed: "#047857",
  retransmit_requested: "#d97706",
  cancelled: "#dc2626",
};

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch (_err) {
    return value;
  }
}

function formatDuration(start, end) {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours}h ${remMins}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

function StatusBadge({ status, count }) {
  const color = statusColors[status] || "#374151";
  return (
    <span
      style={{
        ...badgeStyle,
        background: color,
        color: "#fff",
        gap: 6,
      }}
    >
      {status.replace(/_/g, " ")}
      {typeof count === "number" && (
        <span
          style={{
            background: "rgba(255,255,255,0.2)",
            padding: "2px 6px",
            borderRadius: 999,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {count}
        </span>
      )}
    </span>
  );
}

function Toast({ tone, message }) {
  const background = tone === "error" ? "#fee2e2" : tone === "success" ? "#dcfce7" : "#e0f2fe";
  const border = tone === "error" ? "#ef4444" : tone === "success" ? "#16a34a" : "#0ea5e9";
  return (
    <div
      style={{
        border: `1px solid ${border}`,
        background,
        borderRadius: 10,
        padding: "8px 12px",
        color: "#111827",
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}

export default function LabOrders({ onClose, clinician }) {
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [form, setForm] = useState({
    submissionId: "",
    orderType: "Allergen Panel",
    priority: "routine",
    vendor: "LabCorp",
    notes: "",
    externalOrderId: "",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [err, setErr] = useState("");

  const showToast = useCallback((tone, message) => {
    setToast({ tone, message });
  }, []);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    setErr("");
    const { data, error } = await supabase
      .from("lab_orders")
      .select("*, events:lab_order_events(*)")
      .order("ordered_at", { ascending: false })
      .order("occurred_at", { ascending: false, foreignTable: "events" })
      .limit(100);
    if (error) {
      console.error(error);
      setErr(error.message || "Failed to load lab orders");
      setOrders([]);
    } else {
      setOrders(data || []);
    }
    setLoadingOrders(false);
  }, []);

  const loadSubmissions = useCallback(async () => {
    setLoadingSubmissions(true);
    const { data, error } = await supabase
      .from("submissions")
      .select("id, first_name, surname, email, date_of_birth")
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) {
      console.error(error);
    }
    setSubmissions(data || []);
    setLoadingSubmissions(false);
  }, []);

  useEffect(() => {
    loadOrders();
    loadSubmissions();
  }, [loadOrders, loadSubmissions]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const submissionOptions = useMemo(() => {
    return submissions.map((s) => ({
      id: s.id,
      label: `${s.first_name || ""} ${s.surname || ""}`.trim() || s.email || s.id,
      email: s.email,
      date_of_birth: s.date_of_birth,
    }));
  }, [submissions]);

  const selectedSubmission = useMemo(
    () => submissionOptions.find((s) => s.id === form.submissionId) || null,
    [submissionOptions, form.submissionId]
  );

  const statusSummary = useMemo(() => {
    const counts = orders.reduce((acc, order) => {
      const key = order.order_status || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  const handleFormChange = (evt) => {
    const { name, value } = evt.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateOrder = async (evt) => {
    evt.preventDefault();
    if (saving) return;
    if (!form.submissionId) {
      showToast("error", "Select a patient submission before creating an order.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const patientLabel = selectedSubmission?.label || "";
      const metadata = form.notes ? { notes: form.notes } : {};
      const { data: inserted, error: insertError } = await supabase
        .from("lab_orders")
        .insert({
          submission_id: form.submissionId,
          patient_full_name: patientLabel,
          patient_email: selectedSubmission?.email || null,
          patient_date_of_birth: selectedSubmission?.date_of_birth || null,
          order_type: form.orderType || null,
          priority: form.priority || "routine",
          vendor: form.vendor || null,
          metadata,
          ordering_clinician_id: clinician?.id || null,
          ordering_clinician_email: clinician?.email || null,
          external_order_id: form.externalOrderId || null,
        })
        .select("id")
        .single();

      if (insertError || !inserted) throw new Error(insertError?.message || "Failed to create order");

      const { error: submitError } = await supabase.functions.invoke("lab-order-connector", {
        body: {
          action: "submit",
          orderId: inserted.id,
          vendor: form.vendor || null,
          metadata,
          actorEmail: clinician?.email || null,
          externalOrderId: form.externalOrderId || null,
        },
      });

      if (submitError) throw new Error(submitError.message || "Connector failed to submit order");

      showToast("success", "Lab order submitted to connector.");
      setForm({
        submissionId: "",
        orderType: "Allergen Panel",
        priority: "routine",
        vendor: form.vendor,
        notes: "",
        externalOrderId: "",
      });
      await loadOrders();
    } catch (error) {
      console.error(error);
      showToast("error", error.message || "Unable to submit order");
    } finally {
      setSaving(false);
    }
  };

  const handleRetransmit = async (orderId) => {
    setBusyOrderId(orderId);
    try {
      const { error } = await supabase.functions.invoke("lab-order-connector", {
        body: {
          action: "retransmit",
          orderId,
          actorEmail: clinician?.email || null,
        },
      });
      if (error) throw new Error(error.message || "Failed to request retransmission");
      showToast("info", "Retransmission requested");
      await loadOrders();
    } catch (error) {
      console.error(error);
      showToast("error", error.message || "Retransmission failed");
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleMarkResults = async (orderId) => {
    setBusyOrderId(orderId);
    const now = new Date().toISOString();
    try {
      const { error } = await supabase.functions.invoke("lab-order-connector", {
        body: {
          action: "status-update",
          orderId,
          status: "results_received",
          resultReceivedAt: now,
          actorEmail: clinician?.email || null,
        },
      });
      if (error) throw new Error(error.message || "Failed to update status");
      showToast("success", "Results marked as received");
      await loadOrders();
    } catch (error) {
      console.error(error);
      showToast("error", error.message || "Unable to mark results");
    } finally {
      setBusyOrderId(null);
    }
  };

  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Lab Orders</h2>
            <div style={{ color: "#6b7280", fontSize: 13 }}>
              Submit orders to partner labs, monitor statuses, and action connector requests.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={buttonStyle} onClick={loadOrders} disabled={loadingOrders}>
              {loadingOrders ? "Refreshing…" : "Refresh"}
            </button>
            <button style={buttonStyle} onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {toast && <Toast tone={toast.tone} message={toast.message} />}
        {err && (
          <div style={{ color: "#b91c1c", fontSize: 13 }}>⚠️ {err}</div>
        )}

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)" }}>
          <div style={sectionCard}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Create order</div>
            <form onSubmit={handleCreateOrder} style={{ display: "grid", gap: 12 }}>
              <label style={labelStyle} htmlFor="submissionId">
                Patient submission
              </label>
              <select
                id="submissionId"
                name="submissionId"
                value={form.submissionId}
                onChange={handleFormChange}
                style={inputStyle}
                disabled={loadingSubmissions}
              >
                <option value="">{loadingSubmissions ? "Loading…" : "Select patient"}</option>
                {submissionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} • {s.email || "No email"}
                  </option>
                ))}
              </select>

              {selectedSubmission && (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  DOB: {selectedSubmission.date_of_birth || "—"} • Email: {selectedSubmission.email || "—"}
                </div>
              )}

              <label style={labelStyle} htmlFor="orderType">
                Order type
              </label>
              <input
                id="orderType"
                name="orderType"
                value={form.orderType}
                onChange={handleFormChange}
                style={inputStyle}
                placeholder="e.g. ImmunoCAP panel"
              />

              <label style={labelStyle} htmlFor="priority">
                Priority
              </label>
              <select id="priority" name="priority" value={form.priority} onChange={handleFormChange} style={inputStyle}>
                <option value="routine">Routine</option>
                <option value="stat">STAT</option>
                <option value="urgent">Urgent</option>
              </select>

              <label style={labelStyle} htmlFor="vendor">
                Vendor
              </label>
              <input
                id="vendor"
                name="vendor"
                value={form.vendor}
                onChange={handleFormChange}
                style={inputStyle}
                placeholder="Lab vendor"
              />

              <label style={labelStyle} htmlFor="externalOrderId">
                External order ID
              </label>
              <input
                id="externalOrderId"
                name="externalOrderId"
                value={form.externalOrderId}
                onChange={handleFormChange}
                style={inputStyle}
                placeholder="Optional – use vendor accession"
              />

              <label style={labelStyle} htmlFor="notes">
                Notes / metadata
              </label>
              <textarea
                id="notes"
                name="notes"
                value={form.notes}
                onChange={handleFormChange}
                style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                placeholder="Include collection instructions, panels, CPT codes, etc."
              />

              <button type="submit" style={{ ...buttonStyle, background: "#111827", color: "white" }} disabled={saving}>
                {saving ? "Submitting…" : "Submit order"}
              </button>
            </form>
          </div>

          <div style={sectionCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600 }}>Recent lab orders</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {statusSummary.map((row) => (
                  <StatusBadge key={row.status} status={row.status} count={row.count} />
                ))}
              </div>
            </div>

            {loadingOrders ? (
              <div style={{ color: "#6b7280", fontSize: 14, marginTop: 12 }}>Loading orders…</div>
            ) : orders.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: 14, marginTop: 12 }}>No lab orders yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                {orders.map((order) => {
                  const tat = formatDuration(order.ordered_at, order.result_received_at);
                  const events = Array.isArray(order.events)
                    ? [...order.events].sort(
                        (a, b) => new Date(b.occurred_at || b.created_at || 0) - new Date(a.occurred_at || a.created_at || 0)
                      )
                    : [];
                  return (
                    <div key={order.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "white" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{order.patient_full_name || order.patient_email || "Unknown patient"}</div>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>
                            Ordered {formatDate(order.ordered_at)} • {order.order_type || "Unspecified"} • Vendor {order.vendor || "—"}
                          </div>
                          {order.external_order_id && (
                            <div style={{ color: "#6b7280", fontSize: 12 }}>External ID: {order.external_order_id}</div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <StatusBadge status={order.order_status || "draft"} />
                          {tat && <div style={{ fontSize: 12, color: "#10b981" }}>TAT {tat}</div>}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <button
                          style={buttonStyle}
                          onClick={() => handleRetransmit(order.id)}
                          disabled={busyOrderId === order.id}
                        >
                          🔄 Retransmit
                        </button>
                        {order.order_status !== "results_received" && (
                          <button
                            style={{ ...buttonStyle, background: "#10b981", color: "white" }}
                            onClick={() => handleMarkResults(order.id)}
                            disabled={busyOrderId === order.id}
                          >
                            ✅ Mark results received
                          </button>
                        )}
                      </div>

                      {events.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 }}>
                            Event timeline
                          </div>
                          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                            {events.map((event) => (
                              <div
                                key={event.id}
                                style={{
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 8,
                                  padding: "6px 10px",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                                    {event.event_type.replace(/_/g, " ")}
                                  </div>
                                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                                    {formatDate(event.occurred_at || event.created_at)} • {event.event_status || "—"}
                                  </div>
                                  {event.note && <div style={{ fontSize: 12, color: "#4b5563" }}>{event.note}</div>}
                                </div>
                                {event.external_event_id && (
                                  <div style={{ fontSize: 12, color: "#6b7280" }}>#{event.external_event_id}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
