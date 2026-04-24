import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { CreateServiceRequestDto } from "./dto/create-service-request.dto";
import { UpdateServiceRequestStatusDto } from "./dto/update-service-request-status.dto";
import { ServiceRequestsService } from "./service-requests.service";

@Controller("service-requests")
export class ServiceRequestsController {
  constructor(private readonly service: ServiceRequestsService) {}

  // Public — the concierge intake modal submits here without auth.
  @Post()
  @HttpCode(201)
  async create(
    @Body() dto: CreateServiceRequestDto,
    @Headers("user-agent") userAgent?: string,
  ): Promise<{ id: string; status: string }> {
    const doc = await this.service.create(dto, { userAgent });
    return { id: String(doc._id), status: doc.status };
  }

  // Admin — list with optional status filter + pagination.
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAll(
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
  ) {
    return this.service.findAll({
      status,
      limit: limit ? parseInt(limit, 10) : 50,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  // Admin — update status (pending → contacted → quoted → booked → dropped).
  @Patch(":id/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateServiceRequestStatusDto,
  ) {
    return this.service.updateStatus(id, dto.status, dto.notes);
  }
}
