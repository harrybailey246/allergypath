// src/AppointmentSlotManager.js
import React from "react";
import { format } from "date-fns";
import { supabase } from "./supabaseClient";
import {
  SLOT_COLUMN_CANDIDATES,
  SLOT_PRIMARY_KEY_CANDIDATES,
  fetchSlotsForSource,
  getSlotSources,
  isMissingSlotRelationError,
  normaliseSlotRecords,
} from "./utils/appointmentSlots";

const SLOT_SOURCES = getSlotSources();

const createEmptyForm = () => ({
  start_at: "",
  duration_mins: 60,
  location: "",
  price: "",
  deposit: "",
  payment_link: "",
  is_booked: false,
});

export default function AppointmentSlotManager() {
  const [sourceIndex, setSourceIndex] = React.useState(0);
  const [slots, setSlots] = React.useState([]);
  const [columnMap, setColumnMap] = React.useState(() => deriveColumnMap([]));
  const [primaryKey, setPrimaryKey] = React.useState("id");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [form, setForm] = React.useState(() => createEmptyForm());
  const [editing, setEditing] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  const activeSource = SLOT_SOURCES[sourceIndex] || null;

  const loadSlots = React.useCallback(async () => {
    if (!activeSource) {
      setSlots([]);
      setColumnMap(deriveColumnMap([]));
      setPrimaryKey("id");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("");
    try {
      const client = activeSource.schema ? supabase.schema(activeSource.schema) : supabase;
      const records = await fetchSlotsForSource(
        client,
        { ...activeSource, filterColumn: null },
        new Date().toISOString()
      );
      const derivedMap = deriveColumnMap(records);
      const detectedKey = detectPrimaryKey(records);
      const normalised = normaliseSlotRecords(records);
      const decorated = normalised.map((slot, index) => {
        const raw = records[index] || {};
        const keyValue =
          raw && Object.prototype.hasOwnProperty.call(raw, detectedKey)
            ? raw[detectedKey]
            : slot.id;
        return {
          ...slot,
          __raw: raw,
          __primaryKey: detectedKey,
          __primaryValue: keyValue,
        };
      });

      decorated.sort((a, b) => {
        const aTime = a.start_at ? new Date(a.start_at).getTime() : 0;
        const bTime = b.start_at ? new Date(b.start_at).getTime() : 0;
        return aTime - bTime;
      });

      setSlots(decorated);
      setColumnMap(derivedMap);
      setPrimaryKey(detectedKey);
    } catch (err) {
      console.error(err);
      if (isMissingSlotRelationError(err)) {
        setError(
          `The source ${describeSource(activeSource)} does not exist. Update REACT_APP_APPOINTMENT_SLOT_SOURCES.
        );
      } else {
        setError(err?.message || "Unable to load appointment slots.");
      }
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [activeSource]);

  React.useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const resetForm = React.useCallback(() => {
    setForm(createEmptyForm());
    setEditing(null);
  }, []);

  const handleSourceChange = (event) => {
    const nextIndex = Number(event.target.value);
    setSourceIndex(Number.isFinite(nextIndex) ? nextIndex : 0);
    setSlots([]);
    resetForm();
  };

  const handleEdit = (slot) => {
    setEditing(slot);
    setError("");
    setStatus("");
    setForm({
      start_at: toLocalInputValue(slot.start_at),
      duration_mins: slot.duration_mins || 60,
      location: slot.location || "",
      price: formatMoneyField(slot.price_cents, slot.price),
      deposit: formatMoneyField(slot.deposit_cents, slot.deposit),
      payment_link: slot.payment_link || "",
      is_booked: Boolean(slot.is_booked),
    });
  };

  const handleFieldChange = (field) => (event) => {
    const value = field === "is_booked" ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggleBooked = async (slot) => {
    if (!activeSource) return;
    const next = !slot.is_booked;
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        next
          ? "Mark this slot as booked? It will disappear from the public booking list."
          : "Mark this slot as available for booking?"
      );
    if (!confirmed) return;

    setError("");
    setStatus("");
    const previous = slots;
    setSlots((current) =>
      current.map((item) =>
        item.__primaryValue === slot.__primaryValue ? { ...item, is_booked: next } : item
      )
    );

    const client = activeSource.schema ? supabase.schema(activeSource.schema) : supabase;
    const payload = buildColumnPayload({ is_booked: next }, columnMap);
    if (Object.keys(payload).length === 0) {
      setSlots(previous);
      setError("This source does not expose an is_booked column to update.");
      await loadSlots();
      return;
    }
    try {
      const { error: updateError } = await client
        .from(activeSource.table)
        .update(payload)
        .eq(slot.__primaryKey || primaryKey, slot.__primaryValue);
      if (updateError) throw updateError;
      setStatus(next ? "Slot marked as booked." : "Slot made available.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to update the slot.");
      setSlots(previous);
    } finally {
      await loadSlots();
    }
  };

  const handleDelete = async (slot) => {
    if (!activeSource) return;
    const confirmed =
      typeof window === "undefined" ||
      window.confirm("Delete this appointment slot? This cannot be undone.");
    if (!confirmed) return;

    setError("");
    setStatus("");
    const previous = slots;
    setSlots((current) => current.filter((item) => item.__primaryValue !== slot.__primaryValue));
    if (editing && editing.__primaryValue === slot.__primaryValue) {
      resetForm();
    }

    const client = activeSource.schema ? supabase.schema(activeSource.schema) : supabase;
    try {
      const { error: deleteError } = await client
        .from(activeSource.table)
        .delete()
        .eq(slot.__primaryKey || primaryKey, slot.__primaryValue);
      if (deleteError) throw deleteError;
      setStatus("Slot deleted.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to delete the slot.");
      setSlots(previous);
    } finally {
      await loadSlots();
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!activeSource) return;
    setError("");
    setStatus("");

    const validation = validateForm(form);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    const client = activeSource.schema ? supabase.schema(activeSource.schema) : supabase;
    const normalized = normalizeForm(form, columnMap);
    const payload = buildColumnPayload(normalized, columnMap);
    if (Object.keys(payload).length === 0) {
      setError("No columns available for updates in this source.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const { error: updateError } = await client
          .from(activeSource.table)
          .update(payload)
          .eq(editing.__primaryKey || primaryKey, editing.__primaryValue);
        if (updateError) throw updateError;
        setStatus("Slot updated.");
      } else {
        const { error: insertError } = await client.from(activeSource.table).insert([payload]);
        if (insertError) throw insertError;
        setStatus("Slot created.");
      }
      resetForm();
      await loadSlots();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unable to save the slot.");
    } finally {
      setSaving(false);
    }
  };

  if (SLOT_SOURCES.length === 0) {
    return (
      <div style={card}>
        <h2 style={title}>Appointment slots</h2>
        <p style={muted}>
          No appointment slot sources are configured. Set REACT_APP_APPOINTMENT_SLOT_SOURCES or
          create an <code>appointment_slots</code> table in Supabase.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ ...card, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <h2 style={{ ...title, marginBottom: 0 }}>Appointment slot manager</h2>
          <select value={sourceIndex} onChange={handleSourceChange} style={select}>
            {SLOT_SOURCES.map((source, index) => (
              <option key={describeSource(source)} value={index}>
                {describeSource(source)}
              </option>
            ))}
          </select>
          <button type="button" onClick={loadSlots} disabled={loading} style={ghostBtn}>
            ↻ Refresh
          </button>
        </div>
        <p style={{ ...muted, margin: 0 }}>
          Manage the raw slots that feed the public booking flow. Changes take effect immediately.
        </p>
        {loading && <div style={muted}>Loading slots…</div>}
        {error && (
          <div style={{ ...alert, background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.35)" }}>
            ❌ {error}
          </div>
        )}
        {status && (
          <div style={{ ...alert, background: "rgba(34, 197, 94, 0.12)", border: "1px solid rgba(34, 197, 94, 0.32)" }}>
            ✅ {status}
          </div>
        )}
      </div>

      <div style={{ ...card, display: "grid", gap: 12 }}>
        <h3 style={{ ...title, fontSize: 18, marginBottom: 0 }}>Slots</h3>
        {slots.length === 0 ? (
          <p style={muted}>{loading ? "" : "No slots found for this source."}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Start</th>
                  <th style={th}>Duration</th>
                  <th style={th}>Location</th>
                  <th style={th}>Price</th>
                  <th style={th}>Deposit</th>
                  <th style={th}>Status</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={`${slot.__primaryValue}-${slot.start_at || ""}`}>
                    <td style={td}>{formatSlotStart(slot.start_at)}</td>
                    <td style={td}>{slot.duration_mins ? `${slot.duration_mins} mins` : "—"}</td>
                    <td style={td}>{slot.location || "—"}</td>
                    <td style={td}>{renderMoney(slot.price_cents, slot.price, slot.currency)}</td>
                    <td style={td}>{renderMoney(slot.deposit_cents, slot.deposit, slot.currency)}</td>
                    <td style={td}>{slot.is_booked ? "Booked" : "Available"}</td>
                    <td style={{ ...td, minWidth: 200 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button style={smallBtn} type="button" onClick={() => handleEdit(slot)}>
                          Edit
                        </button>
                        <button
                          style={smallBtn}
                          type="button"
                          onClick={() => handleToggleBooked(slot)}
                        >
                          {slot.is_booked ? "Mark available" : "Mark booked"}
                        </button>
                        <button style={dangerBtn} type="button" onClick={() => handleDelete(slot)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ ...card, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ ...title, fontSize: 18, margin: 0 }}>
            {editing ? "Edit slot" : "Create new slot"}
          </h3>
          {editing && (
            <button type="button" onClick={resetForm} style={ghostBtn}>
              Cancel edit
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={label}>
            Start time *
            <input
              type="datetime-local"
              value={form.start_at}
              onChange={handleFieldChange("start_at")}
              required
            />
          </label>
          <label style={label}>
            Duration (minutes) *
            <input
              type="number"
              min={1}
              value={form.duration_mins}
              onChange={handleFieldChange("duration_mins")}
              required
            />
          </label>
          <label style={label}>
            Location
            <input value={form.location} onChange={handleFieldChange("location")} />
          </label>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <label style={label}>
              Price (£)
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={handleFieldChange("price")}
              />
            </label>
            <label style={label}>
              Deposit (£)
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.deposit}
                onChange={handleFieldChange("deposit")}
              />
            </label>
          </div>
          <label style={label}>
            Payment link
            <input
              type="url"
              placeholder="https://"
              value={form.payment_link}
              onChange={handleFieldChange("payment_link")}
            />
          </label>
          <label style={{ ...label, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={form.is_booked}
              onChange={handleFieldChange("is_booked")}
            />
            <span>Slot already booked</span>
          </label>
          <button type="submit" style={primaryBtn} disabled={saving}>
            {saving ? "Saving…" : editing ? "Update slot" : "Create slot"}
          </button>
        </form>
        <p style={{ ...muted, fontSize: 12, margin: 0 }}>
          Validation checks ensure the start time exists, the duration is positive, and prices are non-negative. The
          booking widget refreshes automatically after each change.
        </p>
      </div>
    </div>
  );
}

function describeSource(source) {
  if (!source) return "Unknown";
  return source.schema ? `${source.schema}.${source.table}` : source.table;
}

function formatSlotStart(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${format(date, "EEE d MMM yyyy HH:mm")}`;
}

function renderMoney(cents, amount, currency = "GBP") {
  const normalised = normalizeMoneyValue(cents, amount);
  if (normalised == null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(normalised / 100);
}

function normalizeMoneyValue(cents, amount) {
  if (typeof cents === "number" && Number.isFinite(cents)) return Math.round(cents);
  if (typeof amount === "number" && Number.isFinite(amount)) return Math.round(amount * 100);
  if (typeof amount === "string" && amount.trim() !== "") {
    const parsed = Number(amount);
    if (!Number.isNaN(parsed)) return Math.round(parsed * 100);
  }
  return null;
}

function toLocalInputValue(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - tzOffset);
  return local.toISOString().slice(0, 16);
}

function deriveColumnMap(records) {
  const map = {};
  const samples = Array.isArray(records) ? records.filter(Boolean).slice(0, 10) : [];
  const hasSamples = samples.length > 0;

  Object.entries(SLOT_COLUMN_CANDIDATES).forEach(([field, candidates]) => {
    const matches = [];
    candidates.forEach((candidate) => {
      if (samples.some((record) => Object.prototype.hasOwnProperty.call(record, candidate))) {
        matches.push(candidate);
      }
    });
    if (!matches.length && !hasSamples) {
      matches.push(candidates[0]);
    }
    map[field] = matches;
  });

  return map;
}

function detectPrimaryKey(records) {
  const samples = Array.isArray(records) ? records : [];
  for (const key of SLOT_PRIMARY_KEY_CANDIDATES) {
    if (samples.some((record) => Object.prototype.hasOwnProperty.call(record || {}, key))) {
      return key;
    }
  }
  return "id";
}

function buildColumnPayload(updates, columnMap) {
  const payload = {};
  Object.entries(updates).forEach(([field, value]) => {
    const columns = columnMap[field] || [];
    const unique = Array.from(new Set(columns));
    unique.forEach((column) => {
      payload[column] = value;
    });
  });
  return payload;
}

function normalizeForm(form, columnMap) {
  const startIso = fromLocalInput(form.start_at);
  const duration = Number(form.duration_mins);
  const durationValue = Number.isFinite(duration) ? Math.round(duration) : null;
  const locationInput = form.location ?? "";
  const location = locationInput.trim() || null;
  const paymentLinkInput = form.payment_link ?? "";
  const paymentLink = paymentLinkInput.trim() || null;
  const isBooked = Boolean(form.is_booked);

  const updates = {
    start_at: startIso,
    duration_mins: durationValue,
    location,
    payment_link: paymentLink,
    is_booked: isBooked,
  };

  const priceValue = parseMoney(form.price);
  const depositValue = parseMoney(form.deposit);

  if (columnMap.price_cents?.length || columnMap.price?.length) {
    updates.price_cents = priceValue != null ? Math.round(priceValue * 100) : null;
    updates.price = priceValue != null ? Number(priceValue.toFixed(2)) : null;
  }

  if (columnMap.deposit_cents?.length || columnMap.deposit?.length) {
    updates.deposit_cents = depositValue != null ? Math.round(depositValue * 100) : null;
    updates.deposit = depositValue != null ? Number(depositValue.toFixed(2)) : null;
  }

  return updates;
}

function parseMoney(value) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < 0) return Math.max(0, num);
  return Math.round(num * 100) / 100;
}

function fromLocalInput(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function validateForm(form) {
  if (!form.start_at) {
    return { valid: false, message: "Start time is required." };
  }
  const start = new Date(form.start_at);
  if (Number.isNaN(start.getTime())) {
    return { valid: false, message: "Enter a valid start time." };
  }

  const duration = Number(form.duration_mins);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { valid: false, message: "Duration must be a positive number of minutes." };
  }

  const price = parseFloat(form.price || "0");
  if (form.price !== "" && (Number.isNaN(price) || price < 0)) {
    return { valid: false, message: "Price must be zero or greater." };
  }

  const deposit = parseFloat(form.deposit || "0");
  if (form.deposit !== "" && (Number.isNaN(deposit) || deposit < 0)) {
    return { valid: false, message: "Deposit must be zero or greater." };
  }

  if (form.price !== "" && form.deposit !== "" && deposit > price) {
    return { valid: false, message: "Deposit cannot exceed the price." };
  }

  return { valid: true };
}

function formatMoneyField(cents, amount) {
  if (typeof amount === "number" && Number.isFinite(amount)) {
    return amount.toString();
  }
  if (typeof cents === "number" && Number.isFinite(cents)) {
    return (cents / 100).toString();
  }
  return "";
}

const card = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "var(--shadow)",
};

const title = {
  color: "var(--text)",
  margin: "0 0 8px",
};

const muted = {
  color: "var(--muted)",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const th = {
  textAlign: "left",
  padding: "8px 6px",
  color: "var(--muted)",
  fontSize: 12,
  textTransform: "uppercase",
  borderBottom: "1px solid var(--border)",
};

const td = {
  padding: "10px 6px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "top",
};

const label = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 14,
  color: "var(--text)",
};

const primaryBtn = {
  background: "var(--primary)",
  color: "var(--primaryText)",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  cursor: "pointer",
  fontSize: 14,
};

const ghostBtn = {
  background: "rgba(37, 99, 235, 0.12)",
  color: "var(--primary)",
  border: "1px solid rgba(37, 99, 235, 0.25)",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 13,
};

const smallBtn = {
  ...ghostBtn,
  padding: "6px 10px",
  fontSize: 12,
};

const dangerBtn = {
  ...ghostBtn,
  color: "var(--danger)",
  borderColor: "rgba(239, 68, 68, 0.4)",
};

const alert = {
  borderRadius: 12,
  padding: "12px 16px",
  color: "var(--text)",
  fontSize: 14,
};

const select = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
};
