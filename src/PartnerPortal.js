import React from "react";
import { supabase } from "./supabaseClient";

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

export default function PartnerPortal() {
  const timeFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
    []
  );

  const currencyFormatter = React.useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
      }),
    []
  );

  const [schedule, setSchedule] = React.useState([]);
  const [scheduleLoading, setScheduleLoading] = React.useState(true);
  const [scheduleError, setScheduleError] = React.useState(null);

  const [checkIns, setCheckIns] = React.useState([]);
  const [checkInLoading, setCheckInLoading] = React.useState(true);
  const [checkInError, setCheckInError] = React.useState(null);

  const [labelQueue, setLabelQueue] = React.useState([]);
  const [labelLoading, setLabelLoading] = React.useState(true);
  const [labelError, setLabelError] = React.useState(null);

  const [stock, setStock] = React.useState([]);
  const [stockLoading, setStockLoading] = React.useState(true);
  const [stockError, setStockError] = React.useState(null);

  const [earnings, setEarnings] = React.useState({ today: null, week: null, month: null });
  const [earningsLoading, setEarningsLoading] = React.useState(true);
  const [earningsError, setEarningsError] = React.useState(null);

  const loadSchedule = React.useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError(null);
    const { data, error } = await supabase
      .from("partner_portal_daily_schedule")
      .select("id, start_at, end_at, first_name, surname, purpose");
    if (error) {
      setScheduleError(error.message);
      setSchedule([]);
    } else {
      setSchedule(data || []);
    }
    setScheduleLoading(false);
  }, []);

  const loadCheckIns = React.useCallback(async () => {
    setCheckInLoading(true);
    setCheckInError(null);
    const { data, error } = await supabase
      .from("partner_portal_check_ins")
      .select("id, patient_name, status, updated_at");
    if (error) {
      setCheckInError(error.message);
      setCheckIns([]);
    } else {
      setCheckIns(data || []);
    }
    setCheckInLoading(false);
  }, []);

  const loadLabels = React.useCallback(async () => {
    setLabelLoading(true);
    setLabelError(null);
    const { data, error } = await supabase
      .from("partner_portal_label_queue")
      .select("id, label_code, patient_name, label_type, created_at");
    if (error) {
      setLabelError(error.message);
      setLabelQueue([]);
    } else {
      setLabelQueue(data || []);
    }
    setLabelLoading(false);
  }, []);

  const loadStock = React.useCallback(async () => {
    setStockLoading(true);
    setStockError(null);
    const { data, error } = await supabase
      .from("partner_stock_levels")
      .select("id, item_name, quantity, unit, status, updated_at")
      .order("updated_at", { ascending: false });
    if (error) {
      setStockError(error.message);
      setStock([]);
    } else {
      setStock(data || []);
    }
    setStockLoading(false);
  }, []);

  const loadEarnings = React.useCallback(async () => {
    setEarningsLoading(true);
    setEarningsError(null);
    const { data, error } = await supabase
      .from("partner_portal_payout_summary")
      .select("today_total, week_total, month_total")
      .limit(1)
      .single();
    if (error && error.code !== "PGRST116") {
      setEarningsError(error.message);
      setEarnings({ today: null, week: null, month: null });
    } else {
      const totals = error ? null : data;
      setEarnings({
        today: totals?.today_total ?? 0,
        week: totals?.week_total ?? 0,
        month: totals?.month_total ?? 0,
      });
    }
    setEarningsLoading(false);
  }, []);

  React.useEffect(() => {
    loadSchedule();
    loadCheckIns();
    loadLabels();
    loadStock();
    loadEarnings();
  }, [loadSchedule, loadCheckIns, loadLabels, loadStock, loadEarnings]);

  React.useEffect(() => {
    const scheduleChannel = supabase
      .channel("partner-portal-appointments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => loadSchedule()
      )
      .subscribe();

    const checkInChannel = supabase
      .channel("partner-portal-checkins")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "partner_check_ins" },
        () => loadCheckIns()
      )
      .subscribe();

    const labelChannel = supabase
      .channel("partner-portal-labels")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "partner_label_queue" },
        () => loadLabels()
      )
      .subscribe();

    const stockChannel = supabase
      .channel("partner-portal-stock")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "partner_stock_levels" },
        () => loadStock()
      )
      .subscribe();

    const payoutChannel = supabase
      .channel("partner-portal-payouts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "partner_payouts" },
        () => loadEarnings()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(scheduleChannel);
      supabase.removeChannel(checkInChannel);
      supabase.removeChannel(labelChannel);
      supabase.removeChannel(stockChannel);
      supabase.removeChannel(payoutChannel);
    };
  }, [loadSchedule, loadCheckIns, loadLabels, loadStock, loadEarnings]);

  const formatTimeRange = (start, end) => {
    if (!start) return "";
    const startTime = timeFormatter.format(new Date(start));
    return end ? `${startTime} – ${timeFormatter.format(new Date(end))}` : startTime;
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 20,
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      }}
    >
      <section style={{ ...sectionStyle, gridColumn: "1 / -1" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "grid" }}>
            <h2 style={titleStyle}>Day Schedule</h2>
            {scheduleError && <span style={{ ...muted, color: "var(--danger, #dc2626)" }}>{scheduleError}</span>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {scheduleLoading && <span style={muted}>Loading…</span>}
            <button style={secondaryBtn} onClick={loadSchedule} disabled={scheduleLoading}>
              Refresh
            </button>
          </div>
        </header>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!scheduleLoading && schedule.length === 0 && !scheduleError && (
            <div style={{ ...muted, textAlign: "center", padding: "12px 0" }}>
              No appointments scheduled for today.
            </div>
          )}
          {schedule.map((item) => {
            const patientName = [item.first_name, item.surname].filter(Boolean).join(" ") || "Unassigned";
            return (
              <div
                key={item.id}
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
                  <strong>{formatTimeRange(item.start_at, item.end_at)}</strong>
                  {item.purpose && <div style={muted}>{item.purpose}</div>}
                </div>
                <span>{patientName}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section style={sectionStyle}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "grid" }}>
            <h2 style={titleStyle}>Patient Check-in</h2>
            {checkInError && <span style={{ ...muted, color: "var(--danger, #dc2626)" }}>{checkInError}</span>}
          </div>
          <button style={secondaryBtn} onClick={loadCheckIns} disabled={checkInLoading}>
            Refresh
          </button>
        </header>
        <p style={muted}>Review arrivals and prep rooms.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {checkInLoading && <div style={muted}>Loading…</div>}
          {!checkInLoading && checkIns.length === 0 && !checkInError && (
            <div style={{ ...muted, textAlign: "center", padding: "12px 0" }}>No patients waiting right now.</div>
          )}
          {checkIns.map((item) => (
            <div
              key={item.id}
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
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "grid" }}>
            <h2 style={titleStyle}>Label Print Queue</h2>
            {labelError && <span style={{ ...muted, color: "var(--danger, #dc2626)" }}>{labelError}</span>}
          </div>
          <button style={secondaryBtn} onClick={loadLabels} disabled={labelLoading}>
            Refresh
          </button>
        </header>
        <p style={muted}>Confirm details before printing.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {labelLoading && <div style={muted}>Loading…</div>}
          {!labelLoading && labelQueue.length === 0 && !labelError && (
            <div style={{ ...muted, textAlign: "center", padding: "12px 0" }}>All labels are up to date.</div>
          )}
          {labelQueue.map((item) => (
            <div
              key={item.id}
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
              {item.label_type && <span style={muted}>{item.label_type}</span>}
              <button style={actionBtn}>Print Label</button>
            </div>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "grid" }}>
            <h2 style={titleStyle}>Stock Counter</h2>
            {stockError && <span style={{ ...muted, color: "var(--danger, #dc2626)" }}>{stockError}</span>}
          </div>
          <button style={secondaryBtn} onClick={loadStock} disabled={stockLoading}>
            Refresh
          </button>
        </header>
        <p style={muted}>Keep critical supplies topped up.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stockLoading && <div style={muted}>Loading…</div>}
          {!stockLoading && stock.length === 0 && !stockError && (
            <div style={{ ...muted, textAlign: "center", padding: "12px 0" }}>No inventory has been recorded.</div>
          )}
          {stock.map((item) => {
            const level = [item.quantity, item.unit].filter(Boolean).join(" ") || "—";
            return (
              <div
                key={item.id}
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
                  <div style={muted}>{level}</div>
                </div>
                {item.status && <span style={{ fontWeight: 600 }}>{item.status}</span>}
              </div>
            );
          })}
        </div>
        <button style={actionBtn}>Create Restock Order</button>
      </section>

      <section style={sectionStyle}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "grid" }}>
            <h2 style={titleStyle}>Earnings</h2>
            {earningsError && <span style={{ ...muted, color: "var(--danger, #dc2626)" }}>{earningsError}</span>}
          </div>
          <button style={secondaryBtn} onClick={loadEarnings} disabled={earningsLoading}>
            Refresh
          </button>
        </header>
        <p style={muted}>Snapshot of partner payouts.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {earningsLoading ? (
            <div style={muted}>Loading…</div>
          ) : (
            <>
              <div style={statRow}>
                <span style={muted}>Today</span>
                <strong>{currencyFormatter.format(earnings.today ?? 0)}</strong>
              </div>
              <div style={statRow}>
                <span style={muted}>This Week</span>
                <strong>{currencyFormatter.format(earnings.week ?? 0)}</strong>
              </div>
              <div style={statRow}>
                <span style={muted}>This Month</span>
                <strong>{currencyFormatter.format(earnings.month ?? 0)}</strong>
              </div>
            </>
          )}
        </div>
        <button style={actionBtn}>View Detailed Report</button>
      </section>
    </div>
  );
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

const secondaryBtn = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
  color: "var(--muted)",
};

const statRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "rgba(15, 23, 42, 0.04)",
  borderRadius: 10,
  padding: "10px 12px",
};
