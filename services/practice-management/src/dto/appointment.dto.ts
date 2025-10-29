import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  RESCHEDULED = 'rescheduled',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export class ClinicianSummaryDto {
  @IsUUID()
  id!: string;

  @IsString()
  @Length(1, 120)
  name!: string;
}

export class PatientSummaryDto {
  @IsUUID()
  id!: string;

  @IsString()
  @Length(1, 120)
  name!: string;
}

export class LocationSummaryDto {
  @IsUUID()
  id!: string;

  @IsString()
  @Length(1, 160)
  name!: string;
}

export class AppointmentDto {
  @IsUUID()
  id!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;

  @ValidateNested()
  @Type(() => ClinicianSummaryDto)
  clinician!: ClinicianSummaryDto;

  @ValidateNested()
  @Type(() => PatientSummaryDto)
  patient!: PatientSummaryDto;

  @ValidateNested()
  @Type(() => LocationSummaryDto)
  location!: LocationSummaryDto;
}

export class CreateAppointmentDto {
  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsUUID()
  clinicianId!: string;

  @IsUUID()
  patientId!: string;

  @IsUUID()
  locationId!: string;

  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsUUID()
  clinicianId?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}

export enum AppointmentResolutionType {
  APPROVED = 'approved',
  DECLINED = 'declined',
  NEEDS_FOLLOW_UP = 'needs_follow_up',
}

export class ResolveAppointmentRequestDto {
  @IsEnum(AppointmentResolutionType)
  resolutionType!: AppointmentResolutionType;

  @IsUUID()
  resolvedBy!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

export class AppointmentRequestResolutionDto {
  @IsUUID()
  requestId!: string;

  @IsEnum(AppointmentResolutionType)
  resolutionType!: AppointmentResolutionType;

  @IsString()
  resolvedBy!: string;

  @IsDateString()
  resolvedAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
