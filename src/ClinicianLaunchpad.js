import React from "react";
import { PARTNER_PORTAL_URL } from "./config";

export default function ClinicianLaunchpad({ onOpenDashboard, onOpenAnalytics, isAdmin }) {
  const openDashboard = () => {
    if (typeof onOpenDashboard === "function") {
      onOpenDashboard();
      return;
    }
    if (typeof window !== "undefined") {
      window.setView?.("dashboard");
    }
  };

  const openAnalytics = () => {
    if (typeof onOpenAnalytics === "function") {
      onOpenAnalytics();
      return;
    }
    if (typeof window !== "undefined") {
      window.setView?.("analytics");
    }
  };

  const openPartnerPortal = () => {
    if (!PARTNER_PORTAL_URL) {
      alert("Partner portal URL is not configured.");
      return;
    }
    if (typeof window !== "undefined") {
      window.open(PARTNER_PORTAL_URL, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div style={wrap}>
      <header style={header}>
        <div>
          <div style={eyebrow}>Clinician launchpad</div>
          <h1 style={title}>Choose where you want to work today</h1>
          <p style={lede}>
            Jump straight into AllergyPath to triage submissions or open the Partner Portal to
            collaborate with clinics and referral partners.
          </p>
        </div>
      </header>

      <section style={grid}>
        <Card title="AllergyPath" description="Manage referrals, review patient information, and update clinical notes in real time." actionLabel="Open AllergyPath" onAction={openDashboard} />

        <Card
          title="Partner Portal"
          description="Share resources, coordinate with partner sites, and monitor shared patient journeys."
          actionLabel="Open Partner Portal"
          onAction={openPartnerPortal}
        />

        {isAdmin && (
          <Card
            title="Analytics"
            description="View trends across submissions, high-risk flags, and clinic performance metrics."
            actionLabel="View analytics"
            onAction={openAnalytics}
          />
        )}
      </section>
    </div>
  );
}

function Card({ title, description, actionLabel, onAction }) {
  return (
    <div style={card}>
      <div style={{ display: "grid", gap: 8 }}>
        <h2 style={cardTitle}>{title}</h2>
        <p style={cardDescription}>{description}</p>
      </div>
      <button type="button" style={cardAction} onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}

const wrap = {
  display: "grid",
  gap: 24,
  maxWidth: 960,
  margin: "0 auto",
};

const header = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: "32px 36px",
  boxShadow: "var(--shadow)",
};

const eyebrow = {
  textTransform: "uppercase",
  letterSpacing: 1,
  fontSize: 12,
  color: "var(--muted)",
  fontWeight: 600,
  marginBottom: 6,
};

const title = {
  margin: "0 0 12px",
  fontSize: 28,
  lineHeight: 1.2,
};

const lede = {
  margin: 0,
  color: "var(--muted)",
  maxWidth: 560,
  lineHeight: 1.5,
};

const grid = {
  display: "grid",
  gap: 20,
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
};

const card = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: "24px 24px 28px",
  display: "grid",
  gap: 18,
  boxShadow: "var(--shadow)",
  minHeight: 220,
};

const cardTitle = {
  margin: 0,
  fontSize: 20,
};

const cardDescription = {
  margin: 0,
  color: "var(--muted)",
  lineHeight: 1.5,
};

const cardAction = {
  justifySelf: "flex-start",
  padding: "10px 16px",
  background: "var(--primary)",
  color: "var(--primaryText)",
  border: "1px solid var(--primary)",
  borderRadius: 999,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
  boxShadow: "0 14px 30px rgba(37, 99, 235, 0.22)",
};
