import {
  AppointmentDto,
  AppointmentRequestResolutionDto,
  CreateAppointmentDto,
  ResolveAppointmentRequestDto,
  UpdateAppointmentDto,
} from '../dto/appointment.dto';
import { AppointmentsRepository } from '../repositories/appointments.repository';

export class AppointmentsService {
  constructor(private readonly repository: AppointmentsRepository) {}

  createAppointment(payload: CreateAppointmentDto): Promise<AppointmentDto> {
    return this.repository.createAppointment(payload);
  }

  updateAppointment(id: string, payload: UpdateAppointmentDto): Promise<AppointmentDto> {
    return this.repository.updateAppointment(id, payload);
  }

  resolveAppointmentRequest(
    requestId: string,
    payload: ResolveAppointmentRequestDto,
  ): Promise<AppointmentRequestResolutionDto> {
    return this.repository.resolveRequest(requestId, payload);
  }
}
