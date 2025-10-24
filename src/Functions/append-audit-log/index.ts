// supabase/functions/append-audit-log/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn("Missing Supabase credentials for append-audit-log function.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type AuditPayload = {
  submission_id?: string;
  actor_id?: string | null;
  action?: string;
  payload?: Record<string, unknown>;
  occurred_at?: string;
};

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: AuditPayload | null = null;
  try {
    body = await req.json();
  } catch (err) {
    console.error("append-audit-log: invalid JSON", err);
    return badRequest("Invalid JSON body");
  }

  const { submission_id, actor_id = null, action, payload = {}, occurred_at } = body ?? {};

  if (!submission_id || !action) {
    return badRequest("submission_id and action are required");
  }

  const entry = {
    submission_id,
    actor_id,
    action,
    payload,
    occurred_at: occurred_at ?? new Date().toISOString(),
  };

  const { error } = await supabase.from("audit_logs").insert(entry);

  if (error) {
    console.error("append-audit-log: insert failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
