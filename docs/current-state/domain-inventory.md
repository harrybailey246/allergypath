# Domain Inventory (Current State)

## Database entities from Supabase migrations

### Tables
- **`public.submissions`** – patient intake records. Recent migrations add patient-authored notes plus safeguarding and consent metadata (`patient_notes`, `guardian_contacts`, `consent_signed_at`, `consent_expires_at`, `safeguarding_notes`, `safeguarding_follow_up_at`, `document_references`).【F:supabase/migrations/202503150900_add_patient_notes_to_submissions.sql†L1-L4】【F:supabase/migrations/202503200900_extend_submissions_and_compliance.sql†L1-L9】
- **`public.appointment_requests`** – patient-originated change/cancellation requests linked to `submissions` and optionally to specific `appointments` (one-to-many from submission). Tracks request type, free-text message, status, handled timestamp, and patient email for RLS.【F:supabase/migrations/202502160000_create_appointment_requests.sql†L1-L32】 Policies allow patients to insert their own rows and clinicians to review/update via submission ownership or clinician assignment.【F:supabase/migrations/202502160000_create_appointment_requests.sql†L34-L67】
- **`public.action_plans`** – clinician-uploaded care documents stored in Supabase Storage, owned by a submission (one-to-many). Keeps category, storage path, uploader identifiers, and timestamps.【F:supabase/migrations/202503200900_extend_submissions_and_compliance.sql†L11-L24】
- **`public.compliance_tasks`** – workflow tasks tied to a submission, with type, details, due date, status, metadata, resolution info, and audit timestamps. Trigger maintains `updated_at`, and unique partial index prevents duplicate open tasks per submission/type.【F:supabase/migrations/202503200900_extend_submissions_and_compliance.sql†L26-L60】
- **`public.lab_orders`** – lab order header linked to submissions (nullable) with patient, clinician, vendor, status lifecycle, metadata, and audit timestamps. Indexed by submission, status, vendor, and external IDs; trigger updates `updated_at`.【F:supabase/migrations/202503210930_create_lab_orders.sql†L4-L47】【F:supabase/migrations/202503210930_create_lab_orders.sql†L69-L87】
- **`public.lab_order_events`** – audit trail rows for lab orders (one-to-many). Stores event type/status, payload, occurrence timestamp, actor email, and optional notes. Indexed for lab_order_id, type, and chronology.【F:supabase/migrations/202503210930_create_lab_orders.sql†L49-L66】
- **`public.partner_checkins`** – front-desk arrival queue keyed by patient name with status and arrival/update timestamps.【F:supabase/migrations/202411071200_partner_tools.sql†L21-L31】
- **`public.partner_label_queue`** – label printing backlog with request metadata, priority, and creation timestamp.【F:supabase/migrations/202411071200_partner_tools.sql†L33-L44】
- **`public.partner_stock_levels`** – partner-managed inventory with quantity, unit, status, and temperature guardrails. Later migration adds lot/expiry/manufacturer/location and min/max temperature with validation constraint. Supports zero-or-more temperature logs per stock item.【F:supabase/migrations/202411071200_partner_tools.sql†L46-L57】【F:supabase/migrations/202503200930_partner_temperature_compliance.sql†L3-L26】
- **`public.partner_payouts`** – payouts earned by partner sites with amount, date, optional partner email, and notes (supports analytics view).【F:supabase/migrations/202411071200_partner_tools.sql†L59-L66】
- **`public.partner_temperature_logs`** – cold-chain compliance records optionally tied to a stock item, capturing storage location, recorded temperature, excursion metadata, and timestamps.【F:supabase/migrations/202503200930_partner_temperature_compliance.sql†L18-L36】

### Views
- **`public.partner_today_schedule`** – joins `appointments` with `submissions` for same-day visits to surface patient name, time, purpose, and location for partner check-in workflow.【F:supabase/migrations/202411071200_partner_tools.sql†L68-L83】
- **`public.partner_earnings_summary`** – aggregates `partner_payouts` into today/week/month earnings buckets for partner dashboard KPIs.【F:supabase/migrations/202411071200_partner_tools.sql†L85-L102】

