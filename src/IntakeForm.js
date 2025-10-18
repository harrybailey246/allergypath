// src/IntakeForm.js
import React, { useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

// ---- tiny UI bits reused across steps ----
const Page = ({ children }) => (
  <div style={{ background: "white", border: "1px solid #eee", borderRadius: 12, padding: 16, maxWidth: 760, margin: "0 auto" }}>
    {children}
  </div>
);
const Row = ({ children }) => <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>{children}</div>;
const Label = ({ children }) => <div style={{ fontWeight: 600, fontSize: 14 }}>{children}</div>;
const Input = (props) => <input {...props} style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10, width: "100%" }} />;
const Textarea = (props) => <textarea {...props} style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10, width: "100%", minHeight: 80 }} />;
const Btn = ({ children, ...props }) => (
  <button {...props} style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, background: "#fff", cursor: "pointer" }}>
    {children}
  </button>
);
const Pill = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid #ddd",
      cursor: "pointer",
      background: active ? "#111827" : "#fff",
      color: active ? "#fff" : "#111827",
    }}
  >
    {children}
  </button>
);

const SYMPTOMS = [
  "hives/urticaria",
  "angioedema",
  "wheezing/shortness of breath",
  "vomiting",
  "diarrhoea",
  "abdominal pain",
  "dizziness/fainting",
  "throat tightness",
  "lip/tongue swelling",
];

const FOOD_TRIGGERS = [
  "peanut",
  "tree nuts",
  "milk",
  "egg",
  "wheat",
  "soy",
  "fish",
  "shellfish",
  "sesame",
  "other",
  "unsure", // <-- NEW: Unsure option
];

