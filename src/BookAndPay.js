// src/BookAndPay.js
import React from "react";
import { format } from "date-fns";
import { supabase } from "./supabaseClient";

const initialForm = {
  first_name: "",
  surname: "",
  email: "",
  phone: "",
  notes: "",
};

const SLOT_SOURCES = getSlotSources();
const PROCESS_BOOKING_ENDPOINT =
  process.env.REACT_APP_BOOKING_HANDLER_URL || "/functions/v1/process-booking";

export default function BookAndPay() {
  const [slots, setSlots] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selected, setSelected] = React.useState(null);
  const [form, setForm] = React.useState(initialForm);
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState("");
  const [paymentNotice, setPaymentNotice] = React.useState("");
  const [paymentStatus, setPaymentStatus] = React.useState(null);
  const [confirmation, setConfirmation] = React.useState(null);
  const [slotSource, setSlotSource] = React.useState(null);
  const confirmationDate = React.useMemo(() => {
    if (!confirmation?.slot?.start_at) return null;
    const date = new Date(confirmation.slot.start_at);
    return Number.isNaN(date.getTime()) ? null : date;
  }, [confirmation]);

  const loadSlots = React.useCallback(async () => {
    setLoading(true);
    setError("");
    setPaymentNotice("");
    setSlotSource(null);
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      let loaded = false;
      let lastError = null;

      for (const source of SLOT_SOURCES) {
        const client = source.schema ? supabase.schema(source.schema) : supabase;
        try {
          const records = await fetchSlotsForSource(client, source, nowIso);
          const normalised = normaliseSlotRecords(records);
          const upcoming = normalised.filter((slot) => {
            if (!slot.start_at) return false;
            const start = new Date(slot.start_at);
            return !Number.isNaN(start.getTime()) && start >= now;
          });
          const available = upcoming.filter((slot) => !slot.is_booked);

          setSlots(available);
          setSlotSource(source);
          setPaymentNotice(
            available.length === 0
              ? "All available appointments are currently booked. Please check back soon."
              : ""
          );

          loaded = true;
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          if (isMissingSlotRelationError(err)) {
            continue;
          }
          throw err;
        }
      }

      if (!loaded && lastError) {
        throw lastError;
      }
      if (!loaded) {
        throw new Error("No appointment slot source could be loaded.");
      }
    } catch (e) {
      console.error(e);
      const message = formatFriendlyError(e);
      setError(message);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setPaymentNotice("");
    setPaymentStatus(null);
    setConfirmation(null);

    if (!selected) {
      setError("Choose an appointment slot to continue.");
      return;
    }

    if (!form.first_name.trim() || !form.email.trim() || !form.phone.trim()) {
      setError("First name, email, and phone are required.");
      return;
    }

    const emailPattern = /^\S+@\S+\.\S+$/;
    if (!emailPattern.test(form.email.trim())) {
      setError("Enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const source = selected.source || slotSource;
      if (!source) {
        throw new Error(
          "No appointment slot source is configured. Refresh the page and try again."
        );
      }

      const requestPayload = {
        slot_id: selected.id,
        slot_table: source.table,
        slot_schema: source.schema,
        patient: {
          first_name: form.first_name.trim(),
          surname: form.surname.trim() || null,
          email: form.email.trim(),
          phone: form.phone.trim(),
        },
        notes: form.notes.trim() || null,
        slot_details: {
          id: selected.id,
          start_at: selected.start_at,
          duration_mins: selected.duration_mins,
          location: selected.location,
          price_cents: selected.price_cents,
          price: selected.price,
          currency: selected.currency,
          payment_link: selected.payment_link,
        },
        metadata: {
          source: "public-portal",
        },
      };

      const response = await fetch(PROCESS_BOOKING_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });

      let result = null;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error("Failed to parse booking response", parseError);
      }

      if (!result) {
        throw new Error("Unexpected response from the booking service.");
      }

      setPaymentStatus(result.payment || null);

      if (result.payment?.status === "pending") {
        setPaymentNotice(
          result.message ||
            "Your payment is pending — complete the payment in the newly opened window."
        );
        if (result.payment.checkout_url && typeof window !== "undefined") {
          window.open(result.payment.checkout_url, "_blank", "noopener,noreferrer");
        }
      }

      if (result.payment?.status === "failed" || response.status === 402) {
        setError(result.message || "Payment failed. Please try another method.");
        return;
      }

      if (result.success) {
        setSuccess(result.message || "Payment complete – you’re booked in!");
        setConfirmation(result.confirmation || null);
        setPaymentNotice(
          result.payment?.receipt_url
            ? "Your receipt is available using the link below."
            : ""
        );
        setForm(initialForm);
        setSelected(null);
        await loadSlots();
        return;
      }

      if (!result.success && result.payment?.status !== "pending") {
        setError(result.message || "We couldn’t complete your booking. Please try again.");
      }
    } catch (e) {
      console.error(e);
      setError(formatFriendlyError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadICS = React.useCallback((slot) => {
    if (!slot?.start_at) return;
    const ics = buildICSFile(slot);
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const start = new Date(slot.start_at);
    const filename = `appointment-${format(start, "yyyyMMdd-HHmm")}.ics`;

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  return (
    <div style={container}>
      <style>{`
        @media (max-width: 960px) {
          .ap-book-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div style={introCard}>
        <h2 style={{ margin: "0 0 8px", color: "var(--text)" }}>Book a clinic appointment</h2>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Pick a time that works for you, reserve it instantly and complete your payment securely.
        </p>
      </div>

      {error && (
        <div style={{ ...alert, background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.35)" }}>
          ❌ {error}
        </div>
      )}

      {success && (
        <div style={{ ...alert, background: "rgba(22, 163, 74, 0.12)", border: "1px solid rgba(22, 163, 74, 0.35)" }}>
          ✅ {success}
        </div>
      )}

      {paymentNotice && (
        <div style={{ ...alert, background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(37, 99, 235, 0.25)" }}>
          ℹ️ {paymentNotice}
        </div>
      )}

      {confirmation && (
        <div style={{ ...alert, background: "rgba(22, 163, 74, 0.1)", border: "1px solid rgba(22, 163, 74, 0.3)" }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
            Appointment details
          </div>
          <ul style={confirmationList}>
            {confirmationDate && (
              <li style={confirmationItem}>
                <strong>Date</strong>
                <span>{format(confirmationDate, "EEEE d MMMM yyyy, HH:mm")}</span>
              </li>
            )}
            {confirmation.slot?.location && (
              <li style={confirmationItem}>
                <strong>Location</strong>
                <span>{confirmation.slot.location}</span>
              </li>
            )}
            {paymentStatus?.reference && (
              <li style={confirmationItem}>
                <strong>Payment reference</strong>
                <span>{paymentStatus.reference}</span>
              </li>
            )}
          </ul>
          {paymentStatus?.receipt_url && (
            <a
              href={paymentStatus.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              style={confirmationLink}
            >
              View receipt
            </a>
          )}
        </div>
      )}

      {paymentStatus?.status === "pending" && paymentStatus.checkout_url && (
        <div style={{ ...alert, background: "rgba(250, 204, 21, 0.1)", border: "1px solid rgba(234, 179, 8, 0.4)", color: "var(--text)" }}>
          🔔 Payment still pending –{' '}
          <a href={paymentStatus.checkout_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", fontWeight: 600 }}>
            open the secure checkout
          </a>{' '}
          to complete your booking.
        </div>
      )}

      <div className="ap-book-grid" style={grid}>
        <div style={slotPanel}>
          <div style={panelHeader}>
            <h3 style={{ margin: 0, color: "var(--text)" }}>Available slots</h3>
            <button onClick={loadSlots} disabled={loading} style={ghostBtn}>
              ↻ Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ color: "var(--muted)", padding: 12 }}>Loading slots…</div>
          ) : slots.length === 0 ? (
            <div style={{ color: "var(--muted)", padding: 12 }}>
              We don’t have any free appointments at the moment. Please try refreshing or contact the clinic.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {slots.map((slot) => (
                <SlotCard
                  key={slot.id}
                  slot={slot}
                  active={selected?.id === slot.id}
                  onSelect={() => setSelected(slot)}
                />
              ))}
            </div>
          )}
        </div>

        <div style={formPanel}>
          <h3 style={{ marginTop: 0, color: "var(--text)" }}>Reserve & pay</h3>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            We’ll send confirmation and receipts to the email you provide.
          </p>
          <BookingTable
            slots={slots}
            selectedId={selected?.id}
            onSelect={setSelected}
            onDownloadICS={handleDownloadICS}
            loading={loading}
          />
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
            <div style={fieldGroup}>
              <label style={label}>
                First name *
                <input value={form.first_name} onChange={handleChange("first_name")} required />
              </label>
            </div>
            <div style={fieldGroup}>
              <label style={label}>
                Surname
                <input value={form.surname} onChange={handleChange("surname")} />
              </label>
            </div>
            <div style={fieldGroup}>
              <label style={label}>
                Email *
                <input type="email" value={form.email} onChange={handleChange("email")} required />
              </label>
            </div>
            <div style={fieldGroup}>
              <label style={label}>
                Phone *
                <input value={form.phone} onChange={handleChange("phone")} required />
              </label>
            </div>
            <div style={fieldGroup}>
              <label style={label}>
                Notes (optional)
                <textarea value={form.notes} onChange={handleChange("notes")} rows={3} />
              </label>
            </div>

            <button type="submit" disabled={submitting} style={primaryBtn}>
              {submitting ? "Reserving…" : selected ? "Reserve & continue to payment" : "Select a slot to continue"}
            </button>

            {selected?.payment_link && (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                A secure payment window will open in a new tab once your reservation is placed.
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function SlotCard({ slot, active, onSelect }) {
  const start = slot.start_at ? new Date(slot.start_at) : null;
  const duration = slot.duration_mins || 60;
  const end = start ? new Date(start.getTime() + duration * 60000) : null;
  const price = formatPrice(slot);
  const deposit = formatDeposit(slot);

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        ...slotCard,
        borderColor: active ? "var(--primary)" : "var(--border)",
        boxShadow: active ? "var(--shadow)" : "none",
        transform: active ? "translateY(-1px)" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>
            {start ? format(start, "EEEE d MMM") : "TBC"}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            {start && end
              ? `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`
              : "Time to be confirmed"}
          </div>
          {slot.location && (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>📍 {slot.location}</div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          {price && (
            <div style={{ fontWeight: 600, color: "var(--primary)", fontSize: 16 }}>{price}</div>
          )}
          {deposit && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Deposit: {deposit}</div>
          )}
        </div>
      </div>
    </button>
  );
}

function BookingTable({ slots, selectedId, onSelect, onDownloadICS, loading }) {
  return (
    <div style={tableWrapper}>
      <div style={tableHeader}>
        <h4 style={{ margin: 0, color: "var(--text)" }}>Clinic availability</h4>
        <span style={tableCaption}>
          Reminders are scheduled 24 hours and 1 hour before your visit.
        </span>
      </div>
      {loading ? (
        <div style={{ padding: "8px 0", color: "var(--muted)", fontSize: 13 }}>
          Loading timetable…
        </div>
      ) : slots.length === 0 ? (
        <div style={{ padding: "8px 0", color: "var(--muted)", fontSize: 13 }}>
          New appointments will appear here as soon as they’re released.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th scope="col" style={tableHeadCell}>
                  Date
                </th>
                <th scope="col" style={tableHeadCell}>
                  Time
                </th>
                <th scope="col" style={tableHeadCell}>
                  Location
                </th>
                <th scope="col" style={tableHeadCell}>
                  Price
                </th>
                <th scope="col" style={tableHeadCell}>
                  Calendar
                </th>
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => {
                const start = slot.start_at ? new Date(slot.start_at) : null;
                const duration = slot.duration_mins || 60;
                const end = start ? new Date(start.getTime() + duration * 60000) : null;
                return (
                  <tr
                    key={slot.id}
                    data-active={selectedId === slot.id ? "true" : undefined}
                    style={selectedId === slot.id ? tableActiveRow : tableRow}
                  >
                    <td style={tableCell}>
                      {start ? (
                        <button
                          type="button"
                          onClick={() => onSelect(slot)}
                          style={{ ...tableSelectBtn, fontWeight: 600 }}
                        >
                          {format(start, "EEE d MMM")}
                        </button>
                      ) : (
                        "TBC"
                      )}
                    </td>
                    <td style={tableCell}>
                      {start && end
                        ? `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`
                        : "TBC"}
                    </td>
                    <td style={tableCell}>{slot.location || "Clinic"}</td>
                    <td style={tableCell}>{formatPrice(slot) || "Contact us"}</td>
                    <td style={{ ...tableCell, minWidth: 140 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <button type="button" style={tableDownloadBtn} onClick={() => onDownloadICS(slot)}>
                          Add to calendar
                        </button>
                        <span style={tableReminder}>24h & 1h reminders</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatPrice(slot) {
  const amountCents = normaliseMoney(slot.price_cents, slot.price);
  if (amountCents == null) return null;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: slot.currency || "GBP",
  }).format(amountCents / 100);
}

function formatDeposit(slot) {
  const amountCents = normaliseMoney(slot.deposit_cents, slot.deposit);
  if (amountCents == null) return null;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: slot.currency || "GBP",
  }).format(amountCents / 100);
}

function normaliseMoney(primary, fallback) {
  const primaryNum = typeof primary === "string" ? Number(primary) : primary;
  const fallbackNum = typeof fallback === "string" ? Number(fallback) : fallback;
  if (typeof primaryNum === "number" && !Number.isNaN(primaryNum)) return primaryNum;
  if (typeof fallbackNum === "number" && !Number.isNaN(fallbackNum)) {
    return Math.round(fallbackNum * 100);
  }
  return null;
}

function formatFriendlyError(error) {
  const msg = error?.message || "Something went wrong.";
  if (/schema cache/i.test(msg) && /appointment_slots/i.test(msg)) {
    return "The appointment slot source could not be found. Update REACT_APP_APPOINTMENT_SLOT_SOURCES to point at the correct Supabase table or view.";
  }
  if (/appointment_slots/i.test(msg) && /does not exist/i.test(msg)) {
    return "The appointment slot source is missing. Confirm the Supabase table or view name configured for appointments.";
  }
  if (/booking_requests/i.test(msg) && /does not exist/i.test(msg)) {
    return "The booking_requests table is missing. Create it in Supabase or grant insert permissions.";
  }
  if (/booking service/i.test(msg) && /response/i.test(msg)) {
    return "We couldn’t confirm the booking because the server returned an unexpected response. Please try again.";
  }
  if (/fetch failed/i.test(msg) || /failed to fetch/i.test(msg)) {
    return "We couldn’t reach the booking service. Check your internet connection and try again.";
  }
  return msg;
}

function getSlotSources() {
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

function parseSlotSource(entry) {
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

async function fetchSlotsForSource(client, source, nowIso) {
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
    return attachSourceMetadata(fallback.data || [], source);
  }
  if (error) {
    error.__slotSource = source;
    throw error;
  }
  return attachSourceMetadata(data || [], source);
}

function attachSourceMetadata(records, source) {
  return (records || []).map((record) => ({ ...record, __slot_source: source }));
}

function normaliseSlotRecords(records) {
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

    const isBooked = toBoolean(record.is_booked ?? record.booked ?? record.is_reserved ?? record.reserved ?? false);

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
      source: record.__slot_source || null,
    };
  });
}

function coerceNumber(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    return ["true", "t", "1", "yes", "y"].includes(normalised);
  }
  return Boolean(value);
}

function isMissingSlotRelationError(error) {
  const msg = error?.message || "";
  return /could not find table/i.test(msg) || /does not exist/i.test(msg);
}

function isMissingColumnError(error, column) {
  if (!error?.message || !column) return false;
  const message = error.message.toLowerCase();
  return message.includes("column") && message.includes(column.toLowerCase()) && message.includes("does not exist");
}

function buildICSFile(slot) {
  const start = slot.start_at ? new Date(slot.start_at) : null;
  if (!start) return "";
  const duration = slot.duration_mins || 60;
  const end = new Date(start.getTime() + duration * 60000);
  const dtStamp = formatICSDate(new Date());
  const dtStart = formatICSDate(start);
  const dtEnd = formatICSDate(end);
  const uid = `appointment-${slot.id}@allergypath`;
  const summary = escapeICSValue("Allergy Path clinic appointment");
  const location = escapeICSValue(slot.location || "Clinic");
  const description = escapeICSValue(
    "We look forward to seeing you. Please contact the clinic if you need to reschedule."
  );

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Allergy Path//Booking//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment reminder",
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

function formatICSDate(date) {
  const iso = date.toISOString();
  return iso.replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeICSValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

/* styles */
const container = {
  display: "grid",
  gap: 16,
};

const introCard = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "var(--shadow)",
};

const alert = {
  borderRadius: 12,
  padding: "12px 16px",
  color: "var(--text)",
  fontSize: 14,
};

const confirmationList = {
  listStyle: "none",
  margin: "0 0 8px",
  padding: 0,
  display: "grid",
  gap: 4,
};

const confirmationItem = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 13,
  color: "var(--text)",
};

const confirmationLink = {
  color: "var(--primary)",
  fontWeight: 600,
  textDecoration: "none",
};

const grid = {
  display: "grid",
  gap: 20,
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 360px)",
  alignItems: "start",
};

const slotPanel = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 20,
  display: "grid",
  gap: 16,
  boxShadow: "var(--shadow)",
  minHeight: 280,
};

const formPanel = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "var(--shadow)",
};

const tableWrapper = {
  display: "grid",
  gap: 8,
  marginBottom: 12,
};

const tableHeader = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const tableCaption = {
  fontSize: 12,
  color: "var(--muted)",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const tableHeadCell = {
  textAlign: "left",
  padding: "8px 6px",
  color: "var(--muted)",
  fontSize: 12,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  borderBottom: "1px solid var(--border)",
};

const tableRow = {
  borderBottom: "1px solid var(--border)",
};

const tableActiveRow = {
  ...tableRow,
  background: "rgba(37, 99, 235, 0.08)",
};

const tableCell = {
  padding: "10px 6px",
  verticalAlign: "top",
};

const tableSelectBtn = {
  background: "transparent",
  border: "none",
  color: "var(--primary)",
  cursor: "pointer",
  padding: 0,
  fontSize: 13,
};

const tableDownloadBtn = {
  background: "rgba(37, 99, 235, 0.1)",
  border: "1px solid rgba(37, 99, 235, 0.3)",
  borderRadius: 8,
  color: "var(--primary)",
  cursor: "pointer",
  fontSize: 12,
  padding: "6px 10px",
};

const tableReminder = {
  fontSize: 11,
  color: "var(--muted)",
};

const panelHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const ghostBtn = {
  background: "transparent",
  color: "var(--primary)",
  border: "1px solid rgba(37, 99, 235, 0.35)",
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
};

const primaryBtn = {
  background: "var(--primary)",
  color: "var(--primaryText)",
  border: "1px solid var(--primary)",
  borderRadius: 12,
  padding: "12px 16px",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  transition: "transform 0.18s ease, box-shadow 0.18s ease",
};

const slotCard = {
  width: "100%",
  background: "var(--card)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 16,
  textAlign: "left",
  cursor: "pointer",
  transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
};

const label = {
  display: "grid",
  gap: 6,
  color: "var(--text)",
  fontWeight: 600,
  fontSize: 14,
};

const fieldGroup = {
  display: "grid",
  gap: 4,
};
