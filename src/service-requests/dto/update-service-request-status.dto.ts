import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { ServiceRequestStatus } from "../schemas/service-request.schema";

const STATUSES: readonly ServiceRequestStatus[] = [
  "new",
  "contacted",
  "quoted",
  "booked",
  "dropped",
];

export class UpdateServiceRequestStatusDto {
  @IsIn(STATUSES as unknown as string[])
  status: ServiceRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
