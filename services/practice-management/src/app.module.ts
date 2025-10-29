import { Module } from '@nestjs/common';
import { AppointmentsModule } from './appointments/appointments.module';
import { PartnerOpsModule } from './partner-ops/partner-ops.module';
import { ScheduleGraphqlModule } from './schedule/schedule-graphql.module';

@Module({
  imports: [AppointmentsModule, PartnerOpsModule, ScheduleGraphqlModule],
})
export class AppModule {}
