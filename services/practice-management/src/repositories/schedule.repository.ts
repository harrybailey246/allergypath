import { AppointmentDto } from '../dto/appointment.dto';
import {
  PartnerDashboardDto,
  PartnerDashboardScheduleCardDto,
  PracticeScheduleDto,
  PracticeScheduleFilterDto,
} from '../dto/schedule.dto';
import { PrismaService } from '../prisma/prisma.service';

interface ScheduleRecord {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  clinician: { id: string; name: string };
  patient: { id: string; name: string };
  location: { id: string; name: string };
}

export class ScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getPracticeSchedule(filter?: PracticeScheduleFilterDto): Promise<PracticeScheduleDto> {
    const records = (await this.prisma.execute<ScheduleRecord[]>('appointment', 'findMany', {
      where: {
        startAt: filter?.startAt ? { gte: filter.startAt } : undefined,
        endAt: filter?.endAt ? { lte: filter.endAt } : undefined,
        clinicianId: filter?.clinicianId,
      },
      include: {
        clinician: true,
        patient: true,
        location: true,
      },
      orderBy: { startAt: 'asc' },
    })) as ScheduleRecord[];

    return {
      appointments: records.map((record) => this.mapAppointment(record)),
    };
  }

  async getPartnerDashboard(partnerId: string): Promise<PartnerDashboardDto> {
    const [appointments, checkIns, labelQueue, stockAdjustments, temperatureLogs] = await Promise.all([
      this.prisma.execute<any>('partnerTodaySchedule', 'findMany', {
        where: { partnerId },
      }),
      this.prisma.execute<any>('partnerCheckin', 'findMany', { where: { partnerId } }),
      this.prisma.execute<any>('partnerLabelQueue', 'findMany', { where: { partnerId } }),
      this.prisma.execute<any>('partnerStockLevelAdjustment', 'findMany', { where: { partnerId } }),
      this.prisma.execute<any>('partnerTemperatureLog', 'findMany', { where: { partnerId } }),
    ]);

    const scheduleCard: PartnerDashboardScheduleCardDto = {
      totalAppointments: Array.isArray(appointments) ? appointments.length : 0,
      arrivedAppointments: Array.isArray(checkIns)
        ? checkIns.filter((item: any) => item.status === 'arrived').length
        : 0,
    };

    return {
      schedule: scheduleCard,
      checkIns: checkIns ?? [],
      labelQueue: labelQueue ?? [],
      stock: stockAdjustments ?? [],
      temperatureLogs: temperatureLogs ?? [],
    } as PartnerDashboardDto;
  }

  private mapAppointment(record: ScheduleRecord): AppointmentDto {
    return {
      id: record.id,
      startAt: record.startAt,
      endAt: record.endAt,
      status: record.status as AppointmentDto['status'],
      clinician: { id: record.clinician.id, name: record.clinician.name },
      patient: { id: record.patient.id, name: record.patient.name },
      location: { id: record.location.id, name: record.location.name },
    };
  }
}
