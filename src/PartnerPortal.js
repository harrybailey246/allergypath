import React from "react";
import { supabase } from "./supabaseClient";

const gridWrap = {
  display: "grid",
  gap: 20,
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
};

const sectionStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 20,
  boxShadow: "var(--shadow)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const titleStyle = {
  margin: 0,
  fontSize: 20,
};

const muted = {
  color: "var(--muted)",
  fontSize: 13,
};

const refreshIndicatorStyle = {
  fontSize: 12,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color: "var(--muted)",
};

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
});

export default function PartnerPortal() {
  const [schedule, setSchedule] = React.useState([]);
  const [checkIns, setCheckIns] = React.useState([]);
  const [labelQueue, setLabelQueue] = React.useState([]);
  const [stock, setStock] = React.useState([]);
  const [earnings, setEarnings] = React.useState({ today: 0, week: 0, month: 0 });
  const [lastRefreshed, setLastRefreshed] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [toast, setToast] = React.useState(null);
  const toastTimeoutRef = React.useRef(null);
  const refreshInFlightRef = React.useRef(false);
  const [checkInMutatingId, setCheckInMutatingId] = React.useState(null);
  const [printingLabelId, setPrintingLabelId] = React.useState(null);
  const [restockOpen, setRestockOpen] = React.useState(false);
  const [restockItem, setRestockItem] = React.useState("");
  const [restockQuantity, setRestockQuantity] = React.useState("1");
  const [restockNotes, setRestockNotes] = React.useState("");
  const [restockSubmitting, setRestockSubmitting] = React.useState(false);

  const showToast = React.useCallback((tone, message) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ tone, message });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const loadData = React.useCallback(
    async ({ background = false } = {}) => {
      if (refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;

      if (background) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
        setError("");
      }

      try {
        const [scheduleRes, checkInsRes, labelQueueRes, stockRes, earningsRes] = await Promise.all([
          supabase
            .from("partner_today_schedule")
            .select("id,start_at,patient_name,purpose,location")
            .order("start_at", { ascending: true }),
          supabase
            .from("partner_checkins")
            .select("id,patient_name,status,arrived_at")
            .order("arrived_at", { ascending: true }),
          supabase
            .from("partner_label_queue")
            .select("id,label_code,patient_name,request_type,priority,created_at,printed_at")
            .order("created_at", { ascending: true }),
          supabase
            .from("partner_stock_levels")
            .select("id,item_name,quantity,unit,status,updated_at")
            .order("item_name", { ascending: true }),
          supabase.from("partner_earnings_summary").select("scope,amount"),
        ]);

        if (scheduleRes.error) throw scheduleRes.error;
        if (checkInsRes.error) throw checkInsRes.error;
        if (labelQueueRes.error) throw labelQueueRes.error;
        if (stockRes.error) throw stockRes.error;
        if (earningsRes.error) throw earningsRes.error;

        const summary = { today: 0, week: 0, month: 0 };
        (earningsRes.data || []).forEach((row) => {
          if (!row?.scope) return;
          const amount = Number(row.amount ?? 0);
          summary[row.scope] = Number.isFinite(amount) ? amount : 0;
        });

        setSchedule(scheduleRes.data || []);
        setCheckIns(checkInsRes.data || []);
        setLabelQueue(labelQueueRes.data || []);
        setStock(stockRes.data || []);
        setEarnings(summary);
        setLastRefreshed(new Date());
        setError("");
      } catch (e) {
        console.error("Failed to load partner tools", e);
        const message = e.message || "Failed to load partner metrics.";
        setError(message);
        if (!background) {
          setSchedule([]);
          setCheckIns([]);
          setLabelQueue([]);
          setStock([]);
          setEarnings({ today: 0, week: 0, month: 0 });
        } else {
          showToast("error", message);
        }
      } finally {
        refreshInFlightRef.current = false;
        if (background) {
          setIsRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [showToast]
  );

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      loadData({ background: true });
    }, 60000);
    return () => clearInterval(intervalId);
  }, [loadData]);

  React.useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const handleMarkReady = async (checkIn) => {
    if (!checkIn?.id) return;
    setCheckInMutatingId(checkIn.id);
    try {
      const { error } = await supabase
        .from("partner_checkins")
        .update({ status: "ready", ready_at: new Date().toISOString() })
        .eq("id", checkIn.id);
      if (error) throw error;
      setCheckIns((prev) => prev.filter((c) => c.id !== checkIn.id));
      showToast("success", `${checkIn.patient_name} marked as ready.`);
    } catch (e) {
      showToast("error", e?.message || "Unable to mark patient ready.");
    } finally {
      setCheckInMutatingId(null);
    }
  };

  const handlePrintLabel = async (label) => {
    if (!label?.id) return;
    setPrintingLabelId(label.id);
    try {
      const { error } = await supabase
        .from("partner_label_queue")
        .update({ printed_at: new Date().toISOString() })
        .eq("id", label.id);
      if (error) throw error;
      setLabelQueue((prev) => prev.filter((item) => item.id !== label.id));
      showToast("success", `Label ${label.label_code} marked as printed.`);
    } catch (e) {
      showToast("error", e?.message || "Unable to update label status.");
    } finally {
      setPrintingLabelId(null);
    }
  };

  const closeRestockModal = () => {
    setRestockOpen(false);
    setRestockItem("");
    setRestockQuantity("1");
    setRestockNotes("");
    setRestockSubmitting(false);
  };

  const submitRestockRequest = async (event) => {
    event.preventDefault();
    if (!restockItem.trim()) {
      showToast("error", "Please provide an item name.");
      return;
    }
    setRestockSubmitting(true);
    try {
      const quantityValue = Number(restockQuantity);
      const payload = {
        item_name: restockItem.trim(),
        quantity: Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : null,
        notes: restockNotes.trim() || null,
      };
      const { error } = await supabase.from("partner_restock_requests").insert([payload]);
      if (error) throw error;
      showToast("success", "Restock request submitted.");
      closeRestockModal();
    } catch (e) {
      showToast("error", e?.message || "Unable to submit restock request.");
      setRestockSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={gridWrap}>
        <section style={{ ...sectionStyle, gridColumn: "1 / -1", textAlign: "center" }}>
          <div>Loading…</div>
        </section>
      </div>
    );
  }

  return (
    <div style={gridWrap}>
      {error && (
        <section
          style={{
            ...sectionStyle,
            gridColumn: "1 / -1",
            border: "1px solid #fca5a5",
            background: "rgba(239, 68, 68, 0.08)",
          }}
        >
          <div style={{ fontWeight: 600 }}>We couldn’t refresh the latest partner metrics.</div>
          <div style={{ color: "var(--muted)" }}>{error}</div>
          <div style={{ marginTop: 12 }}>
            <button style={actionBtn} onClick={() => loadData()}>
              Retry
            </button>
          </div>
        </section>
      )}

      <section style={{ ...sectionStyle, gridColumn: "1 / -1", position: "relative" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={titleStyle}>Day Schedule</h2>
          <span
            style={{
              ...muted,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {lastRefreshed ? `Updated ${formatTime(lastRefreshed)}` : "Awaiting data"}
            {isRefreshing && <span style={refreshIndicatorStyle}>⏳ Refreshing…</span>}
          </span>
        </header>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {schedule.length === 0 ? (
            <div style={{ ...muted, fontSize: 14 }}>No appointments scheduled for today.</div>
          ) : (
            schedule.map((item) => (
              <div
                key={item.id || `${item.start_at}-${item.patient_name}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "rgba(37, 99, 235, 0.08)",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <div>
                  <strong>{formatTime(item.start_at)}</strong>
                  <div style={muted}>
                    {item.purpose}
                    {item.location ? ` • ${item.location}` : ""}
                  </div>
                </div>
                <span>{item.patient_name}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={titleStyle}>Patient Check-in</h2>
        <p style={muted}>Review arrivals and prep rooms.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {checkIns.length === 0 ? (
            <div style={{ ...muted, fontSize: 14 }}>No patients are waiting to be roomed.</div>
          ) : (
            checkIns.map((item) => (
              <div
                key={item.id || item.patient_name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(15, 23, 42, 0.04)",
                }}
              >
                <div>
                  <strong>{item.patient_name}</strong>
                  <div style={muted}>{item.status}</div>
                </div>
                <button
                  style={{ ...actionBtn, opacity: checkInMutatingId === item.id ? 0.6 : 1 }}
                  onClick={() => handleMarkReady(item)}
                  disabled={checkInMutatingId === item.id}
                >
                  {checkInMutatingId === item.id ? "Updating…" : "Mark Ready"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={titleStyle}>Label Print Queue</h2>
        <p style={muted}>Confirm details before printing.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {labelQueue.length === 0 ? (
            <div style={{ ...muted, fontSize: 14 }}>No labels are waiting to be printed.</div>
          ) : (
            labelQueue.map((item) => (
              <div
                key={item.id || item.label_code}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                }}
              >
                <strong>{item.label_code}</strong>
                <span>{item.patient_name}</span>
                <span style={muted}>{item.request_type}</span>
                <button
                  style={{ ...actionBtn, opacity: printingLabelId === item.id ? 0.6 : 1 }}
                  onClick={() => handlePrintLabel(item)}
                  disabled={printingLabelId === item.id}
                >
                  {printingLabelId === item.id ? "Printing…" : "Print Label"}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={titleStyle}>Stock Counter</h2>
        <p style={muted}>Keep critical supplies topped up.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stock.length === 0 ? (
            <div style={{ ...muted, fontSize: 14 }}>No tracked items have been configured yet.</div>
          ) : (
            stock.map((item) => (
              <div
                key={item.item_name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(37, 99, 235, 0.06)",
                }}
              >
                <div>
                  <strong>{item.item_name}</strong>
                  <div style={muted}>
                    {item.quantity} {item.unit}
                  </div>
                </div>
                <span style={{ fontWeight: 600 }}>{item.status}</span>
              </div>
            ))
          )}
        </div>
        <button style={actionBtn} onClick={() => setRestockOpen(true)}>
          Create Restock Order
        </button>
      </section>

      <section style={sectionStyle}>
        <h2 style={titleStyle}>Earnings</h2>
        <p style={muted}>Snapshot of partner payouts.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={statRow}>
            <span style={muted}>Today</span>
            <strong>{formatCurrency(earnings.today)}</strong>
          </div>
          <div style={statRow}>
            <span style={muted}>This Week</span>
            <strong>{formatCurrency(earnings.week)}</strong>
          </div>
          <div style={statRow}>
            <span style={muted}>This Month</span>
            <strong>{formatCurrency(earnings.month)}</strong>
          </div>
        </div>
        <a href="/reports/earnings" style={{ ...actionBtn, textDecoration: "none", display: "inline-block" }}>
          View Detailed Report
        </a>
      </section>

      {toast && (
        <div style={toastToneStyles(toast)}>
          <span style={{ fontWeight: 600, marginRight: 8 }}>
            {toast.tone === "success" ? "✅" : "❌"}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      {restockOpen && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <h3 style={{ marginTop: 0 }}>New Restock Request</h3>
            <form onSubmit={submitRestockRequest} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={modalLabel}>
                Item name
                <input
                  type="text"
                  value={restockItem}
                  onChange={(e) => setRestockItem(e.target.value)}
                  style={modalInput}
                  placeholder="e.g. EpiPens"
                  disabled={restockSubmitting}
                  required
                />
              </label>
              <label style={modalLabel}>
                Quantity needed
                <input
                  type="number"
                  min="1"
                  value={restockQuantity}
                  onChange={(e) => setRestockQuantity(e.target.value)}
                  style={modalInput}
                  disabled={restockSubmitting}
                />
              </label>
              <label style={modalLabel}>
                Notes (optional)
                <textarea
                  value={restockNotes}
                  onChange={(e) => setRestockNotes(e.target.value)}
                  style={{ ...modalInput, minHeight: 80, resize: "vertical" }}
                  disabled={restockSubmitting}
                />
              </label>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" style={secondaryBtn} onClick={closeRestockModal} disabled={restockSubmitting}>
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ ...actionBtn, opacity: restockSubmitting ? 0.6 : 1 }}
                  disabled={restockSubmitting}
                >
                  {restockSubmitting ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(value) {
  if (!value) return "—";
  try {
    const date = value instanceof Date ? value : new Date(value);
    return timeFormatter.format(date);
  } catch (e) {
    return typeof value === "string" ? value : "—";
  }
}

function formatCurrency(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return currencyFormatter.format(0);
  return currencyFormatter.format(amount);
}

const actionBtn = {
  alignSelf: "flex-start",
  background: "var(--primary)",
  color: "var(--primaryText)",
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  cursor: "pointer",
};

const statRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "rgba(15, 23, 42, 0.04)",
  borderRadius: 10,
  padding: "10px 12px",
};

const secondaryBtn = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  cursor: "pointer",
};

const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 20,
};

const modalContent = {
  background: "var(--card)",
  borderRadius: 12,
  padding: 24,
  maxWidth: 420,
  width: "100%",
  boxShadow: "var(--shadow)",
};

const modalLabel = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  color: "var(--muted)",
};

const modalInput = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  fontSize: 14,
  color: "inherit",
  background: "var(--background)",
};

function toastToneStyles(toast) {
  return {
    position: "fixed",
    bottom: 20,
    right: 20,
    background:
      toast?.tone === "success"
        ? "rgba(34, 197, 94, 0.1)"
        : "rgba(239, 68, 68, 0.12)",
    color: toast?.tone === "success" ? "#15803d" : "#b91c1c",
    border: `1px solid ${toast?.tone === "success" ? "#86efac" : "#fca5a5"}`,
    borderRadius: 12,
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxShadow: "var(--shadow)",
    zIndex: 30,
    maxWidth: 320,
  };
}
