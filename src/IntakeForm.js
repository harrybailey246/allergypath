// src/IntakeForm.js
import React from "react";
import { supabase } from "./supabaseClient";

// ---------- Options ----------
const SYMPTOM_OPTIONS = [
  "Hives / Urticaria",
  "Swelling / Angioedema",
  "Wheeze / Chest tightness",
  "Vomiting",
  "Diarrhoea",
  "Abdominal pain",
  "Itchy throat",
  "Dizziness / Faint",
  "Anaphylaxis",
];

const TRIGGER_OPTIONS = [
  "Peanut",
  "Tree nuts",
  "Milk",
  "Egg",
  "Fish",
  "Shellfish",
  "Sesame",
  "Soy",
  "Wheat",
  "Pollen",
  "Dust mite",
  "Animal dander",
  "Exercise",
  "NSAIDs",
  "Latex",
  "Unsure", // 👈 requested
];

const ASTHMA_CONTROL = [
  "well-controlled",
  "sometimes-uncontrolled",
  "poorly-controlled",
  "no-asthma",
];

// ---------- Helpers ----------
function Label({ children }) {
  return <div style={{ fontSize: 14, marginBottom: 6, fontWeight: 600 }}>{children}</div>;
}

function Section({ title, children }) {
  return (
    <div style={{ border: "1px solid #eee", background: "#fff", borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function CheckboxGroup({ options, values, onToggle }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
      {options.map((opt) => {
        const id = `chk-${opt.toLowerCase().replace(/\s+/g, "-")}`;
        const checked = (values || []).some((v) => v?.toLowerCase() === opt.toLowerCase());
        return (
          <label key={opt} htmlFor={id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input id={id} type="checkbox" checked={!!checked} onChange={() => onToggle(opt)} />
            <span>{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

const input = { padding: 10, border: "1px solid #ddd", borderRadius: 10, width: "100%" };
const btn = { padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer" };
const wrap = { maxWidth: 900, margin: "24px auto", fontFamily: "system-ui, sans-serif", color: "#111827" };

export default function IntakeForm() {
  // identity
  const [firstName, setFirstName] = React.useState("");
  const [surname, setSurname] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [dob, setDob] = React.useState("");
  const [nhsNumber, setNhsNumber] = React.useState("");

  // clinical history
  const [symptoms, setSymptoms] = React.useState([]);
  const [onsetTime, setOnsetTime] = React.useState("");
  const [reactionFrequency, setReactionFrequency] = React.useState("");
  const [mostSevereReaction, setMostSevereReaction] = React.useState("");

  // triggers
  const [foodTriggers, setFoodTriggers] = React.useState([]);
  const [otherTriggers, setOtherTriggers] = React.useState("");

  // baked tolerance
  const [bakedEgg, setBakedEgg] = React.useState(false);
  const [bakedMilk, setBakedMilk] = React.useState(false);

  // comorbidities
  const [asthmaControl, setAsthmaControl] = React.useState("no-asthma");
  const [eczema, setEczema] = React.useState(false);
  const [hayFever, setHayFever] = React.useState(false);
  const [otherConditions, setOtherConditions] = React.useState("");

  // medications / readiness
  const [lastAntihistamine, setLastAntihistamine] = React.useState("");
  const [betaBlocker, setBetaBlocker] = React.useState(false);
  const [aceInhibitor, setAceInhibitor] = React.useState(false);
  const [pregnant, setPregnant] = React.useState(false);

  // preparedness
  const [hasAutoInjector, setHasAutoInjector] = React.useState(false);
  const [carriesAutoInjector, setCarriesAutoInjector] = React.useState(false);

  // meta
  const [confirmSubmission, setConfirmSubmission] = React.useState(false);
  const [testNotes, setTestNotes] = React.useState("");

  // files (optional)
  const [files, setFiles] = React.useState([]);
  const [skippedUpload, setSkippedUpload] = React.useState(false);

  // UX
  const [submitting, setSubmitting] = React.useState(false);
  const [okMsg, setOkMsg] = React.useState("");
  const [errMsg, setErrMsg] = React.useState("");

  const toggleSymptom = (val) =>
    setSymptoms((prev) =>
      prev.some((v) => v?.toLowerCase() === val.toLowerCase())
        ? prev.filter((v) => v?.toLowerCase() !== val.toLowerCase())
        : [...prev, val]
    );

  const toggleTrigger = (val) =>
    setFoodTriggers((prev) =>
      prev.some((v) => v?.toLowerCase() === val.toLowerCase())
        ? prev.filter((v) => v?.toLowerCase() !== val.toLowerCase())
        : [...prev, val]
    );

  const resetForm = () => {
    setFirstName("");
    setSurname("");
    setEmail("");
    setPhone("");
    setDob("");
    setNhsNumber("");
    setSymptoms([]);
    setOnsetTime("");
    setReactionFrequency("");
    setMostSevereReaction("");
    setFoodTriggers([]);
    setOtherTriggers("");
    setBakedEgg(false);
    setBakedMilk(false);
    setAsthmaControl("no-asthma");
    setEczema(false);
    setHayFever(false);
    setOtherConditions("");
    setLastAntihistamine("");
    setBetaBlocker(false);
    setAceInhibitor(false);
    setPregnant(false);
    setHasAutoInjector(false);
    setCarriesAutoInjector(false);
    setConfirmSubmission(false);
    setTestNotes("");
    setFiles([]);
    setSkippedUpload(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrMsg("");
    setOkMsg("");

    // quick validation
    if (!firstName.trim() || !surname.trim() || !email.trim() || !phone.trim()) {
      setErrMsg("Please fill in first name, surname, email and phone.");
      return;
    }
    if (!confirmSubmission) {
      setErrMsg("Please tick the confirmation box before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      // 1) Create submission FIRST (no uploads yet) — avoids mobile “record 'pick'…” errors
      const payload = {
        first_name: firstName.trim(),
        surname: surname.trim(),
        email: email.trim(),
        phone: phone.trim(),
        date_of_birth: dob || null,
        nhs_number: nhsNumber || null,

        symptoms,
        onset_time: onsetTime || null,
        reaction_frequency: reactionFrequency || null,
        most_severe_reaction: mostSevereReaction || null,

        food_triggers: foodTriggers,
        other_triggers: otherTriggers || null,

        can_eat_baked_egg: bakedEgg,
        can_eat_baked_milk: bakedMilk,

        asthma_control: asthmaControl,
        eczema,
        hay_fever: hayFever,
        other_conditions: otherConditions || null,

        last_antihistamine: lastAntihistamine ? new Date(lastAntihistamine).toISOString() : null,
        taking_beta_blocker: betaBlocker,
        taking_ace_inhibitor: aceInhibitor,
        pregnant,

        has_auto_injector: hasAutoInjector,
        carries_auto_injector: carriesAutoInjector,

        confirm_submission: true,
        test_notes: testNotes || null,
      };

      const { data: created, error: insertErr } = await supabase
        .from("submissions")
        .insert([payload])
        .select()
        .single();

      if (insertErr) throw insertErr;

      const submissionId = created.id;

      // 2) Optional: upload files (if user provided and didn't press skip)
      let uploadedPaths = [];
      if (!skippedUpload && files && files.length > 0) {
        const bucket = supabase.storage.from("attachments");

        // upload sequentially (mobile-friendly) to avoid weird concurrency issues
        for (const f of files) {
          const cleanName = f.name.replace(/\s+/g, "_");
          const path = `${submissionId}/${Date.now()}_${cleanName}`;
          const { error: upErr } = await bucket.upload(path, f, { cacheControl: "3600", upsert: false });
          if (upErr) {
            // Non-fatal; keep collecting others
            console.warn("Upload failed for", f.name, upErr.message);
          } else {
            uploadedPaths.push(path);
          }
        }

        if (uploadedPaths.length > 0) {
          const { error: patchErr } = await supabase
            .from("submissions")
            .update({ attachments: uploadedPaths })
            .eq("id", submissionId);
          if (patchErr) console.warn("Failed to patch attachments:", patchErr.message);
        }
      }

      setOkMsg("Thanks! Your information has been submitted.");
      resetForm();
    } catch (e1) {
      console.error(e1);
      setErrMsg(e1.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={wrap}>
      <h1 style={{ margin: 0, marginBottom: 8 }}>Allergy Assessment Form</h1>
      <p style={{ color: "#6b7280", marginTop: 0 }}>
        Please complete as much as you can. File upload is optional — you can skip it.
      </p>

      {errMsg && <div style={{ color: "#b91c1c", marginBottom: 8 }}>❌ {errMsg}</div>}
      {okMsg && <div style={{ color: "#059669", marginBottom: 8 }}>✅ {okMsg}</div>}

      <Section title="Patient details">
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <Label>First name*</Label>
            <input style={input} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label>Surname*</Label>
            <input style={input} value={surname} onChange={(e) => setSurname(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <Label>Email*</Label>
            <input type="email" style={input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Phone*</Label>
            <input type="tel" style={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <Label>Date of birth</Label>
            <input type="date" style={input} value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
          <div>
            <Label>NHS number (optional)</Label>
            <input style={input} value={nhsNumber} onChange={(e) => setNhsNumber(e.target.value)} />
          </div>
        </div>
      </Section>

      <Section title="Symptoms & history">
        <Label>Symptoms experienced</Label>
        <CheckboxGroup options={SYMPTOM_OPTIONS} values={symptoms} onToggle={toggleSymptom} />

        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
          <div>
            <Label>When did reactions start?</Label>
            <input style={input} value={onsetTime} onChange={(e) => setOnsetTime(e.target.value)} placeholder="e.g. 2 years ago" />
          </div>
          <div>
            <Label>How often?</Label>
            <input style={input} value={reactionFrequency} onChange={(e) => setReactionFrequency(e.target.value)} placeholder="e.g. monthly" />
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <Label>Most severe reaction (free text)</Label>
          <textarea style={{ ...input, minHeight: 70 }} value={mostSevereReaction} onChange={(e) => setMostSevereReaction(e.target.value)} />
        </div>
      </Section>

      <Section title="Food & other triggers">
        <Label>Possible triggers (tick all that apply)</Label>
        <CheckboxGroup options={TRIGGER_OPTIONS} values={foodTriggers} onToggle={toggleTrigger} />
        <div style={{ marginTop: 8 }}>
          <Label>Other triggers</Label>
          <input style={input} value={otherTriggers} onChange={(e) => setOtherTriggers(e.target.value)} placeholder="e.g. cold air, alcohol" />
        </div>
      </Section>

      <Section title="Baked tolerance">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Toggle label="Can eat baked egg" checked={bakedEgg} onChange={setBakedEgg} />
          <Toggle label="Can eat baked milk" checked={bakedMilk} onChange={setBakedMilk} />
        </div>
      </Section>

      <Section title="Comorbidities">
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <Label>Asthma control</Label>
            <select style={input} value={asthmaControl} onChange={(e) => setAsthmaControl(e.target.value)}>
              {ASTHMA_CONTROL.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Other conditions</Label>
            <input style={input} value={otherConditions} onChange={(e) => setOtherConditions(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
          <Toggle label="Eczema" checked={eczema} onChange={setEczema} />
          <Toggle label="Hay fever" checked={hayFever} onChange={setHayFever} />
        </div>
      </Section>

      <Section title="Medications & readiness">
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <Label>Last antihistamine</Label>
            <input
              type="datetime-local"
              style={input}
              value={lastAntihistamine}
              onChange={(e) => setLastAntihistamine(e.target.value)}
            />
          </div>
          <div>
            <Label>Pregnant</Label>
            <select style={input} value={pregnant ? "yes" : "no"} onChange={(e) => setPregnant(e.target.value === "yes")}>
              <option value="no">No / N/A</option>
              <option value="yes">Yes</option>
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
          <Toggle label="Taking beta-blocker" checked={betaBlocker} onChange={setBetaBlocker} />
          <Toggle label="Taking ACE inhibitor" checked={aceInhibitor} onChange={setAceInhibitor} />
        </div>
      </Section>

      <Section title="Preparedness">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Toggle label="Has auto-injector" checked={hasAutoInjector} onChange={setHasAutoInjector} />
          <Toggle label="Carries auto-injector" checked={carriesAutoInjector} onChange={setCarriesAutoInjector} />
        </div>
      </Section>

      <Section title="Attach photos or documents (optional)">
        <div style={{ display: "grid", gap: 8 }}>
          <input
            type="file"
            multiple
            onChange={(e) => {
              setFiles(Array.from(e.target.files || []));
              setSkippedUpload(false);
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              style={btn}
              onClick={() => {
                setFiles([]);
                setSkippedUpload(true); // 👈 user explicitly chooses to skip
              }}
            >
              Skip upload
            </button>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              {skippedUpload
                ? "You chose to skip file upload."
                : files.length
                ? `${files.length} file(s) selected`
                : "No files selected (optional)"}
            </span>
          </div>
          <div>
            <Label>Anything else you want us to know? (optional)</Label>
            <textarea
              style={{ ...input, minHeight: 70 }}
              value={testNotes}
              onChange={(e) => setTestNotes(e.target.value)}
            />
          </div>
        </div>
      </Section>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={confirmSubmission} onChange={(e) => setConfirmSubmission(e.target.checked)} />
          <span>I confirm the above details are accurate to the best of my knowledge.</span>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <button disabled={submitting} type="submit" style={btn}>
          {submitting ? "Submitting…" : "Submit form"}
        </button>
      </div>
    </form>
  );
}
