# Service Contracts (Initial Draft)

This draft outlines candidate interfaces and integration events for each proposed service. Endpoints are expressed in REST where state changes occur and GraphQL where rich read models are needed. Existing Supabase tables and views slated for migration are referenced to show lineage.

## Practice Management Service

### Proposed APIs

| Type | Signature | Description | Supabase lineage |
| ---- | --------- | ----------- | ---------------- |
| REST | `POST /appointments` | Create a new appointment slot or patient booking. | `appointments` (currently managed via Supabase client calls in the dashboard). |
| REST | `PATCH /appointments/{id}` | Update status, clinician assignment, or location for an appointment. | `appointments` |
| REST | `POST /appointment-requests/{id}:resolve` | Resolve a patient-initiated reschedule/cancel request and record resolution metadata. | `appointment_requests` |
| REST | `POST /partner-checkins` | Mark a patient arrival, update status, or close out a visit. | `partner_checkins` |
| REST | `POST /partner-label-queue/{id}:print` | Record a label print action and capture device metadata. | `partner_label_queue` |
| REST | `POST /partner-stock-levels/{id}:adjust` | Adjust inventory counts and track restock notes. | `partner_stock_levels` |
| REST | `POST /partner-temperature-logs/import` | Upload temperature readings for compliance, accepting CSV/JSON payloads. | `partner_temperature_logs` |
| GraphQL | `query PracticeSchedule { appointments(filter) { id startAt clinician { id name } patient { id name } location { id name } } }` | Read model for calendar views combining appointments, clinician roster, and patient context. | `appointments`, `patients`, `clinicians` |
| GraphQL | `query PartnerDashboard { schedule {...} checkIns {...} labelQueue {...} stock {...} }` | Aggregated portal query mirroring partner dashboard cards. | `partner_today_schedule` (view), `partner_checkins`, `partner_label_queue`, `partner_stock_levels`, `partner_earnings_summary` |

### Domain Events
- `appointment.scheduled` — emitted when a new booking is created; consumed by Communications (reminders) and Billing (charge creation).
- `appointment.status_changed` — tracks reschedules, cancellations, and check-ins; consumed by Communications and Billing.
- `partner.inventory_adjusted` — publishes stock level updates to Operations dashboards and Billing cost allocations.
- `partner.temperature_excursion_detected` — triggers compliance workflows in Communications and incident tracking in Operations.

### Stakeholder Feedback
- **Operations:** Requested SLA metrics in the GraphQL `PartnerDashboard` response; follow-up to define fields before implementation.
- **Clinical:** Asked for appointment payloads to include care-plan flags from EMR (requires cross-service enrichment strategy).

## EMR Service

### Proposed APIs

| Type | Signature | Description | Supabase lineage |
| ---- | --------- | ----------- | ---------------- |
| REST | `POST /submissions` | Persist a new intake submission with patient demographics, consents, and attachments. | `submissions` |
| REST | `PATCH /submissions/{id}` | Update clinician triage state, safeguarding notes, or consent expiration. | `submissions` |
| REST | `POST /action-plans` | Create a patient action plan tied to a submission. | `action_plans` |
| REST | `POST /compliance-tasks` | Add a compliance task to an action plan, with due dates and reminder cadence. | `compliance_tasks` |
| REST | `POST /lab-orders` | Create or update lab orders initiated by clinicians, including vendor metadata. | `lab_orders` |
| REST | `POST /lab-orders/{id}/events` | Append status events received from external lab integrations. | `lab_order_events` |
| GraphQL | `query ClinicalWorkbench { submissions(filter) { id demographics consentStatus appointmentContext { ... } outstandingTasks {...} } }` | Read-optimized feed for clinician dashboard cards combining submission state and upcoming appointments. | `submissions`, `appointments`, `action_plans`, `compliance_tasks` |
| GraphQL | `subscription LabOrderTimeline($id: ID!) { labOrderEvents(labOrderId: $id) { eventType status occurredAt payload } }` | Push updates to lab review screens and downstream services. | `lab_orders`, `lab_order_events` |

### Domain Events
- `submission.triaged` — indicates intake review completion; consumed by Practice Management for scheduling readiness.
- `action_plan.assigned` — prompts Communications to schedule patient reminders.
- `lab_order.status_updated` — shared with Practice Management (to show onsite status) and Billing (for payable milestones).
- `compliance_task.completed` — consumed by Billing to justify quality incentives and Communications for closing loops.

