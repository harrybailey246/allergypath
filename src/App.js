// src/App.js
import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import IntakeForm from "./IntakeForm";
import Dashboard from "./Dashboard";
import ClinicianSchedule from "./ClinicianSchedule";
import Login from "./Login";
import AdminAnalytics from "./AdminAnalytics";
import AdminSettings from "./AdminSettings";
import PatientPortal from "./PatientPortal";
import BookAndPay from "./BookAndPay";
import ThemedPage from "./ThemedPage";
import PartnerPortal from "./PartnerPortal";
import BookingRequests from "./BookingRequests";

// Hash-based navigation helper
window.setView = (view) => {
  if (typeof window !== "undefined") window.location.hash = "#" + view;
};

/* -------- theming helpers (CSS variables) -------- */
const LIGHT = {
  "--bg": "#f5f7fb",
  "--text": "#0f172a",
  "--header": "linear-gradient(135deg, #0b1220 0%, #1d2940 100%)",
  "--headerText": "#ffffff",
  "--card": "#ffffff",
  "--border": "#e5e7eb",
  "--primary": "#2563eb",
  "--primaryText": "#ffffff",
  "--btnBg": "rgba(255,255,255,0.92)",
  "--btn-bg": "rgba(255,255,255,0.92)",
  "--btnText": "#0f172a",
  "--btn-text": "#0f172a",
  "--btnBorder": "#dbe1f1",
  "--btn-border": "#dbe1f1",
  "--muted": "#6b7280",
  "--shadow": "0 22px 45px rgba(15, 23, 42, 0.12)",
  "--focus": "0 0 0 3px rgba(37, 99, 235, 0.35)",
  "--focus-ring": "0 0 0 3px rgba(37, 99, 235, 0.35)",
  "--danger": "#ef4444",
  "--success": "#16a34a",
  "--warning": "#f59e0b",
  "--pillBg": "rgba(15, 23, 42, 0.06)",
  "--pill-bg": "rgba(15, 23, 42, 0.06)",
  "--pillActiveBg": "rgba(37, 99, 235, 0.12)",
  "--pill-active-bg": "rgba(37, 99, 235, 0.12)",
  "--pillActiveText": "#1d4ed8",
  "--pill-active-text": "#1d4ed8",
};
const DARK = {
  "--bg": "#0c1222",
  "--text": "#e5e7eb",
  "--header": "linear-gradient(135deg, #080d1a 0%, #101b33 100%)",
  "--headerText": "#e5e7eb",
  "--card": "#111827",
  "--border": "#1f2937",
  "--primary": "#60a5fa",
  "--primaryText": "#0b1220",
  "--btnBg": "rgba(15, 23, 42, 0.78)",
  "--btn-bg": "rgba(15, 23, 42, 0.78)",
  "--btnText": "#e5e7eb",
  "--btn-text": "#e5e7eb",
  "--btnBorder": "rgba(96, 165, 250, 0.28)",
  "--btn-border": "rgba(96, 165, 250, 0.28)",
  "--muted": "#94a3b8",
  "--shadow": "0 30px 65px rgba(8, 15, 35, 0.45)",
  "--focus": "0 0 0 3px rgba(96, 165, 250, 0.38)",
  "--focus-ring": "0 0 0 3px rgba(96, 165, 250, 0.38)",
  "--danger": "#f87171",
  "--success": "#34d399",
  "--warning": "#fbbf24",
  "--pillBg": "rgba(148, 163, 184, 0.1)",
  "--pill-bg": "rgba(148, 163, 184, 0.1)",
  "--pillActiveBg": "rgba(96, 165, 250, 0.28)",
  "--pill-active-bg": "rgba(96, 165, 250, 0.28)",
  "--pillActiveText": "#e0f2fe",
  "--pill-active-text": "#e0f2fe",
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

  // Normalize `?view=` query param into hash routing
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get("view");
    if (!viewParam) return;
    const normalized = viewParam.trim();
    if (!normalized) return;

    setLocalView(normalized);
    window.setView(normalized);
    params.delete("view");

    const remaining = params.toString();
    const nextUrl =
      window.location.pathname + (remaining ? `?${remaining}` : "") + window.location.hash;
    window.history.replaceState({}, "", nextUrl);
  }, []);

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
          <Dashboard
            isAdmin={isAdmin}
            onOpenAdminSettings={
              isAdmin ? () => window.setView("adminSettings") : undefined
            }
            onOpenAnalytics={
              isAdmin ? () => window.setView("analytics") : undefined
            }
            onOpenPartner={() => window.setView("partner")}
            onOpenSchedule={() => window.setView("schedule")}
          />
        ) : (
          <Login />
        );

      case "schedule":
        return authed ? (
          <ClinicianSchedule onBack={() => window.setView("dashboard")} />
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

      case "adminSettings":
        return authed && isAdmin ? (
          <AdminSettings onBack={() => window.setView("dashboard")} />
        ) : authed ? (
          <NoAccess onBack={() => window.setView("dashboard")} />
        ) : (
          <Login />
        );

      case "bookingRequests":
        return authed && isAdmin ? (
          <ThemedPage title="Booking Requests">
            <BookingRequests />
          </ThemedPage>
        ) : authed ? (
          <NoAccess onBack={() => window.setView("dashboard")} />
        ) : (
          <Login />
        );

      case "book":
        return (
          <ThemedPage title="Book & Pay">
            <BookAndPay />
          </ThemedPage>
        );

      case "patientPortal":
        return (
          <ThemedPage title="Patient Portal">
            <PatientPortal />
          </ThemedPage>
        );

      case "partner":
        return authed ? (
          <ThemedPage title="Partner Tools">
            <PartnerPortal />
          </ThemedPage>
        ) : (
          <Login />
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
        transition: "background 0.4s ease, color 0.4s ease",
      }}
    >
      <style>{`
        @keyframes menu-fade {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .menu-section__toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: transparent;
          border: none;
          color: var(--muted);
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 10px 12px;
        }

        .menu-section__toggle::after {
          content: "";
          flex: 1;
          height: 1px;
          background: var(--border);
          margin-left: 12px;
          opacity: 0.6;
        }

        .menu-section__toggle span {
          flex: none;
        }

        .menu-section__list {
          display: grid;
          gap: 2px;
          padding: 6px 0 8px 0;
          margin: 0;
        }

        .menu-section__list.collapsed {
          display: none;
        }

        .menu-section__item {
          padding-left: 26px;
          font-size: 13px;
        }
      `}</style>
      {/* Header / Nav */}
      <header
        style={{
          background: "var(--header)",
          color: "var(--headerText)",
          padding: "18px 26px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 18,
          boxShadow: "0 18px 40px rgba(7, 11, 26, 0.35)",
        }}
      >
        {/* Logo + Theme Toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 16px",
              borderRadius: 16,
              background: "linear-gradient(135deg, rgba(96,165,250,0.25), rgba(129,140,248,0.18))",
              border: "1px solid rgba(148, 163, 184, 0.3)",
              boxShadow: "0 12px 30px rgba(8, 15, 35, 0.28)",
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                display: "grid",
                placeItems: "center",
                background: "rgba(15, 23, 42, 0.65)",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: 1.2,
              }}
            >
              AP
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                }}
              >
                Allergy
                <span style={{ color: "var(--primary)" }}>Path</span>
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: 0.4,
                  color: "rgba(226, 232, 240, 0.92)",
                  textTransform: "uppercase",
                }}
              >
                Specialist allergy care, simplified
              </span>
            </div>
          </div>
          <button onClick={toggleTheme} style={toggleBtn}>
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {authed && (
            <button
              style={navBtn(view === "schedule")}
              onClick={() => window.setView("schedule")}
            >
              Clinician Schedule
            </button>
          )}

          <div style={{ display: "flex", flexDirection: "column", textAlign: "right" }}>
            {authed && (
              <span style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                Signed in as <b>{user.email}</b>
                {isAdmin ? " • Admin" : ""}
              </span>
            )}
          </div>

          {/* Dropdown Navigation */}
          <NavMenu authed={authed} isAdmin={isAdmin} current={view} />
        </div>
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
  const [expanded, setExpanded] = React.useState({});

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

  const sections = React.useMemo(() => {
    const config = [
      {
        id: "patient-experience",
        label: "Patient Experience",
        items: [
          { label: "Patient Form", view: "intake" },
          { label: "Book & Pay", view: "book" },
          { label: "Patient Portal", view: "patientPortal" },
        ],
      },
      {
        id: "clinician-tools",
        label: "Clinician Tools",
        items: [
          { label: "Dashboard", view: "dashboard" },
          { label: "Clinician Schedule", view: "schedule", requiresAuth: true },
          { label: "Partner Tools", view: "partner", requiresAuth: true },
        ],
      },
      {
        id: "admin",
        label: "Admin",
        items: [
          {
            label: "Booking Requests",
            view: "bookingRequests",
            requiresAuth: true,
            requiresAdmin: true,
          },
          {
            label: "Analytics",
            view: "analytics",
            requiresAuth: true,
            requiresAdmin: true,
          },
          {
            label: "Admin Settings",
            view: "adminSettings",
            requiresAuth: true,
            requiresAdmin: true,
          },
        ],
      },
    ];

    return config
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (item.requiresAdmin && !isAdmin) return false;
          if (item.requiresAuth && !authed) return false;
          return true;
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [authed, isAdmin]);

  React.useEffect(() => {
    if (!open) return;
    setExpanded((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      if (sections.length === 0) return prev;
      return { [sections[0].id]: true };
    });
  }, [open, sections]);

  const handleSectionToggle = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleNavigate = (view) => {
    window.setView(view);
    setOpen(false);
  };

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

      <div
        role="menu"
        aria-hidden={!open}
        style={{
          ...menu,
          opacity: open ? 1 : 0,
          visibility: open ? "visible" : "hidden",
          pointerEvents: open ? "auto" : "none",
          transform: open ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.97)",
        }}
      >
        {sections.map((section) => (
          <MenuSection
            key={section.id}
            section={section}
            current={current}
            expanded={!!expanded[section.id]}
            onToggle={() => handleSectionToggle(section.id)}
            onNavigate={handleNavigate}
          />
        ))}

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
    </div>
  );
}

