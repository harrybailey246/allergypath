// src/App.js
import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import IntakeForm from "./IntakeForm";
import Dashboard from "./Dashboard";
import Login from "./Login";
import AdminAnalytics from "./AdminAnalytics";
import PatientPortal from "./PatientPortal";
import ThemedPage from "./ThemedPage";

// Hash-based navigation helper
window.setView = (view) => {
  if (typeof window !== "undefined") window.location.hash = "#" + view;
};

/* -------- theming helpers (CSS variables) -------- */
const LIGHT = {
  "--bg": "#f5f7fb",
  "--text": "#0f172a",
  "--header": "#0b1220",
  "--headerText": "#ffffff",
  "--card": "#ffffff",
  "--border": "#e5e7eb",
  "--primary": "#2563eb",
  "--primaryText": "#ffffff",
  "--btnBg": "#ffffff",
};
const DARK = {
  "--bg": "#0c1222",
  "--text": "#e5e7eb",
  "--header": "#0b1220",
  "--headerText": "#e5e7eb",
  "--card": "#111827",
  "--border": "#1f2937",
  "--primary": "#60a5fa",
  "--primaryText": "#0b1220",
  "--btnBg": "#0f172a",
};

function applyTheme(name) {
  const vars = name === "dark" ? DARK : LIGHT;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute("data-theme", name);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setLocalView] = useState(
    (typeof window !== "undefined" && window.location.hash.replace("#", "")) || "intake"
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [theme, setTheme] = useState("light");

  // Theme: load & apply on boot
  useEffect(() => {
    const saved =
      (typeof window !== "undefined" && window.localStorage.getItem("theme")) ||
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    if (typeof window !== "undefined") window.localStorage.setItem("theme", next);
  };

  // Update view when hash changes
  useEffect(() => {
    const handleHashChange = () =>
      setLocalView(window.location.hash.replace("#", "") || "intake");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Load user and listen for changes
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user ?? null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // Lookup role (admin?)
  useEffect(() => {
    const getRole = async () => {
      setIsAdmin(false);
      if (!user?.email) return;
      const { data, error } = await supabase
        .from("clinician_emails")
        .select("role")
        .eq("email", (user.email || "").toLowerCase())
        .maybeSingle();
      if (!error && data?.role === "admin") setIsAdmin(true);
    };
    getRole();
  }, [user?.email]);

  const authed = !!user;

  // View routing
  const renderView = () => {
    switch (view) {
      case "dashboard":
        return authed ? (
          <Dashboard onOpenAnalytics={() => window.setView("analytics")} />
        ) : (
          <Login />
        );

      case "analytics":
        return authed && isAdmin ? (
          <AdminAnalytics onBack={() => window.setView("dashboard")} />
        ) : authed ? (
          <NoAccess onBack={() => window.setView("dashboard")} />
        ) : (
          <Login />
        );

      case "patientPortal":
        return (
          <ThemedPage title="Patient Portal">
            <PatientPortal />
          </ThemedPage>
        );

      case "login":
        return <Login />;

      case "intake":
      default:
        return (
          <ThemedPage title="Patient Intake">
            <IntakeForm />
          </ThemedPage>
        );
    }
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "var(--bg)",
        minHeight: "100vh",
        color: "var(--text)",
      }}
    >
      {/* Header / Nav */}
      <header
        style={{
          background: "var(--header)",
          color: "var(--headerText)",
          padding: "12px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {/* Logo + Theme Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>AllergyPath</h1>
          <button onClick={toggleTheme} style={toggleBtn}>
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", textAlign: "right" }}>
          {authed && (
            <span style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
              Signed in as <b>{user.email}</b>
              {isAdmin ? " • Admin" : ""}
            </span>
          )}
        </div>

        {/* Dropdown Navigation */}
        <NavMenu authed={authed} isAdmin={isAdmin} current={view} />
      </header>

      {/* Main content */}
      <main style={{ padding: 20 }}>{renderView()}</main>
    </div>
  );
}

/* ------------ Dropdown Menu ------------ */
function NavMenu({ authed, isAdmin, current }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  // close on outside click or Esc
  React.useEffect(() => {
    const onClickAway = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClickAway);
    window.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        style={menuBtn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
      >
        Menu ▾
      </button>

      {open && (
        <div role="menu" style={menu}>
          <MenuItem
            active={current === "intake"}
            onClick={() => {
              window.setView("intake");
              setOpen(false);
            }}
          >
            Patient Form
          </MenuItem>

          <MenuItem
            active={current === "dashboard"}
            onClick={() => {
              window.setView("dashboard");
              setOpen(false);
            }}
          >
            Dashboard
          </MenuItem>

          <MenuItem
            active={current === "patientPortal"}
            onClick={() => {
              window.setView("patientPortal");
              setOpen(false);
            }}
          >
            Patient Portal
          </MenuItem>

          {authed && isAdmin && (
            <MenuItem
              active={current === "analytics"}
              onClick={() => {
                window.setView("analytics");
                setOpen(false);
              }}
            >
              Analytics
            </MenuItem>
          )}

          <div style={{ borderTop: "1px solid var(--border)", margin: "6px 0" }} />

          {authed ? (
            <MenuItem
              onClick={async () => {
                await supabase.auth.signOut();
                window.setView("login");
                setOpen(false);
              }}
            >
              Sign Out
            </MenuItem>
          ) : (
            <MenuItem
              active={current === "login"}
              onClick={() => {
                window.setView("login");
                setOpen(false);
              }}
            >
              Clinician Login
            </MenuItem>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, active }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{ ...menuItem, ...(active ? menuItemActive : {}) }}
    >
      {children}
    </button>
  );
}

/* ------------ Styling ------------- */
const navBtn = (active = false) => ({
  background: active ? "var(--primary)" : "var(--btnBg)",
  color: active ? "var(--primaryText)" : "var(--headerText)",
  border: "1px solid var(--primary)",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 14,
  transition: "background 0.2s, color 0.2s, opacity 0.2s",
  opacity: active ? 1 : 0.95,
});

const toggleBtn = {
  background: "transparent",
  color: "var(--headerText)",
  border: "1px solid var(--border)",
  borderRadius: 999,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 12,
  opacity: 0.8,
};

const menuBtn = {
  background: "var(--btnBg)",
  color: "var(--headerText)",
  border: "1px solid var(--primary)",
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 14,
};

const menu = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 8px)",
  background: "var(--card)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  minWidth: 180,
  boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
  padding: 6,
  zIndex: 2000,
};

const menuItem = {
  width: "100%",
  textAlign: "left",
  background: "transparent",
  color: "inherit",
  border: "none",
  borderRadius: 8,
  padding: "8px 10px",
  cursor: "pointer",
  fontSize: 14,
};

const menuItemActive = {
  background: "rgba(37, 99, 235, 0.12)", // faint highlight
  color: "var(--text)",
};

/* ------------ No Access ------------- */
function NoAccess({ onBack }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 16,
        maxWidth: 700,
        margin: "12px auto",
        background: "var(--card)",
        color: "var(--text)",
      }}
    >
      <h2 style={{ marginTop: 0 }}>No permission</h2>
      <p style={{ color: "#6b7280" }}>
        You’re signed in, but your account doesn’t have access to this section.
        If you think this is a mistake, ask an administrator to grant you the{" "}
        <code>admin</code> role in <code>clinician_emails</code>.
      </p>
      <button style={navBtn()} onClick={onBack}>
        ← Back to Dashboard
      </button>
    </div>
  );
}

