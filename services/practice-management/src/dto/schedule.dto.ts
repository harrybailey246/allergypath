import { AppointmentDto } from './appointment.dto';

export interface PracticeScheduleFilterDto {
  startAt?: string;
  endAt?: string;
  clinicianId?: string;
}

export interface PracticeScheduleDto {
  appointments: AppointmentDto[];
}

export interface PartnerDashboardScheduleCardDto {
  totalAppointments: number;
  arrivedAppointments: number;
}

export interface PartnerDashboardDto {
  schedule: PartnerDashboardScheduleCardDto;
  checkIns: unknown[];
  labelQueue: unknown[];
  stock: unknown[];
  temperatureLogs: unknown[];
}