### Stakeholder Feedback
- **Clinical:** Approved API surface but requested batch endpoints for lab event ingestion; follow-up to design asynchronous import pipeline.
- **Operations:** Emphasized the need for audit logging on `PATCH /submissions/{id}` for compliance; to be incorporated in the next revision.

## Billing Service

### Proposed APIs

| Type | Signature | Description | Supabase lineage |
| ---- | --------- | ----------- | ---------------- |
| REST | `POST /charges` | Generate a charge for a completed appointment or lab milestone. | Derived from `appointments`, `lab_orders`, `submissions` |
| REST | `POST /charges/{id}:submit` | Submit charge batches to clearinghouses or partner payouts. | Derived aggregates |
| REST | `POST /partner-payouts` | Create or adjust payout statements for partners. | `partner_payouts` |
| REST | `POST /partner-payouts/{id}:finalize` | Lock and publish a payout period with remittance references. | `partner_payouts` |
| REST | `POST /adjustments` | Apply financial adjustments due to disputes or compliance exceptions. | `partner_earnings_summary` (source for variance tracking) |
| GraphQL | `query RevenueDashboard { charges(filter) {...} payouts(filter) {...} aging { bucket amount } }` | Provide finance with aggregated metrics across charges and payouts. | `partner_earnings_summary`, future `charges` table |
| GraphQL | `query ClaimExport($period: DateRange!) { claims(period: $period) { id status payer amount encounterRef } }` | Previews of clearinghouse exports for billing staff. | Derived from `submissions`, `appointments`, `lab_orders` |

### Domain Events
- `charge.created` — triggers Communications invoice workflows and updates revenue dashboards.
- `charge.submitted` — informs Operations of batching progress and triggers lockouts on editing clinical data.
- `payout.finalized` — consumed by Practice Management for partner dashboards and by Communications for remittance notices.
- `adjustment.applied` — notifies EMR and Practice Management to review underlying clinical context.

### Stakeholder Feedback
- **Billing:** Approved endpoints; flagged need for idempotency keys on charge submission. Follow-up to define standard header.
- **Operations:** Requested webhook support when `payout.finalized` fires for integration with accounting tools.

## Communications Service

### Proposed APIs

| Type | Signature | Description | Supabase lineage |
| ---- | --------- | ----------- | ---------------- |
| REST | `POST /notifications` | Send ad-hoc or templated outbound communications. | New `notification_logs` table referencing `submissions`, `appointments` |
| REST | `POST /notifications/batch` | Queue bulk sends for campaigns (e.g., consent renewals). | `notification_logs` |
| REST | `POST /webhooks/intake` | Receive inbound patient messages (email/SMS) and convert to tasks. | `appointment_requests`, `submissions` |
| REST | `POST /templates` | Create or update communication templates with localization metadata. | New `communication_templates` |
| GraphQL | `query DeliveryHistory($patientId: ID!) { notifications(patientId: $patientId) { id channel status sentAt relatedEntity } }` | Provide cross-service visibility into patient engagement history. | `notification_logs`, `submissions` |
| GraphQL | `subscription NotificationStatus($id: ID!) { notificationStatus(id: $id) { status deliveredAt failureCode } }` | Async delivery tracking for UI updates across portals. | `notification_logs` |

### Domain Events
- `notification.dispatched` — consumed by originating services to update engagement timelines.
- `notification.failed` — triggers retries in Communications and raises alerts to owning services.
- `inbound.message.received` — routed to Practice Management (for scheduling issues) or EMR (for clinical questions).
- `consent.renewal.required` — emitted when Communications detects expiring consents via nightly jobs.

### Stakeholder Feedback
- **Clinical:** Requested clear routing rules for `inbound.message.received` events to avoid PHI exposure; a policy appendix will be drafted.
- **Billing:** Asked to ensure invoice-related templates support attachments; backlog item opened to define payload limits.
- **Operations:** Approved API surfaces; will review delivery rate KPIs once monitoring requirements are documented.

## Cross-Service Approval Notes
- Stakeholder workshop (Clinical, Billing, Operations) completed on 2025-03-24; all services received conditional approval subject to noted follow-ups.
- Follow-up actions will be tracked in the transformation program RAID log and referenced in future revisions of this document.
