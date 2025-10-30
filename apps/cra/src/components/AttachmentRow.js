import React from "react";

const defaultButtonStyle = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--border, #d1d5db)",
  background: "#fff",
  cursor: "pointer",
  color: "inherit",
};

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  border: "1px solid var(--border, #e5e7eb)",
  borderRadius: 8,
  padding: "6px 10px",
  gap: 12,
};

const nameStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
};

const errorStyle = {
  color: "#b91c1c",
  fontSize: 12,
  marginTop: 4,
};

export default function AttachmentRow({
  path,
  url,
  loading,
  error,
  onRetry,
  buttonStyle,
  downloadLabel = "Download",
}) {
  const name = (path || "").split("/").pop() || path || "Attachment";
  const anchorStyle = {
    ...(buttonStyle || defaultButtonStyle),
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    opacity: loading && !error ? 0.6 : 1,
    pointerEvents: loading || !url ? "none" : "auto",
  };

  const retryStyle = buttonStyle || defaultButtonStyle;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={rowStyle}>
        <div style={nameStyle}>📎 {name}</div>
        {error ? (
          <button type="button" onClick={onRetry} style={retryStyle}>
            Retry
          </button>
        ) : (
          <a
            href={url || "#"}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              if (!url) e.preventDefault();
            }}
            style={anchorStyle}
          >
            {loading ? "Preparing…" : downloadLabel}
          </a>
        )}
      </div>
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}
