import React from "react";
import { format } from "date-fns";
import { supabase } from "./supabaseClient";

const FIRST_NAME_COLUMNS = [
  "first_name",
  "given_name",
  "firstName",
  "name",
  "full_name",
  "contact_name",
];

const LAST_NAME_COLUMNS = ["surname", "last_name", "family_name", "lastName"];
const STATUS_COLUMNS = ["status", "state", "booking_status", "approval_status", "request_status", "decision"];
const SLOT_START_COLUMNS = [
  "slot_start_at",
  "start_at",
  "slot_time",
  "appointment_start",
  "scheduled_for",
  "start",
];
const SLOT_LOCATION_COLUMNS = ["slot_location", "location", "clinic", "room"];
const SLOT_DURATION_COLUMNS = [
  "slot_duration_mins",
  "duration_mins",
  "duration_minutes",
  "slot_duration",
  "duration",
];
const SLOT_RESERVATION_COLUMNS = ["is_booked", "booked", "is_reserved", "reserved"];
const SLOT_SOURCES = getSlotSources();
const DEFAULT_APPOINTMENT_DURATION = 60;

const TOAST_TONES = {
  success: {
    background: "rgba(22, 163, 74, 0.12)",
    border: "1px solid rgba(22, 163, 74, 0.4)",
  },
  info: {
    background: "rgba(37, 99, 235, 0.12)",
    border: "1px solid rgba(37, 99, 235, 0.35)",
  },
  error: {
    background: "rgba(239, 68, 68, 0.12)",
    border: "1px solid rgba(239, 68, 68, 0.45)",
  },
};