export default function IntakeForm() {
  const [step, setStep] = useState(1);
  const totalSteps = 6;

  // --- form state ----
  const [first_name, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [date_of_birth, setDOB] = useState("");

  const [nhs_number, setNhs] = useState("");
  const [symptoms, setSymptoms] = useState([]);
  const [onset_time, setOnsetTime] = useState("");
  const [reaction_frequency, setReactionFrequency] = useState("");
  const [most_severe_reaction, setMostSevere] = useState("");

  const [food_triggers, setFoodTriggers] = useState([]);
  const [other_triggers, setOtherTriggers] = useState("");

  const [can_eat_baked_egg, setBakedEgg] = useState(false);
  const [can_eat_baked_milk, setBakedMilk] = useState(false);

  const [asthma_control, setAsthma] = useState("");
  const [eczema, setEczema] = useState(false);
  const [hay_fever, setHayFever] = useState(false);
  const [other_conditions, setOtherConditions] = useState("");

  const [last_antihistamine, setLastAnti] = useState("");
  const [taking_beta_blocker, setBB] = useState(false);
  const [taking_ace_inhibitor, setACE] = useState(false);
  const [pregnant, setPregnant] = useState(false);

  const [has_auto_injector, setHasAI] = useState(false);
  const [carries_auto_injector, setCarriesAI] = useState(false);

  const [confirm_submission, setConfirmSubmission] = useState(false);
  const [test_notes, setTestNotes] = useState("");

  // attachments (optional)
  const [files, setFiles] = useState([]); // FileList -> we’ll copy to array
  const [uploadSkipped, setUploadSkipped] = useState(false); // NEW: allow skipping upload

  // UX
  const [submitting, setSubmitting] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");

  const canNext = useMemo(() => {
    if (step === 1) {
      return first_name && surname && email && phone;
    }
    if (step === 6) {
      return confirm_submission;
    }
    return true;
  }, [step, first_name, surname, email, phone, confirm_submission]);

  const toggleArrayVal = (arr, setArr, val) => {
    if (arr.includes(val)) setArr(arr.filter((v) => v !== val));
    else setArr([...arr, val]);
  };

  const goNext = () => setStep((s) => Math.min(totalSteps, s + 1));
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  // ---- submit handler ----
  const handleSubmit = async () => {
    setSubmitting(true);
    setErrMsg("");
    setOkMsg("");

    try {
      // 1) create submission first (so we have the id)
      const payload = {
        first_name,
        surname,
        email,
        phone,
        date_of_birth: date_of_birth || null,
        nhs_number: nhs_number || null,

        symptoms,
        onset_time: onset_time || null,
        reaction_frequency: reaction_frequency || null,
        most_severe_reaction: most_severe_reaction || null,

        food_triggers,
        other_triggers: other_triggers || null,

        can_eat_baked_egg,
        can_eat_baked_milk,

        asthma_control: asthma_control || null,
        eczema,
        hay_fever,
        other_conditions: other_conditions || null,

        last_antihistamine: last_antihistamine ? new Date(last_antihistamine).toISOString() : null,
        taking_beta_blocker,
        taking_ace_inhibitor,
        pregnant,

        has_auto_injector,
        carries_auto_injector,

        confirm_submission,
        test_notes: test_notes || null,
      };

      // insert & return id (use .select().single() for portable returning)
      const { data: created, error: insertErr } = await supabase
        .from("submissions")
        .insert([payload])
        .select("id")
        .single();

      if (insertErr) throw insertErr;
      const submissionId = created.id;

      // 2) optional file uploads — ONLY if user selected files and didn’t skip
      const uploadedPaths = [];
      if (!uploadSkipped && files && files.length > 0) {
        // “record 'pick' is not assigned yet” on phones typically happens when a
        // picker object is used after it’s gone. We avoid that by reading from the
        // plain <input type="file"> synchronously and uploading each File directly.
        for (const f of files) {
          // protect against nullish entries
          if (!f || !f.name) continue;
          const path = `${submissionId}/${Date.now()}_${sanitizeName(f.name)}`;
          const { error: upErr } = await supabase.storage
            .from("attachments")
            .upload(path, f, { upsert: false });

          if (upErr) {
            // don’t fail the entire submission if one file fails — just log
            console.error("upload error", upErr);
          } else {
            uploadedPaths.push(path);
          }
        }
      }

      // 3) store object paths on the row (so clinicians can generate signed URLs)
      if (uploadedPaths.length > 0) {
        await supabase
          .from("submissions")
          .update({ attachments: uploadedPaths })
          .eq("id", submissionId);
      }

      setOkMsg("Thanks — your form was submitted successfully.");
      // reset minimal fields; don’t force a full reset so users can review
      setStep(1);
      setFiles([]);
      setUploadSkipped(false);
      setConfirmSubmission(false);
    } catch (e) {
      console.error(e);
      setErrMsg(e.message || "Sorry, something went wrong submitting your form.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", fontFamily: "system-ui, sans-serif" }}>
      {/* progress */}
      <div style={{ marginBottom: 12, color: "#6b7280" }}>
        Step {step} of {totalSteps}
      </div>

      {errMsg && (
        <div style={{ background: "#fee2e2", border: "1px solid #fecaca", color: "#7f1d1d", padding: 10, borderRadius: 8, marginBottom: 10 }}>
          ❌ {errMsg}
        </div>
      )}
      {okMsg && (
        <div style={{ background: "#dcfce7", border: "1px solid #bbf7d0", color: "#14532d", padding: 10, borderRadius: 8, marginBottom: 10 }}>
          ✅ {okMsg}
        </div>
      )}

      {/* ====== STEP 1: Patient identity ====== */}
      {step === 1 && (
        <Page>
          <h2 style={{ marginTop: 0 }}>Patient details</h2>
          <Row>
            <Label>First name</Label>
            <Input value={first_name} onChange={(e) => setFirstName(e.target.value)} />
          </Row>
          <Row>
            <Label>Surname</Label>
            <Input value={surname} onChange={(e) => setSurname(e.target.value)} />
          </Row>
          <Row>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Row>
          <Row>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Row>
          <Row>
            <Label>Date of birth</Label>
            <Input type="date" value={date_of_birth} onChange={(e) => setDOB(e.target.value)} />
          </Row>
          <Row>
            <Label>NHS number (optional)</Label>
            <Input value={nhs_number} onChange={(e) => setNhs(e.target.value)} />
          </Row>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn disabled>← Back</Btn>
            <Btn disabled={!canNext} onClick={goNext}>Next →</Btn>
          </div>
        </Page>
      )}

      {/* ====== STEP 2: Symptoms & history ====== */}
      {step === 2 && (
        <Page>
          <h2 style={{ marginTop: 0 }}>Symptoms & reaction history</h2>

          <Row>
            <Label>Symptoms (select all that apply)</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {SYMPTOMS.map((s) => (
                <Pill key={s} active={symptoms.includes(s)} onClick={() => toggleArrayVal(symptoms, setSymptoms, s)}>
                  {s}
                </Pill>
              ))}
            </div>
          </Row>

          <Row>
            <Label>When did reactions start?</Label>
            <Input value={onset_time} onChange={(e) => setOnsetTime(e.target.value)} placeholder="e.g. 6 months ago" />
          </Row>

          <Row>
            <Label>How often do reactions occur?</Label>
            <Input value={reaction_frequency} onChange={(e) => setReactionFrequency(e.target.value)} placeholder="e.g. monthly" />
          </Row>

          <Row>
            <Label>Most severe reaction (brief description)</Label>
            <Textarea value={most_severe_reaction} onChange={(e) => setMostSevere(e.target.value)} />
          </Row>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn onClick={goPrev}>← Back</Btn>
            <Btn onClick={goNext}>Next →</Btn>
          </div>
        </Page>
      )}

      {/* ====== STEP 3: Triggers & baked tolerance ====== */}
      {step === 3 && (
        <Page>
          <h2 style={{ marginTop: 0 }}>Possible triggers</h2>

          <Row>
            <Label>Food triggers (select all that apply)</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FOOD_TRIGGERS.map((t) => (
                <Pill key={t} active={food_triggers.includes(t)} onClick={() => toggleArrayVal(food_triggers, setFoodTriggers, t)}>
                  {t}
                </Pill>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Tip: choose <b>“unsure”</b> if you’re not certain yet.
            </div>
          </Row>

          {food_triggers.includes("other") && (
            <Row>
              <Label>Other triggers</Label>
              <Input value={other_triggers} onChange={(e) => setOtherTriggers(e.target.value)} placeholder="e.g. chickpea, lupin" />
            </Row>
          )}

          <Row>
            <Label>Baked tolerance (optional)</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill active={can_eat_baked_egg} onClick={() => setBakedEgg((v) => !v)}>Can eat baked egg</Pill>
              <Pill active={can_eat_baked_milk} onClick={() => setBakedMilk((v) => !v)}>Can eat baked milk</Pill>
            </div>
          </Row>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn onClick={goPrev}>← Back</Btn>
            <Btn onClick={goNext}>Next →</Btn>
          </div>
        </Page>
      )}

      {/* ====== STEP 4: Comorbidities & readiness ====== */}
      {step === 4 && (
        <Page>
          <h2 style={{ marginTop: 0 }}>Health & medications</h2>

          <Row>
            <Label>Asthma control</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["well-controlled", "sometimes-uncontrolled", "poorly-controlled", "none"].map((a) => (
                <Pill key={a} active={asthma_control === a} onClick={() => setAsthma(a)}>{a}</Pill>
              ))}
            </div>
          </Row>

          <Row>
            <Label>Other conditions</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill active={eczema} onClick={() => setEczema((v) => !v)}>Eczema</Pill>
              <Pill active={hay_fever} onClick={() => setHayFever((v) => !v)}>Hay fever</Pill>
            </div>
            <Textarea value={other_conditions} onChange={(e) => setOtherConditions(e.target.value)} placeholder="Add any other relevant conditions" />
          </Row>

          <Row>
            <Label>Last antihistamine taken (date & time)</Label>
            <Input type="datetime-local" value={last_antihistamine} onChange={(e) => setLastAnti(e.target.value)} />
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              (We usually need at least 72 hours without antihistamines before skin prick testing.)
            </div>
          </Row>

          <Row>
            <Label>Medications & status</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill active={taking_beta_blocker} onClick={() => setBB((v) => !v)}>Taking beta-blocker</Pill>
              <Pill active={taking_ace_inhibitor} onClick={() => setACE((v) => !v)}>Taking ACE inhibitor</Pill>
              <Pill active={pregnant} onClick={() => setPregnant((v) => !v)}>Pregnant</Pill>
            </div>
          </Row>

          <Row>
            <Label>Adrenaline auto-injector</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill active={has_auto_injector} onClick={() => setHasAI((v) => !v)}>I have one</Pill>
              <Pill active={carries_auto_injector} onClick={() => setCarriesAI((v) => !v)}>I carry it with me</Pill>
            </div>
          </Row>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn onClick={goPrev}>← Back</Btn>
            <Btn onClick={goNext}>Next →</Btn>
          </div>
        </Page>
      )}

      {/* ====== STEP 5: Attachments (optional) ====== */}
      {step === 5 && (
        <Page>
          <h2 style={{ marginTop: 0 }}>Upload documents (optional)</h2>
          <p style={{ color: "#6b7280", marginTop: 0 }}>
            You can upload photos of rashes, previous letters, or test results. This step is optional — you can also <b>skip</b> it.
          </p>

          <Row>
            <Label>Files</Label>
            <input
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10, width: "100%", background: "#fff" }}
            />
            {files?.length > 0 && (
              <div style={{ fontSize: 12, color: "#6b7280" }}>{files.length} file(s) selected</div>
            )}
          </Row>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn onClick={() => { setFiles([]); setUploadSkipped(true); goNext(); }}>
              Skip upload
            </Btn>
            <Btn onClick={goPrev}>← Back</Btn>
            <Btn onClick={() => { setUploadSkipped(false); goNext(); }}>Next →</Btn>
          </div>
        </Page>
      )}

      {/* ====== STEP 6: Review & submit ====== */}
      {step === 6 && (
        <Page>
          <h2 style={{ marginTop: 0 }}>Review & submit</h2>

          <Row>
            <Label>Any final notes for the clinic? (optional)</Label>
            <Textarea value={test_notes} onChange={(e) => setTestNotes(e.target.value)} placeholder="Add anything else you want us to know" />
          </Row>

          <Row>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={confirm_submission} onChange={(e) => setConfirmSubmission(e.target.checked)} />
              I confirm the information above is accurate to the best of my knowledge.
            </label>
          </Row>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn onClick={goPrev}>← Back</Btn>
            <Btn disabled={!confirm_submission || submitting} onClick={handleSubmit}>
              {submitting ? "Submitting…" : "Submit form"}
            </Btn>
          </div>
        </Page>
      )}
    </div>
  );
}

// simple filename sanitiser
function sanitizeName(name) {
  return name.replace(/[^\w.\-]+/g, "_");
}
