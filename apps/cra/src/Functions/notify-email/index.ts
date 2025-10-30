// @ts-nocheck
// supabase/functions/notify-email/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  buildAppointmentCreatedRecipients,
  buildStatusUpdatedRecipients,
  dedupeEmails,
  type Submission,
} from "./recipients";

// Define what data looks like

// Define the types of messages the function will receive
type Appointment = {
  id: string;
  start_at: string;
  end_at: string;
  location?: string | null;
  notes?: string | null;
};

type AppointmentRequest = {
  id: string;
  request_type: string;
  message?: string | null;
  status: string;
  patient_email?: string | null;
  handled_at?: string | null;
  appointment_id?: string | null;
};

type Payload =
  | { type: "submission_created"; submission: Submission }
  | { type: "status_updated"; submission: Submission; newStatus: string; actorEmail?: string }
  | { type: "appointment_created"; submission: Submission; appointment: Appointment; actorEmail?: string | null }
  | {
      type: "appointment_request_resolved";
      submission: Submission;
      request: AppointmentRequest;
      appointment?: Appointment | null;
      actorEmail?: string | null;
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

function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString("en-GB", {
      dateStyle: "full",
      timeStyle: "short",
    });
  } catch (_err) {
    return value;
  }
}

// This runs when the function receives a request
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const payload: Payload = await req.json();

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
    const recipients = buildStatusUpdatedRecipients(s, ADMIN_NOTIFY);
    await sendEmail(recipients, subject, text);
  }

  if (payload.type === "appointment_created") {
    const { submission: s, appointment, actorEmail } = payload;
    const subject = `Appointment scheduled for ${s.first_name} ${s.surname}`;
    const start = formatDate(appointment.start_at);
    const end = formatDate(appointment.end_at);
    const details = [`Start: ${start}`, `End: ${end}`];
    if (appointment.location) details.push(`Location: ${appointment.location}`);
    if (appointment.notes) details.push(`Notes: ${appointment.notes}`);
    if (actorEmail) details.push(`Scheduled by: ${actorEmail}`);
    const text = `An appointment has been scheduled for ${s.first_name} ${s.surname}.\n\n${details.join("\n")}\n\nThank you,\nAllergypath Team`;
    const recipients = buildAppointmentCreatedRecipients(s, ADMIN_NOTIFY);
    await sendEmail(recipients, subject, text);
  }

  if (payload.type === "appointment_request_resolved") {
    const { submission: s, request, appointment, actorEmail } = payload;
    const subject = `Request resolved for ${s.first_name} ${s.surname}`;
    const lines = [
      `Request type: ${request.request_type}`,
      `Status: ${request.status}`,
    ];
    if (request.message) lines.push(`Message: ${request.message}`);
    if (request.handled_at) lines.push(`Handled at: ${formatDate(request.handled_at)}`);
    if (appointment) {
      lines.push("Appointment details:");
      lines.push(`• Start: ${formatDate(appointment.start_at)}`);
      lines.push(`• End: ${formatDate(appointment.end_at)}`);
      if (appointment.location) lines.push(`• Location: ${appointment.location}`);
      if (appointment.notes) lines.push(`• Notes: ${appointment.notes}`);
    }
    if (actorEmail) lines.push(`Handled by: ${actorEmail}`);
    const text = `${lines.join("\n")}\n\nIf you have further questions, please reply to this email.`;
    const recipients = dedupeEmails([
      request.patient_email || s.email || null,
      ...(Array.isArray(ADMIN_NOTIFY) ? ADMIN_NOTIFY : []),
    ]);
    await sendEmail(recipients, subject, text);
  }

  return new Response("OK");
});
