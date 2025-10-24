# AllergyPath clinician tooling

This workspace contains the clinician dashboard and supporting Supabase functions used by the AllergyPath operations team.

## Local development

1. Install dependencies with `npm install`.
2. Start the client with `npm start` to serve the dashboard on http://localhost:3000.
3. Provide the Supabase project URL and anon key via `src/supabaseClient.js` (already populated for the shared sandbox).

## Governance & audit logging

To strengthen clinical governance we now capture a full audit trail for every mutation that touches a patient submission.

### Data model

The migration in [`supabase/migrations/20240701000000_create_audit_logs.sql`](supabase/migrations/20240701000000_create_audit_logs.sql) provisions a dedicated `audit_logs` table with the columns `submission_id`, `actor_id`, `action`, `payload` (JSONB metadata), and `occurred_at`. The table is indexed by `(submission_id, occurred_at)` for efficient timeline retrieval.

### Edge function

An Edge Function named `append-audit-log` (see [`src/Functions/append-audit-log/index.ts`](src/Functions/append-audit-log/index.ts)) accepts POST requests from the web app and inserts immutable audit rows using the Supabase service role. Deploy it with:

```bash
supabase functions deploy append-audit-log --no-verify-jwt
```

Ensure the `SUPABASE_SERVICE_ROLE_KEY` secret is configured for the function so that inserts bypass row level security.

### Application instrumentation

Every clinician-facing write helper inside [`src/Dashboard.js`](src/Dashboard.js) now calls `logAuditEvent` from [`src/auditLogs.js`](src/auditLogs.js) after completing the primary Supabase mutation. The following actions are recorded automatically:

- Status changes triggered from the list view.
- Assigning a submission to the active clinician.
- Unassigning a submission.
- Updating clinical notes in the detail panel.
- Status changes triggered inside the detail panel.

The detail panel also shows a read-only "Audit timeline" section that queries the audit history for the open submission so clinicians can review who made each change and when.

### Access control & RLS

Row Level Security is enabled on `audit_logs`. Policies restrict access so that:

- Only the Supabase service role (used by Edge functions) can insert audit rows.
- Authenticated clinicians can read logs for submissions assigned to them.
- Administrators (identified by `app_metadata.role` of `admin` or `clinician_admin`) can review every audit record and delete entries during governance investigations if required.

Review and adjust the role checks to align with the production auth metadata before running the migration in production.

## Deploying updates

1. Run the SQL migration against the Supabase project (via the CLI or Studio).
2. Deploy the `append-audit-log` Edge function.
3. Redeploy the React application so the new instrumentation and timeline UI are available.
