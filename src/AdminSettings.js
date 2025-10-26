// src/AdminSettings.js
import React from "react";
import { supabase } from "./supabaseClient";

export default function AdminSettings({ onBack }) {
  const [me, setMe] = React.useState(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [isCheckingRole, setIsCheckingRole] = React.useState(true);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState("");

  const [newEmail, setNewEmail] = React.useState("");
  const [newRole, setNewRole] = React.useState("clinician");

  // load me + role
  React.useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!isMounted) return;

        const u = data?.user || null;
        setMe(u);
        if (!u?.email) {
          setIsAdmin(false);
          return;
        }

        // RLS: non-admins can only read their own row; admins can read all.
        const email = u.email.trim().toLowerCase();
        const { data: roleData, error } = await supabase
          .from("clinician_emails")
          .select("role")
          .eq("email", email)
          .maybeSingle();

        if (!isMounted) return;

        if (!error && roleData?.role === "admin") setIsAdmin(true);
        else setIsAdmin(false);
      } catch (e) {
        if (isMounted) setIsAdmin(false);
      } finally {
        if (isMounted) setIsCheckingRole(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchRows = React.useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("clinician_emails")
        .select("*")
        .order("email", { ascending: true });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(e.message || "Failed to load clinicians");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isAdmin) fetchRows();
  }, [isAdmin, fetchRows]);

  const addClinician = async () => {
    if (!newEmail.trim()) return;
    try {
      const email = newEmail.trim().toLowerCase();
      const role = newRole;
      const { error } = await supabase
        .from("clinician_emails")
        .insert([{ email, role }]);
      if (error) throw error;
      setNewEmail("");
      setNewRole("clinician");
      fetchRows();
    } catch (e) {
      alert(e.message || "Failed to add clinician");
    }
  };

  const removeClinician = async (email) => {
    if (!window.confirm(`Remove ${email}?`)) return;
    try {
      const { error } = await supabase
        .from("clinician_emails")
        .delete()
        .eq("email", email);
      if (error) throw error;
      fetchRows();
    } catch (e) {
      alert(e.message || "Failed to remove");
    }
  };

  const setRole = async (email, role) => {
    try {
      const { error } = await supabase
        .from("clinician_emails")
        .update({ role })
        .eq("email", email);
      if (error) throw error;
      fetchRows();
    } catch (e) {
      alert(e.message || "Failed to update role");
    }
  };

  // Non-admin guard
  if (isCheckingRole) {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>Admin Settings</h1>
          <button style={btn} onClick={onBack}>← Back</button>
        </div>
        <div style={{ color: "#6b7280" }}>Checking permissions…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>Admin Settings</h1>
          <button style={btn} onClick={onBack}>← Back</button>
        </div>
        <div style={{ color: "#b91c1c" }}>
          You don’t have permission to view this page.
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Admin Settings</h1>
        <button style={btn} onClick={onBack}>← Back</button>
      </div>

      {err && <div style={{ color: "#b91c1c", marginBottom: 8 }}>❌ {err}</div>}

      {/* Add clinician */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Add clinician</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px auto", gap: 8 }}>
          <input
            placeholder="email@clinic.org"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            style={input}
          />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={input}>
            <option value="clinician">clinician</option>
            <option value="admin">admin</option>
          </select>
          <button style={btn} onClick={addClinician}>Add</button>
        </div>
      </div>

      {/* List */}
      <div style={{ ...card, marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Clinicians</div>
        {loading ? (
          <div>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No clinicians.</div>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th style={{ width: 240 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.email}>
                  <td>{r.email}</td>
                  <td>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 999,
                      color: "#fff",
                      background: r.role === "admin" ? "#2563eb" : "#6b7280",
                      fontSize: 12
                    }}>
                      {r.role}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {r.role !== "admin" ? (
                        <button style={btn} onClick={() => setRole(r.email, "admin")}>Promote to admin</button>
                      ) : (
                        <button style={btn} onClick={() => setRole(r.email, "clinician")}>Demote to clinician</button>
                      )}
                      <button
                        style={btn}
                        onClick={() => removeClinician(r.email)}
                        disabled={me?.email === r.email} // don’t let you delete yourself
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* styles (matching your app) */
const wrap = { maxWidth: 1000, margin: "24px auto", fontFamily: "system-ui, sans-serif" };
const card = { border: "1px solid #eee", borderRadius: 10, padding: 12 };
const input = { padding: 10, border: "1px solid #ddd", borderRadius: 10, width: "100%" };
const btn = { padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };
const table = { width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" };
