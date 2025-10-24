// @ts-nocheck
// supabase/functions/recover-pending-bookings/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const DEFAULT_SLOT_TABLE = Deno.env.get("BOOKING_DEFAULT_SLOT_TABLE") ?? "appointment_slots";
const DEFAULT_SLOT_SCHEMA = Deno.env.get("BOOKING_DEFAULT_SLOT_SCHEMA") ?? null;
const PENDING_GRACE_MINUTES = Number(Deno.env.get("BOOKING_PENDING_GRACE_MINUTES") ?? "30");

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!supabaseAdmin) {
    return jsonResponse(
      {
        success: false,
        message:
          "Server misconfiguration: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.",
      },
      500
    );
  }

  try {
    const bookingsResult = await fetchBookingRequests();
    if (!bookingsResult.ok) {
      return jsonResponse(
        { success: false, message: "Failed to load booking requests." },
        500
      );
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - Math.max(PENDING_GRACE_MINUTES, 1) * 60000);

    let inspected = 0;
    let released = 0;
    let failed = 0;

    for (const booking of bookingsResult.data) {
      inspected += 1;

      const slotId = booking.slot_id ?? booking.slotId;
      if (!slotId) continue;

      const status = String(booking.payment_status ?? "").toLowerCase();
      const expiresAt = parseDate(booking.payment_expires_at);
      const updatedAt = parseDate(booking.updated_at) ?? parseDate(booking.created_at);

      const shouldRelease =
        status === "failed"
          ? true
          : status === "pending"
          ? (expiresAt && expiresAt < now) || (updatedAt && updatedAt < cutoff)
          : false;

      if (!shouldRelease) {
        continue;
      }

      const slotTable = booking.slot_table ?? DEFAULT_SLOT_TABLE;
      const slotSchema = booking.slot_schema ?? DEFAULT_SLOT_SCHEMA;
      const slotClient = slotSchema ? supabaseAdmin.schema(slotSchema) : supabaseAdmin;

      const { error: releaseError } = await slotClient
        .from(slotTable)
        .update({ is_booked: false })
        .eq("id", slotId);

      if (releaseError) {
        console.error("Failed to release slot", slotTable, slotId, releaseError);
        failed += 1;
        continue;
      }

      const updatePayload: Record<string, unknown> = { payment_status: "cancelled" };
      if (Object.prototype.hasOwnProperty.call(booking, "cancelled_at")) {
        updatePayload.cancelled_at = new Date().toISOString();
      }

      const { error: bookingUpdateError } = await supabaseAdmin
        .from("booking_requests")
        .update(updatePayload)
        .eq("id", booking.id);

      if (bookingUpdateError && !isColumnError(bookingUpdateError)) {
        console.error("Failed to mark booking as cancelled", booking.id, bookingUpdateError);
        failed += 1;
        continue;
      }

      released += 1;
    }

    return jsonResponse({ success: true, inspected, released, failed });
  } catch (error) {
    console.error("Recovery job failed", error);
    return jsonResponse(
      { success: false, message: error?.message ?? "Unexpected error." },
      500
    );
  }
});

async function fetchBookingRequests() {
  const preferredColumns =
    "id,slot_id,payment_status,payment_expires_at,slot_table,slot_schema,updated_at,created_at,cancelled_at";
  const { data, error } = await supabaseAdmin
    .from("booking_requests")
    .select(preferredColumns);

  if (!error && data) {
    return { ok: true, data } as const;
  }

  if (error && isColumnError(error)) {
    const fallback = await supabaseAdmin.from("booking_requests").select("*");
    if (!fallback.error && fallback.data) {
      return { ok: true, data: fallback.data } as const;
    }
    console.error("Failed to read booking requests (fallback)", fallback.error);
    return { ok: false, error: fallback.error } as const;
  }

  console.error("Failed to read booking requests", error);
  return { ok: false, error } as const;
}

function parseDate(input: any) {
  if (!input) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isColumnError(error: any) {
  const message = error?.message ? String(error.message).toLowerCase() : "";
  return message.includes("column") && message.includes("does not exist");
}