function MenuItem({ children, onClick, active, className, style }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={className}
      style={{ ...menuItem, ...style, ...(active ? menuItemActive : {}) }}
    >
      {children}
    </button>
  );
}

function MenuSection({ section, current, expanded, onToggle, onNavigate }) {
  return (
    <div>
      <button
        type="button"
        className="menu-section__toggle"
        onClick={onToggle}
        aria-expanded={expanded ? "true" : "false"}
      >
        <span>{section.label}</span>
        <span>{expanded ? "▴" : "▾"}</span>
      </button>

      <div className={`menu-section__list${expanded ? "" : " collapsed"}`}>
        {section.items.map((item) => (
          <MenuItem
            key={item.view}
            active={current === item.view}
            onClick={() => onNavigate(item.view)}
            className="menu-section__item"
            style={nestedMenuItem}
          >
            {item.label}
          </MenuItem>
        ))}
      </div>
    </div>
  );
}

/* ------------ Styling ------------- */
const navBtn = (active = false) => ({
  background: active
    ? "linear-gradient(135deg, rgba(96,165,250,0.75), rgba(129,140,248,0.68))"
    : "linear-gradient(135deg, rgba(96,165,250,0.24), rgba(129,140,248,0.18))",
  color: active ? "var(--primaryText)" : "var(--headerText)",
  border: active
    ? "1px solid rgba(148, 163, 184, 0.45)"
    : "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 8,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: 14,
  transition:
    "background 0.2s ease, color 0.2s ease, opacity 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease",
  opacity: active ? 1 : 0.98,
  boxShadow: active ? "0 14px 28px rgba(8, 15, 35, 0.25)" : "0 10px 20px rgba(15, 23, 42, 0.18)",
});

