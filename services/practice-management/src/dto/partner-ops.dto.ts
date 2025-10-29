export enum PartnerCheckinStatus {
  ARRIVED = 'arrived',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export interface CreatePartnerCheckinDto {
  appointmentId: string;
  status: PartnerCheckinStatus;
  occurredAt: string;
  notes?: string;
}

export interface PartnerCheckinDto {
  id: string;
  appointmentId: string;
  status: PartnerCheckinStatus;
  occurredAt: string;
  notes?: string;
}

export interface PrintPartnerLabelDto {
  printedBy: string;
  printerIdentifier: string;
}

export interface PartnerLabelPrintDto {
  queueId: string;
  printedBy: string;
  printerIdentifier: string;
  printedAt: string;
}

export enum PartnerStockAdjustmentType {
  INCREMENT = 'increment',
  DECREMENT = 'decrement',
}

export interface AdjustPartnerStockDto {
  adjustmentType: PartnerStockAdjustmentType;
  quantityDelta: number;
  adjustedBy: string;
  reason?: string;
}

export interface PartnerStockAdjustmentDto {
  id: string;
  stockLevelId: string;
  adjustmentType: PartnerStockAdjustmentType;
  quantityDelta: number;
  adjustedBy: string;
  adjustedAt: string;
  reason?: string;
}

export interface PartnerTemperatureLogRecordDto {
  loggedAt: string;
  temperature: number;
  unit: 'C' | 'F';
  probeIdentifier?: string;
}

export interface ImportPartnerTemperatureLogsDto {
  partnerId: string;
  source?: string;
  records: PartnerTemperatureLogRecordDto[];
}

export interface PartnerTemperatureLogImportDto {
  importId: string;
  partnerId: string;
  importedAt: string;
  records: PartnerTemperatureLogRecordDto[];
}
