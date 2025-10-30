-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create Enums
do $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AppointmentStatus') THEN
    CREATE TYPE "AppointmentStatus" AS ENUM (
      'REQUESTED',
      'CONFIRMED',
      'CHECKED_IN',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW'
    );
  END IF;
END$$;

do $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AppointmentResourceType') THEN
    CREATE TYPE "AppointmentResourceType" AS ENUM (
      'IN_PERSON',
      'TELEHEALTH',
      'HOME_VISIT'
    );
  END IF;
END$$;

-- Core reference tables
CREATE TABLE IF NOT EXISTS "Patient" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "legacyId" TEXT UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Clinician" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "legacyId" TEXT UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Location" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "legacyId" TEXT UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scheduling tables
CREATE TABLE IF NOT EXISTS "Appointment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "patientId" UUID NOT NULL,
  "clinicianId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
  "resourceType" "AppointmentResourceType" NOT NULL,
  "startTime" TIMESTAMPTZ NOT NULL,
  "endTime" TIMESTAMPTZ NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Appointment_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "Clinician"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Appointment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_appointment_location_start" ON "Appointment"("locationId", "startTime");
CREATE INDEX IF NOT EXISTS "idx_appointment_clinician_start" ON "Appointment"("clinicianId", "startTime");
CREATE INDEX IF NOT EXISTS "idx_appointment_patient_start" ON "Appointment"("patientId", "startTime");

CREATE TABLE IF NOT EXISTS "AppointmentRequest" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "patientId" UUID NOT NULL,
  "preferredClinician" UUID,
  "preferredLocation" UUID,
  "reason" TEXT,
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "AppointmentRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AppointmentRequest_preferredClinician_fkey" FOREIGN KEY ("preferredClinician") REFERENCES "Clinician"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AppointmentRequest_preferredLocation_fkey" FOREIGN KEY ("preferredLocation") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_request_patient_requested_at" ON "AppointmentRequest"("patientId", "requestedAt");

-- Partner operational tables
CREATE TABLE IF NOT EXISTS "PartnerCheckIn" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "patientId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "appointmentId" UUID,
  "checkedInAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "kioskId" TEXT,
  "notes" TEXT,
  CONSTRAINT "PartnerCheckIn_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PartnerCheckIn_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PartnerCheckIn_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_checkin_location_time" ON "PartnerCheckIn"("locationId", "checkedInAt");

CREATE TABLE IF NOT EXISTS "PartnerLabelJob" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "locationId" UUID NOT NULL,
  "requestedBy" TEXT,
  "jobType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "payload" JSONB NOT NULL,
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completedAt" TIMESTAMPTZ,
  CONSTRAINT "PartnerLabelJob_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_label_job_location_requested" ON "PartnerLabelJob"("locationId", "requestedAt");

CREATE TABLE IF NOT EXISTS "PartnerStockLevel" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "locationId" UUID NOT NULL,
  "sku" TEXT NOT NULL,
  "quantityOnHand" INTEGER NOT NULL,
  "reorderPoint" INTEGER,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PartnerStockLevel_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "uq_stock_location_sku" UNIQUE ("locationId", "sku")
);

CREATE TABLE IF NOT EXISTS "PartnerTemperatureLog" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "locationId" UUID NOT NULL,
  "deviceId" TEXT NOT NULL,
  "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "temperature" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'C',
  "notes" TEXT,
  CONSTRAINT "PartnerTemperatureLog_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_temperature_location_recorded" ON "PartnerTemperatureLog"("locationId", "recordedAt");

-- Trigger to maintain updatedAt columns
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_patient_updated_at
BEFORE UPDATE ON "Patient"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_clinician_updated_at
BEFORE UPDATE ON "Clinician"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_location_updated_at
BEFORE UPDATE ON "Location"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_appointment_updated_at
BEFORE UPDATE ON "Appointment"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_request_updated_at
BEFORE UPDATE ON "AppointmentRequest"
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
