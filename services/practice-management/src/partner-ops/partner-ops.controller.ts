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
import { PartnerOpsService } from './partner-ops.service';

export class PartnerOpsController {
  constructor(private readonly partnerOpsService: PartnerOpsService) {}

  recordCheckin(payload: CreatePartnerCheckinDto): Promise<PartnerCheckinDto> {
    return this.partnerOpsService.recordCheckin(payload);
  }

  recordLabelPrint(
    queueId: string,
    payload: PrintPartnerLabelDto,
  ): Promise<PartnerLabelPrintDto> {
    return this.partnerOpsService.recordLabelPrint(queueId, payload);
  }

  adjustStock(
    stockLevelId: string,
    payload: AdjustPartnerStockDto,
  ): Promise<PartnerStockAdjustmentDto> {
    return this.partnerOpsService.adjustStock(stockLevelId, payload);
  }

  importTemperatureLogs(payload: ImportPartnerTemperatureLogsDto): Promise<PartnerTemperatureLogImportDto> {
    return this.partnerOpsService.importTemperatureLogs(payload.partnerId, payload);
  }
}
