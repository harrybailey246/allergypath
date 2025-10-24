import React, { useMemo, useState } from "react";

const containerStyle = {
  display: "grid",
  gap: 20,
};

const gridTwo = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 18,
};

const cardStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 18,
  boxShadow: "var(--shadow)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  background: "var(--pillBg)",
  color: "var(--muted)",
  fontWeight: 600,
  letterSpacing: 0.2,
};

const btn = {
  background: "var(--primary)",
  color: "var(--primaryText)",
  border: "none",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 13,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  justifyContent: "center",
  transition: "transform 0.18s ease, opacity 0.18s ease",
};

const ghostBtn = {
  ...btn,
  background: "transparent",
  color: "var(--primary)",
  border: "1px solid rgba(37, 99, 235, 0.28)",
};

const listStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  margin: 0,
  padding: 0,
  listStyle: "none",
};

const badge = (variant) => {
  const colors = {
    ready: {
      background: "rgba(16, 185, 129, 0.18)",
      color: "#047857",
    },
    waiting: {
      background: "rgba(59, 130, 246, 0.18)",
      color: "#1d4ed8",
    },
    printed: {
      background: "rgba(75, 85, 99, 0.22)",
      color: "var(--muted)",
    },
  };
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.3,
    ...colors[variant],
  };
};

const StockControlButton = ({ onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      width: 32,
      height: 32,
      borderRadius: 10,
      border: "1px solid var(--border)",
      background: "var(--btnBg)",
      color: "var(--text)",
      cursor: "pointer",
      fontSize: 16,
      fontWeight: 600,
    }}
  >
    {children}
  </button>
);

const SectionTitle = ({ title, subtitle, action }) => (
  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{title}</h2>
      {subtitle && (
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>{subtitle}</p>
      )}
    </div>
    {action}
  </div>
);

