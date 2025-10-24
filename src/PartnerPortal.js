// src/PartnerPortal.js
import React, { useMemo } from "react";

const wrapperStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 24,
};

const sectionStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 24,
  boxShadow: "var(--shadow)",
};

const sectionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
};

const listStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const pillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  borderRadius: 999,
  background: "var(--pillBg)",
  color: "var(--text)",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0.3,
  textTransform: "uppercase",
};

const badge = (color) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 10px",
  borderRadius: 999,
  background: `${color}22`,
  color,
  fontSize: 12,
  fontWeight: 600,
});

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const tableHeaderCell = {
  textAlign: "left",
  padding: "12px 0",
  fontSize: 12,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.6,
  borderBottom: "1px solid var(--border)",
};

const tableCell = {
  padding: "14px 0",
  borderBottom: "1px solid var(--border)",
  fontSize: 14,
};

const SummaryCard = ({ title, value, trend, tone = "var(--primary)" }) => {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 20,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {title}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      {trend && (
        <div style={{ fontSize: 12, color: tone, fontWeight: 600 }}>{trend}</div>
      )}
    </div>
  );
};

const ListItem = ({ title, subtitle, meta, accent }) => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 12,
        background: "var(--bg)",
        border: "1px solid var(--border)",
      }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: "var(--muted)" }}>{subtitle}</div>}
      </div>
      <div style={badge(accent)}>{meta}</div>
    </div>
  );
};

export default function PartnerPortal() {
  const schedule = useMemo(
    () => [
      { time: "08:30", patient: "Morgan Stevens", service: "Allergy Consultation", room: "Room 2" },
      { time: "10:00", patient: "Luis Ortega", service: "SPT Follow-up", room: "Room 1" },
      { time: "11:15", patient: "Amira Patel", service: "Immunotherapy", room: "Lab" },
      { time: "13:00", patient: "Priya Kaur", service: "New Intake", room: "Room 3" },
    ],
    []
  );

  const checkIns = useMemo(
    () => [
      { name: "Morgan Stevens", status: "Checked-in", time: "08:18", accent: "#059669" },
      { name: "Luis Ortega", status: "En route", time: "09:42", accent: "#2563eb" },
      { name: "Zoe Chen", status: "Waiting", time: "09:55", accent: "#d97706" },
    ],
    []
  );

  const labelQueue = useMemo(
    () => [
      { id: "LBL-1047", patient: "Amira Patel", type: "Vial Set A" },
      { id: "LBL-1048", patient: "Zoe Chen", type: "Patch Panel" },
      { id: "LBL-1049", patient: "Derrick Moss", type: "Food Panel" },
    ],
    []
  );

  const stockLevels = useMemo(
    () => [
      { item: "Histamine Control", qty: 42, min: 30 },
      { item: "Allergen Mix A", qty: 18, min: 20 },
      { item: "Patch Test Tape", qty: 255, min: 200 },
      { item: "Sharps Container", qty: 6, min: 4 },
    ],
    []
  );

  const earnings = useMemo(
    () => ({
      today: "$1,640",
      week: "$8,950",
      month: "$32,480",
      trend: "+12% vs last month",
    }),
    []
  );

  return (
    <div style={wrapperStyle}>
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <div style={pillStyle}>Partner Operations</div>
            <h1 style={{ margin: "12px 0 0", fontSize: 28 }}>Clinician Partner Portal</h1>
            <p style={{ margin: "6px 0 0", color: "var(--muted)", maxWidth: 540 }}>
              A consolidated command center for partner clinics to monitor the daily
              schedule, patient flow, label production, stock levels, and earnings in one
              secure view.
            </p>
          </div>
        </div>
        <div style={gridStyle}>
          <SummaryCard title="Patients checked-in" value="12" trend="4 awaiting arrival" tone="#2563eb" />
          <SummaryCard title="Labels queued" value="7" trend="2 high priority" tone="#d97706" />
          <SummaryCard title="Stock alerts" value="3" trend="Review before 3 PM" tone="#dc2626" />
          <SummaryCard title="Today's revenue" value={earnings.today} trend={earnings.trend} tone="#059669" />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <h2 style={{ margin: 0 }}>Day Schedule</h2>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Auto-synced from clinician calendar</span>
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={tableHeaderCell}>Time</th>
              <th style={tableHeaderCell}>Patient</th>
              <th style={tableHeaderCell}>Service</th>
              <th style={tableHeaderCell}>Location</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((slot) => (
              <tr key={`${slot.time}-${slot.patient}`}>
                <td style={tableCell}>{slot.time}</td>
                <td style={tableCell}>{slot.patient}</td>
                <td style={tableCell}>{slot.service}</td>
                <td style={tableCell}>{slot.room}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          <div>
            <div style={sectionHeaderStyle}>
              <h2 style={{ margin: 0 }}>Patient Check-in</h2>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Live status from front desk</span>
            </div>
            <div style={listStyle}>
              {checkIns.map((entry) => (
                <ListItem
                  key={entry.name}
                  title={entry.name}
                  subtitle={`Updated ${entry.time}`}
                  meta={entry.status}
                  accent={entry.accent}
                />
              ))}
            </div>
          </div>

          <div>
            <div style={sectionHeaderStyle}>
              <h2 style={{ margin: 0 }}>Label Print Queue</h2>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Connected to in-house printer</span>
            </div>
            <div style={listStyle}>
              {labelQueue.map((label) => (
                <div
                  key={label.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{label.id}</div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>{label.patient}</div>
                  </div>
                  <div style={badge("#7c3aed")}>{label.type}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          <div>
            <div style={sectionHeaderStyle}>
              <h2 style={{ margin: 0 }}>Stock Counter</h2>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Threshold alerts trigger supply orders</span>
            </div>
            <div style={listStyle}>
              {stockLevels.map((item) => (
                <div
                  key={item.item}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.item}</div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>On hand: {item.qty}</div>
                  </div>
                  <div style={badge(item.qty <= item.min ? "#dc2626" : "#059669")}>Min {item.min}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={sectionHeaderStyle}>
              <h2 style={{ margin: 0 }}>Earnings Snapshot</h2>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Automatically reconciled daily</span>
            </div>
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: "16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--bg)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                <span>Today</span>
                <span>{earnings.today}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>This week</span>
                <span>{earnings.week}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>This month</span>
                <span>{earnings.month}</span>
              </div>
              <div style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>{earnings.trend}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
