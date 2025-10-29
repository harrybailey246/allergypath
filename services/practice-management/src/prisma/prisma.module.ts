import { Global, Module } from '@nestjs/common';
import { PRISMA_CLIENT } from './prisma.constants';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: PRISMA_CLIENT,
      useFactory: () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { PrismaClient } = require('@prisma/client');
          return new PrismaClient();
        } catch (error) {
          return {};
        }
      },
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
