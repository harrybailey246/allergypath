import { format } from "date-fns";
import { createEvent } from "ics";

function normalize(value) {
  return (value ?? "").toString().trim();
}

export function createAppointmentICS(appointment, submission = {}) {
  if (!appointment?.start_at || !appointment?.end_at) {
    throw new Error("Appointment is missing start or end time");
  }

  const start = new Date(appointment.start_at);
  const end = new Date(appointment.end_at);

  const firstName = normalize(submission.first_name) || "Patient";
  const lastName = normalize(submission.surname) || "Visit";

  const { error, value } = createEvent({
    title: `AllergyPath Appointment – ${firstName} ${lastName}`.trim(),
    start: [
      start.getFullYear(),
      start.getMonth() + 1,
      start.getDate(),
      start.getHours(),
      start.getMinutes(),
    ],
    end: [
      end.getFullYear(),
      end.getMonth() + 1,
      end.getDate(),
      end.getHours(),
      end.getMinutes(),
    ],
    location: normalize(appointment.location),
    description:
      [
        submission.first_name && submission.surname
          ? `Patient: ${submission.first_name} ${submission.surname}`
          : null,
        submission.email ? `Email: ${submission.email}` : null,
        submission.most_severe_reaction
          ? `Hx: ${submission.most_severe_reaction}`
          : null,
        appointment.notes ? `Notes: ${appointment.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    status: "CONFIRMED",
  });

  if (error) {
    throw new Error(error.message || "Unable to generate calendar event");
  }

  const blob = new Blob([value], { type: "text/calendar;charset=utf-8" });
  const filename = `AllergyPath_${firstName}_${lastName}_${format(start, "yyyyMMdd_HHmm")}`
    .replace(/\s+/g, "_")
    .concat(".ics");

  return { blob, filename };
}