### Functions & triggers
- **`public.storage_attachment_is_accessible(bucket text, object_name text)`** – storage policy helper that validates requesting user email matches submission owner for `attachments` bucket. Ensures robust parsing of object path and avoids dereferencing missing records.【F:supabase/migrations/202410242200_fix_pick_record.sql†L5-L41】【F:supabase/migrations/202410242230_fix_pick_record_without_row.sql†L1-L32】【F:supabase/migrations/202410242300_remove_pick_helper.sql†L7-L36】
- **`public.has_staff_role(roles text[])`** – checks clinician email roster for requested roles; reused in multiple RLS policies.【F:supabase/migrations/202411071200_partner_tools.sql†L4-L15】
- **`public.has_partner_portal_access()`** – convenience wrapper granting access to admins, clinicians, and partners (uses `has_staff_role`).【F:supabase/migrations/202411071200_partner_tools.sql†L17-L22】
- **`public.touch_compliance_tasks()`** – trigger to keep `updated_at` current on `compliance_tasks` updates.【F:supabase/migrations/202503200900_extend_submissions_and_compliance.sql†L44-L55】
- **`public.touch_updated_at()`** – generic trigger ensuring `lab_orders.updated_at` tracks modifications.【F:supabase/migrations/202503210930_create_lab_orders.sql†L69-L80】

### Relationships & RLS highlights
- `submissions` now owns compliance (`compliance_tasks`), care plans (`action_plans`), patient-generated `appointment_requests`, and lab orders (`lab_orders`). Storage helper plus storage RLS enforce attachment access via submission email.
- `lab_orders` cascade deletes to `lab_order_events`, and RLS restricts management to `has_staff_role` (admin/clinician).【F:supabase/migrations/202503210930_create_lab_orders.sql†L82-L120】
- Partner tables enable RLS for partner vs clinician/admin access, using shared helper functions. Views require read access to `appointments` and `submissions` so partners can see schedules.【F:supabase/migrations/202411071200_partner_tools.sql†L104-L183】
- `appointment_requests` RLS allows patients (matching submission email) to submit and clinicians tied to the submission to update status, enabling queue sharing between Patient Portal and clinician dashboard.【F:supabase/migrations/202502160000_create_appointment_requests.sql†L18-L67】

## React surfaces and data touchpoints

### Clinician Dashboard (`src/Dashboard.js`)
- **Tables/Functions:** `submissions`, `appointments`, `appointment_requests`, `action_plans`, Supabase Storage (`attachments`, `action-plans` buckets), `compliance_tasks` via `compliance-reminders` edge function, `lab_orders` & `lab_order_events`, `clinician_emails` (for auth), `notify-email` function.【F:src/Dashboard.js†L22-L206】【F:src/Dashboard.js†L880-L1059】【F:src/Dashboard.js†L1080-L1179】
- **Business processes:** clinician triage of submission queue (assignment, status updates, exporting CSV), compliance follow-up management, scheduling appointments, handling patient appointment-change requests, uploading and distributing action plans, launching lab order workflow modal.
- **Flow notes:** real-time channels keep submissions, appointments, action plans, and appointment requests in sync. Email notifications sent for appointment creation/status updates, but failures surface only as toast.

### Clinician Schedule (`src/ClinicianSchedule.js`)
- **Tables:** `appointments` (week view filtered by start date).【F:src/ClinicianSchedule.js†L18-L77】
- **Process:** weekly planning for clinicians with navigation back to dashboard to open patient context.

### Patient Portal (`src/PatientPortal.js`)
- **Tables/Storage:** `submissions`, `appointments`, `appointment_requests`, storage attachments bucket via signed URLs. Leverages `createAppointmentICS` helper for calendar exports.【F:src/PatientPortal.js†L36-L207】【F:src/PatientPortal.js†L208-L401】
- **Process:** patients authenticate via magic link, review submission details, download uploaded files, see appointments, request changes/cancellations, and monitor request statuses.

### Admin Analytics (`src/AdminAnalytics.js`)
- **Tables/Views:** `analytics_status_counts`, `analytics_readiness_risk`, `analytics_weekly`, `analytics_top_triggers`, `analytics_top_symptoms`, `analytics_tat_30d` (all assumed materialized views or tables outside current migrations), plus `lab_orders` for turnaround metrics.【F:src/AdminAnalytics.js†L20-L117】
- **Process:** leadership reporting on submission funnel, readiness, risk, volume trends, top triggers/symptoms, lab turnaround times, and patient lab histories.
- **Flow notes:** heavy reliance on precomputed analytics data sources not present in migrations; missing views will break dashboard.

### Admin Settings (`src/AdminSettings.js`)
- **Tables:** `clinician_emails` (manage roster and roles).【F:src/AdminSettings.js†L24-L116】
- **Process:** admin manages clinician access (add/remove/update roles) and self-checks role via Supabase auth.