export default function PartnerPortal() {
  const [checkIns, setCheckIns] = useState([
    { id: 1, name: "Noah Miller", reason: "Monthly maintenance", eta: "08:20", status: "waiting" },
    { id: 2, name: "Grace Patel", reason: "New patient orientation", eta: "08:45", status: "waiting" },
    { id: 3, name: "Lucas Chen", reason: "Vial pickup", eta: "09:05", status: "waiting" },
  ]);

  const [labels, setLabels] = useState([
    { id: "RX-2041", patient: "Miller / Noah", notes: "Blue vial", printed: false },
    { id: "RX-2042", patient: "Patel / Grace", notes: "Starter kit", printed: false },
    { id: "RX-2043", patient: "Chen / Lucas", notes: "Peanut escalation", printed: true },
  ]);

  const [stock, setStock] = useState([
    { id: "ALRG-A", name: "Serum A (dust)", onHand: 24, par: 30, unit: "vials" },
    { id: "ALRG-B", name: "Serum B (tree mix)", onHand: 16, par: 25, unit: "vials" },
    { id: "ALRG-C", name: "Syringes 1mL", onHand: 140, par: 180, unit: "count" },
  ]);

  const schedule = useMemo(
    () => [
      {
        time: "08:00",
        patient: "Noah Miller",
        service: "Injection | Maintenance",
        room: "Lab 1",
      },
      {
        time: "08:30",
        patient: "Grace Patel",
        service: "Onboarding consult",
        room: "Consult 3",
      },
      {
        time: "09:00",
        patient: "Lucas Chen",
        service: "Label pickup",
        room: "Front desk",
      },
      {
        time: "09:30",
        patient: "Erin Brooks",
        service: "Vial mixing",
        room: "Lab 2",
      },
    ],
    []
  );

  const earnings = useMemo(
    () => ({
      today: 1180,
      week: 6240,
      breakdown: [
        { label: "Allergy Shots", amount: 4200 },
        { label: "Serum Sales", amount: 1500 },
        { label: "Consults", amount: 540 },
      ],
    }),
    []
  );

  const handleToggleCheckIn = (id) => {
    setCheckIns((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, status: entry.status === "waiting" ? "ready" : "waiting" }
          : entry
      )
    );
  };

  const handlePrintLabel = (id) => {
    setLabels((prev) => prev.map((label) => (label.id === id ? { ...label, printed: true } : label)));
  };

  const adjustStock = (id, delta) => {
    setStock((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, onHand: Math.max(0, item.onHand + delta) }
          : item
      )
    );
  };

  const lowStock = stock.filter((item) => item.onHand < item.par);

  return (
    <div style={containerStyle}>
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 20,
          borderRadius: 16,
          background: "linear-gradient(135deg, rgba(37, 99, 235, 0.9), rgba(59, 130, 246, 0.85))",
          color: "white",
          boxShadow: "var(--shadow)",
        }}
      >
        <span style={{ opacity: 0.8, fontSize: 13 }}>Partner Operations</span>
        <h1 style={{ margin: 0, fontSize: 28 }}>Good morning! Here's your clinic overview.</h1>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span style={{ ...pill, background: "rgba(255,255,255,0.18)", color: "white" }}>
            {schedule.length} visits today
          </span>
          <span style={{ ...pill, background: "rgba(16, 185, 129, 0.22)", color: "#ecfdf5" }}>
            {checkIns.filter((c) => c.status === "ready").length} checked-in
          </span>
          <span style={{ ...pill, background: "rgba(248, 113, 113, 0.3)", color: "#fee2e2" }}>
            {lowStock.length} low stock alerts
          </span>
        </div>
      </header>

      <section style={gridTwo}>
        <article style={cardStyle}>
          <SectionTitle title="Today's Schedule" subtitle="Track injections, consults, and pickups." />
          <ul style={listStyle}>
            {schedule.map((item) => (
              <li
                key={`${item.time}-${item.patient}`}
                style={{
                  display: "flex",
                  gap: 14,
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  padding: 12,
                  borderRadius: 12,
                  background: "var(--bg)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontWeight: 600, letterSpacing: 0.2 }}>{item.time}</span>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>{item.room}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{item.patient}</p>
                  <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{item.service}</p>
                </div>
                <span style={badge("waiting")}>Scheduled</span>
              </li>
            ))}
          </ul>
        </article>

        <article style={cardStyle}>
          <SectionTitle
            title="Patient Check-in"
            subtitle="Confirm arrivals and prepare rooms."
            action={<span style={pill}>{checkIns.length} in queue</span>}
          />
          <ul style={listStyle}>
            {checkIns.map((entry) => (
              <li
                key={entry.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 14,
                  borderRadius: 12,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>{entry.name}</p>
                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{entry.reason}</p>
                  </div>
                  <span style={badge(entry.status)}>
                    {entry.status === "waiting" ? `ETA ${entry.eta}` : "Ready"}
                  </span>
                </div>
                <button
                  onClick={() => handleToggleCheckIn(entry.id)}
                  style={entry.status === "waiting" ? btn : ghostBtn}
                >
                  {entry.status === "waiting" ? "Mark Ready" : "Undo"}
                </button>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section style={gridTwo}>
        <article style={cardStyle}>
          <SectionTitle
            title="Label Printing"
            subtitle="Batch labels for today's pickups."
            action={<button style={ghostBtn}>Print Batch</button>}
          />
          <ul style={listStyle}>
            {labels.map((label) => (
              <li
                key={label.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 14,
                  borderRadius: 12,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>{label.id}</p>
                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>
                      {label.patient} • {label.notes}
                    </p>
                  </div>
                  <span style={badge(label.printed ? "printed" : "waiting")}>
                    {label.printed ? "Printed" : "Queued"}
                  </span>
                </div>
                <button
                  onClick={() => handlePrintLabel(label.id)}
                  disabled={label.printed}
                  style={{
                    ...btn,
                    opacity: label.printed ? 0.5 : 1,
                    cursor: label.printed ? "default" : "pointer",
                  }}
                >
                  {label.printed ? "Completed" : "Print Label"}
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article style={cardStyle}>
          <SectionTitle
            title="Stock Counter"
            subtitle="Monitor par levels for allergy inventory."
            action={
              lowStock.length > 0 ? (
                <span style={{ ...pill, background: "rgba(248, 113, 113, 0.18)", color: "#991b1b" }}>
                  {lowStock.length} low
                </span>
              ) : null
            }
          />
          <ul style={listStyle}>
            {stock.map((item) => (
              <li
                key={item.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: 14,
                  borderRadius: 12,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>{item.name}</p>
                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>
                      Par {item.par} {item.unit}
                    </p>
                  </div>
                  <span style={badge(item.onHand < item.par ? "waiting" : "ready")}>
                    {item.onHand} {item.unit}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <StockControlButton onClick={() => adjustStock(item.id, -1)}>-</StockControlButton>
                  <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 32, textAlign: "center" }}>
                    {item.onHand}
                  </span>
                  <StockControlButton onClick={() => adjustStock(item.id, 1)}>+</StockControlButton>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section style={cardStyle}>
        <SectionTitle title="Earnings Snapshot" subtitle="Quick view of revenue performance." />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 18,
          }}
        >
          <div
            style={{
              flex: "1 1 200px",
              background: "var(--bg)",
              borderRadius: 12,
              padding: 16,
              border: "1px solid var(--border)",
            }}
          >
            <p style={{ margin: "0 0 6px", color: "var(--muted)", fontSize: 13 }}>Today</p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>${earnings.today.toLocaleString()}</p>
          </div>
          <div
            style={{
              flex: "1 1 200px",
              background: "var(--bg)",
              borderRadius: 12,
              padding: 16,
              border: "1px solid var(--border)",
            }}
          >
            <p style={{ margin: "0 0 6px", color: "var(--muted)", fontSize: 13 }}>This Week</p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>${earnings.week.toLocaleString()}</p>
          </div>
          <div style={{ flex: "2 1 260px", minWidth: 240 }}>
            <ul style={{ ...listStyle, gap: 10 }}>
              {earnings.breakdown.map((item) => (
                <li
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: 12,
                    borderRadius: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{item.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>${item.amount.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
