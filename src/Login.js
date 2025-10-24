// src/Login.js
import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const sendLink = async (e) => {
    e.preventDefault();
    setError("");
    const redirectTo = `${window.location.origin}/#dashboard`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) setError(error.message);
    else setSent(true);
  };

  if (sent) {
    return <div>✅ Check your email for the login link.</div>;
  }

  return (
    <form onSubmit={sendLink} style={{ display:"grid", gap:12, maxWidth:360 }}>
      <h2>Clinician sign-in</h2>
      <input
        type="email"
        placeholder="you@nhs.net"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={{ padding:10, border:"1px solid #ddd", borderRadius:8 }}
      />
      {error && <div style={{ color:"#b91c1c" }}>❌ {error}</div>}
      <button type="submit" style={{ padding:"10px 14px", borderRadius:8, border:0, background:"#111827", color:"#fff" }}>
        Send magic link
      </button>
    </form>
  );
}
