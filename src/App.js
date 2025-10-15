// src/App.js
import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import IntakeForm from "./IntakeForm";
import Dashboard from "./Dashboard";
import Login from "./Login";
import AdminAnalytics from "./AdminAnalytics";

// ✅ Global navigation helper (keeps your nav buttons working exactly as before)
window.setView = (view) => {
  if (typeof window !== "undefined") {
    window.location.hash = "#" + view;
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setLocalView] = useState(
    window.location.hash.replace("#", "") || "intake"
  );
  const [isAdmin, setIsAdmin] = useState(false);

  // 🔁 Update view when hash changes
  useEffect(() => {
    const handleHashChange = () =>
      setLocalView(window.location.hash.replace("#", "") || "intake");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // 👤 Load user and listen for changes
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

  // 🔑 Look up this user's role from clinician_emails (RLS allows only their own row)
  useEffect(() => {
    const getRole = async () => {
      setIsAdmin(false);
      if (!user?.email) return;
      const { data, error } = await supabase
        .from("clinician_emails")
        .select("role")
        .eq("email", user.email)
        .maybeSingle();
      if (!error && data?.role === "admin") setIsAdmin(true);
    };
    getRole();
  }, [user?.email]);

  const authed = !!user;

  // 🎯 View routing
  const renderView = () => {
    switch (view) {
      case "dashboard":
        return authed ? <Dashboard /> : <Login />;
      case "analytics":
        // Only admins can see this view
        return authed && isAdmin ? <AdminAnalytics /> : <Login />;
      case "login":
        return <Login />;
      case "intake":
      default:
        return <IntakeForm />;
    }
  };

  // 🧱 Layout (keeps your styling + buttons)
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#f9fafb",
        minHeight: "100vh",
        color: "#111827",
      }}
    >
      {/* ===== HEADER / NAV ===== */}
      <header
        style={{
          background: "#111827",
          color: "white",
          padding: "12px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>AllergyPath</h1>
          {authed && (
            <span style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
              Signed in as <b>{user.email}</b>
              {isAdmin ? " • Admin" : ""}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => window.setView("intake")}
            style={navBtn(view === "intake")}
          >
            Patient Form
          </button>

          <button
            onClick={() => window.setView("dashboard")}
            style={navBtn(view === "dashboard")}
          >
            Dashboard
          </button>

          {/* 🔒 Only show Analytics if user is admin */}
          {authed && isAdmin && (
            <button
              onClick={() => window.setView("analytics")}
              style={navBtn(view === "analytics")}
            >
              Analytics
            </button>
          )}

          {authed ? (
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.setView("login");
              }}
              style={navBtn()}
            >
              Sign Out
            </button>
          ) : (
            <button
              onClick={() => window.setView("login")}
              style={navBtn(view === "login")}
            >
              Clinician Login
            </button>
          )}
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <main style={{ padding: 20 }}>{renderView()}</main>
    </div>
  );
}

// ===== Button Style (unchanged look) =====
const navBtn = (active = false) => ({
  background: active ? "#2563eb" : "white",
  color: active ? "white" : "#111827",
  border: "1px solid #2563eb",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 14,
  transition: "background 0.2s, color 0.2s",
});
