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
import { PartnerOpsRepository } from '../repositories/partner-ops.repository';

export class PartnerOpsService {
  constructor(private readonly repository: PartnerOpsRepository) {}

  recordCheckin(payload: CreatePartnerCheckinDto): Promise<PartnerCheckinDto> {
    return this.repository.recordCheckin(payload);
  }

  recordLabelPrint(queueId: string, payload: PrintPartnerLabelDto): Promise<PartnerLabelPrintDto> {
    return this.repository.recordLabelPrint(queueId, payload);
  }

  adjustStock(levelId: string, payload: AdjustPartnerStockDto): Promise<PartnerStockAdjustmentDto> {
    return this.repository.adjustStock(levelId, payload);
  }

  importTemperatureLogs(partnerId: string, payload: ImportPartnerTemperatureLogsDto): Promise<PartnerTemperatureLogImportDto> {
    return this.repository.importTemperatureLogs(partnerId, payload);
  }
}
