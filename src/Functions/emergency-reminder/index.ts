// supabase/functions/emergency-reminder/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("REMINDER_FROM_EMAIL") ?? "no-reply@allergypath.app";
const FALLBACK_RECIPIENTS = Deno.env.get("EMERGENCY_REMINDER_RECIPIENTS") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

const dedupe = (values: (string | null | undefined)[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(value.trim());
  }
  return out;
};

async function sendEmail(to: string[], subject: string, text: string) {
  if (!RESEND_API_KEY) {
    console.log("No RESEND_API_KEY set – skipping email send");
    return { ok: false, skipped: true };
  }

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

  return { ok: resp.ok, status: resp.status, body: await resp.text() };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Missing Supabase credentials", { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let daysAhead = 7;
  try {
    const body = await req.json();
    if (typeof body?.daysAhead === "number" && !Number.isNaN(body.daysAhead)) {
      daysAhead = body.daysAhead;
    }
  } catch (_err) {
    // ignore – defaults to 7 days
  }

  const { data: due, error: dueError } = await supabase.rpc("emergency_checklist_due", {
    days_ahead: daysAhead,
  });

  if (dueError) {
    console.error("Failed to fetch due checklists", dueError);
    return new Response(
      JSON.stringify({ status: "error", message: dueError.message }),
      { status: 500, headers: JSON_HEADERS }
    );
  }

  if (!due || due.length === 0) {
    return new Response(
      JSON.stringify({ status: "ok", sent: false, reason: "nothing_due" }),
      { headers: JSON_HEADERS }
    );
  }

  const { data: staff, error: staffError } = await supabase
    .from("clinician_emails")
    .select("email")
    .in("role", ["admin", "clinician"]);

  if (staffError) {
    console.error("Failed to load staff emails", staffError);
  }

  const fallback = FALLBACK_RECIPIENTS.split(",").map((s) => s.trim());
  const recipients = dedupe([...(staff?.map((row) => row.email) || []), ...fallback]);

  if (recipients.length === 0) {
    return new Response(
      JSON.stringify({ status: "ok", sent: false, reason: "no_recipients", due }),
      { headers: JSON_HEADERS }
    );
  }

  const lines = [
    "Emergency checklist reminders",
    `Window: next ${daysAhead} day(s)`,
  ];
  for (const item of due) {
    const label = item.checklist_type?.replace?.(/_/g, " ") ?? "Checklist";
    const dueOn = item.next_due_on ? new Date(item.next_due_on).toLocaleDateString("en-GB") : "overdue now";
    const statusLine = item.is_overdue
      ? `OVERDUE since ${dueOn}`
      : `Due by ${dueOn}`;
    lines.push(`• ${label}: ${statusLine}`);
  }
  lines.push("\nLog updates in AllergyPath → Admin → Audit & Compliance");

  const sendResult = await sendEmail(
    recipients,
    "Emergency checklist reminders",
    lines.join("\n")
  );

  const sent = sendResult.ok || !!sendResult.skipped;

  return new Response(
    JSON.stringify({ status: "ok", sent, recipients, sendResult, due }),
    { headers: JSON_HEADERS }
  );
});
