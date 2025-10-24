// @ts-nocheck
// supabase/functions/process-booking/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const PAYMENT_PROVIDER_URL = Deno.env.get("PAYMENT_PROVIDER_URL") ?? "";
const PAYMENT_PROVIDER_KEY = Deno.env.get("PAYMENT_PROVIDER_KEY") ?? "";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("BOOKINGS_FROM_EMAIL") ?? "no-reply@allergypath.app";
const STAFF_EMAILS = parseList(Deno.env.get("BOOKINGS_STAFF_EMAILS") ?? "");

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER") ?? "";

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
    const payload = await req.json();
    const validation = validatePayload(payload);
    if (!validation.ok) {
      return jsonResponse({ success: false, message: validation.error }, 400);
    }

    const { slotId, slotTable, slotSchema, patient, notes, slotDetails, metadata } =
      validation.value;

    const slotClient = slotSchema ? supabaseAdmin.schema(slotSchema) : supabaseAdmin;
    const { data: rawSlot, error: slotError } = await slotClient
      .from(slotTable)
      .select(
        "id,is_booked,start_at,start,start_time,duration_mins,duration,location,price_cents,price,currency,payment_link"
      )
      .eq("id", slotId)
      .maybeSingle();

    if (slotError) {
      console.error("Failed to load slot", slotError);
      return jsonResponse(
        { success: false, message: "The selected appointment could not be found." },
        404
      );
    }

    if (!rawSlot) {
      return jsonResponse(
        { success: false, message: "The selected appointment could not be found." },
        404
      );
    }

    const normalisedSlot = normaliseSlot(rawSlot, slotDetails);
    if (normalisedSlot.is_booked) {
      return jsonResponse(
        { success: false, message: "Sorry, that slot has already been booked." },
        409
      );
    }

    const paymentResult = await runPayment(patient, normalisedSlot, payload.payment ?? {});

    const baseBookingRecord: Record<string, unknown> = {
      slot_id: slotId,
      first_name: patient.first_name,
      surname: patient.surname ?? null,
      email: patient.email,
      phone: patient.phone,
      notes: notes ?? null,
    };

    const enrichedBookingRecord: Record<string, unknown> = {
      ...baseBookingRecord,
      payment_status: paymentResult.status,
      payment_reference: paymentResult.reference ?? null,
      payment_expires_at: paymentResult.expires_at ?? null,
      slot_table: slotTable,
      slot_schema: slotSchema,
      payment_provider_response: paymentResult.raw ?? null,
      metadata: metadata ?? null,
    };

    const bookingInsert = await insertWithFallback(
      supabaseAdmin,
      "booking_requests",
      enrichedBookingRecord,
      baseBookingRecord
    );

    if (!bookingInsert.ok) {
      return jsonResponse(
        { success: false, message: "Unable to record your booking. Please try again." },
        500
      );
    }

    const bookingRecord = bookingInsert.data;

    if (paymentResult.status === "paid" || paymentResult.status === "succeeded") {
      const { data: updatedSlot, error: updateError } = await slotClient
        .from(slotTable)
        .update({ is_booked: true })
        .eq("id", slotId)
        .eq("is_booked", false)
        .select()
        .maybeSingle();

      if (updateError || !updatedSlot) {
        console.error("Failed to mark slot booked", updateError);
        return jsonResponse(
          {
            success: false,
            message:
              "Payment succeeded but we could not secure the slot. Please contact the clinic immediately.",
          },
          500
        );
      }
    }

    await sendNotifications({
      booking: bookingRecord,
      payment: paymentResult,
      slot: normalisedSlot,
      patient,
    });

    const responsePayload = {
      success: paymentResult.status === "paid" || paymentResult.status === "succeeded",
      message:
        paymentResult.status === "paid" || paymentResult.status === "succeeded"
          ? "Payment received – your appointment is confirmed."
          : paymentResult.status === "pending"
          ? "Your payment is pending. Complete the payment to confirm your appointment."
          : paymentResult.message ?? "Payment failed. Please try again.",
      payment: {
        status: paymentResult.status,
        reference: paymentResult.reference ?? null,
        receipt_url: paymentResult.receipt_url ?? null,
        checkout_url: paymentResult.checkout_url ?? null,
        expires_at: paymentResult.expires_at ?? null,
      },
      confirmation:
        paymentResult.status === "paid" || paymentResult.status === "succeeded"
          ? buildConfirmation(normalisedSlot, bookingRecord, paymentResult)
          : null,
    };

    const statusCode =
      paymentResult.status === "paid" || paymentResult.status === "succeeded"
        ? 200
        : paymentResult.status === "pending"
        ? 202
        : 402;

    return jsonResponse(responsePayload, statusCode);
  } catch (error) {
    console.error("Unhandled error in process-booking", error);
    return jsonResponse(
      {
        success: false,
        message: formatErrorMessage(error) ?? "Unexpected error while processing payment.",
      },
      500
    );
  }
});

