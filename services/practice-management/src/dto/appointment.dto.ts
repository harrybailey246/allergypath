export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  RESCHEDULED = 'rescheduled',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export interface ClinicianSummaryDto {
  id: string;
  name: string;
}

export interface PatientSummaryDto {
  id: string;
  name: string;
}

export interface LocationSummaryDto {
  id: string;
  name: string;
}

export interface AppointmentDto {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  clinician: ClinicianSummaryDto;
  patient: PatientSummaryDto;
  location: LocationSummaryDto;
}

export interface CreateAppointmentDto {
  startAt: string;
  endAt: string;
  clinicianId: string;
  patientId: string;
  locationId: string;
  status: AppointmentStatus;
}

export interface UpdateAppointmentDto {
  startAt?: string;
  endAt?: string;
  clinicianId?: string;
  patientId?: string;
  locationId?: string;
  status?: AppointmentStatus;
}

export enum AppointmentResolutionType {
  APPROVED = 'approved',
  DECLINED = 'declined',
  NEEDS_FOLLOW_UP = 'needs_follow_up',
}

export interface ResolveAppointmentRequestDto {
  resolutionType: AppointmentResolutionType;
  resolvedBy: string;
  notes?: string;
}

export interface AppointmentRequestResolutionDto {
  requestId: string;
  resolutionType: AppointmentResolutionType;
  resolvedBy: string;
  resolvedAt: string;
  notes?: string;
}
