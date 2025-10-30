import { Controller, Get, UseGuards } from "@nestjs/common";
import { Patient } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PatientsService } from "./patients.service";

@Controller("patients")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles("ADMIN", "CLINICIAN", "NURSE", "STAFF")
  findAll(): Promise<Patient[]> {
    return this.patientsService.findAll();
  }
}
