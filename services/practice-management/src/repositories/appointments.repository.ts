import { Injectable } from '@nestjs/common';
import {
  AppointmentDto,
  AppointmentRequestResolutionDto,
  AppointmentResolutionType,
  AppointmentStatus,
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from '../dto/appointment.dto';
import { PrismaService } from '../prisma/prisma.service';

interface AppointmentRecord {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  clinician: { id: string; name: string };
  patient: { id: string; name: string };
  location: { id: string; name: string };
}

@Injectable()
export class AppointmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createAppointment(payload: CreateAppointmentDto): Promise<AppointmentDto> {
    const record = (await this.prisma.execute<AppointmentRecord>('appointment', 'create', {
      data: {
        startAt: payload.startAt,
        endAt: payload.endAt,
        status: payload.status,
        clinicianId: payload.clinicianId,
        patientId: payload.patientId,
        locationId: payload.locationId,
      },
      include: {
        clinician: true,
        patient: true,
        location: true,
      },
    })) as AppointmentRecord;

    return this.mapAppointment(record);
  }

  async updateAppointment(id: string, payload: UpdateAppointmentDto): Promise<AppointmentDto> {
    const record = (await this.prisma.execute<AppointmentRecord>('appointment', 'update', {
      where: { id },
      data: {
        startAt: payload.startAt,
        endAt: payload.endAt,
        status: payload.status,
        clinicianId: payload.clinicianId,
        patientId: payload.patientId,
        locationId: payload.locationId,
      },
      include: {
        clinician: true,
        patient: true,
        location: true,
      },
    })) as AppointmentRecord;

    return this.mapAppointment(record);
  }

  async resolveRequest(
    requestId: string,
    payload: { resolutionType: AppointmentResolutionType; resolvedBy: string; notes?: string },
  ): Promise<AppointmentRequestResolutionDto> {
    const record = (await this.prisma.execute<any>('appointmentRequest', 'update', {
      where: { id: requestId },
      data: {
        resolutionType: payload.resolutionType,
        resolvedBy: payload.resolvedBy,
        notes: payload.notes,
        resolvedAt: new Date().toISOString(),
      },
    })) as { id: string; resolutionType: AppointmentResolutionType; resolvedBy: string; resolvedAt: string; notes?: string };

    return {
      requestId: record.id,
      resolutionType: record.resolutionType,
      resolvedBy: record.resolvedBy,
      resolvedAt: record.resolvedAt,
      notes: record.notes,
    };
  }

  private mapAppointment(record: AppointmentRecord): AppointmentDto {
    return {
      id: record.id,
      startAt: record.startAt,
      endAt: record.endAt,
      status: record.status,
      clinician: {
        id: record.clinician.id,
        name: record.clinician.name,
      },
      patient: {
        id: record.patient.id,
        name: record.patient.name,
      },
      location: {
        id: record.location.id,
        name: record.location.name,
      },
    };
  }
}
