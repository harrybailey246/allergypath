# Migration Strategy

## Overview

This document outlines how the existing Supabase operational datastore will transition to the target operational data stores (OLTP) and FHIR resources. It also covers the frontend strangler pattern, sequencing, tooling, and risk mitigation strategies for a safe migration.

## Table-to-Target Mapping and Migration Plan

| Supabase Asset | Description / Key Fields | Target System | Migration Notes |
| --- | --- | --- | --- |
| `public.submissions` | Patient onboarding submissions including demographic data, guardian contacts, consent status, and safeguarding metadata. | **Primary OLTP: Patient Intake Service** (PostgreSQL) <br> **FHIR Mapping:** `QuestionnaireResponse` for submitted forms; derived `Patient`, `RelatedPerson`, `Consent` resources. | Bulk backfill via `db-migrator` job generating QuestionnaireResponse bundles. Live dual-write through ingestion service; FHIR bundles posted to FHIR server using `fhir-sync` tool. |
| `public.appointments` | Schedule for clinician/partner appointments linked to submissions. | **Primary OLTP: Scheduling Service** (PostgreSQL) <br> **FHIR Mapping:** `Appointment` with references to `Patient` and `Practitioner`. | Phase 1 read replica using Debezium change stream; Phase 2 cut-over with API gateway routing writes to Scheduling Service. FHIR appointment bundle synchronization with `scheduler-sync`. |
| `public.appointment_requests` | Patient requested slots awaiting confirmation. | **Scheduling Service** queue table. | Migrated alongside `appointments` with idempotent replay; requests exposed via new queue endpoint. |
| `public.lab_orders` | Lab order lifecycle metadata including vendor integration status. | **Diagnostics OLTP Service** (PostgreSQL) <br> **FHIR Mapping:** `ServiceRequest` (order) and `DiagnosticReport` (results). | Backfill via ETL script exporting JSON to `ServiceRequest` bundles. Real-time sync through CDC pipeline pushing to Kafka → Diagnostics service. |
| `public.lab_order_events` | Audit trail of lab order status changes. | **Diagnostics OLTP Service** event table <br> **FHIR Mapping:** `Provenance` / `AuditEvent`. | Retained as append-only event log; `audit-sync` job converts to `Provenance` resources nightly. |
| `public.action_plans` | Storage references for clinician action plans. | **Care Plan Service** (object storage metadata) <br> **FHIR Mapping:** `CarePlan` with attachments. | Files re-uploaded to managed storage; metadata stored in Care Plan DB. FHIR attachments created via `careplan-import`. |
| `public.compliance_tasks` | Compliance follow-ups tied to submissions. | **Compliance Service** (OLTP) <br> **FHIR Mapping:** `Task` resources referencing `Patient`/`CarePlan`. | Dual-write toggled per task type; final cutover after verifying scheduler parity. |
| `public.partner_checkins` | Inventory check-ins from partner pharmacies. | **Partner Operations Service** (OLTP). | Migrate using batched copy; no FHIR representation required. |
| `public.partner_label_queue` | Labels awaiting printing. | **Partner Operations Service** queue. | Migrated last with zero-downtime queue drain script. |
| `public.partner_stock_levels` | Inventory levels by partner site. | **Partner Operations Service** (OLTP). | Uses incremental sync via materialized view export to Kafka topic. |
| `public.partner_payouts` | Remittance records for partner reimbursements. | **Finance OLTP**. | Migrated in final wave due to finance reconciliation dependencies. |
| `public.partner_temperature_logs` | Cold-chain compliance logs. | **Compliance Service** <br> **FHIR Mapping:** `Observation`. | Backfill with CSV export + import; live sync via IoT ingestion gateway. |

### Sequencing

1. **Foundation (Month 0-1)**
   - Provision new OLTP clusters and FHIR server.
   - Implement Debezium-based CDC connectors for `submissions`, `appointments`, and `lab_orders`.
   - Deliver `db-migrator` CLI for backfills and `fhir-sync` service for bundle creation.

2. **Phase 1 – Read Model Parity (Month 2)**
   - Stand up read-only replicas in new services fed via CDC streams.
   - Update analytics/reporting to query new OLTP read replicas.
   - Validate FHIR bundles for submissions and appointments through shadow API tests.

3. **Phase 2 – Write Strangler (Month 3-4)**
   - Gateway routes write APIs for lab orders and compliance tasks to new services while keeping Supabase as read-through fallback.
   - Frontend toggles (feature flags) enable dual-write mode where Supabase remains system of record but writes are mirrored to new services.
   - Monitor CDC lag and reconcile nightly.

