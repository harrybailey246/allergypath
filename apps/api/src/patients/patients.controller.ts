import { Controller, Get } from "@nestjs/common";
import { Patient } from "@prisma/client";
import { PatientsService } from "./patients.service";

@Controller("patients")
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  findAll(): Promise<Patient[]> {
    return this.patientsService.findAll();
  }
}
