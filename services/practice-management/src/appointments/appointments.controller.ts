import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import {
  AppointmentDto,
  AppointmentRequestResolutionDto,
  CreateAppointmentDto,
  ResolveAppointmentRequestDto,
  UpdateAppointmentDto,
} from '../dto/appointment.dto';
import { AppointmentsService } from './appointments.service';

@Controller()
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post('appointments')
  createAppointment(@Body() payload: CreateAppointmentDto): Promise<AppointmentDto> {
    return this.appointmentsService.createAppointment(payload);
  }

  @Patch('appointments/:id')
  updateAppointment(@Param('id') id: string, @Body() payload: UpdateAppointmentDto): Promise<AppointmentDto> {
    return this.appointmentsService.updateAppointment(id, payload);
  }

  @Post('appointment-requests/:id:resolve')
  resolveAppointmentRequest(
    @Param('id') requestId: string,
    @Body() payload: ResolveAppointmentRequestDto,
  ): Promise<AppointmentRequestResolutionDto> {
    return this.appointmentsService.resolveAppointmentRequest(requestId, payload);
  }
}