export default function BookingRequests() {
  const [loading, setLoading] = React.useState(true);
  const [requests, setRequests] = React.useState([]);
  const [error, setError] = React.useState("");
  const [busyId, setBusyId] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const toastTimeoutRef = React.useRef(null);

  const showToast = React.useCallback((tone, message) => {
    if (!message) return;
    setToast({ tone, message });
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4500);
  }, []);

  React.useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const fetchRequests = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let query = supabase
        .from("booking_requests")
        .select("*")
        .order("created_at", { ascending: false });

      const withStatus = await query.eq("status", "pending");
      let data = withStatus.data || [];
      if (withStatus.error) {
        if (isMissingColumnError(withStatus.error, "status")) {
          const fallback = await supabase
            .from("booking_requests")
            .select("*")
            .order("created_at", { ascending: false });
          if (fallback.error) throw fallback.error;
          data = fallback.data || [];
        } else {
          throw withStatus.error;
        }
      }

      const pending = (data || []).map(normaliseRequest).filter((r) => isPending(r));
      setRequests(pending);
    } catch (err) {
      console.error(err);
      setError(formatFriendlyError(err));
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleUpdate = async (request, nextStatus) => {
    if (!request?.raw?.id) return;
    setBusyId(request.raw.id);
    setError("");
    try {
      const shouldCreateAppointment = ["approved", "converted"].includes(nextStatus);
      let appointmentRecord = null;

      if (shouldCreateAppointment) {
        appointmentRecord = await createAppointmentForRequest(request);
        const slotId =
          appointmentRecord?.slot_id || request.raw.slot_id || request.raw.appointment_slot_id || request.raw.slot;
        if (slotId) {
          await reserveSlotById(slotId);
        }
      }

      const payload = buildUpdatePayload(request.raw, nextStatus);
      if (Object.keys(payload).length === 0) {
        throw new Error(
          "The booking_requests table does not expose a status column that can be updated."
        );
      }
      const { error: updateError } = await supabase
        .from("booking_requests")
        .update(payload)
        .eq("id", request.raw.id);
      if (updateError) {
        if (appointmentRecord?.id) {
          await rollbackAppointment(appointmentRecord.id);
        }
        throw updateError;
      }
      if (shouldCreateAppointment) {
        await notifyRequestProcessed(request, nextStatus, appointmentRecord);
      }
      setRequests((prev) => prev.filter((item) => item.raw.id !== request.raw.id));
      const successName = request.displayName || "the patient";
      if (nextStatus === "declined") {
        showToast("info", `Declined the booking request for ${successName}.`);
      } else if (nextStatus === "converted") {
        showToast(
          "success",
          `Converted the booking request for ${successName}. Appointment confirmed for ${
            formatAppointmentToastSummary(appointmentRecord) || "the selected slot"
          }.`
        );
      } else if (nextStatus === "approved") {
        showToast(
          "success",
          `Approved the booking request for ${successName}. Appointment scheduled for ${
            formatAppointmentToastSummary(appointmentRecord) || "the selected slot"
          }.`
        );
      }
    } catch (err) {
      console.error(err);
      setError(formatFriendlyError(err));
      if (err?.message) {
        showToast("error", err.message);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={container}>
      <header style={header}>
        <div>
          <h1 style={{ margin: 0 }}>Booking Requests</h1>
          <p style={muted}>
            Review, approve, or decline self-service appointment requests. Approvals automatically
            reserve the slot and create the appointment for you.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={button} onClick={fetchRequests} disabled={loading}>
            ⟳ Refresh
          </button>
        </div>
      </header>

      {toast && (
        <div style={{ ...toastBox, ...(TOAST_TONES[toast.tone] || TOAST_TONES.info) }}>{toast.message}</div>
      )}

      {error && <div style={errorBox}>{error}</div>}

      {loading ? (
        <div style={card}>Loading requests…</div>
      ) : requests.length === 0 ? (
        <div style={card}>No pending requests right now.</div>
      ) : (
        <div style={list}>
          {requests.map((request) => (
            <article key={request.raw.id} style={card}>
              <div style={rowHeader}>
                <div>
                  <h2 style={cardTitle}>{request.displayName || "Unnamed"}</h2>
                  <p style={muted}>
                    Submitted {request.createdAt ? format(request.createdAt, "d MMM yyyy, HH:mm") : "unknown"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    style={{ ...button, ...approveBtn }}
                    disabled={busyId === request.raw.id}
                    onClick={() => handleUpdate(request, "approved")}
                  >
                    Approve
                  </button>
                  <button
                    style={{ ...button, ...convertBtn }}
                    disabled={busyId === request.raw.id}
                    onClick={() => handleUpdate(request, "converted")}
                  >
                    Convert
                  </button>
                  <button
                    style={{ ...button, ...declineBtn }}
                    disabled={busyId === request.raw.id}
                    onClick={() => handleUpdate(request, "declined")}
                  >
                    Decline
                  </button>
                </div>
              </div>

              <div style={grid}>
                <Info label="Email" value={request.email} />
                <Info label="Phone" value={request.phone} />
                <Info label="Slot" value={request.slotSummary} />
                <Info label="Status" value={request.statusLabel} />
              </div>

              {request.notes && (
                <div style={{ marginTop: 12 }}>
                  <strong style={{ display: "block", marginBottom: 4 }}>Notes</strong>
                  <p style={notes}>{request.notes}</p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

async function createAppointmentForRequest(request) {
  const row = request?.raw || {};
  const slotStartValue = pick(row, SLOT_START_COLUMNS) || row.slot_start_at || row.start_at;
  const startDate = parseDate(slotStartValue);
  if (!startDate) {
    throw new Error("Unable to create appointment — the booking request is missing a slot start time.");
  }

  const duration = pickNumber(row, SLOT_DURATION_COLUMNS) || DEFAULT_APPOINTMENT_DURATION;
  const endDate = Number.isFinite(duration) ? new Date(startDate.getTime() + duration * 60000) : null;

  const payload = {
    start_at: startDate.toISOString(),
    end_at: endDate ? endDate.toISOString() : null,
    location: pick(row, SLOT_LOCATION_COLUMNS) || null,
    notes: request.notes || row.notes || row.internal_notes || null,
    patient_name: request.displayName || null,
    patient_email: request.email || row.email || row.contact_email || null,
    patient_phone: request.phone || row.phone || row.phone_number || row.contact_phone || null,
    booking_request_id: row.id || null,
    slot_id: row.slot_id || row.appointment_slot_id || row.slot || null,
    source: "booking_request",
  };

  const optionalColumns = Object.keys(payload).filter((column) => column !== "start_at");
  let attempt = { ...payload };

  while (true) {
    const cleaned = cleanInsertPayload(attempt);
    const { data, error } = await supabase.from("appointments").insert([cleaned]).select("*").single();
    if (!error) {
      return data;
    }

    const missing = findMissingColumn(error, optionalColumns.filter((column) => column in attempt));
    if (missing) {
      delete attempt[missing];
      continue;
    }

    throw error;
  }
}

async function reserveSlotById(slotId) {
  if (!slotId) return;
  for (const source of SLOT_SOURCES) {
    const client = source.schema ? supabase.schema(source.schema) : supabase;
    for (const reserveColumn of SLOT_RESERVATION_COLUMNS) {
      const updatePayload = { [reserveColumn]: true };
      const matchColumns = ["id", "slot_id", "uuid", "reference"];
      for (const matchColumn of matchColumns) {
        try {
          const response = await client.from(source.table).update(updatePayload).eq(matchColumn, slotId);
          if (!response?.error) {
            return;
          }
          if (isMissingColumnError(response.error, reserveColumn)) {
            break;
          }
          if (isMissingColumnError(response.error, matchColumn)) {
            continue;
          }
        } catch (err) {
          console.warn("Failed to reserve slot", err);
        }
      }
    }
  }
}

async function rollbackAppointment(appointmentId) {
  if (!appointmentId) return;
  try {
    await supabase.from("appointments").delete().eq("id", appointmentId);
  } catch (err) {
    console.warn("Unable to rollback appointment", err);
  }
}

async function notifyRequestProcessed(request, status, appointmentRecord) {
  try {
    const user = (await supabase.auth.getUser()).data?.user;
    await supabase.functions.invoke("notify-email", {
      body: {
        type: "booking_request_processed",
        status,
        actorEmail: user?.email || null,
        request: {
          id: request?.raw?.id || null,
          first_name: pick(request?.raw, FIRST_NAME_COLUMNS) || request?.displayName || "",
          surname: pick(request?.raw, LAST_NAME_COLUMNS) || "",
          email: request?.email || request?.raw?.email || null,
          phone: request?.phone || request?.raw?.phone || request?.raw?.phone_number || null,
          slot_summary: request?.slotSummary || formatAppointmentToastSummary(appointmentRecord) || null,
        },
        appointment: appointmentRecord
          ? {
              id: appointmentRecord.id,
              start_at: appointmentRecord.start_at || null,
              end_at: appointmentRecord.end_at || null,
              location: appointmentRecord.location || null,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("notify-email invocation failed", err);
  }
}

function formatAppointmentToastSummary(appointment) {
  if (!appointment) return null;
  const start = appointment.start_at ? parseDate(appointment.start_at) : null;
  const parts = [];
  if (start) {
    parts.push(format(start, "d MMM yyyy HH:mm"));
  }
  if (appointment.location) {
    parts.push(appointment.location);
  }
  return parts.join(" • ") || null;
}

function Info({ label, value }) {
  if (!value) return null;
  return (
    <div style={infoItem}>
      <span style={infoLabel}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function cleanInsertPayload(record) {
  return Object.entries(record).reduce((acc, [key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function findMissingColumn(error, candidates) {
  if (!error?.message) return null;
  const message = error.message.toLowerCase();
  return candidates.find((column) =>
    column && message.includes(column.toLowerCase()) && message.includes("does not exist")
  );
}

function pickNumber(row, columns) {
  if (!row) return null;
  for (const column of columns) {
    if (!(column in row)) continue;
    const value = row[column];
    if (value == null) continue;
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isNaN(num)) return num;
  }
  return null;
}

function normaliseRequest(row) {
  const createdAt = parseDate(row.created_at);
  const status = deriveStatus(row);
  const firstName = pick(row, FIRST_NAME_COLUMNS);
  const lastName = pick(row, LAST_NAME_COLUMNS);
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || firstName || lastName || "";
  const email = row.email || row.contact_email || row.customer_email || "";
  const phone = row.phone || row.phone_number || row.contact_phone || "";
  const notes = row.notes || row.internal_notes || row.comments || "";
  const slotStart = parseDate(pick(row, SLOT_START_COLUMNS));
  const slotLocation = pick(row, SLOT_LOCATION_COLUMNS);
  const slotId = row.slot_id || row.appointment_slot_id || row.slot || null;
  const slotSummary = buildSlotSummary(slotStart, slotLocation, slotId);

  return {
    raw: row,
    createdAt,
    displayName,
    email,
    phone,
    notes,
    slotSummary,
    statusLabel: status,
  };
}

function deriveStatus(row) {
  for (const column of STATUS_COLUMNS) {
    if (column in row && row[column]) {
      return String(row[column]).trim();
    }
  }
  if (row.approved_at) return "approved";
  if (row.declined_at) return "declined";
  if (row.converted_at) return "converted";
  if (row.processed_at) return "processed";
  return "pending";
}

function isPending(request) {
  const status = (request.statusLabel || "").toLowerCase();
  if (!status) return true;
  if (["pending", "new", "awaiting", "awaiting_payment"].includes(status)) return true;
  if (["approved", "declined", "converted", "cancelled", "completed"].includes(status)) return false;
  return !request.raw.approved_at && !request.raw.declined_at && !request.raw.converted_at;
}

function buildUpdatePayload(row, nextStatus) {
  const payload = {};
  const statusColumn = getStatusColumn(row);
  const timestamp = new Date().toISOString();

  if (statusColumn) payload[statusColumn] = nextStatus;
  if ("updated_at" in row) payload.updated_at = timestamp;
  if ("decision_at" in row) payload.decision_at = timestamp;
  if ("processed_at" in row) payload.processed_at = nextStatus === "pending" ? null : timestamp;
  if ("approved_at" in row)
    payload.approved_at = nextStatus === "approved" || nextStatus === "converted" ? timestamp : null;
  if ("declined_at" in row) payload.declined_at = nextStatus === "declined" ? timestamp : null;
  if ("converted_at" in row) payload.converted_at = nextStatus === "converted" ? timestamp : null;

  return payload;
}

function getStatusColumn(row) {
  return STATUS_COLUMNS.find((column) => column in row) || null;
}

function pick(row, columns) {
  for (const column of columns) {
    if (row && row[column]) return row[column];
  }
  return "";
}

function parseDate(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch (err) {
    return null;
  }
}

function buildSlotSummary(start, location, slotId) {
  const parts = [];
  if (start) parts.push(format(start, "EEE d MMM, HH:mm"));
  if (location) parts.push(location);
  if (!start && !location && slotId) parts.push(`Slot #${slotId}`);
  if (slotId && start) parts.push(`#${slotId}`);
  return parts.join(" • ") || null;
}

function isMissingColumnError(error, column) {
  if (!error?.message || !column) return false;
  const message = error.message.toLowerCase();
  return message.includes("column") && message.includes(column.toLowerCase()) && message.includes("does not exist");
}

function formatFriendlyError(error) {
  const message = error?.message || "Something went wrong.";
  if (/booking_requests/i.test(message) && /permission/i.test(message)) {
    return "Your account doesn’t have permission to read booking requests.";
  }
  return message;
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

const container = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  flexWrap: "wrap",
  gap: 12,
};

const list = {
  display: "grid",
  gap: 16,
};

const card = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 20,
  boxShadow: "var(--shadow)",
};

const rowHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const cardTitle = {
  margin: "0 0 4px",
};

const muted = {
  color: "var(--muted)",
  margin: 0,
  fontSize: 14,
};

const button = {
  background: "var(--btnBg)",
  color: "var(--btnText)",
  border: "1px solid var(--btnBorder)",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 14,
};

const approveBtn = {
  background: "rgba(22, 163, 74, 0.14)",
  border: "1px solid rgba(22, 163, 74, 0.4)",
  color: "var(--text)",
};

const declineBtn = {
  background: "rgba(239, 68, 68, 0.12)",
  border: "1px solid rgba(239, 68, 68, 0.4)",
  color: "var(--text)",
};

const convertBtn = {
  background: "rgba(37, 99, 235, 0.12)",
  border: "1px solid rgba(37, 99, 235, 0.35)",
  color: "var(--text)",
};

const grid = {
  marginTop: 12,
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
};

const infoItem = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const infoLabel = {
  fontSize: 12,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const notes = {
  background: "rgba(15, 23, 42, 0.04)",
  padding: 12,
  borderRadius: 10,
  margin: 0,
};

const toastBox = {
  borderRadius: 10,
  padding: 12,
  color: "var(--text)",
};

const errorBox = {
  background: "rgba(239, 68, 68, 0.12)",
  border: "1px solid rgba(239, 68, 68, 0.45)",
  borderRadius: 10,
  padding: 12,
  color: "var(--text)",
};
