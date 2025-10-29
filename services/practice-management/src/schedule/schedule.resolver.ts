import { PartnerDashboardDto, PracticeScheduleDto, PracticeScheduleFilterDto } from '../dto/schedule.dto';
import { ScheduleService } from './schedule.service';

export class ScheduleResolver {
  constructor(private readonly scheduleService: ScheduleService) {}

  practiceSchedule(filter?: PracticeScheduleFilterDto): Promise<PracticeScheduleDto> {
    return this.scheduleService.getPracticeSchedule(filter);
  }

  partnerDashboard(partnerId: string): Promise<PartnerDashboardDto> {
    return this.scheduleService.getPartnerDashboard(partnerId);
  }
}
