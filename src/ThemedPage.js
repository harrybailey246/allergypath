// src/ThemedPage.js
import React from "react";

export default function ThemedPage({ title, actions, children, maxWidth = 900 }) {
  return (
    <div style={{ display: "grid", gap: 12, maxWidth, margin: "24px auto", fontFamily: "system-ui, sans-serif" }}>
      {(title || actions) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {title ? <h1 style={{ margin: 0, color: "var(--text)" }}>{title}</h1> : <div />}
          {actions ?? null}
        </div>
      )}
      <div style={{
        background: "var(--card)",
        color: "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16
      }}>
        {children}
      </div>
    </div>
  );
}
