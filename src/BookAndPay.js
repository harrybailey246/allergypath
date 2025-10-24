// src/BookAndPay.js
import React from "react";

const appointmentSteps = [
  {
    title: "1. Share your history",
    description:
      "Complete the AllergyPath intake form so our clinicians can review your symptoms, previous testing, and medications before the visit.",
    icon: "📝",
  },
  {
    title: "2. Book your appointment",
    description:
      "Once the intake is submitted you'll receive an email with your secure booking link. Choose a date and time that works for you and confirm your spot.",
    icon: "📅",
  },
  {
    title: "3. Check in and pay",
    description:
      "On the day of your visit you can settle your balance online or at reception. We accept all major credit cards and HSA/FSA cards.",
    icon: "💳",
  },
];

const paymentOptions = [
  {
    heading: "In-person skin testing",
    items: [
      { label: "Initial consultation", value: "$195" },
      { label: "Skin-prick panel", value: "$145" },
      { label: "Same-day results review", value: "Included" },
    ],
  },
  {
    heading: "Virtual visit",
    items: [
      { label: "Telehealth follow-up", value: "$95" },
      { label: "Prescription renewals", value: "$35" },
    ],
  },
  {
    heading: "Flexible payment methods",
    items: [
      { label: "Major credit & debit cards", value: "Visa, Mastercard, AmEx" },
      { label: "Health savings", value: "HSA and FSA cards" },
      { label: "Installments", value: "Ask about CareCredit" },
    ],
  },
];

export default function BookAndPay() {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <p style={{ margin: 0, color: "#6b7280", lineHeight: 1.6 }}>
          Whether you're planning a first visit or a follow-up, AllergyPath makes it simple to
          confirm your appointment and manage payment ahead of time. Use the guide below to learn
          what to expect and how to prepare.
        </p>
      </div>

      <div style={grid}>
        {appointmentSteps.map((step) => (
          <div key={step.title} style={card}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{step.icon}</div>
            <h2 style={cardTitle}>{step.title}</h2>
            <p style={cardBody}>{step.description}</p>
          </div>
        ))}
      </div>

      <section style={section}>
        <h2 style={{ marginTop: 0 }}>Need help?</h2>
        <p style={{ marginBottom: 12, color: "#6b7280", lineHeight: 1.6 }}>
          If you have questions about insurance coverage, payment plans, or which visit type is right
          for you, our care coordinators are happy to help. Reach out at
          {" "}
          <a href="mailto:support@allergypath.com" style={link}>
            support@allergypath.com
          </a>
          {" "}
          or call <a href="tel:18001231234" style={link}>(800) 123-1234</a>.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <a href="mailto:support@allergypath.com" style={primaryButton}>
            Email our team
          </a>
          <a href="tel:18001231234" style={secondaryButton}>
            Call now
          </a>
        </div>
      </section>

      <section style={section}>
        <h2 style={{ margin: "0 0 16px" }}>Pricing & payment</h2>
        <div style={paymentGrid}>
          {paymentOptions.map((option) => (
            <div key={option.heading} style={card}>
              <h3 style={cardTitle}>{option.heading}</h3>
              <ul style={priceList}>
                {option.items.map((item) => (
                  <li key={item.label} style={priceItem}>
                    <span>{item.label}</span>
                    <span style={{ fontWeight: 600 }}>{item.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section style={section}>
        <h2 style={{ marginTop: 0 }}>Before you arrive</h2>
        <ul style={checklist}>
          <li>Bring a photo ID and your insurance card if you plan to submit for reimbursement.</li>
          <li>
            Stop antihistamines for at least 5 days before skin testing unless your clinician advises
            otherwise.
          </li>
          <li>Arrive 10 minutes early so we can confirm your information and answer questions.</li>
        </ul>
      </section>
    </div>
  );
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 16,
};

const paymentGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
};

const card = {
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
  background: "var(--card)",
  color: "var(--text)",
  boxShadow: "0 12px 24px -18px rgba(15, 23, 42, 0.35)",
};

const cardTitle = {
  margin: "0 0 8px",
  fontSize: 18,
};

const cardBody = {
  margin: 0,
  color: "#6b7280",
  lineHeight: 1.6,
};

const section = {
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 16,
  background: "var(--card)",
  color: "var(--text)",
};

const link = {
  color: "var(--primary)",
  textDecoration: "none",
};

const primaryButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 16px",
  borderRadius: 10,
  background: "var(--primary)",
  color: "var(--primaryText)",
  textDecoration: "none",
  fontWeight: 600,
};

const secondaryButton = {
  ...primaryButton,
  background: "transparent",
  color: "var(--primary)",
  border: "1px solid var(--primary)",
};

const priceList = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 8,
};

const priceItem = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  color: "#6b7280",
};

const checklist = {
  margin: 0,
  paddingLeft: 20,
  lineHeight: 1.6,
  color: "#6b7280",
};
