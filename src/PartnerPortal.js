import React from "react";

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
  const schedule = [
    { time: "8:00 AM", patient: "Jamie Lee", purpose: "Initial consult" },
    { time: "9:30 AM", patient: "Maria Sanchez", purpose: "Allergy testing" },
    { time: "11:00 AM", patient: "Chris Patel", purpose: "Follow-up" },
  ];

  const checkIns = [
    { name: "Taylor Kim", status: "Waiting" },
    { name: "Jordan Smith", status: "Vitals complete" },
    { name: "Sasha Idris", status: "Roomed" },
  ];

  const labelQueue = [
    { id: "RX-2341", patient: "Jamie Lee", type: "EpiPen refill" },
    { id: "RX-2342", patient: "Maria Sanchez", type: "Serum batch" },
  ];

  const stock = [
    { name: "EpiPen", level: "18 units", status: "Healthy" },
    { name: "Serum A", level: "6 vials", status: "Restock soon" },
    { name: "Bandages", level: "42 packs", status: "Healthy" },
  ];

  const earnings = {
    today: "$1,820",
    week: "$8,460",
    month: "$32,190",
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
          <h2 style={titleStyle}>Day Schedule</h2>
          <span style={muted}>Updated 5 minutes ago</span>
        </header>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {schedule.map((item) => (
            <div
              key={`${item.time}-${item.patient}`}
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
                <strong>{item.time}</strong>
                <div style={muted}>{item.purpose}</div>
              </div>
              <span>{item.patient}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={titleStyle}>Patient Check-in</h2>
        <p style={muted}>Review arrivals and prep rooms.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {checkIns.map((item) => (
            <div
              key={item.name}
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
                <strong>{item.name}</strong>
                <div style={muted}>{item.status}</div>
              </div>
              <button style={actionBtn}>Mark Ready</button>
            </div>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={titleStyle}>Label Print Queue</h2>
        <p style={muted}>Confirm details before printing.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
              <strong>{item.id}</strong>
              <span>{item.patient}</span>
              <span style={muted}>{item.type}</span>
              <button style={actionBtn}>Print Label</button>
            </div>
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={titleStyle}>Stock Counter</h2>
        <p style={muted}>Keep critical supplies topped up.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stock.map((item) => (
            <div
              key={item.name}
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
                <strong>{item.name}</strong>
                <div style={muted}>{item.level}</div>
              </div>
              <span style={{ fontWeight: 600 }}>{item.status}</span>
            </div>
          ))}
        </div>
        <button style={actionBtn}>Create Restock Order</button>
      </section>

      <section style={sectionStyle}>
        <h2 style={titleStyle}>Earnings</h2>
        <p style={muted}>Snapshot of partner payouts.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={statRow}>
            <span style={muted}>Today</span>
            <strong>{earnings.today}</strong>
          </div>
          <div style={statRow}>
            <span style={muted}>This Week</span>
            <strong>{earnings.week}</strong>
          </div>
          <div style={statRow}>
            <span style={muted}>This Month</span>
            <strong>{earnings.month}</strong>
          </div>
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

const statRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "rgba(15, 23, 42, 0.04)",
  borderRadius: 10,
  padding: "10px 12px",
};
