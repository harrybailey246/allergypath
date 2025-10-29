# Practice Management Data Model

This document describes the core entities introduced for the practice management service, their relationships, and the corresponding change data capture (CDC) topics aligned with the legacy Supabase implementation.

## Shared reference entities

| Entity | Description | Legacy Source | CDC Topic |
| --- | --- | --- | --- |
| Patient | Canonical patient demographic stub used for downstream joins. | `supabase.public.patient` | `cdc.patient` |
| Clinician | Providers who can be scheduled for appointments. | `supabase.public.clinician` | `cdc.clinician` |
| Location | Physical or virtual practice sites. | `supabase.public.location` | `cdc.location` |

Each reference entity is immutable in this service; updates are consumed from the CDC topics and applied using the shared identifiers.

## Operational entities

### Appointment
- **Relationships:** references one `Patient`, one `Clinician`, and one `Location`.
- **Indexes:** composite indexes on `(locationId, startTime)`, `(clinicianId, startTime)`, and `(patientId, startTime)` to accelerate schedule searches.
- **Legacy source:** `supabase.public.appointments` (denormalized calendar view).
- **CDC topic:** `cdc.appointments`.
- **Notes:** `status` uses the `AppointmentStatus` enum and `resourceType` uses the `AppointmentResourceType` enum for parity with legacy status/resource fields.

### AppointmentRequest
- **Relationships:** references `Patient` and optional preferred `Clinician`/`Location` for routing.
- **Indexes:** `(patientId, requestedAt)` for tracking historical demand.
- **Legacy source:** `supabase.public.appointment_requests`.
- **CDC topic:** `cdc.appointment_requests`.

### PartnerCheckIn
- **Relationships:** references `Patient`, `Location`, and optionally the associated `Appointment` if known.
- **Indexes:** `(locationId, checkedInAt)` supports kiosk dashboards.
- **Legacy source:** `supabase.public.partner_check_ins`.
- **CDC topic:** `cdc.partner_check_ins`.

### PartnerLabelJob
- **Relationships:** references `Location`.
- **Indexes:** `(locationId, requestedAt)` streamlines batching for print queues.
- **Legacy source:** `supabase.public.partner_label_jobs`.
- **CDC topic:** `cdc.partner_label_jobs`.

### PartnerStockLevel
- **Relationships:** references `Location` and enforces uniqueness per `(locationId, sku)`.
- **Legacy source:** `supabase.public.partner_stock_levels`.
- **CDC topic:** `cdc.partner_stock_levels`.

### PartnerTemperatureLog
- **Relationships:** references `Location`.
- **Indexes:** `(locationId, recordedAt)` for compliance reporting windows.
- **Legacy source:** `supabase.public.partner_temperature_logs`.
- **CDC topic:** `cdc.partner_temperature_logs`.

## Enums

| Enum | Values | Legacy Source |
| --- | --- | --- |
| AppointmentStatus | `REQUESTED`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, `NO_SHOW` | `supabase.public.appointments.status` |
| AppointmentResourceType | `IN_PERSON`, `TELEHEALTH`, `HOME_VISIT` | `supabase.public.appointments.resource_type` |

## Migration strategy

1. Create enum types for appointment statuses and resource types to match the existing Supabase controlled vocabularies.
2. Materialize shared reference tables (`Patient`, `Clinician`, `Location`) with CDC triggers to keep `updatedAt` current when replaying events.
3. Create operational tables with foreign key constraints ensuring referential integrity back to the shared references.
4. Apply indexes that mirror the Supabase query hotspots for scheduling, intake kiosks, and partner operations.
5. Subscribe to the listed CDC topics to populate and maintain each table in lockstep with the legacy system during the migration window.
