import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ScheduleResolver } from '../src/schedule/schedule.resolver';
import { ScheduleService } from '../src/schedule/schedule.service';
import { PartnerDashboardDto, PracticeScheduleDto, PracticeScheduleFilterDto } from '../src/dto/schedule.dto';

function createAsyncSpy<Args extends unknown[], Result>(result: Result) {
  const calls: Args[] = [];
  const fn = async (...args: Args) => {
    calls.push(args);
    return result;
  };
  return { fn, calls };
}

describe('ScheduleResolver', () => {
  let resolver: ScheduleResolver;
  let serviceMock: {
    getPracticeSchedule: ReturnType<typeof createAsyncSpy<[PracticeScheduleFilterDto | undefined], PracticeScheduleDto>>;
    getPartnerDashboard: ReturnType<typeof createAsyncSpy<[string], PartnerDashboardDto>>;
  };
  let service: ScheduleService;

  beforeEach(() => {
    serviceMock = {
      getPracticeSchedule: createAsyncSpy<[PracticeScheduleFilterDto | undefined], PracticeScheduleDto>({
        appointments: [],
      }),
      getPartnerDashboard: createAsyncSpy<[string], PartnerDashboardDto>({
        schedule: { totalAppointments: 0, arrivedAppointments: 0 },
        checkIns: [],
        labelQueue: [],
        stock: [],
        temperatureLogs: [],
      }),
    };

    service = {
      getPracticeSchedule: serviceMock.getPracticeSchedule.fn,
      getPartnerDashboard: serviceMock.getPartnerDashboard.fn,
    } as unknown as ScheduleService;

    resolver = new ScheduleResolver(service);
  });

  it('fetches the practice schedule', async () => {
    const filter: PracticeScheduleFilterDto = { clinicianId: 'clinician-1' };

    const result = await resolver.practiceSchedule(filter);

    assert.deepEqual(result.appointments, []);
    assert.deepEqual(serviceMock.getPracticeSchedule.calls, [[filter]]);
  });

  it('fetches the partner dashboard', async () => {
    const partnerId = 'partner-1';

    const result = await resolver.partnerDashboard(partnerId);

    assert.equal(result.schedule.totalAppointments, 0);
    assert.deepEqual(serviceMock.getPartnerDashboard.calls, [[partnerId]]);
  });
});
