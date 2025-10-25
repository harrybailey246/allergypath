// src/utils/appointmentSlots.js
export const SLOT_COLUMN_CANDIDATES = {
  start_at: ["start_at", "startAt", "starts_at", "start_time", "start"],
  duration_mins: ["duration_mins", "duration_minutes", "duration", "length_mins"],
  location: ["location", "venue", "room"],
  price_cents: ["price_cents", "amount_cents", "price_amount_cents"],
  price: ["price", "price_amount", "amount"],
  deposit_cents: ["deposit_cents", "deposit_amount_cents"],
  deposit: ["deposit", "deposit_amount"],
  payment_link: ["payment_link", "payment_url", "checkout_url"],
  is_booked: ["is_booked", "booked", "is_reserved", "reserved"],
};

export const SLOT_PRIMARY_KEY_CANDIDATES = [
  "id",
  "slot_id",
  "uuid",
  "slug",
  "reference",
];

export function getSlotSources() {
  const configured = process.env.REACT_APP_APPOINTMENT_SLOT_SOURCES;
  if (!configured) {
    return [
      { schema: null, table: "appointment_slots", filterColumn: "start_at" },
      { schema: "bookings", table: "appointment_slots", filterColumn: "start_at" },
      { schema: null, table: "available_appointment_slots", filterColumn: "start_at" },
    ];
  }

  return configured
    .split(",")
    .map(parseSlotSource)
    .filter(Boolean);
}

export function parseSlotSource(entry) {
  const raw = (entry || "").trim();
  if (!raw) return null;

  let schema = null;
  let table = raw;

  const separator = raw.includes(":") ? ":" : raw.includes(".") ? "." : null;
  if (separator) {
    const [schemaPart, tablePart] = raw.split(separator);
    schema = schemaPart ? schemaPart.trim() || null : null;
    table = (tablePart || "").trim();
  }

  if (!table) return null;

  return { schema: schema || null, table, filterColumn: "start_at" };
}

export async function fetchSlotsForSource(client, source, nowIso) {
  let query = client.from(source.table).select("*");
  if (source.filterColumn) {
    query = query.gte(source.filterColumn, nowIso).order(source.filterColumn, { ascending: true });
  }
  const { data, error } = await query;
  if (error && source.filterColumn && isMissingColumnError(error, source.filterColumn)) {
    const fallback = await client.from(source.table).select("*");
    if (fallback.error) {
      fallback.error.__slotSource = source;
      throw fallback.error;
    }
    return fallback.data || [];
  }
  if (error) {
    error.__slotSource = source;
    throw error;
  }
  return data || [];
}

export function normaliseSlotRecords(records) {
  return (records || []).map((record) => {
    const startAt =
      record.start_at ||
      record.startAt ||
      record.starts_at ||
      record.start_time ||
      record.start ||
      null;
    const duration =
      coerceNumber(record.duration_mins) ??
      coerceNumber(record.duration_minutes) ??
      coerceNumber(record.duration) ??
      coerceNumber(record.length_mins) ??
      60;

    const priceCents =
      coerceNumber(record.price_cents) ??
      coerceNumber(record.amount_cents) ??
      coerceNumber(record.price_amount_cents) ??
      null;
    const price =
      coerceNumber(record.price) ??
      coerceNumber(record.price_amount) ??
      coerceNumber(record.amount) ??
      null;
    const depositCents =
      coerceNumber(record.deposit_cents) ??
      coerceNumber(record.deposit_amount_cents) ??
      null;
    const deposit =
      coerceNumber(record.deposit) ??
      coerceNumber(record.deposit_amount) ??
      null;

    const isBooked = toBoolean(
      record.is_booked ?? record.booked ?? record.is_reserved ?? record.reserved ?? false
    );

    return {
      id: record.id ?? record.slot_id ?? record.uuid ?? record.slug ?? record.reference ?? startAt,
      start_at: startAt,
      duration_mins: duration,
      location: record.location || record.venue || record.room || null,
      price_cents: priceCents,
      price,
      currency: record.currency || record.currency_code || record.currency_iso || "GBP",
      deposit_cents: depositCents,
      deposit,
      payment_link: record.payment_link || record.payment_url || record.checkout_url || null,
      is_booked: isBooked,
    };
  });
}

export function coerceNumber(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    return ["true", "t", "1", "yes", "y"].includes(normalised);
  }
  return Boolean(value);
}

export function isMissingSlotRelationError(error) {
  const msg = error?.message || "";
  return /could not find table/i.test(msg) || /does not exist/i.test(msg);
}

export function isMissingColumnError(error, column) {
  if (!error?.message || !column) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("column") &&
    message.includes(column.toLowerCase()) &&
    message.includes("does not exist")
  );
}
