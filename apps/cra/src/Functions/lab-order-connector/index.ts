// @ts-nocheck
// supabase/functions/lab-order-connector/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type SubmitPayload = {
  action: "submit";
  orderId: string;
  vendor?: string | null;
  externalOrderId?: string | null;
  metadata?: Record<string, unknown> | null;
  actorEmail?: string | null;
};

type RetransmitPayload = {
  action: "retransmit";
  orderId: string;
  note?: string | null;
  actorEmail?: string | null;
};

type StatusUpdatePayload = {
  action: "status-update";
  orderId: string;
  status: string;
  resultReceivedAt?: string | null;
  resultReviewedAt?: string | null;
  actorEmail?: string | null;
  details?: Record<string, unknown> | null;
};

type Payload = SubmitPayload | RetransmitPayload | StatusUpdatePayload;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables for lab-order-connector function.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const isoNow = () => new Date().toISOString();

async function fetchOrder(orderId: string) {
  const { data, error } = await supabase
    .from("lab_orders")
    .select("id, patient_full_name, metadata, order_status, vendor, external_order_id, ordered_at")
    .eq("id", orderId)
    .single();

  if (error || !data) throw new Error(error?.message || "Order not found");
  return data;
}

function ensureStatus(status: string) {
  const allowed = [
    "draft",
    "submitted",
    "in_transit",
    "results_received",
    "results_reviewed",
    "retransmit_requested",
    "cancelled",
  ];
  return allowed.includes(status) ? status : "submitted";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch (_err) {
    return json({ ok: false, error: "Invalid JSON payload" }, 400);
  }

  if (!payload || typeof payload.orderId !== "string") {
    return json({ ok: false, error: "orderId is required" }, 400);
  }

  try {
    if (payload.action === "submit") {
      const existing = await fetchOrder(payload.orderId);
      const now = isoNow();
      const vendor = payload.vendor ?? existing.vendor ?? null;
      const mergedMetadata = {
        ...(existing.metadata ?? {}),
        ...(payload.metadata ?? {}),
      };
      const externalOrderId =
        payload.externalOrderId ?? existing.external_order_id ?? `SIM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const { data: updated, error: updateError } = await supabase
        .from("lab_orders")
        .update({
          vendor,
          external_order_id: externalOrderId,
          metadata: mergedMetadata,
          order_status: "submitted",
          ordered_at: existing.ordered_at ?? now,
          last_status_at: now,
        })
        .eq("id", payload.orderId)
        .select("id, order_status, vendor, external_order_id, ordered_at")
        .single();

      if (updateError) throw new Error(updateError.message);

      const eventPayload = {
        vendor,
        external_order_id: externalOrderId,
        metadata: mergedMetadata,
      };

      const { error: eventError } = await supabase.from("lab_order_events").insert({
        lab_order_id: payload.orderId,
        event_type: "submitted",
        event_status: "submitted",
        external_event_id: externalOrderId,
        payload: eventPayload,
        occurred_at: now,
        actor_email: payload.actorEmail ?? null,
      });

      if (eventError) throw new Error(eventError.message);

      return json({ ok: true, order: updated });
    }

    if (payload.action === "retransmit") {
      const existing = await fetchOrder(payload.orderId);
      const now = isoNow();

      const { error: updateError } = await supabase
        .from("lab_orders")
        .update({
          order_status: "retransmit_requested",
          last_status_at: now,
        })
        .eq("id", payload.orderId);

      if (updateError) throw new Error(updateError.message);

      const notes = payload.note ?? null;
      const requestEvent = {
        lab_order_id: payload.orderId,
        event_type: "retransmit_requested",
        event_status: "retransmit_requested",
        payload: { note: notes },
        occurred_at: now,
        actor_email: payload.actorEmail ?? null,
        note: notes,
      };

      const acknowledgementEvent = {
        lab_order_id: payload.orderId,
        event_type: "connector_ack",
        event_status: existing.order_status === "submitted" ? "in_transit" : existing.order_status,
        payload: {
          message: "Connector accepted retransmission",
        },
        occurred_at: now,
        actor_email: null,
      };

      const { error: insertError } = await supabase.from("lab_order_events").insert([requestEvent, acknowledgementEvent]);
      if (insertError) throw new Error(insertError.message);

      return json({ ok: true });
    }

    if (payload.action === "status-update") {
      const status = ensureStatus(payload.status);
      const now = isoNow();
      const patch: Record<string, unknown> = {
        order_status: status,
        last_status_at: now,
      };

      if (payload.resultReceivedAt) patch.result_received_at = payload.resultReceivedAt;
      if (payload.resultReviewedAt) patch.result_reviewed_at = payload.resultReviewedAt;

      const { data: updated, error: updateError } = await supabase
        .from("lab_orders")
        .update(patch)
        .eq("id", payload.orderId)
        .select("id, order_status, result_received_at, result_reviewed_at, last_status_at")
        .single();

      if (updateError) throw new Error(updateError.message);

      const eventPayload = {
        status,
        details: payload.details ?? null,
      };

      const { error: eventError } = await supabase.from("lab_order_events").insert({
        lab_order_id: payload.orderId,
        event_type: "status_update",
        event_status: status,
        payload: eventPayload,
        occurred_at: now,
        actor_email: payload.actorEmail ?? null,
      });

      if (eventError) throw new Error(eventError.message);

      return json({ ok: true, order: updated });
    }

    return json({ ok: false, error: `Unknown action: ${payload.action}` }, 400);
  } catch (err) {
    console.error("lab-order-connector error", err);
    return json({ ok: false, error: err instanceof Error ? err.message : "Unexpected error" }, 400);
  }
});
