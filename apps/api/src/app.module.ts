import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { PatientsModule } from "./patients/patients.module";

@Module({
  imports: [PrismaModule, PatientsModule],
})
export class AppModule {}
