import { Test } from '@nestjs/testing';
import { ScheduleResolver } from './schedule.resolver';
import { ScheduleService } from './schedule.service';
import { PartnerDashboardDto, PracticeScheduleDto } from '../dto/schedule.dto';

describe('ScheduleResolver', () => {
  let resolver: ScheduleResolver;
  let service: ScheduleService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ScheduleResolver,
        {
          provide: ScheduleService,
          useValue: {
            getPracticeSchedule: jest.fn().mockResolvedValue({} as PracticeScheduleDto),
            getPartnerDashboard: jest.fn().mockResolvedValue({} as PartnerDashboardDto),
          },
        },
      ],
    }).compile();

    resolver = moduleRef.get(ScheduleResolver);
    service = moduleRef.get(ScheduleService);
  });

  it('fetches practice schedule', async () => {
    await resolver.practiceSchedule({});
    expect(service.getPracticeSchedule).toHaveBeenCalledWith({});
  });

  it('fetches partner dashboard', async () => {
    await resolver.partnerDashboard('partner-1');
    expect(service.getPartnerDashboard).toHaveBeenCalledWith('partner-1');
  });
});
