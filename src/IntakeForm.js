// src/IntakeForm.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { uploadAttachment } from "./storage";

/* ---------- tiny UI bits ---------- */
const Page = ({ children }) => (
  <div
    style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 16,
      padding: 20,
      maxWidth: 780,
      margin: "0 auto",
      boxShadow: "var(--shadow)",
    }}
  >
    {children}
  </div>
);
const Row = ({ children }) => <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>{children}</div>;
const Label = ({ children }) => <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{children}</div>;
const Help = ({ children }) => <div style={{ fontSize: 12, color: "var(--muted)" }}>{children}</div>;
const ErrorText = ({ children }) => <div style={{ color: "var(--danger)", fontSize: 13 }}>{children}</div>;
const Input = (props) => (
  <input
    {...props}
    style={{
      padding: 12,
      border: "1px solid var(--border)",
      borderRadius: 12,
      width: "100%",
      background: "var(--card)",
      color: "var(--text)",
    }}
  />
);
const Textarea = (props) => (
  <textarea
    {...props}
    style={{
      padding: 12,
      border: "1px solid var(--border)",
      borderRadius: 12,
      width: "100%",
      minHeight: 90,
      background: "var(--card)",
      color: "var(--text)",
    }}
  />
);
const Btn = ({ children, variant = "default", style, ...props }) => (
  <button
    {...props}
    style={{
      padding: "10px 14px",
      borderRadius: 12,
      border: "1px solid var(--border)",
      background: variant === "primary" ? "var(--primary)" : "var(--btnBg)",
      color: variant === "primary" ? "var(--primaryText)" : "var(--text)",
      cursor: props.disabled ? "not-allowed" : "pointer",
      boxShadow: variant === "primary" ? "var(--shadow)" : "none",
      fontWeight: variant === "primary" ? 600 : 500,
      transition: "transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
      ...style,
    }}
  >
    {children}
  </button>
);
const Pill = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: "6px 12px",
      borderRadius: 999,
      border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
      cursor: "pointer",
      background: active ? "var(--pillActiveBg)" : "var(--pillBg)",
      color: active ? "var(--pillActiveText)" : "var(--text)",
      fontWeight: active ? 600 : 500,
      transition: "all 0.18s ease",
    }}
  >
    {children}
  </button>
);

/* ---------- constants ---------- */
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
  "unsure", // ✅ NEW (counts as a valid selection)
];

