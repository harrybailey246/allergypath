import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AdjustPartnerStockDto,
  CreatePartnerCheckinDto,
  ImportPartnerTemperatureLogsDto,
  PartnerCheckinDto,
  PartnerLabelPrintDto,
  PartnerStockAdjustmentDto,
  PartnerTemperatureLogImportDto,
  PrintPartnerLabelDto,
} from '../dto/partner-ops.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PartnerOpsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordCheckin(payload: CreatePartnerCheckinDto): Promise<PartnerCheckinDto> {
    const record = (await this.prisma.execute<any>('partnerCheckin', 'create', {
      data: {
        appointmentId: payload.appointmentId,
        status: payload.status,
        occurredAt: payload.occurredAt,
        notes: payload.notes,
      },
    })) as PartnerCheckinDto;

    return record;
  }

  async recordLabelPrint(queueId: string, payload: PrintPartnerLabelDto): Promise<PartnerLabelPrintDto> {
    const record = (await this.prisma.execute<any>('partnerLabelQueue', 'update', {
      where: { id: queueId },
      data: {
        printedBy: payload.printedBy,
        printerIdentifier: payload.printerIdentifier,
        printedAt: new Date().toISOString(),
      },
    })) as PartnerLabelPrintDto;

    return {
      queueId: record.queueId ?? queueId,
      printedBy: record.printedBy,
      printerIdentifier: record.printerIdentifier,
      printedAt: record.printedAt,
    };
  }

  async adjustStock(levelId: string, payload: AdjustPartnerStockDto): Promise<PartnerStockAdjustmentDto> {
    const record = (await this.prisma.execute<any>('partnerStockLevel', 'update', {
      where: { id: levelId },
      data: {
        adjustmentType: payload.adjustmentType,
        quantityDelta: payload.quantityDelta,
        adjustedBy: payload.adjustedBy,
        reason: payload.reason,
        adjustedAt: new Date().toISOString(),
      },
    })) as PartnerStockAdjustmentDto;

    return {
      id: record.id ?? levelId,
      stockLevelId: record.stockLevelId ?? levelId,
      adjustmentType: record.adjustmentType,
      quantityDelta: record.quantityDelta,
      adjustedBy: record.adjustedBy,
      adjustedAt: record.adjustedAt,
      reason: record.reason,
    };
  }

  async importTemperatureLogs(partnerId: string, payload: ImportPartnerTemperatureLogsDto): Promise<PartnerTemperatureLogImportDto> {
    await this.prisma.execute<any>('partnerTemperatureLog', 'createMany', {
      data: payload.records.map((record) => ({
        partnerId,
        loggedAt: record.loggedAt,
        temperature: record.temperature,
        unit: record.unit,
        probeIdentifier: record.probeIdentifier,
        source: payload.source,
      })),
    });

    return {
      importId: randomUUID(),
      partnerId,
      importedAt: new Date().toISOString(),
      records: payload.records,
    };
  }
}
