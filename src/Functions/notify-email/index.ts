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
  | { type: "status_updated"; submission: Submission; newStatus: string; actorEmail?: string };

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

  return new Response("OK");
});