/* ---------- component ---------- */
export default function IntakeForm() {
  const [step, setStep] = useState(1);
  const totalSteps = 6;

  // patient details
  const [first_name, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [date_of_birth, setDOB] = useState("");
  const [nhs_number, setNhs] = useState("");

  // history
  const [symptoms, setSymptoms] = useState([]);
  const [onset_time, setOnsetTime] = useState("");
  const [reaction_frequency, setReactionFrequency] = useState("");
  const [most_severe_reaction, setMostSevere] = useState("");

  // triggers
  const [food_triggers, setFoodTriggers] = useState([]);
  const [other_triggers, setOtherTriggers] = useState("");
  const [can_eat_baked_egg, setBakedEgg] = useState(false);
  const [can_eat_baked_milk, setBakedMilk] = useState(false);

  // health
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

  // attachments (optional)
  const [files, setFiles] = useState([]);
  const [uploadSkipped, setUploadSkipped] = useState(false);

  // review / submit
  const [confirm_submission, setConfirmSubmission] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const showToast = useCallback((tone, message) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ tone, message });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);
  const [patient_notes, setPatientNotes] = useState("");

  // UX
  const [submitting, setSubmitting] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [warnMsg, setWarnMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [errors, setErrors] = useState({}); // ✅ inline errors per step

  const toggleArrayVal = (arr, setArr, val) => {
    if (arr.includes(val)) setArr(arr.filter((v) => v !== val));
    else setArr([...arr, val]);
  };

  /* ---------- validation ---------- */
  function validateStep(s) {
    const e = {};
    if (s === 1) {
      if (!first_name.trim()) e.first_name = "First name is required.";
      if (!surname.trim()) e.surname = "Surname is required.";
      if (!date_of_birth) e.date_of_birth = "Date of birth is required.";
      if (!email.trim()) e.email = "Email is required.";
      else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = "Enter a valid email.";
      if (!phone.trim()) e.phone = "Phone is required.";
    }
    if (s === 2) {
      if (!symptoms.length) e.symptoms = "Select at least one symptom.";
      if (!most_severe_reaction.trim()) e.most_severe_reaction = "Please describe the most severe reaction.";
    }
    if (s === 3) {
      // at least one trigger, "unsure" counts as valid
      if (!food_triggers.length) e.food_triggers = "Select at least one trigger (you can choose “unsure”).";
      if (food_triggers.includes("other") && !other_triggers.trim()) {
        e.other_triggers = "Please describe the other trigger.";
      }
    }
    if (s === 6) {
      if (!confirm_submission) e.confirm = "Please confirm your information is accurate.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const canNext = useMemo(() => {
    if (step === 1) return first_name && surname && email && phone && date_of_birth;
    if (step === 2) return symptoms.length > 0 && most_severe_reaction.trim().length > 0;
    if (step === 3) return food_triggers.length > 0 && (!food_triggers.includes("other") || other_triggers.trim().length > 0);
    if (step === 6) return confirm_submission && !submitting;
    return true;
  }, [step, first_name, surname, email, phone, date_of_birth, symptoms, most_severe_reaction, food_triggers, other_triggers, confirm_submission, submitting]);

  const goNext = () => {
    if (validateStep(step)) setStep((s) => Math.min(totalSteps, s + 1));
  };
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  const isPatientNotesColumnError = useCallback((err) => {
    if (!err) return false;

    const haystack = [err.message, err.details, err.hint]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (haystack.includes("patient_notes")) return true;

    // Supabase may surface undefined column as either Postgres (42703) or PostgREST (PGRST204/PGRST302).
    return ["42703", "PGRST204", "PGRST302"].includes(err.code);
  }, []);

  async function handleSubmit() {
    if (!validateStep(6)) return;

    setSubmitting(true);
    setOkMsg("");
    setWarnMsg("");
    setErrMsg("");
    try {
      const payload = {
        first_name,
        surname,
        email,
        phone,
        date_of_birth, // keep as YYYY-MM-DD (backend can store as text/date)
        nhs_number: nhs_number || null,

        symptoms,
        onset_time: onset_time || null,
        reaction_frequency: reaction_frequency || null,
        most_severe_reaction,

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

        patient_notes: patient_notes || null,
      };

      const trimmedNotes = patient_notes.trim();
      if (trimmedNotes) {
        payload.patient_notes = trimmedNotes;
      }

      let schemaMismatch = false;

      // 1) create record first
      const baseInsert = await supabase
        .from("submissions")
        .insert([payload])
        .select("*")
        .single();

      let created = baseInsert.data;
      let insErr = baseInsert.error;

      if (isPatientNotesColumnError(insErr)) {
      if (insErr && /patient_notes/.test(insErr.message || "")) {
        schemaMismatch = true;
        const fallbackPayload = { ...payload };
        delete fallbackPayload.patient_notes;
        const retryInsert = await supabase
          .from("submissions")
          .insert([fallbackPayload])
          .select("*")
          .single();
        created = retryInsert.data;
        insErr = retryInsert.error;
      }

      if (insErr) throw insErr;
      const submissionId = created.id;
      let submissionForNotify = created;

      // 2) optional upload (avoid “record 'pick' is not assigned yet” by ensuring target id exists first)
      const uploaded = [];
      let uploadErr = null;
      if (!uploadSkipped && files && files.length > 0) {
        for (const f of files) {
          if (!f || !f.name) continue;
          try {
            const path = await uploadAttachment(f, { folder: `submissions/${submissionId}` });
            uploaded.push(path);
          } catch (err) {
            console.error("Attachment upload failed", err);
            uploadErr = err;
          }
        }
      }

      if (uploaded.length) {
        const { error: updateErr } = await supabase
          .from("submissions")
          .update({ attachments: uploaded })
          .eq("id", submissionId);
        if (updateErr) {
          console.error("Failed to link attachments", updateErr);
          uploadErr = uploadErr || updateErr;
        } else {
          submissionForNotify = { ...submissionForNotify, attachments: uploaded };
        }
      }

      if (submissionForNotify) {
        try {
          await supabase.functions.invoke("notify-email", {
            body: { type: "submission_created", submission: submissionForNotify },
          });
        } catch (invokeErr) {
          console.error("notify-email invocation failed", invokeErr);
          showToast("error", "Submission saved, but we couldn't send email notifications.");
        }
      }

      let okMessage = "Thanks — your form was submitted successfully.";
      let warnMessage = "";

      if (uploadErr && schemaMismatch) {
        okMessage =
          "Thanks — your form was submitted, but we couldn't save all of your files or your final notes. We'll be in touch if we need them.";
        warnMessage =
          "Your form went through, but some files and your final notes failed to save. Please email any important information to the clinic.";
      } else if (uploadErr) {
        okMessage =
          "Thanks — your form was submitted, but we couldn't save all of your files. We'll be in touch if we need them.";
        warnMessage =
          "Your form went through, but some files failed to upload. Please email any important documents to the clinic.";
      } else if (schemaMismatch) {
        okMessage =
          "Thanks — your form was submitted, but we couldn't save your final notes just yet. We'll make sure the team receives your submission.";
        warnMessage =
          "Your form went through, but the notes field is still updating. Please email any urgent notes to the clinic.";
      }

      setOkMsg(okMessage);
      setWarnMsg(warnMessage);
      // reset minimal fields to keep UX tidy
      setStep(1);
      setFiles([]);
      setUploadSkipped(false);
      setConfirmSubmission(false);
      setFirstName(""); setSurname(""); setEmail(""); setPhone(""); setDOB(""); setNhs("");
      setSymptoms([]); setOnsetTime(""); setReactionFrequency(""); setMostSevere("");
      setFoodTriggers([]); setOtherTriggers(""); setBakedEgg(false); setBakedMilk(false);
      setAsthma(""); setEczema(false); setHayFever(false); setOtherConditions("");
      setLastAnti(""); setBB(false); setACE(false); setPregnant(false);
      setHasAI(false); setCarriesAI(false); setPatientNotes("");
      setErrors({});
    } catch (e) {
      console.error(e);
      setErrMsg(e.message || "Sorry, something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------- only render ONE step via switch ---------- */
  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Page>
            <h2 style={{ marginTop: 0 }}>Patient details</h2>

            <Row>
              <Label>First name *</Label>
              <Input
                id="first_name"
                name="first_name"
                value={first_name}
                onChange={(e) => setFirstName(e.target.value)}
              />
              {errors.first_name && <ErrorText>{errors.first_name}</ErrorText>}
            </Row>
            <Row>
              <Label>Surname *</Label>
              <Input
                id="surname"
                name="surname"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
              />
              {errors.surname && <ErrorText>{errors.surname}</ErrorText>}
            </Row>
            <Row>
              <Label>Email *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errors.email && <ErrorText>{errors.email}</ErrorText>}
            </Row>
            <Row>
              <Label>Phone *</Label>
              <Input
                id="phone"
                name="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {errors.phone && <ErrorText>{errors.phone}</ErrorText>}
            </Row>
            <Row>
              <Label>Date of birth *</Label>
              <Input
                id="date_of_birth"
                name="date_of_birth"
                type="date"
                value={date_of_birth}
                onChange={(e) => setDOB(e.target.value)}
              />
              {errors.date_of_birth && <ErrorText>{errors.date_of_birth}</ErrorText>}
            </Row>
            <Row>
              <Label>NHS number (optional)</Label>
              <Input
                id="nhs_number"
                name="nhs_number"
                value={nhs_number}
                onChange={(e) => setNhs(e.target.value)}
              />
            </Row>

            <div style={{ display: "flex", gap: 8 }}>
              <Btn disabled>← Back</Btn>
              <Btn variant="primary" disabled={!canNext} onClick={goNext}>Next →</Btn>
            </div>
          </Page>
        );

      case 2:
        return (
          <Page>
            <h2 style={{ marginTop: 0 }}>Symptoms & reaction history</h2>
            <Row>
              <Label>Symptoms * (select all that apply)</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {SYMPTOMS.map((s) => (
                  <Pill key={s} active={symptoms.includes(s)} onClick={() => toggleArrayVal(symptoms, setSymptoms, s)}>
                    {s}
                  </Pill>
                ))}
              </div>
              {errors.symptoms && <ErrorText>{errors.symptoms}</ErrorText>}
            </Row>
            <Row>
              <Label>When did reactions start? (optional)</Label>
              <Input value={onset_time} onChange={(e) => setOnsetTime(e.target.value)} placeholder="e.g. 6 months ago" />
            </Row>
            <Row>
              <Label>How often do reactions occur? (optional)</Label>
              <Input value={reaction_frequency} onChange={(e) => setReactionFrequency(e.target.value)} placeholder="e.g. monthly" />
            </Row>
            <Row>
              <Label>Most severe reaction *</Label>
              <Textarea value={most_severe_reaction} onChange={(e) => setMostSevere(e.target.value)} />
              {errors.most_severe_reaction && <ErrorText>{errors.most_severe_reaction}</ErrorText>}
            </Row>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={goPrev}>← Back</Btn>
              <Btn variant="primary" disabled={!canNext} onClick={goNext}>Next →</Btn>
            </div>
          </Page>
        );

      case 3:
        return (
          <Page>
            <h2 style={{ marginTop: 0 }}>Possible triggers</h2>
            <Row>
              <Label>Food triggers * (select all that apply)</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {FOOD_TRIGGERS.map((t) => (
                  <Pill key={t} active={food_triggers.includes(t)} onClick={() => toggleArrayVal(food_triggers, setFoodTriggers, t)}>
                    {t}
                  </Pill>
                ))}
              </div>
              <Help>Choose <b>“unsure”</b> if you’re not certain.</Help>
              {errors.food_triggers && <ErrorText>{errors.food_triggers}</ErrorText>}
            </Row>
            {food_triggers.includes("other") && (
              <Row>
                <Label>Other triggers *</Label>
                <Input value={other_triggers} onChange={(e) => setOtherTriggers(e.target.value)} placeholder="e.g. chickpea" />
                {errors.other_triggers && <ErrorText>{errors.other_triggers}</ErrorText>}
              </Row>
            )}
            <Row>
              <Label>Baked tolerance (optional)</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Pill active={can_eat_baked_egg} onClick={() => setBakedEgg((v) => !v)}>Can eat baked egg</Pill>
                <Pill active={can_eat_baked_milk} onClick={() => setBakedMilk((v) => !v)}>Can eat baked milk</Pill>
              </div>
            </Row>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={goPrev}>← Back</Btn>
              <Btn variant="primary" disabled={!canNext} onClick={goNext}>Next →</Btn>
            </div>
          </Page>
        );

      case 4:
        return (
          <Page>
            <h2 style={{ marginTop: 0 }}>Health & medications</h2>
            <Row>
              <Label>Asthma control (optional)</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["well-controlled", "sometimes-uncontrolled", "poorly-controlled", "none"].map((a) => (
                  <Pill key={a} active={asthma_control === a} onClick={() => setAsthma(a)}>{a}</Pill>
                ))}
              </div>
            </Row>
            <Row>
              <Label>Other conditions (optional)</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Pill active={eczema} onClick={() => setEczema((v) => !v)}>Eczema</Pill>
                <Pill active={hay_fever} onClick={() => setHayFever((v) => !v)}>Hay fever</Pill>
              </div>
              <Textarea value={other_conditions} onChange={(e) => setOtherConditions(e.target.value)} placeholder="Add any other relevant conditions" />
            </Row>
            <Row><Label>Last antihistamine (optional)</Label><Input type="datetime-local" value={last_antihistamine} onChange={(e) => setLastAnti(e.target.value)} /></Row>
            <Row>
              <Label>Medications & status (optional)</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Pill active={taking_beta_blocker} onClick={() => setBB((v) => !v)}>Taking beta-blocker</Pill>
                <Pill active={taking_ace_inhibitor} onClick={() => setACE((v) => !v)}>Taking ACE inhibitor</Pill>
                <Pill active={pregnant} onClick={() => setPregnant((v) => !v)}>Pregnant</Pill>
              </div>
            </Row>
            <Row>
              <Label>Adrenaline auto-injector (optional)</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Pill active={has_auto_injector} onClick={() => setHasAI((v) => !v)}>I have one</Pill>
                <Pill active={carries_auto_injector} onClick={() => setCarriesAI((v) => !v)}>I carry it with me</Pill>
              </div>
            </Row>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={goPrev}>← Back</Btn>
              <Btn variant="primary" onClick={goNext}>Next →</Btn>
            </div>
          </Page>
        );

      case 5:
        return (
          <Page>
            <h2 style={{ marginTop: 0 }}>Upload documents (optional)</h2>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>You can upload photos/letters now or skip this step.</p>
            <Row>
              <Label>Files</Label>
              <input
                type="file"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 10, width: "100%", background: "var(--card)" }}
              />
              {files?.length > 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>{files.length} file(s) selected</div>}
            </Row>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn onClick={() => { setFiles([]); setUploadSkipped(true); goNext(); }}>Skip upload</Btn>
              <Btn onClick={goPrev}>← Back</Btn>
              <Btn variant="primary" onClick={() => { setUploadSkipped(false); goNext(); }}>Next →</Btn>
            </div>
          </Page>
        );

      case 6:
        return (
          <Page>
            <h2 style={{ marginTop: 0 }}>Review & submit</h2>
            <Row><Label>Any final notes? (optional)</Label><Textarea value={patient_notes} onChange={(e) => setPatientNotes(e.target.value)} /></Row>
            <Row>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={confirm_submission} onChange={(e) => setConfirmSubmission(e.target.checked)} />
                I confirm the above is accurate. *
              </label>
              {errors.confirm && <ErrorText>{errors.confirm}</ErrorText>}
            </Row>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn onClick={goPrev}>← Back</Btn>
              <Btn variant="primary" disabled={!canNext} onClick={handleSubmit}>{submitting ? "Submitting…" : "Submit form"}</Btn>
            </div>
          </Page>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 12, color: "var(--muted)" }}>Step {step} of {totalSteps}</div>

      {errMsg && (
        <div style={{ background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.35)", color: "var(--danger)", padding: 10, borderRadius: 8, marginBottom: 10 }}>
          ❌ {errMsg}
        </div>
      )}
      {warnMsg && !errMsg && (
        <div style={{ background: "rgba(250, 204, 21, 0.12)", border: "1px solid rgba(250, 204, 21, 0.35)", color: "#854d0e", padding: 10, borderRadius: 8, marginBottom: 10 }}>
          ⚠️ {warnMsg}
        </div>
      )}
      {okMsg && (
        <div style={{ background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.35)", color: "var(--success)", padding: 10, borderRadius: 8, marginBottom: 10 }}>
          ✅ {okMsg}
        </div>
      )}

      {renderStep()}

      {toast && (
        <div
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            background: toast.tone === "success" ? "rgba(16, 185, 129, 0.95)" : "rgba(239, 68, 68, 0.95)",
            color: "white",
            padding: "10px 14px",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.15)",
            display: "flex",
            gap: 8,
            alignItems: "center",
            zIndex: 9999,
          }}
        >
          <span>{toast.tone === "success" ? "✅" : "⚠️"}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
