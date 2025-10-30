import { Injectable } from "@nestjs/common";
import { Patient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Patient[]> {
    return this.prisma.patient.findMany();
  }
}
