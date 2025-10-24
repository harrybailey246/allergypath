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

export default function BookAndPay() {
  const [slots, setSlots] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selected, setSelected] = React.useState(null);
  const [form, setForm] = React.useState(initialForm);
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState("");
  const [paymentNotice, setPaymentNotice] = React.useState("");

  const loadSlots = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("appointment_slots")
        .select(
          "id, start_at, duration_mins, location, price_cents, price, currency, deposit_cents, payment_link, is_booked"
        )
        .gte("start_at", new Date().toISOString())
        .order("start_at", { ascending: true });

      if (err) throw err;
      const available = (data || []).filter((slot) => !slot.is_booked);
      setSlots(available);
      if (available.length === 0) {
        setPaymentNotice("All available appointments are currently booked. Please check back soon.");
      } else {
        setPaymentNotice("");
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
      const payload = {
        slot_id: selected.id,
        first_name: form.first_name.trim(),
        surname: form.surname.trim() || null,
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim() || null,
      };

      const { error: insertError } = await supabase.from("booking_requests").insert([payload]);
      if (insertError) throw insertError;

      // mark slot as tentatively reserved so it disappears from the picker
      await supabase
        .from("appointment_slots")
        .update({ is_booked: true })
        .eq("id", selected.id)
        .eq("is_booked", false);

      setSuccess("Great! We’ve reserved this appointment — complete payment below to confirm.");
      setPaymentNotice(selected.payment_link ? "Payment opens in a new tab." : "A team member will contact you to take payment.");

      if (selected.payment_link && typeof window !== 'undefined') {
        window.open(selected.payment_link, "_blank", "noopener,noreferrer");
      }

      setForm(initialForm);
      setSelected(null);
      await loadSlots();
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
  if (/appointment_slots/i.test(msg) && /does not exist/i.test(msg)) {
    return "The appointment_slots table is missing. Create it in Supabase with the columns used for slots.";
  }
  if (/booking_requests/i.test(msg) && /does not exist/i.test(msg)) {
    return "The booking_requests table is missing. Create it in Supabase or grant insert permissions.";
  }
  return msg;
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