function validatePayload(payload: any) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid request payload." } as const;
  }

  const slotId = payload.slot_id ?? payload.slotId;
  const slotTable = payload.slot_table ?? payload.slotTable;
  const slotSchema = payload.slot_schema ?? payload.slotSchema ?? null;
  const notes = payload.notes ?? null;
  const metadata = payload.metadata ?? null;
  const slotDetails = payload.slot_details ?? payload.slotDetails ?? null;

  if (!slotId) {
    return { ok: false, error: "Missing slot identifier." } as const;
  }

  if (!slotTable || typeof slotTable !== "string") {
    return { ok: false, error: "Missing slot table reference." } as const;
  }

  const patient = payload.patient ?? {
    first_name: payload.first_name,
    surname: payload.surname,
    email: payload.email,
    phone: payload.phone,
  };

  if (!patient || typeof patient !== "object") {
    return { ok: false, error: "Missing patient details." } as const;
  }

  if (!patient.first_name || !patient.email || !patient.phone) {
    return { ok: false, error: "First name, email, and phone are required." } as const;
  }

  return {
    ok: true,
    value: {
      slotId,
      slotTable,
      slotSchema,
      patient: {
        first_name: String(patient.first_name).trim(),
        surname: patient.surname ? String(patient.surname).trim() : null,
        email: String(patient.email).trim(),
        phone: String(patient.phone).trim(),
      },
      notes: notes ? String(notes).trim() : null,
      slotDetails,
      metadata,
    },
  } as const;
}

function normaliseSlot(raw: any, fallback: any) {
  const isBooked = toBoolean(raw?.is_booked);
  const start = raw?.start_at ?? raw?.start ?? raw?.start_time ?? fallback?.start_at ?? null;
  const duration =
    coerceNumber(raw?.duration_mins) ??
    coerceNumber(raw?.duration) ??
    coerceNumber(fallback?.duration_mins) ??
    60;
  const priceCents =
    coerceNumber(raw?.price_cents) ??
    coerceNumber(raw?.amount_cents) ??
    (fallback ? normaliseMoney(fallback.price_cents, fallback.price) : null);
  const currency = raw?.currency ?? fallback?.currency ?? "GBP";

  return {
    id: raw?.id ?? fallback?.id ?? null,
    start_at: start,
    duration_mins: duration,
    location: raw?.location ?? fallback?.location ?? null,
    price_cents: priceCents,
    price: raw?.price ?? fallback?.price ?? null,
    currency,
    payment_link: raw?.payment_link ?? fallback?.payment_link ?? null,
    is_booked: isBooked,
  };
}

async function runPayment(patient: any, slot: any, paymentPayload: any) {
  const amountCents = normaliseMoney(slot.price_cents, slot.price);
  const currency = slot.currency ?? "GBP";

  if (!PAYMENT_PROVIDER_URL) {
    return {
      status: "paid",
      reference: `test_${crypto.randomUUID()}`,
      raw: { simulated: true },
    };
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (PAYMENT_PROVIDER_KEY) {
      headers.Authorization = `Bearer ${PAYMENT_PROVIDER_KEY}`;
    }

    const response = await fetch(PAYMENT_PROVIDER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: amountCents,
        currency,
        patient,
        slot,
        payment: paymentPayload,
      }),
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = { raw: text };
    }

    if (!response.ok) {
      console.error("Payment provider returned non-OK", response.status, data);
      return {
        status: "failed",
        reference: null,
        raw: data,
        message: data?.message ?? data?.error ?? "Payment was declined.",
      };
    }

    const status = (data?.status ?? "").toLowerCase();

    if (status === "paid" || status === "succeeded" || status === "success") {
      return {
        status: "paid",
        reference: data?.reference ?? data?.id ?? data?.payment_id ?? null,
        receipt_url: data?.receipt_url ?? null,
        raw: data,
      };
    }

    if (status === "pending" || status === "requires_action" || status === "requires_payment_method") {
      return {
        status: "pending",
        reference: data?.reference ?? null,
        checkout_url: data?.checkout_url ?? data?.url ?? slot.payment_link ?? null,
        expires_at: data?.expires_at ?? null,
        raw: data,
      };
    }

    return {
      status: "failed",
      reference: data?.reference ?? null,
      raw: data,
      message: data?.message ?? data?.error ?? "Payment failed.",
    };
  } catch (error) {
    console.error("Payment provider error", error);
    return {
      status: "failed",
      reference: null,
      raw: { error: formatErrorMessage(error) },
      message: "Payment could not be processed.",
    };
  }
}