const toggleBtn = {
  background: "rgba(255,255,255,0.15)",
  color: "var(--headerText)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 999,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: 12,
  backdropFilter: "blur(12px)",
  transition: "background 0.2s ease, transform 0.2s ease, border 0.2s ease",
};

const menuBtn = {
  background: "rgba(255,255,255,0.12)",
  color: "var(--headerText)",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 14,
  transition: "background 0.2s ease, transform 0.2s ease, border 0.2s ease",
};

const menu = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 8px)",
  background: "var(--card)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  minWidth: 220,
  boxShadow: "var(--shadow)",
  padding: 6,
  zIndex: 2000,
  animation: "menu-fade 0.18s ease forwards",
  backdropFilter: "blur(14px)",
  transition: "opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease",
};

const menuItem = {
  width: "100%",
  textAlign: "left",
  background: "transparent",
  color: "inherit",
  border: "none",
  borderRadius: 10,
  padding: "10px 12px",
  cursor: "pointer",
  fontSize: 14,
};

const menuItemActive = {
  background: "rgba(37, 99, 235, 0.14)",
  color: "var(--primary)",
  fontWeight: 600,
};

const nestedMenuItem = {
  paddingLeft: 26,
  fontSize: 13,
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
      <p style={{ color: "var(--muted)" }}>
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
