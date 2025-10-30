import {
  buildAppointmentCreatedRecipients,
  buildStatusUpdatedRecipients,
} from "./recipients";

describe("buildStatusUpdatedRecipients", () => {
  it("includes both clinician and admins when a clinician is assigned", () => {
    const recipients = buildStatusUpdatedRecipients(
      { clinician_email: "clinician@example.com" },
      ["admin@example.com"]
    );

    expect(recipients).toEqual(["clinician@example.com", "admin@example.com"]);
  });

  it("falls back to admins when no clinician is assigned", () => {
    const recipients = buildStatusUpdatedRecipients(
      { clinician_email: null },
      ["admin@example.com"]
    );

    expect(recipients).toEqual(["admin@example.com"]);
  });

  it("removes duplicates regardless of casing", () => {
    const recipients = buildStatusUpdatedRecipients(
      { clinician_email: "Admin@Example.com" },
      ["admin@example.com", "other@example.com"]
    );

    expect(recipients).toEqual(["Admin@Example.com", "other@example.com"]);
  });
});

describe("buildAppointmentCreatedRecipients", () => {
  it("includes patient and admin addresses", () => {
    const recipients = buildAppointmentCreatedRecipients(
      { email: "patient@example.com" },
      ["admin@example.com"]
    );

    expect(recipients).toEqual(["patient@example.com", "admin@example.com"]);
  });
});
