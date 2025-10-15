// src/Wizard.js
import React, { useState } from "react";

export default function Wizard({ steps, onSubmit, validate }) {
  const [i, setI] = useState(0);
  const isLast = i === steps.length - 1;
  const percent = Math.round(((i + 1) / steps.length) * 100);

  const next = async () => {
    if (validate) {
      const ok = await validate(i);
      if (!ok) return;
    }
    setI((n) => Math.min(n + 1, steps.length - 1));
  };
  const prev = () => setI((n) => Math.max(n - 1, 0));

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Progress */}
      <div style={{ marginBottom: 12, color: "#6b7280" }}>
        Step {i + 1} of {steps.length}: {steps[i].title}
      </div>
      <div style={{ height: 8, background: "#eee", borderRadius: 999, marginBottom: 16 }}>
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: "#111827",
            borderRadius: 999,
            transition: "width .25s ease",
          }}
        />
      </div>

      {/* Content */}
      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
        {steps[i].content}
      </div>

      {/* Nav */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <button onClick={prev} disabled={i === 0} style={btnSecondary}>
          Previous
        </button>
        {isLast ? (
          <button onClick={onSubmit} style={btnPrimary}>Submit</button>
        ) : (
          <button onClick={next} style={btnPrimary}>Next</button>
        )}
      </div>
    </div>
  );
}

const btnPrimary = {
  padding: "10px 16px",
  borderRadius: 10,
  border: 0,
  background: "#111827",
  color: "#fff",
  cursor: "pointer",
};
const btnSecondary = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111827",
  cursor: "pointer",
};
