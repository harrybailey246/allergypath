import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum PartnerCheckinStatus {
  ARRIVED = 'arrived',
  IN_ROOM = 'in_room',
  COMPLETE = 'complete',
  CANCELLED = 'cancelled',
}

export class PartnerCheckinDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  appointmentId!: string;

  @IsEnum(PartnerCheckinStatus)
  status!: PartnerCheckinStatus;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

export class CreatePartnerCheckinDto {
  @IsUUID()
  appointmentId!: string;

  @IsEnum(PartnerCheckinStatus)
  status!: PartnerCheckinStatus;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

export class PartnerLabelPrintDto {
  @IsUUID()
  queueId!: string;

  @IsString()
  @Length(1, 120)
  printedBy!: string;

  @IsDateString()
  printedAt!: string;

  @IsString()
  @Length(1, 120)
  printerIdentifier!: string;
}

export class PrintPartnerLabelDto {
  @IsString()
  @Length(1, 120)
  printedBy!: string;

  @IsString()
  @Length(1, 120)
  printerIdentifier!: string;
}

export enum PartnerStockAdjustmentType {
  INCREMENT = 'increment',
  DECREMENT = 'decrement',
  RESET = 'reset',
}

export class PartnerStockAdjustmentDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  stockLevelId!: string;

  @IsEnum(PartnerStockAdjustmentType)
  adjustmentType!: PartnerStockAdjustmentType;

  @IsInt()
  quantityDelta!: number;

  @IsString()
  @Length(1, 200)
  adjustedBy!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;

  @IsDateString()
  adjustedAt!: string;
}

export class AdjustPartnerStockDto {
  @IsEnum(PartnerStockAdjustmentType)
  adjustmentType!: PartnerStockAdjustmentType;

  @IsInt()
  quantityDelta!: number;

  @IsString()
  @Length(1, 200)
  adjustedBy!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

export class PartnerTemperatureLogRecordDto {
  @IsDateString()
  loggedAt!: string;

  @IsNumber()
  temperature!: number;

  @IsString()
  @Length(1, 10)
  unit!: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  probeIdentifier?: string;
}

export class PartnerTemperatureLogImportDto {
  @IsUUID()
  importId!: string;

  @IsUUID()
  partnerId!: string;

  @IsDateString()
  importedAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PartnerTemperatureLogRecordDto)
  records!: PartnerTemperatureLogRecordDto[];
}

export class ImportPartnerTemperatureLogsDto {
  @IsUUID()
  partnerId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PartnerTemperatureLogRecordDto)
  records!: PartnerTemperatureLogRecordDto[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  source?: string;
}
