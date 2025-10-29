import { Test } from '@nestjs/testing';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentDto,
  AppointmentRequestResolutionDto,
  AppointmentResolutionType,
  AppointmentStatus,
  CreateAppointmentDto,
  ResolveAppointmentRequestDto,
  UpdateAppointmentDto,
} from '../dto/appointment.dto';

const appointment: AppointmentDto = {
  id: 'a2e8c5d0-17b6-4a17-9f70-7284f1e2cb49',
  startAt: '2025-05-01T09:00:00Z',
  endAt: '2025-05-01T09:30:00Z',
  status: AppointmentStatus.SCHEDULED,
  clinician: { id: 'c1', name: 'Dr. Allergy' },
  patient: { id: 'p1', name: 'Pat Patient' },
  location: { id: 'l1', name: 'Room A' },
};

const resolution: AppointmentRequestResolutionDto = {
  requestId: 'req-1',
  resolutionType: AppointmentResolutionType.APPROVED,
  resolvedBy: 'user-1',
  resolvedAt: '2025-05-01T08:00:00Z',
};

describe('AppointmentsController', () => {
  let controller: AppointmentsController;
  let service: AppointmentsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        {
          provide: AppointmentsService,
          useValue: {
            createAppointment: jest.fn().mockResolvedValue(appointment),
            updateAppointment: jest.fn().mockResolvedValue(appointment),
            resolveAppointmentRequest: jest.fn().mockResolvedValue(resolution),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(AppointmentsController);
    service = moduleRef.get(AppointmentsService);
  });

  it('creates an appointment', async () => {
    const payload: CreateAppointmentDto = {
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      clinicianId: 'c1',
      patientId: 'p1',
      locationId: 'l1',
      status: AppointmentStatus.SCHEDULED,
    };

    await expect(controller.createAppointment(payload)).resolves.toEqual(appointment);
    expect(service.createAppointment).toHaveBeenCalledWith(payload);
  });

  it('updates an appointment', async () => {
    const payload: UpdateAppointmentDto = {
      status: AppointmentStatus.COMPLETED,
    };

    await expect(controller.updateAppointment(appointment.id, payload)).resolves.toEqual(appointment);
    expect(service.updateAppointment).toHaveBeenCalledWith(appointment.id, payload);
  });

  it('resolves an appointment request', async () => {
    const payload: ResolveAppointmentRequestDto = {
      resolutionType: AppointmentResolutionType.APPROVED,
      resolvedBy: 'user-1',
    };

    await expect(controller.resolveAppointmentRequest('req-1', payload)).resolves.toEqual(resolution);
    expect(service.resolveAppointmentRequest).toHaveBeenCalledWith('req-1', payload);
  });
});
