// @ts-nocheck
// supabase/functions/notify-email/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Define what data looks like
type Submission = {
  id: string;
  created_at?: string;
  first_name?: string;
  surname?: string;
  email?: string;
  status?: string;
  clinician_email?: string | null;
};

// Define the types of messages the function will receive
type Payload =
  | { type: "submission_created"; submission: Submission }
  | { type: "status_updated"; submission: Submission; newStatus: string; actorEmail?: string }
  | {
      type: "booking_request_processed";
      status: string;
      actorEmail?: string | null;
      request: {
        id?: string | null;
        first_name?: string | null;
        surname?: string | null;
        email?: string | null;
        phone?: string | null;
        slot_summary?: string | null;
      };
      appointment?: {
        id?: string | null;
        start_at?: string | null;
        end_at?: string | null;
        location?: string | null;
      } | null;
    };

// Your Resend API key (set as a secret later)
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "no-reply@allergypath.app"; // must be a verified domain in Resend
const ADMIN_NOTIFY = ["harrybailey246@icloud.com"]; // add more addresses if needed

// Function to send the email
async function sendEmail(to: string | string[], subject: string, text: string) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      text,
    }),
  });
  return { ok: resp.ok, body: await resp.text() };
}

function formatSlotSummary(startAt?: string | null, location?: string | null, fallback?: string | null) {
  const parts: string[] = [];
  if (startAt) {
    const date = new Date(startAt);
    if (!Number.isNaN(date.getTime())) {
      parts.push(date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }));
    }
  }
  if (location) parts.push(location);
  if (parts.length === 0 && fallback) parts.push(fallback);
  return parts.join(" – ");
}

function uniqueRecipients(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const email = (value || "").trim();
    if (!email) continue;
    const lower = email.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(email);
  }
  return result;
}

// This runs when the function receives a request
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const payload = await req.json();

  // When a new form is submitted
  if (payload.type === "submission_created") {
    const s = payload.submission;
    const subject = `New submission from ${s.first_name} ${s.surname}`;
    const text = `A new patient form has been submitted.\n\nName: ${s.first_name} ${s.surname}\nEmail: ${s.email}\nStatus: ${s.status}`;
    await sendEmail(ADMIN_NOTIFY, subject, text);
  }

  // When a clinician updates a status
  if (payload.type === "status_updated") {
    const s = payload.submission;
    const subject = `Status changed: ${s.first_name} ${s.surname}`;
    const text = `The status for ${s.first_name} ${s.surname} is now ${payload.newStatus}.`;
    await sendEmail([s.clinician_email || "", ...ADMIN_NOTIFY], subject, text);
  }

  if (payload.type === "booking_request_processed") {
    const req = payload.request ?? {};
    const appt = payload.appointment ?? {};
    const status = payload.status || "processed";
    const nameParts = [req.first_name, req.surname].filter(Boolean);
    const patientName = nameParts.length > 0 ? nameParts.join(" ").trim() : "Patient";
    const slotSummary = formatSlotSummary(appt.start_at ?? null, appt.location ?? null, req.slot_summary ?? null);

    const staffRecipients = uniqueRecipients([...ADMIN_NOTIFY, payload.actorEmail || null]);
    const staffLines = [
      `The booking request from ${patientName} has been ${status}.`,
      slotSummary ? `Slot: ${slotSummary}` : null,
      req.email ? `Patient email: ${req.email}` : null,
      req.phone ? `Patient phone: ${req.phone}` : null,
    ].filter(Boolean) as string[];
    if (staffRecipients.length > 0) {
      await sendEmail(
        staffRecipients,
        `Booking request ${status}: ${patientName}`,
        staffLines.join("\n")
      );
    }

    if (req.email) {
      const greeting = nameParts.length > 0 ? nameParts.join(" ") : "there";
      const patientLines = [
        `Hi ${greeting},`,
        `We’ve ${status} your appointment request.`,
        slotSummary ? `Appointment: ${slotSummary}` : null,
        appt.location ? `Location: ${appt.location}` : null,
        "We’ll be in touch if anything changes.",
      ].filter(Boolean) as string[];
      await sendEmail(req.email, `Your appointment has been ${status}`, patientLines.join("\n\n"));
    }
  }

  return new Response("OK");
});
