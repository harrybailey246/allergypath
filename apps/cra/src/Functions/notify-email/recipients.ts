export type Submission = {
  id: string;
  created_at?: string;
  first_name?: string;
  surname?: string;
  email?: string;
  status?: string;
  clinician_email?: string | null;
};

export function dedupeEmails(emails: (string | null | undefined)[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const email of emails) {
    if (!email) continue;
    const lower = email.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(email);
  }
  return result;
}

function normalizeAdminRecipients(admins: string | string[]) {
  if (Array.isArray(admins)) return admins;
  if (!admins) return [];
  return [admins];
}

export function buildStatusUpdatedRecipients(
  submission: Pick<Submission, "clinician_email">,
  adminRecipients: string | string[]
) {
  const admins = normalizeAdminRecipients(adminRecipients);
  return dedupeEmails([submission.clinician_email || null, ...admins]);
}

export function buildAppointmentCreatedRecipients(
  submission: Pick<Submission, "email">,
  adminRecipients: string | string[]
) {
  const admins = normalizeAdminRecipients(adminRecipients);
  return dedupeEmails([submission.email || null, ...admins]);
}
