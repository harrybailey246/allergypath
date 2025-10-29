import {
  AppointmentDto,
  AppointmentRequestResolutionDto,
  CreateAppointmentDto,
  ResolveAppointmentRequestDto,
  UpdateAppointmentDto,
} from '../dto/appointment.dto';
import { AppointmentsService } from './appointments.service';

/**
 * Lightweight controller façade that mimics the REST handlers expected by the
 * higher layers without depending on NestJS at runtime. The methods can be
 * invoked directly from tests or an HTTP adapter.
 */
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  createAppointment(payload: CreateAppointmentDto): Promise<AppointmentDto> {
    return this.appointmentsService.createAppointment(payload);
  }

  updateAppointment(id: string, payload: UpdateAppointmentDto): Promise<AppointmentDto> {
    return this.appointmentsService.updateAppointment(id, payload);
  }

  resolveAppointmentRequest(
    requestId: string,
    payload: ResolveAppointmentRequestDto,
  ): Promise<AppointmentRequestResolutionDto> {
    return this.appointmentsService.resolveAppointmentRequest(requestId, payload);
  }
}
