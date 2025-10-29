import { Injectable } from '@nestjs/common';
import { PartnerDashboardDto, PracticeScheduleDto, PracticeScheduleFilterDto } from '../dto/schedule.dto';
import { ScheduleRepository } from '../repositories/schedule.repository';

@Injectable()
export class ScheduleService {
  constructor(private readonly repository: ScheduleRepository) {}

  getPracticeSchedule(filter?: PracticeScheduleFilterDto): Promise<PracticeScheduleDto> {
    return this.repository.getPracticeSchedule(filter);
  }

  getPartnerDashboard(partnerId: string): Promise<PartnerDashboardDto> {
    return this.repository.getPartnerDashboard(partnerId);
  }
}
