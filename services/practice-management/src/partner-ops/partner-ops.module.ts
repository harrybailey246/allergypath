import { Module } from '@nestjs/common';
import { PartnerOpsController } from './partner-ops.controller';
import { PartnerOpsService } from './partner-ops.service';
import { PartnerOpsRepository } from '../repositories/partner-ops.repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PartnerOpsController],
  providers: [PartnerOpsService, PartnerOpsRepository],
  exports: [PartnerOpsService],
})
export class PartnerOpsModule {}
