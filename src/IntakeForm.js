// src/IntakeForm.js
import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Wizard from "./Wizard";
import { uploadAttachment } from "./storage";

// ---------- small presentational inputs ----------
const grid = { display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" };
const stack = { display: "grid", gap: 12 };
const labelStyle = { fontSize: 14, marginBottom: 6 };
const inputStyle = { padding: 10, borderRadius: 10, border: "1px solid #ddd", width: "100%" };
const areaStyle = { ...inputStyle, minHeight: 90 };
const btnPrimary = { padding: "10px 16px", borderRadius: 10, border: 0, background: "#111827", color: "#fff", cursor: "pointer" };
const chipBase = (active) => ({
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid " + (active ? "#111827" : "#ddd"),
  background: active ? "#111827" : "#fff",
  color: active ? "#fff" : "#111827",
  cursor: "pointer",
});

function Label({ children }) {
  return <div style={labelStyle}>{children}</div>;
}
function Input({ label, value, onChange, type = "text" }) {
  const id = React.useId();
  return (
    <div>
      <Label><label htmlFor={id}>{label}</label></Label>
      <input id={id} value={value} type={type} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}
function TextArea({ label, value, onChange, placeholder }) {
  const id = React.useId();
  return (
    <div>
      <Label><label htmlFor={id}>{label}</label></Label>
      <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={areaStyle} />
    </div>
  );
}
function Select({ label, value, onChange, options }) {
  const id = React.useId();
  return (
    <div>
      <Label><label htmlFor={id}>{label}</label></Label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function Checkbox({ label, checked, onChange }) {
  const id = React.useId();
  return (
    <label htmlFor={id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
function Chip({ children, active, onClick }) {
  return (
    <button type="button" onClick={onClick} style={chipBase(active)}>
      {children}
    </button>
  );
}

function Summary({ values, attachmentPaths }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Summary</h3>
      <ul style={{ lineHeight: 1.6, paddingLeft: 18 }}>
        <li><b>Patient:</b> {values.first_name} {values.surname}</li>
        <li><b>Email:</b> {values.email}</li>
        <li><b>Symptoms:</b> {Array.isArray(values.symptoms) && values.symptoms.length ? values.symptoms.join(", ") : "—"}</li>
        <li><b>Most severe:</b> {values.most_severe_reaction || "—"}</li>
        <li><b>Triggers:</b> {values.food_triggers.length ? values.food_triggers.join(", ") : (values.other_triggers || "—")}</li>
        <li><b>Asthma control:</b> {values.asthma_control || "—"}</li>
        <li><b>Auto-injector:</b> {values.has_auto_injector ? (values.carries_auto_injector ? "has + carries" : "has") : "no"}</li>
        <li><b>Last antihistamine:</b> {values.last_antihistamine ? new Date(values.last_antihistamine).toLocaleString("en-GB") : "—"}</li>
        <li><b>Attachments:</b> {attachmentPaths.length ? `${attachmentPaths.length} file(s)` : "—"}</li>
      </ul>
    </div>
  );
}

// ---------- helpers ----------
function toggleInArray(currentArr, value) {
  const set = new Set(currentArr);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return Array.from(set);
}

// ---------- clinical derivation ----------
function deriveClinical(values) {
  const flags = [];
  let antiWithin72h = false;
  if (values.last_antihistamine) {
    const ms = Date.parse(values.last_antihistamine);
    if (!Number.isNaN(ms)) {
      antiWithin72h = (Date.now() - ms) < 72 * 3600 * 1000;
      if (antiWithin72h) flags.push("Antihistamine <72h");
    }
  }
  const severe = /adrenaline|epi|ambulance|emergency|resus|unconscious|icu|hospital/i
    .test(values.most_severe_reaction || "");
  const asthmaUncontrolled = ["poorly-controlled","sometimes-uncontrolled"].includes(values.asthma_control);
  if (asthmaUncontrolled) flags.push("Asthma not well-controlled");
  if (severe) flags.push("Severe past reaction");
  const high_risk = severe || asthmaUncontrolled;
  const spt_ready = !antiWithin72h;
  return { spt_ready, high_risk, flags };
}

export default function IntakeForm() {
  // form state
  const [values, setValues] = useState({
    first_name: "",
    surname: "",
    email: "",
    phone: "",
    date_of_birth: "",
    symptoms: [],                // array<string>
    most_severe_reaction: "",
    food_triggers: [],           // array<string>
    other_triggers: "",
    asthma_control: "",
    has_auto_injector: false,
    carries_auto_injector: false,
    last_antihistamine: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [attachmentPaths, setAttachmentPaths] = useState([]);

  // persist local draft
  useEffect(() => {
    const saved = localStorage.getItem("ap-intake-v1");
    if (saved) {
      try { setValues(JSON.parse(saved)); } catch {}
    }
  }, []);
  useEffect(() => {
    const id = setTimeout(() => {
      localStorage.setItem("ap-intake-v1", JSON.stringify(values));
    }, 300);
    return () => clearTimeout(id);
  }, [values]);

  const set = (patch) => setValues((v) => ({ ...v, ...patch }));

  // validation per step
  const validate = async (stepIndex) => {
    setError("");
    switch (stepIndex) {
      case 0:
        if (!values.first_name || !values.surname || !values.email) {
          setError("Please complete name and email to continue.");
          return false;
        }
        return true;
      case 1:
        if (values.symptoms.length === 0 || !values.most_severe_reaction) {
          setError("Select symptoms and describe the most severe reaction.");
          return false;
        }
        return true;
      case 2:
        if (values.food_triggers.length === 0 && !values.other_triggers) {
          setError("Select at least one trigger or describe other triggers.");
          return false;
        }
        return true;
      case 3:
        if (!values.asthma_control) {
          setError("Please select your asthma control.");
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleFilesSelected = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const f of files) {
        const path = await uploadAttachment(f);
        uploaded.push(path);
      }
      setAttachmentPaths((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // submit to Supabase
  const handleSubmit = async () => {
    setError("");
    setSaving(true);
    try {
      const derived = deriveClinical(values);
      const payload = {
        first_name: values.first_name,
        surname: values.surname,
        email: values.email,
        phone: values.phone,
        date_of_birth: values.date_of_birth || null,
        symptoms: values.symptoms,
        most_severe_reaction: values.most_severe_reaction,
        food_triggers: values.food_triggers,
        other_triggers: values.other_triggers || null,
        asthma_control: values.asthma_control,
        has_auto_injector: values.has_auto_injector,
        carries_auto_injector: values.carries_auto_injector,
        last_antihistamine: values.last_antihistamine || null,
        spt_ready: derived.spt_ready,
        high_risk: derived.high_risk,
        flags: derived.flags,
        attachments: attachmentPaths, // store storage paths
      };
      const { error: insertError } = await supabase.from("submissions").insert([payload]);
      if (insertError) throw insertError;

      alert("✅ Submitted. Thank you!");
      localStorage.removeItem("ap-intake-v1");
      setValues({
        first_name: "",
        surname: "",
        email: "",
        phone: "",
        date_of_birth: "",
        symptoms: [],
        most_severe_reaction: "",
        food_triggers: [],
        other_triggers: "",
        asthma_control: "",
        has_auto_injector: false,
        carries_auto_injector: false,
        last_antihistamine: "",
      });
      setAttachmentPaths([]);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  // symptom and triggers sets
  const SYMPTOMS = [
    "Hives / urticaria",
    "Itching",
    "Swelling (lips/face)",
    "Wheezing",
    "Shortness of breath",
    "Dizziness / faint",
    "Abdominal pain",
    "Vomiting",
  ];
  const TRIGGERS = ["egg","milk","peanut","tree nut","sesame","fish","shellfish","soy","wheat"];

  const steps = [
    {
      title: "Patient details",
      content: (
        <div style={grid}>
          <Input label="First name *" value={values.first_name} onChange={(v) => set({ first_name: v })} />
          <Input label="Surname *" value={values.surname} onChange={(v) => set({ surname: v })} />
          <Input type="email" label="Email *" value={values.email} onChange={(v) => set({ email: v })} />
          <Input label="Phone" value={values.phone} onChange={(v) => set({ phone: v })} />
          <Input type="date" label="Date of birth" value={values.date_of_birth} onChange={(v) => set({ date_of_birth: v })} />
        </div>
      ),
    },
    {
      title: "Symptoms & severity",
      content: (
        <div style={stack}>
          <div>
            <Label>Symptoms (select all that apply) *</Label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
              {SYMPTOMS.map((s) => (
                <Checkbox
                  key={s}
                  label={s}
                  checked={values.symptoms.includes(s)}
                  onChange={() => set({ symptoms: toggleInArray(values.symptoms, s) })}
                />
              ))}
            </div>
          </div>
          <TextArea
            label="Most severe reaction *"
            value={values.most_severe_reaction}
            onChange={(v) => set({ most_severe_reaction: v })}
            placeholder="Describe the worst episode and what happened"
          />
        </div>
      ),
    },
    {
      title: "Suspected triggers",
      content: (
        <div style={stack}>
          <div>
            <Label>Food triggers (select all that apply)</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {TRIGGERS.map((t) => (
                <Chip key={t} active={values.food_triggers.includes(t)} onClick={() => set({ food_triggers: toggleInArray(values.food_triggers, t) })}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>
          <TextArea
            label="Other triggers"
            value={values.other_triggers}
            onChange={(v) => set({ other_triggers: v })}
            placeholder="Latex, drugs, exercise, etc."
          />
        </div>
      ),
    },
    {
      title: "Health & preparedness",
      content: (
        <div style={grid}>
          <Select
            label="Asthma control *"
            value={values.asthma_control}
            onChange={(v) => set({ asthma_control: v })}
            options={[
              { value: "", label: "Select..." },
              { value: "well-controlled", label: "Well controlled" },
              { value: "sometimes-uncontrolled", label: "Sometimes uncontrolled" },
              { value: "poorly-controlled", label: "Poorly controlled" },
              { value: "no-asthma", label: "No asthma" },
            ]}
          />
          <div style={{ display: "grid", gap: 10 }}>
            <Checkbox
              label="I have an adrenaline auto-injector (e.g. EpiPen, Jext)"
              checked={values.has_auto_injector}
              onChange={(v) => set({ has_auto_injector: v })}
            />
            {values.has_auto_injector && (
              <Checkbox
                label="I usually carry it with me"
                checked={values.carries_auto_injector}
                onChange={(v) => set({ carries_auto_injector: v })}
              />
            )}
          </div>
        </div>
      ),
    },
    {
      title: "Test readiness",
      content: (
        <div style={grid}>
          <Input
            type="datetime-local"
            label="When did you last take an antihistamine?"
            value={values.last_antihistamine}
            onChange={(v) => set({ last_antihistamine: v })}
          />
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: -6 }}>
            Tip: avoid antihistamines for 5–7 days before skin prick tests (unless told otherwise).
          </p>
        </div>
      ),
    },
    {
      title: "Attachments (optional)",
      content: (
        <div style={stack}>
          <div>
            <Label>Upload files (referral letters, test results, images)</Label>
            <input type="file" multiple onChange={(e) => handleFilesSelected(e.target.files)} />
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              You can add multiple files. Common formats: JPG/PNG/PDF.
            </p>
          </div>
          {uploading && <div>Uploading…</div>}
          {attachmentPaths.length > 0 && (
            <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
              <b>Attached files:</b>
              <ul style={{ marginTop: 6, lineHeight: 1.6 }}>
                {attachmentPaths.map((p) => (
                  <li key={p} style={{ fontSize: 13, color: "#374151" }}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Review & submit",
      content: (
        <div style={stack}>
          <Summary values={values} attachmentPaths={attachmentPaths} />
          {error && <div style={{ color: "#b91c1c" }}>❌ {error}</div>}
          <button onClick={handleSubmit} disabled={saving} style={btnPrimary}>
            {saving ? "Submitting..." : "Submit"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 800, margin: "24px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>AllergyPath — Pre-Assessment</h1>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>~8–10 minutes • helps prepare your allergy visit</p>
      {error && <div style={{ color: "#b91c1c", marginBottom: 8 }}>❌ {error}</div>}
      <Wizard steps={steps} validate={validate} onSubmit={handleSubmit} />
    </div>
  );
}
