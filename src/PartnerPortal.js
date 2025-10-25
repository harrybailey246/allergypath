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
  const [error, setError] = React.useState("");

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [scheduleRes, checkInsRes, labelQueueRes, stockRes, earningsRes] = await Promise.all([
        supabase.from("partner_today_schedule").select("*").order("start_at", { ascending: true }),
        supabase
          .from("partner_checkins")
          .select("patient_name,status,arrived_at")
          .order("arrived_at", { ascending: true }),
        supabase
          .from("partner_label_queue")
          .select("label_code,patient_name,request_type,priority,created_at")
          .order("created_at", { ascending: true }),
        supabase
          .from("partner_stock_levels")
          .select("item_name,quantity,unit,status,updated_at")
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
    } catch (e) {
      console.error("Failed to load partner tools", e);
      setError(e.message || "Failed to load partner metrics.");
      setSchedule([]);
      setCheckIns([]);
      setLabelQueue([]);
      setStock([]);
      setEarnings({ today: 0, week: 0, month: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

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
            <button style={actionBtn} onClick={loadData}>
              Retry
            </button>
          </div>
        </section>
      )}

      <section style={{ ...sectionStyle, gridColumn: "1 / -1" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={titleStyle}>Day Schedule</h2>
          <span style={muted}>
            {lastRefreshed ? `Updated ${formatTime(lastRefreshed)}` : "Awaiting data"}
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
                key={item.patient_name}
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
                <button style={actionBtn}>Mark Ready</button>
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
                key={item.label_code}
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
                <button style={actionBtn}>Print Label</button>
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
        <button style={actionBtn}>Create Restock Order</button>
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
        <button style={actionBtn}>View Detailed Report</button>
      </section>
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
