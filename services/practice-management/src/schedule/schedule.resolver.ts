import { Args, Query, Resolver } from '@nestjs/graphql';
import { PartnerDashboardDto, PracticeScheduleDto, PracticeScheduleFilterDto } from '../dto/schedule.dto';
import { ScheduleService } from './schedule.service';

@Resolver('Query')
export class ScheduleResolver {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Query('PracticeSchedule')
  practiceSchedule(
    @Args('filter') filter?: PracticeScheduleFilterDto,
  ): Promise<PracticeScheduleDto> {
    return this.scheduleService.getPracticeSchedule(filter);
  }

  @Query('PartnerDashboard')
  partnerDashboard(@Args('partnerId') partnerId: string): Promise<PartnerDashboardDto> {
    return this.scheduleService.getPartnerDashboard(partnerId);
  }
}