### Partner Portal (`src/PartnerPortal.js`)
- **Tables/Views:** `partner_today_schedule`, `partner_checkins`, `partner_label_queue`, `partner_stock_levels`, `partner_earnings_summary`, `partner_temperature_logs`, plus `partner_restock_requests` (referenced but migration missing). Invokes `temperature-logger` edge function for imports/reports.【F:src/PartnerPortal.js†L45-L208】【F:src/PartnerPortal.js†L209-L360】
- **Process:** partner staff manage same-day schedule, waiting room check-ins, label printing, stock monitoring, temperature compliance, earnings KPIs, restock requests, and recall reporting.
- **Flow notes:** minute-level auto-refresh; toast feedback for operations. Dependence on missing `partner_restock_requests` table and temperature logger function.

### Book & Pay (`src/BookAndPay.js`)
- **Tables:** dynamically queries `appointment_slots` (possibly multiple schemas) for availability and writes to `booking_requests`; reserves slot by toggling `is_booked` flag. Payment link just opens external URL.【F:src/BookAndPay.js†L13-L161】【F:src/BookAndPay.js†L220-L330】【F:src/BookAndPay.js†L488-L592】
- **Process:** prospective patients self-select appointment slots and initiate booking with optional payment handoff.
- **Flow notes:** resilient column detection for differing schemas; surfaces friendly errors when tables/columns missing.

### Booking Requests (`src/BookingRequests.js`)
- **Tables:** `booking_requests` (reads, normalises, updates status).【F:src/BookingRequests.js†L13-L101】
- **Process:** staff back-office triage of self-service booking submissions (approve/convert/decline) with dynamic field detection.

### Patient Intake (`src/IntakeForm.js`)
- **Tables/Storage:** `submissions` inserts/updates, attachments storage (upload), `notify-email` function for confirmation. Handles retries on Supabase errors.【F:src/IntakeForm.js†L368-L432】
- **Process:** collects allergy history, uploads attachments, and notifies clinic via email.

### Lab Orders modal (`src/components/LabOrders.js`)
- **Tables:** `lab_orders`, `lab_order_events`, `submissions`; `lab-order-connector` edge function for vendor integration.【F:src/components/LabOrders.js†L56-L134】【F:src/components/LabOrders.js†L278-L336】
- **Process:** clinicians create/manage lab orders, sync status with external systems, and review event timelines.

## Pain points & gaps influencing bounded contexts
- **Analytics dependency gaps:** Admin Analytics references seven `analytics_*` sources not defined in migrations, implying missing ETL/materialized view jobs. Need dedicated analytics/batch context to populate these tables/views reliably.【F:src/AdminAnalytics.js†L20-L117】
- **Partner restock workflow incomplete:** UI posts to `partner_restock_requests`, but database lacks this table/policies. A partner operations context should own restock requests, approvals, and notifications.【F:src/PartnerPortal.js†L245-L285】
- **Temperature compliance automation externalised:** `temperature-logger` edge function must handle imports, excursions, and report generation. Consider dedicated cold-chain service for device integrations, anomaly detection, and regulatory reporting.【F:src/PartnerPortal.js†L286-L360】
- **Booking/payment handoff manual:** Book & Pay reserves slots and opens payment link but lacks integrated payment status tracking or invoicing. Suggest separate billing context to reconcile payments, handle deposits, and release slots on failure.【F:src/BookAndPay.js†L220-L330】
- **Appointment change lifecycle limited:** `appointment_requests` capture patient requests, but there is no SLA tracking, notifications beyond manual dashboard review, or automation to sync calendars. Opportunity for scheduling service to prioritise requests, escalate overdue items, and integrate messaging.【F:src/Dashboard.js†L1080-L1179】【F:src/PatientPortal.js†L150-L230】
- **Lab order orchestration dependent on external connector:** Edge function mediates vendor API; errors only surface via toast. Need lab integration context with retries, status polling, and audit beyond manual refresh.【F:src/components/LabOrders.js†L278-L336】
- **Storage access helper churn:** multiple migrations rewrite `storage_attachment_is_accessible`, hinting at fragility. Could centralise storage/attachments domain with tests and versioning to avoid repeated fixes.【F:supabase/migrations/202410242200_fix_pick_record.sql†L1-L44】【F:supabase/migrations/202410242300_remove_pick_helper.sql†L1-L37】

