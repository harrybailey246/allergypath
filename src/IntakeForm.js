// src/IntakeForm.js
import React, { useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { uploadAttachment } from "./storage";
import "./IntakeForm.css";

/* ---------- tiny UI bits ---------- */
const Page = ({ children }) => <section className="intake-card">{children}</section>;
const Row = ({ children, className = "" }) => (
  <div className={`intake-row ${className}`.trim()}>{children}</div>
);
const Label = ({ children }) => <div className="intake-label">{children}</div>;
const Help = ({ children }) => <div className="intake-help">{children}</div>;
const ErrorText = ({ children }) => <div className="intake-error">{children}</div>;
const Input = ({ className = "", ...props }) => (
  <input {...props} className={`intake-input ${className}`.trim()} />
);
const Textarea = ({ className = "", ...props }) => (
  <textarea {...props} className={`intake-textarea ${className}`.trim()} />
);
const Btn = ({ children, variant = "secondary", className = "", type = "button", ...props }) => (
  <button
    {...props}
    type={type}
    className={`intake-btn intake-btn--${variant} ${className}`.trim()}
  >
    {children}
  </button>
);
const Pill = ({ active, className = "", children, ...props }) => (
  <button
    type="button"
    {...props}
    className={`intake-pill ${active ? "is-active" : ""} ${className}`.trim()}
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
  const [test_notes, setTestNotes] = useState("");

  // UX
  const [submitting, setSubmitting] = useState(false);
  const [okMsg, setOkMsg] = useState("");
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
    if (step === 3)
      return (
        food_triggers.length > 0 &&
        (!food_triggers.includes("other") || other_triggers.trim().length > 0)
      );
    if (step === 6) return confirm_submission && !submitting;
    return true;
  }, [
    step,
    first_name,
    surname,
    email,
    phone,
    date_of_birth,
    symptoms,
    most_severe_reaction,
    food_triggers,
    other_triggers,
    confirm_submission,
    submitting,
  ]);

  const goNext = () => {
    if (validateStep(step)) setStep((s) => Math.min(totalSteps, s + 1));
  };
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  async function handleSubmit() {
    if (!validateStep(6)) return;

    setSubmitting(true);
    setOkMsg("");
    setErrMsg("");
    try {
      const payload = {
        first_name,
        surname,
        email,
        phone,
        date_of_birth, // keep as YYYY-MM-DD (backend can store as text/date)
        nhs_number: nhs_number || null,
        attachments: [],

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

        test_notes: test_notes || null,
      };

      // 1) create record first
      const { data: created, error: insErr } = await supabase
        .from("submissions")
        .insert([payload])
        .select("id")
        .single();

      if (insErr) throw insErr;
      const submissionId = created.id;

      // 2) optional upload (avoid “record 'pick' is not assigned yet” by ensuring target id exists first)
      const uploaded = [];
      if (!uploadSkipped && files && files.length > 0) {
        for (const f of files) {
          if (!f || !f.name) continue;
          const path = await uploadAttachment(f, { folder: `submissions/${submissionId}` });
          uploaded.push(path);
        }
      }

      if (uploaded.length) {
        await supabase
          .from("submissions")
          .update({ attachments: uploaded })
          .eq("id", submissionId);
      }

      setOkMsg("Thanks — your form was submitted successfully.");
      // reset minimal fields to keep UX tidy
      setStep(1);
      setFiles([]);
      setUploadSkipped(false);
      setConfirmSubmission(false);
      setFirstName("");
      setSurname("");
      setEmail("");
      setPhone("");
      setDOB("");
      setNhs("");
      setSymptoms([]);
      setOnsetTime("");
      setReactionFrequency("");
      setMostSevere("");
      setFoodTriggers([]);
      setOtherTriggers("");
      setBakedEgg(false);
      setBakedMilk(false);
      setAsthma("");
      setEczema(false);
      setHayFever(false);
      setOtherConditions("");
      setLastAnti("");
      setBB(false);
      setACE(false);
      setPregnant(false);
      setHasAI(false);
      setCarriesAI(false);
      setTestNotes("");
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
            <h2 className="intake-card__title">Patient details</h2>

            <Row>
              <Label>First name *</Label>
              <Input value={first_name} onChange={(e) => setFirstName(e.target.value)} />
              {errors.first_name && <ErrorText>{errors.first_name}</ErrorText>}
            </Row>
            <Row>
              <Label>Surname *</Label>
              <Input value={surname} onChange={(e) => setSurname(e.target.value)} />
              {errors.surname && <ErrorText>{errors.surname}</ErrorText>}
            </Row>
            <Row>
              <Label>Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {errors.email && <ErrorText>{errors.email}</ErrorText>}
            </Row>
            <Row>
              <Label>Phone *</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              {errors.phone && <ErrorText>{errors.phone}</ErrorText>}
            </Row>
            <Row>
              <Label>Date of birth *</Label>
              <Input type="date" value={date_of_birth} onChange={(e) => setDOB(e.target.value)} />
              {errors.date_of_birth && <ErrorText>{errors.date_of_birth}</ErrorText>}
            </Row>
            <Row>
              <Label>NHS number (optional)</Label>
              <Input value={nhs_number} onChange={(e) => setNhs(e.target.value)} />
            </Row>

            <div className="intake-actions">
              <Btn disabled>← Back</Btn>
              <Btn variant="primary" disabled={!canNext} onClick={goNext}>
                Next →
              </Btn>
            </div>
          </Page>
        );

      case 2:
        return (
          <Page>
            <h2 className="intake-card__title">Symptoms &amp; reaction history</h2>
            <Row>
              <Label>Symptoms * (select all that apply)</Label>
              <div className="intake-pill-group">
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
              <Input
                value={onset_time}
                onChange={(e) => setOnsetTime(e.target.value)}
                placeholder="e.g. 6 months ago"
              />
            </Row>
            <Row>
              <Label>How often do reactions occur? (optional)</Label>
              <Input
                value={reaction_frequency}
                onChange={(e) => setReactionFrequency(e.target.value)}
                placeholder="e.g. monthly"
              />
            </Row>
            <Row>
              <Label>Most severe reaction *</Label>
              <Textarea value={most_severe_reaction} onChange={(e) => setMostSevere(e.target.value)} />
              {errors.most_severe_reaction && <ErrorText>{errors.most_severe_reaction}</ErrorText>}
            </Row>
            <div className="intake-actions">
              <Btn onClick={goPrev}>← Back</Btn>
              <Btn variant="primary" disabled={!canNext} onClick={goNext}>
                Next →
              </Btn>
            </div>
          </Page>
        );

      case 3:
        return (
          <Page>
            <h2 className="intake-card__title">Possible triggers</h2>
            <Row>
              <Label>Food triggers * (select all that apply)</Label>
              <div className="intake-pill-group">
                {FOOD_TRIGGERS.map((t) => (
                  <Pill
                    key={t}
                    active={food_triggers.includes(t)}
                    onClick={() => toggleArrayVal(food_triggers, setFoodTriggers, t)}
                  >
                    {t}
                  </Pill>
                ))}
              </div>
              <Help>
                Choose <b>“unsure”</b> if you’re not certain.
              </Help>
              {errors.food_triggers && <ErrorText>{errors.food_triggers}</ErrorText>}
            </Row>
            {food_triggers.includes("other") && (
              <Row>
                <Label>Other triggers *</Label>
                <Input
                  value={other_triggers}
                  onChange={(e) => setOtherTriggers(e.target.value)}
                  placeholder="e.g. chickpea"
                />
                {errors.other_triggers && <ErrorText>{errors.other_triggers}</ErrorText>}
              </Row>
            )}
            <Row>
              <Label>Baked tolerance (optional)</Label>
              <div className="intake-pill-group">
                <Pill active={can_eat_baked_egg} onClick={() => setBakedEgg((v) => !v)}>Can eat baked egg</Pill>
                <Pill active={can_eat_baked_milk} onClick={() => setBakedMilk((v) => !v)}>Can eat baked milk</Pill>
              </div>
            </Row>
            <div className="intake-actions">
              <Btn onClick={goPrev}>← Back</Btn>
              <Btn variant="primary" disabled={!canNext} onClick={goNext}>
                Next →
              </Btn>
            </div>
          </Page>
        );

      case 4:
        return (
          <Page>
            <h2 className="intake-card__title">Health &amp; medications</h2>
            <Row>
              <Label>Asthma control (optional)</Label>
              <div className="intake-pill-group">
                {["well-controlled", "sometimes-uncontrolled", "poorly-controlled", "none"].map((a) => (
                  <Pill key={a} active={asthma_control === a} onClick={() => setAsthma(a)}>
                    {a}
                  </Pill>
                ))}
              </div>
            </Row>
            <Row>
              <Label>Other conditions (optional)</Label>
              <div className="intake-pill-group">
                <Pill active={eczema} onClick={() => setEczema((v) => !v)}>Eczema</Pill>
                <Pill active={hay_fever} onClick={() => setHayFever((v) => !v)}>Hay fever</Pill>
              </div>
              <Textarea
                value={other_conditions}
                onChange={(e) => setOtherConditions(e.target.value)}
                placeholder="Add any other relevant conditions"
              />
            </Row>
            <Row>
              <Label>Last antihistamine (optional)</Label>
              <Input type="datetime-local" value={last_antihistamine} onChange={(e) => setLastAnti(e.target.value)} />
            </Row>
            <Row>
              <Label>Medications &amp; status (optional)</Label>
              <div className="intake-pill-group">
                <Pill active={taking_beta_blocker} onClick={() => setBB((v) => !v)}>Taking beta-blocker</Pill>
                <Pill active={taking_ace_inhibitor} onClick={() => setACE((v) => !v)}>Taking ACE inhibitor</Pill>
                <Pill active={pregnant} onClick={() => setPregnant((v) => !v)}>Pregnant</Pill>
              </div>
            </Row>
            <Row>
              <Label>Adrenaline auto-injector (optional)</Label>
              <div className="intake-pill-group">
                <Pill active={has_auto_injector} onClick={() => setHasAI((v) => !v)}>I have one</Pill>
                <Pill active={carries_auto_injector} onClick={() => setCarriesAI((v) => !v)}>I carry it with me</Pill>
              </div>
            </Row>
            <div className="intake-actions">
              <Btn onClick={goPrev}>← Back</Btn>
              <Btn variant="primary" onClick={goNext}>
                Next →
              </Btn>
            </div>
          </Page>
        );

      case 5:
        return (
          <Page>
            <h2 className="intake-card__title">Upload documents (optional)</h2>
            <p className="intake-subtitle">You can upload photos/letters now or skip this step.</p>
            <Row>
              <Label>Files</Label>
              <input
                type="file"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                className="intake-file-input"
              />
              {files?.length > 0 && <div className="intake-help">{files.length} file(s) selected</div>}
            </Row>
            <div className="intake-actions intake-actions--wrap">
              <Btn
                onClick={() => {
                  setFiles([]);
                  setUploadSkipped(true);
                  goNext();
                }}
              >
                Skip upload
              </Btn>
              <Btn onClick={goPrev}>← Back</Btn>
              <Btn
                variant="primary"
                onClick={() => {
                  setUploadSkipped(false);
                  goNext();
                }}
              >
                Next →
              </Btn>
            </div>
          </Page>
        );

      case 6:
        return (
          <Page>
            <h2 className="intake-card__title">Review &amp; submit</h2>
            <Row>
              <Label>Any final notes? (optional)</Label>
              <Textarea value={test_notes} onChange={(e) => setTestNotes(e.target.value)} />
            </Row>
            <Row>
              <label className="intake-checkbox">
                <input
                  type="checkbox"
                  checked={confirm_submission}
                  onChange={(e) => setConfirmSubmission(e.target.checked)}
                />
                <span>I confirm the above is accurate. *</span>
              </label>
              {errors.confirm && <ErrorText>{errors.confirm}</ErrorText>}
            </Row>
            <div className="intake-actions intake-actions--wrap">
              <Btn onClick={goPrev}>← Back</Btn>
              <Btn variant="primary" disabled={!canNext} onClick={handleSubmit}>
                {submitting ? "Submitting…" : "Submit form"}
              </Btn>
            </div>
          </Page>
        );

      default:
        return null;
    }
  };

  return (
    <div className="intake-shell">
      <div className="intake-progress">Step {step} of {totalSteps}</div>

      {errMsg && (
        <div className="intake-alert intake-alert--error">
          <span aria-hidden="true">❌</span>
          <span>{errMsg}</span>
        </div>
      )}
      {okMsg && (
        <div className="intake-alert intake-alert--success">
          <span aria-hidden="true">✅</span>
          <span>{okMsg}</span>
        </div>
      )}

      {renderStep()}
    </div>
  );
}