async function insertWithFallback(client: any, table: string, preferred: any, fallback: any) {
  const attempts = [preferred, fallback];
  let lastError = null;

  for (const record of attempts) {
    const { data, error } = await client.from(table).insert([record]).select().maybeSingle();
    if (!error && data) {
      return { ok: true, data } as const;
    }
    lastError = error;
    if (!error || !isColumnError(error)) {
      break;
    }
  }

  console.error("Failed to insert booking request", lastError);
  return { ok: false, error: lastError } as const;
}

async function sendNotifications({ booking, payment, slot, patient }: any) {
  const statusPrefix =
    payment.status === "paid"
      ? "Appointment confirmed"
      : payment.status === "pending"
      ? "Payment pending for appointment"
      : "Payment issue detected";

  const summaryLines = [
    `${statusPrefix} for ${patient.first_name}${patient.surname ? ` ${patient.surname}` : ""}`,
  ];

  if (slot.start_at) {
    summaryLines.push(`Date: ${slot.start_at}`);
  }

  if (slot.location) {
    summaryLines.push(`Location: ${slot.location}`);
  }

  if (payment.reference) {
    summaryLines.push(`Payment reference: ${payment.reference}`);
  }

  const emailBody = summaryLines.join("\n");

  const shouldEmailPatient = payment.status === "paid" || payment.status === "pending";
  const patientEmailPromise =
    shouldEmailPatient && patient.email
      ? sendEmail(
          patient.email,
          payment.status === "paid"
            ? "Your Allergy Path appointment is confirmed"
            : "Action needed: complete your Allergy Path payment",
          emailBody
        )
      : Promise.resolve(null);

  const staffEmailPromise = STAFF_EMAILS.length
    ? sendEmail(
        STAFF_EMAILS,
        payment.status === "paid"
          ? "New clinic booking confirmed"
          : payment.status === "pending"
          ? "Booking pending payment"
          : "Booking payment failed",
        emailBody
      )
    : Promise.resolve(null);

  const smsBody =
    slot.start_at && payment.status === "paid"
      ? `Allergy Path: Appointment confirmed on ${slot.start_at}. Ref ${payment.reference || "N/A"}.`
      : payment.status === "pending"
      ? `Allergy Path: Payment pending for your appointment on ${slot.start_at || "TBC"}.`
      : null;

  const patientSmsPromise =
    smsBody && patient.phone ? sendSMS(patient.phone, smsBody) : Promise.resolve(null);

  await Promise.allSettled([patientEmailPromise, staffEmailPromise, patientSmsPromise]);
}

async function sendEmail(to: string | string[], subject: string, text: string) {
  if (!RESEND_API_KEY) return null;
  const recipient = Array.isArray(to) ? to.filter(Boolean) : [to];
  if (recipient.length === 0) return null;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipient,
        subject,
        text,
      }),
    });

    if (!resp.ok) {
      console.error("Failed to send email", await resp.text());
    }
  } catch (error) {
    console.error("Error sending email", error);
  }
}

async function sendSMS(to: string, body: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) return null;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const params = new URLSearchParams({
    To: to,
    From: TWILIO_FROM_NUMBER,
    Body: body,
  });

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!resp.ok) {
      console.error("Failed to send SMS", await resp.text());
    }
  } catch (error) {
    console.error("Error sending SMS", error);
  }
}

function buildConfirmation(slot: any, booking: any, payment: any) {
  return {
    slot: {
      start_at: slot.start_at ?? null,
      duration_mins: slot.duration_mins ?? null,
      location: slot.location ?? null,
    },
    booking: {
      id: booking?.id ?? null,
      slot_id: booking?.slot_id ?? null,
    },
    payment: {
      reference: payment?.reference ?? null,
      receipt_url: payment?.receipt_url ?? null,
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function coerceNumber(value: any) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normaliseMoney(primary: any, fallback: any) {
  const primaryNum = typeof primary === "string" ? Number(primary) : primary;
  const fallbackNum = typeof fallback === "string" ? Number(fallback) : fallback;
  if (typeof primaryNum === "number" && !Number.isNaN(primaryNum)) return primaryNum;
  if (typeof fallbackNum === "number" && !Number.isNaN(fallbackNum)) {
    return Math.round(fallbackNum * 100);
  }
  return null;
}

function toBoolean(value: any) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    return ["true", "t", "1", "yes", "y"].includes(normalised);
  }
  return Boolean(value);
}

function isColumnError(error: any) {
  const message = error?.message ? String(error.message).toLowerCase() : "";
  return message.includes("column") && message.includes("does not exist");
}

function formatErrorMessage(error: any) {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (error?.message) return error.message;
  return null;
}
