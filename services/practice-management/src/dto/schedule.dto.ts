import { IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AppointmentDto, AppointmentStatus, ClinicianSummaryDto, LocationSummaryDto, PatientSummaryDto } from './appointment.dto';
import { PartnerCheckinDto, PartnerLabelPrintDto, PartnerStockAdjustmentDto, PartnerTemperatureLogRecordDto } from './partner-ops.dto';

export class PracticeScheduleFilterDto {
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsUUID()
  clinicianId?: string;
}

export class PracticeScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AppointmentDto)
  appointments!: AppointmentDto[];
}

export class PartnerDashboardScheduleCardDto {
  @IsNumber()
  totalAppointments!: number;

  @IsNumber()
  arrivedAppointments!: number;
}

export class PartnerDashboardDto {
  @ValidateNested()
  @Type(() => PartnerDashboardScheduleCardDto)
  schedule!: PartnerDashboardScheduleCardDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerCheckinDto)
  checkIns!: PartnerCheckinDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerLabelPrintDto)
  labelQueue!: PartnerLabelPrintDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerStockAdjustmentDto)
  stock!: PartnerStockAdjustmentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerTemperatureLogRecordDto)
  temperatureLogs!: PartnerTemperatureLogRecordDto[];
}
