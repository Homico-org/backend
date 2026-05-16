import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { CatalogSuggestionsService } from "./catalog-suggestions.service";
import { CreateCatalogSuggestionDto } from "./dto/create-catalog-suggestion.dto";
import { UpdateCatalogSuggestionStatusDto } from "./dto/update-catalog-suggestion-status.dto";
import { CatalogSuggestionStatus } from "./schemas/catalog-suggestion.schema";

@ApiTags("catalog-suggestions")
@Controller("catalog-suggestions")
export class CatalogSuggestionsController {
  constructor(private readonly service: CatalogSuggestionsService) {}

  /**
   * Pro submits a suggestion for the catalog. Identity (name, phone, uid) is
   * pulled from the authenticated user, never from the request body.
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  @ApiOperation({ summary: "Submit a catalog suggestion (pro only)" })
  async create(
    @Request() req: { user: { sub: string } },
    @Body() dto: CreateCatalogSuggestionDto,
  ) {
    const doc = await this.service.create(req.user.sub, dto);
    return {
      id: String(doc._id),
      status: doc.status,
    };
  }

  // --- Admin ---

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] List catalog suggestions" })
  async findAll(
    @Query("status") status?: CatalogSuggestionStatus,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.findAll({
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get("pending-count")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] Count of pending suggestions (badge)" })
  async pendingCount() {
    const count = await this.service.getPendingCount();
    return { count };
  }

  @Patch(":id/status")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] Approve or reject a suggestion" })
  async updateStatus(
    @Request() req: { user: { sub: string } },
    @Param("id") id: string,
    @Body() dto: UpdateCatalogSuggestionStatusDto,
  ) {
    return this.service.updateStatus(
      id,
      req.user.sub,
      dto.status,
      dto.reviewerNote,
    );
  }
}
