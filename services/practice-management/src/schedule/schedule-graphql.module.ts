import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'path';
import { ScheduleResolver } from './schedule.resolver';
import { ScheduleService } from './schedule.service';
import { ScheduleRepository } from '../repositories/schedule.repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    GraphQLModule.forRoot({
      typePaths: [join(process.cwd(), 'services/practice-management/src/graphql/schema.gql')],
      sortSchema: true,
    }),
  ],
  providers: [ScheduleResolver, ScheduleService, ScheduleRepository],
})
export class ScheduleGraphqlModule {}
