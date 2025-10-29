import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppointmentsController } from '../src/appointments/appointments.controller';
import { AppointmentsService } from '../src/appointments/appointments.service';
import {
  AppointmentDto,
  AppointmentRequestResolutionDto,
  AppointmentResolutionType,
  AppointmentStatus,
  CreateAppointmentDto,
  ResolveAppointmentRequestDto,
  UpdateAppointmentDto,
} from '../src/dto/appointment.dto';

function createAsyncSpy<Args extends unknown[], Result>(result: Result) {
  const calls: Args[] = [];
  const fn = async (...args: Args) => {
    calls.push(args);
    return result;
  };
  return { fn, calls };
}

describe('AppointmentsController', () => {
  let controller: AppointmentsController;
  let serviceMock: {
    createAppointment: ReturnType<typeof createAsyncSpy<[CreateAppointmentDto], AppointmentDto>>;
    updateAppointment: ReturnType<typeof createAsyncSpy<[string, UpdateAppointmentDto], AppointmentDto>>;
    resolveAppointmentRequest: ReturnType<
      typeof createAsyncSpy<[string, ResolveAppointmentRequestDto], AppointmentRequestResolutionDto>
    >;
  };
  let service: AppointmentsService;

  const appointment: AppointmentDto = {
    id: 'apt-1',
    startAt: '2025-05-01T09:00:00Z',
    endAt: '2025-05-01T09:30:00Z',
    status: AppointmentStatus.SCHEDULED,
    clinician: { id: 'clinician-1', name: 'Dr. Allergy' },
    patient: { id: 'patient-1', name: 'Pat Patient' },
    location: { id: 'location-1', name: 'Room A' },
  };

  const resolution: AppointmentRequestResolutionDto = {
    requestId: 'req-1',
    resolutionType: AppointmentResolutionType.APPROVED,
    resolvedBy: 'user-1',
    resolvedAt: '2025-05-01T08:00:00Z',
    notes: 'Approved after review',
  };

  beforeEach(() => {
    serviceMock = {
      createAppointment: createAsyncSpy<[CreateAppointmentDto], AppointmentDto>(appointment),
      updateAppointment: createAsyncSpy<[string, UpdateAppointmentDto], AppointmentDto>(appointment),
      resolveAppointmentRequest: createAsyncSpy<
        [string, ResolveAppointmentRequestDto],
        AppointmentRequestResolutionDto
      >(resolution),
    };

    service = {
      createAppointment: serviceMock.createAppointment.fn,
      updateAppointment: serviceMock.updateAppointment.fn,
      resolveAppointmentRequest: serviceMock.resolveAppointmentRequest.fn,
    } as unknown as AppointmentsService;

    controller = new AppointmentsController(service);
  });

  it('creates an appointment', async () => {
    const payload: CreateAppointmentDto = {
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      clinicianId: 'clinician-1',
      patientId: 'patient-1',
      locationId: 'location-1',
      status: AppointmentStatus.SCHEDULED,
    };

    const result = await controller.createAppointment(payload);

    assert.deepEqual(result, appointment);
    assert.deepEqual(serviceMock.createAppointment.calls, [[payload]]);
  });

  it('updates an appointment', async () => {
    const payload: UpdateAppointmentDto = { status: AppointmentStatus.COMPLETED };

    const result = await controller.updateAppointment(appointment.id, payload);

    assert.deepEqual(result, appointment);
    assert.deepEqual(serviceMock.updateAppointment.calls, [[appointment.id, payload]]);
  });

  it('resolves an appointment request', async () => {
    const payload: ResolveAppointmentRequestDto = {
      resolutionType: AppointmentResolutionType.APPROVED,
      resolvedBy: 'user-1',
      notes: 'All good',
    };

    const result = await controller.resolveAppointmentRequest(resolution.requestId, payload);

    assert.deepEqual(result, resolution);
    assert.deepEqual(serviceMock.resolveAppointmentRequest.calls, [[resolution.requestId, payload]]);
  });
});
