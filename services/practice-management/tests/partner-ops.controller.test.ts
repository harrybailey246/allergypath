import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PartnerOpsController } from '../src/partner-ops/partner-ops.controller';
import { PartnerOpsService } from '../src/partner-ops/partner-ops.service';
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
} from '../src/dto/partner-ops.dto';

function createAsyncSpy<Args extends unknown[], Result>(result: Result) {
  const calls: Args[] = [];
  const fn = async (...args: Args) => {
    calls.push(args);
    return result;
  };
  return { fn, calls };
}

describe('PartnerOpsController', () => {
  let controller: PartnerOpsController;
  let serviceMock: {
    recordCheckin: ReturnType<typeof createAsyncSpy<[CreatePartnerCheckinDto], PartnerCheckinDto>>;
    recordLabelPrint: ReturnType<typeof createAsyncSpy<[string, PrintPartnerLabelDto], PartnerLabelPrintDto>>;
    adjustStock: ReturnType<typeof createAsyncSpy<[string, AdjustPartnerStockDto], PartnerStockAdjustmentDto>>;
    importTemperatureLogs: ReturnType<
      typeof createAsyncSpy<[string, ImportPartnerTemperatureLogsDto], PartnerTemperatureLogImportDto>
    >;
  };
  let service: PartnerOpsService;

  beforeEach(() => {
    serviceMock = {
      recordCheckin: createAsyncSpy<[CreatePartnerCheckinDto], PartnerCheckinDto>({
        id: 'checkin-1',
        appointmentId: 'apt-1',
        status: PartnerCheckinStatus.ARRIVED,
        occurredAt: '2025-05-01T08:55:00Z',
      }),
      recordLabelPrint: createAsyncSpy<[string, PrintPartnerLabelDto], PartnerLabelPrintDto>({
        queueId: 'queue-1',
        printedBy: 'nurse-1',
        printerIdentifier: 'printer-1',
        printedAt: '2025-05-01T09:05:00Z',
      }),
      adjustStock: createAsyncSpy<[string, AdjustPartnerStockDto], PartnerStockAdjustmentDto>({
        id: 'adjustment-1',
        stockLevelId: 'stock-1',
        adjustmentType: PartnerStockAdjustmentType.INCREMENT,
        quantityDelta: 5,
        adjustedBy: 'ops-1',
        adjustedAt: '2025-05-01T07:00:00Z',
      }),
      importTemperatureLogs: createAsyncSpy<
        [string, ImportPartnerTemperatureLogsDto],
        PartnerTemperatureLogImportDto
      >({
        importId: 'import-1',
        partnerId: 'partner-1',
        importedAt: '2025-05-01T06:30:00Z',
        records: [],
      }),
    };

    service = {
      recordCheckin: serviceMock.recordCheckin.fn,
      recordLabelPrint: serviceMock.recordLabelPrint.fn,
      adjustStock: serviceMock.adjustStock.fn,
      importTemperatureLogs: serviceMock.importTemperatureLogs.fn,
    } as unknown as PartnerOpsService;

    controller = new PartnerOpsController(service);
  });

  it('records a partner check-in', async () => {
    const payload: CreatePartnerCheckinDto = {
      appointmentId: 'apt-1',
      status: PartnerCheckinStatus.ARRIVED,
      occurredAt: '2025-05-01T08:55:00Z',
    };

    const result = await controller.recordCheckin(payload);

    assert.equal(result.appointmentId, 'apt-1');
    assert.deepEqual(serviceMock.recordCheckin.calls, [[payload]]);
  });

  it('records a label print', async () => {
    const payload: PrintPartnerLabelDto = { printedBy: 'nurse-1', printerIdentifier: 'printer-1' };

    const result = await controller.recordLabelPrint('queue-1', payload);

    assert.equal(result.queueId, 'queue-1');
    assert.deepEqual(serviceMock.recordLabelPrint.calls, [['queue-1', payload]]);
  });

  it('adjusts stock levels', async () => {
    const payload: AdjustPartnerStockDto = {
      adjustmentType: PartnerStockAdjustmentType.DECREMENT,
      quantityDelta: 2,
      adjustedBy: 'ops-1',
    };

    const result = await controller.adjustStock('stock-1', payload);

    assert.equal(result.stockLevelId, 'stock-1');
    assert.deepEqual(serviceMock.adjustStock.calls, [['stock-1', payload]]);
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

    const result = await controller.importTemperatureLogs(payload);

    assert.equal(result.partnerId, 'partner-1');
    assert.deepEqual(serviceMock.importTemperatureLogs.calls, [['partner-1', payload]]);
  });
});
