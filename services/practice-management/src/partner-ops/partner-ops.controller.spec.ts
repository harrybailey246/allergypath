import { Test } from '@nestjs/testing';
import { PartnerOpsController } from './partner-ops.controller';
import { PartnerOpsService } from './partner-ops.service';
import {
  AdjustPartnerStockDto,
  CreatePartnerCheckinDto,
  ImportPartnerTemperatureLogsDto,
  PartnerCheckinDto,
  PartnerLabelPrintDto,
  PartnerStockAdjustmentDto,
  PartnerTemperatureLogImportDto,
  PartnerTemperatureLogRecordDto,
  PartnerCheckinStatus,
  PartnerStockAdjustmentType,
  PrintPartnerLabelDto,
} from '../dto/partner-ops.dto';

describe('PartnerOpsController', () => {
  let controller: PartnerOpsController;
  let service: PartnerOpsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PartnerOpsController],
      providers: [
        {
          provide: PartnerOpsService,
          useValue: {
            recordCheckin: jest.fn().mockResolvedValue({} as PartnerCheckinDto),
            recordLabelPrint: jest.fn().mockResolvedValue({} as PartnerLabelPrintDto),
            adjustStock: jest.fn().mockResolvedValue({} as PartnerStockAdjustmentDto),
            importTemperatureLogs: jest.fn().mockResolvedValue({} as PartnerTemperatureLogImportDto),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get(PartnerOpsController);
    service = moduleRef.get(PartnerOpsService);
  });

  it('records a check-in', async () => {
    const payload: CreatePartnerCheckinDto = {
      appointmentId: 'apt-1',
      status: PartnerCheckinStatus.ARRIVED,
      occurredAt: '2025-05-01T08:55:00Z',
    };

    await controller.recordCheckin(payload);
    expect(service.recordCheckin).toHaveBeenCalledWith(payload);
  });

  it('records a label print', async () => {
    const payload: PrintPartnerLabelDto = {
      printedBy: 'nurse-1',
      printerIdentifier: 'printer-1',
    };

    await controller.recordLabelPrint('queue-1', payload);
    expect(service.recordLabelPrint).toHaveBeenCalledWith('queue-1', payload);
  });

  it('adjusts stock', async () => {
    const payload: AdjustPartnerStockDto = {
      adjustmentType: PartnerStockAdjustmentType.INCREMENT,
      quantityDelta: 5,
      adjustedBy: 'ops-1',
    };

    await controller.adjustStock('stock-1', payload);
    expect(service.adjustStock).toHaveBeenCalledWith('stock-1', payload);
  });

  it('imports temperature logs', async () => {
    const record: PartnerTemperatureLogRecordDto = {
      loggedAt: '2025-05-01T07:00:00Z',
      temperature: 36.5,
      unit: 'C',
    };
    const payload: ImportPartnerTemperatureLogsDto = {
      partnerId: 'partner-1',
      records: [record],
    };

    await controller.importTemperatureLogs(payload);
    expect(service.importTemperatureLogs).toHaveBeenCalledWith('partner-1', payload);
  });
});
