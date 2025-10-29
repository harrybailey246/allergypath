# Bounded Contexts Overview

This document proposes a services decomposition for AllergyPath as we migrate away from a monolithic Supabase backend. Each bounded context groups related responsibilities, highlights upstream and downstream dependencies, and calls out shared schemas that require coordination.

## Practice Management Service

### Responsibilities
- Manage the operational schedule for clinics and partner pharmacies, including availability, appointment creation, and real-time check-in status.
- Coordinate onsite logistics such as label printing, stock visibility, and cold-chain compliance workflows currently driven from the partner portal.
- Own partner-facing reporting on workload and fulfillment metrics (e.g., daily schedule, completed check-ins, printed labels, inventory levels).

### Upstream Dependencies
- **EMR Service** for patient demographics, care plans, and lab status that need to be surfaced to front-desk staff.
- **Communications Service** for delivery of booking confirmations, reschedule notifications, and check-in alerts triggered by practice actions.

### Downstream Consumers
- **Billing Service** relies on appointment lifecycle changes and partner production metrics to calculate payouts.
- **Communications Service** listens for scheduling events to send patient reminders and partner notifications.

### Shared Schemas
- `patients` (core patient profile shared with EMR for clinical context and Billing for payer data).
- `clinicians` and `staff_profiles` (user directory shared with EMR for ordering providers and Communications for contact routing).
- `locations` / `partner_sites` (facility metadata shared with Billing to reconcile payouts and with Communications for localized content).
- Supabase tables slated for migration into this service include `appointments`, `appointment_requests`, `partner_today_schedule` (view), `partner_checkins`, `partner_label_queue`, `partner_stock_levels`, `partner_temperature_logs`, and `partner_earnings_summary` for operational reporting.

## EMR Service

### Responsibilities
- Capture patient intake submissions, clinical triage, and consent artifacts used by clinicians to formulate care plans.
- Manage longitudinal clinical data such as action plans, compliance tasks, lab orders, and audit trails required for regulatory oversight.
- Surface clinician workflows (task queues, lab review dashboards) and persist structured documentation.

### Upstream Dependencies
- **Communications Service** for intake form delivery, signed consent packages, and lab result notifications that originate outside the EMR.
- **Practice Management Service** for appointment context (e.g., visit date, location, assigned clinician) when documenting encounters.

### Downstream Consumers
- **Practice Management Service** consumes EMR data to display patient context and outstanding tasks during scheduling and check-in.
- **Billing Service** requires clinical encounter outcomes, lab statuses, and compliance milestones to substantiate claims and partner payouts.

### Shared Schemas
- `submissions` (primary intake record referenced by Practice Management for scheduling and by Billing for eligibility).
- `lab_orders` and `lab_order_events` (clinical orders with status feeds mirrored to Practice Management dashboards).
- `action_plans` and `compliance_tasks` (patient self-management plans surfaced to Communications for reminder messaging).

## Billing Service

### Responsibilities
- Calculate revenue recognition, partner payouts, and insurer claims derived from scheduled encounters and clinical interventions.
- Manage contract rules, fee schedules, and partner remittance history.
- Provide financial reporting and exports for accounting and operations teams.

### Upstream Dependencies
- **Practice Management Service** supplies appointment completion, no-show data, and partner productivity metrics (check-ins, label queue throughput).
- **EMR Service** provides clinical codes, lab order statuses, and action plan completion evidence required to justify billing events.

### Downstream Consumers
- **Communications Service** for sending invoices, payment reminders, and remittance notifications.
- **Operations teams** consume payout statements and compliance exceptions for financial reconciliation.

### Shared Schemas
- `partner_payouts` and `partner_earnings_summary` (financial aggregates currently exposed in the partner portal).
- `submissions`, `appointments`, and `lab_orders` (to tie clinical activity and scheduling to claim line items).
- Future shared schema contracts will codify `Charge`, `Remittance`, and `InsurancePolicy` aggregates aligning EMR and Practice Management data with financial records.

## Communications Service

### Responsibilities
- Orchestrate outbound patient and partner communications across email, SMS, and in-app channels.
- Provide templating, localization, and delivery-status tracking for notifications triggered by other services.
- Manage inbound patient requests (e.g., appointment reschedule/cancel) and route them to the appropriate service queues.

### Upstream Dependencies
- **Practice Management Service** for scheduling triggers that generate reminders, arrival alerts, and stock notifications.
- **EMR Service** for clinical updates such as lab results available, action plan assignments, or compliance task due dates.
- **Billing Service** for invoice delivery, payment receipts, and delinquency escalations.

### Downstream Consumers
- All other services subscribe to communication delivery events to update patient engagement status, retry failures, or audit regulatory compliance.

### Shared Schemas
- `appointment_requests` (patient-originated reschedule/cancel requests captured via public channels and forwarded to Practice Management).
- `submissions` (used to personalize notifications with patient context and consent preferences).
- `communication_templates` and `notification_logs` (new shared schemas required to coordinate messaging history across services).

## Stakeholder Review Summary
- **Clinical (Dr. Priya Menon, Medical Director):** Approved EMR responsibilities and shared schema definitions; requested a follow-up to map external lab vendor integrations before finalizing downstream dependencies.
- **Billing (Alex Rivera, Revenue Cycle Lead):** Approved Billing service scope with the condition that shared schemas for `Charge` and `Remittance` include versioning; follow-up scheduled to align on insurer batch export requirements.
- **Operations (Jamie Chen, Head of Operations):** Approved Practice Management and Communications scopes; asked for an implementation plan to maintain uptime on partner portal dashboards during migration.