4. **Phase 3 – Full Cutover (Month 5)**
   - Promote new services to primary write path for submissions and appointments.
   - Supabase tables switched to read-only archival state.
   - Decommission CDC connectors after 30-day validation window.

5. **Phase 4 – Decommission (Month 6)**
   - Export archival snapshots of Supabase data.
   - Remove Supabase client dependencies from codebase.
   - Finalize operational runbooks on new platform.

### Tooling

- **Debezium + Kafka:** real-time CDC from Supabase PostgreSQL into service topics.
- **db-migrator CLI:** orchestrates batched exports, schema transformations, and load into OLTP services.
- **fhir-sync Service:** transforms OLTP records into FHIR bundles and posts to the central FHIR API.
- **Reconciliation Dashboard:** tracks dual-write divergences and automates remediation tasks.
- **Feature Flag Service:** controls gradual rollout for frontend/API gateway routing.

## Frontend Strangler Pattern

1. **Gateway-first Features**
   - **Lab Order Console:** First consumer of the new Diagnostics API; routes via API Gateway to Diagnostics Service for all order creation and status polling.
   - **Compliance Task Manager:** Uses new Compliance Service endpoints for task lifecycle, retaining Supabase reads for historical data until backfill completes.
   - **Appointment Booking Widget:** After backend read parity, booking calls new Scheduling Service for slot availability and creation while legacy Supabase still provides read-only history.

2. **Progressive Cutover Steps**
   - **Phase 1:** Introduce read-only federated endpoints in API Gateway (`/v2/lab-orders`, `/v2/compliance`, `/v2/appointments`). Frontend uses feature flags to read from new endpoints in shadow mode, comparing responses with Supabase REST.
   - **Phase 2:** Enable writes through gateway for flagged users. Supabase receives mirrored writes via background worker subscribed to service events ensuring data stays in sync.
   - **Phase 3:** Retire Supabase client calls from frontend components once validation thresholds met (error rate <0.5%, reconciliation drift <0.1%).

3. **Data Synchronization During Transition**
   - **Dual-write Workers:** Service events pushed to Supabase via `sync-backfill` worker to keep legacy dashboards functional.
   - **Conflict Resolution:** Last-write-wins with alerting; manual reconciliation playbook for discrepancies beyond 15 minutes.
   - **Audit Trails:** All gateway writes include correlation IDs stored both in Supabase and new services for traceability.

## Risks and Mitigations

| Risk | Description | Mitigation |
| --- | --- | --- |
| Downtime during cutover | Service disruption when switching write paths. | Blue/green deploy API Gateway routes; run canary tests before flipping global traffic. Maintain rollback plan to Supabase writes. |
| Data divergence | Inconsistent records between Supabase and new services during dual-write window. | Automated reconciliation dashboard, nightly diff jobs, manual sign-off before each phase progression. |
| Compliance violations | Mishandled PHI during migrations or audit gaps. | Encrypt data in transit, log access, validate FHIR resources against compliance checklist, involve compliance officer in go/no-go. |
| Performance regressions | New services may have higher latency. | Load testing pre-cutover, auto-scaling policies, monitoring with SLO alerts. |
| Stakeholder communication gaps | Partners unaware of interface changes. | Release notes, partner sandbox testing, scheduled webinars. |

## Acceptance Criteria by Phase

### Foundation Complete
- CDC connectors emitting events for `submissions`, `appointments`, `lab_orders` with <5s lag.
- db-migrator CLI runs dry-run successfully for all mapped tables.
- fhir-sync posts bundles validated against FHIR R4 schema with 0 validation errors.

### Read Model Parity
- New OLTP read replicas return identical record counts vs Supabase for a 24h window.
- Shadow API tests show <0.1% field-level mismatches.
- Stakeholder sign-off on FHIR resource samples for submissions and appointments.

### Write Strangler Activated
- API Gateway routes writes for lab orders and compliance tasks to new services with <1% error rate over 7 days.
- Dual-write reconciliation reports <0.5% unresolved divergences.
- Frontend feature flags allow toggling users between legacy and new endpoints without redeploy.

### Full Cutover
- Supabase tables set to read-only and no new write transactions observed for 48h.
- Operational dashboards read solely from new services/FHIR endpoints.
- Incident playbook validated via simulated rollback drill.

### Decommission
- Supabase data archive exported, checksum verified, and stored per retention policy.
- Supabase-specific secrets removed from CI/CD and infrastructure.
- Post-mortem confirms KPIs (latency, error rate, data completeness) met for 30 consecutive days.
