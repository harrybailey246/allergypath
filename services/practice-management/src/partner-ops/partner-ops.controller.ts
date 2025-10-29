import { Body, Controller, Param, Post } from '@nestjs/common';
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

@Controller()
export class PartnerOpsController {
  constructor(private readonly partnerOpsService: PartnerOpsService) {}

  @Post('partner-checkins')
  recordCheckin(@Body() payload: CreatePartnerCheckinDto): Promise<PartnerCheckinDto> {
    return this.partnerOpsService.recordCheckin(payload);
  }

  @Post('partner-label-queue/:id:print')
  recordLabelPrint(
    @Param('id') queueId: string,
    @Body() payload: PrintPartnerLabelDto,
  ): Promise<PartnerLabelPrintDto> {
    return this.partnerOpsService.recordLabelPrint(queueId, payload);
  }

  @Post('partner-stock-levels/:id:adjust')
  adjustStock(
    @Param('id') stockLevelId: string,
    @Body() payload: AdjustPartnerStockDto,
  ): Promise<PartnerStockAdjustmentDto> {
    return this.partnerOpsService.adjustStock(stockLevelId, payload);
  }

  @Post('partner-temperature-logs/import')
  importTemperatureLogs(@Body() payload: ImportPartnerTemperatureLogsDto): Promise<PartnerTemperatureLogImportDto> {
    return this.partnerOpsService.importTemperatureLogs(payload.partnerId, payload);
  }
}
