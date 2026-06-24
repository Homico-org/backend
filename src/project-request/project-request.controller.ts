import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectRequestService } from './project-request.service';
import { CreateProjectRequestDto } from './dto/create-project-request.dto';
import {
  AddDecisionDto,
  AddDocumentCommentDto,
  AddDocumentDto,
  AddDocumentVersionDto,
  AddEngagementDto,
  AddMilestoneDto,
  AddMoodboardItemDto,
  MoodboardFromUrlDto,
  UpdateMoodboardItemDto,
  AddProductDto,
  AddStepDto,
  ApproveDocumentDto,
  ChooseSelectionDto,
  CreateRoomDto,
  CreateScopeItemDto,
  CreateSelectionDto,
  DesignPhaseDto,
  ImportEstimateDto,
  ReorderStepsDto,
  ReviewSelectionDto,
  SelectionOptionDto,
  UpdateEngagementDto,
  UpdateMilestoneDto,
  UpdateProductDto,
  ReviewProductDto,
  UpdateProjectDto,
  UpdateRoomDto,
  UpdateScopeItemDto,
  UpdateSelectionDto,
  UpdateStepDto,
} from './dto/manage-project.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProjectStatus } from './schemas/project-request.schema';

// Mounted at /projects to match the frontend create flow. The underlying
// model/collection stays `ProjectRequest` (no data migration); this module
// is the "project umbrella" evolution.
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectRequestController {
  constructor(private readonly projectRequestService: ProjectRequestService) {}

  @Post()
  create(
    @CurrentUser() user: any,
    @Body() createProjectRequestDto: CreateProjectRequestDto,
  ) {
    return this.projectRequestService.create(
      user.userId,
      createProjectRequestDto,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('category') category?: string,
    @Query('status') status?: ProjectStatus,
  ) {
    // Return projects the user participates in (owned or engaged), regardless
    // of their global role, so the project switcher always lists them.
    return this.projectRequestService.findForUser(user.userId, {
      category,
      status,
    });
  }

  // Owner's recently-deleted projects (the trash). Declared before `:id` so
  // the static segment isn't swallowed by the param route.
  @Get('trash')
  listTrash(@CurrentUser() user: any) {
    return this.projectRequestService.listDeleted(user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectRequestService.findOne(id);
  }

  // Aggregated dashboard: per-worker progress/stage rollup, phases, budget,
  // documents, merged activity feed. Role-aware (client or engaged pro).
  @Get(':id/dashboard')
  getDashboard(@CurrentUser() user: any, @Param('id') id: string) {
    return this.projectRequestService.getDashboard(id, user.userId);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: ProjectStatus,
  ) {
    return this.projectRequestService.updateStatus(id, status);
  }

  // Client edits top-level project settings.
  @Patch(':id')
  updateProject(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectRequestService.updateProject(id, user.userId, dto);
  }

  // Owner-only soft delete of the whole project.
  @Delete(':id')
  deleteProject(@CurrentUser() user: any, @Param('id') id: string) {
    return this.projectRequestService.deleteProject(id, user.userId);
  }

  // Owner-only restore of a soft-deleted project.
  @Post(':id/restore')
  restoreProject(@CurrentUser() user: any, @Param('id') id: string) {
    return this.projectRequestService.restoreProject(id, user.userId);
  }

  @Patch(':id/assign')
  assignToPro(@Param('id') id: string, @Body('proId') proId: string) {
    return this.projectRequestService.assignToPro(id, proId);
  }

  // === Engagements (roles/workers) ===

  @Post(':id/engagements')
  addEngagement(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddEngagementDto,
  ) {
    return this.projectRequestService.addEngagement(id, user.userId, dto);
  }

  @Patch(':id/engagements/:engagementId')
  updateEngagement(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('engagementId') engagementId: string,
    @Body() dto: UpdateEngagementDto,
  ) {
    return this.projectRequestService.updateEngagement(
      id,
      engagementId,
      user.userId,
      dto,
    );
  }

  @Delete(':id/engagements/:engagementId')
  removeEngagement(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('engagementId') engagementId: string,
  ) {
    return this.projectRequestService.removeEngagement(
      id,
      engagementId,
      user.userId,
    );
  }

  // One-time cleanup: drop leftover standalone engagements for a pro who is
  // also engaged elsewhere (e.g. created by the old "add person" flow).
  @Post(':id/engagements/dedupe')
  dedupeEngagements(@CurrentUser() user: any, @Param('id') id: string) {
    return this.projectRequestService.dedupeEngagements(id, user.userId);
  }

  // Open a role to the marketplace (pros quote on a scoped job).
  @Post(':id/engagements/:engagementId/open')
  openEngagement(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('engagementId') engagementId: string,
  ) {
    return this.projectRequestService.openEngagement(
      id,
      engagementId,
      user.userId,
    );
  }

  // Invite a specific pro to a role.
  @Post(':id/engagements/:engagementId/invite')
  inviteToEngagement(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('engagementId') engagementId: string,
    @Body() body: { proId: string; scheduledStart?: string; period?: string },
  ) {
    return this.projectRequestService.inviteToEngagement(
      id,
      engagementId,
      user.userId,
      body.proId,
      { scheduledStart: body.scheduledStart, period: body.period },
    );
  }

  // Pro accepts an open invitation on this engagement.
  @Post(':id/engagements/:engagementId/accept')
  acceptEngagementInvite(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('engagementId') engagementId: string,
  ) {
    return this.projectRequestService.acceptEngagementInvite(
      id,
      engagementId,
      user.userId,
    );
  }

  // Pro declines an invitation; engagement returns to a draft state and
  // the assignment is cleared so the client can re-invite or open it up.
  @Post(':id/engagements/:engagementId/decline')
  declineEngagementInvite(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('engagementId') engagementId: string,
  ) {
    return this.projectRequestService.declineEngagementInvite(
      id,
      engagementId,
      user.userId,
    );
  }

  // Pro-side inbox: every engagement where the caller has an open invite.
  // Returns a flat list with project context so the UI can render rows
  // without a per-project fetch.
  @Get('my-invitations')
  listMyInvitations(@CurrentUser() user: any) {
    return this.projectRequestService.listMyInvitations(user.userId);
  }

  // === Project steps ===

  @Post(':id/steps')
  addStep(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddStepDto,
  ) {
    return this.projectRequestService.addStep(id, user.userId, dto);
  }

  @Patch(':id/steps/:stepId')
  updateStep(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() dto: UpdateStepDto,
  ) {
    return this.projectRequestService.updateStep(
      id,
      stepId,
      user.userId,
      dto,
    );
  }

  @Delete(':id/steps/:stepId')
  removeStep(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
  ) {
    return this.projectRequestService.removeStep(id, stepId, user.userId);
  }

  @Post(':id/steps/reorder')
  reorderSteps(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ReorderStepsDto,
  ) {
    return this.projectRequestService.reorderSteps(
      id,
      user.userId,
      dto.orderedIds,
    );
  }

  // Graduate: fold an existing standalone booking or job into this project.
  @Post(':id/attach')
  attach(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { bookingId?: string; jobId?: string; roleLabel?: string },
  ) {
    return this.projectRequestService.attachToProject(id, user.userId, body);
  }

  // === Milestones (timeline) ===

  @Post(':id/milestones')
  addMilestone(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddMilestoneDto,
  ) {
    return this.projectRequestService.addMilestone(id, user.userId, dto);
  }

  @Patch(':id/milestones/:milestoneId')
  updateMilestone(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.projectRequestService.updateMilestone(
      id,
      milestoneId,
      user.userId,
      dto,
    );
  }

  @Delete(':id/milestones/:milestoneId')
  removeMilestone(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    return this.projectRequestService.removeMilestone(
      id,
      milestoneId,
      user.userId,
    );
  }

  // === Documents / deliverables ===

  @Post(':id/documents')
  addDocument(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddDocumentDto,
  ) {
    return this.projectRequestService.addDocument(id, user.userId, dto);
  }

  @Patch(':id/documents/:docId/approval')
  approveDocument(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: ApproveDocumentDto,
  ) {
    return this.projectRequestService.setDocumentApproval(
      id,
      user.userId,
      docId,
      dto,
    );
  }

  @Post(':id/documents/:docId/version')
  addDocumentVersion(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: AddDocumentVersionDto,
  ) {
    return this.projectRequestService.addDocumentVersion(
      id,
      user.userId,
      docId,
      dto,
    );
  }

  @Delete(':id/documents/:docId')
  removeDocument(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return this.projectRequestService.removeDocument(id, user.userId, docId);
  }

  @Post(':id/documents/:docId/comments')
  addDocumentComment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: AddDocumentCommentDto,
  ) {
    return this.projectRequestService.addDocumentComment(
      id,
      user.userId,
      docId,
      dto,
    );
  }

  @Delete(':id/documents/:docId/comments/:commentId')
  removeDocumentComment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.projectRequestService.removeDocumentComment(
      id,
      user.userId,
      docId,
      commentId,
    );
  }

  // === Decision log ===

  @Post(':id/decisions')
  addDecision(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddDecisionDto,
  ) {
    return this.projectRequestService.addDecision(id, user.userId, dto);
  }

  @Delete(':id/decisions/:decisionId')
  removeDecision(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('decisionId') decisionId: string,
  ) {
    return this.projectRequestService.removeDecision(
      id,
      user.userId,
      decisionId,
    );
  }

  // === Shopping list / procurement ===

  @Post(':id/products')
  addProduct(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddProductDto,
  ) {
    return this.projectRequestService.addProduct(id, user.userId, dto);
  }

  @Patch(':id/products/:productId')
  updateProduct(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.projectRequestService.updateProduct(
      id,
      user.userId,
      productId,
      dto,
    );
  }

  @Delete(':id/products/:productId')
  removeProduct(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    return this.projectRequestService.removeProduct(
      id,
      user.userId,
      productId,
    );
  }

  // Smart import: read og/meta/JSON-LD from a pasted product URL so the
  // add-product form can autofill name/image/price/vendor. Read-only.
  @Post(':id/products/preview-url')
  previewProductUrl(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: MoodboardFromUrlDto,
  ) {
    return this.projectRequestService.previewProductFromUrl(
      id,
      user.userId,
      dto.url,
    );
  }

  // Client approves / requests changes on a schedule line item.
  @Patch(':id/products/:productId/review')
  reviewProduct(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Body() dto: ReviewProductDto,
  ) {
    return this.projectRequestService.reviewProduct(
      id,
      user.userId,
      productId,
      dto,
    );
  }

  // === Design phase gate (architect/designer) ===

  // Assigned pro submits / advances their design phase for review.
  @Patch(':id/engagements/:engagementId/design-phase')
  submitDesignPhase(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('engagementId') engagementId: string,
    @Body() dto: DesignPhaseDto,
  ) {
    return this.projectRequestService.submitDesignPhase(
      id,
      user.userId,
      engagementId,
      dto,
    );
  }

  // Client approves / requests changes on the submitted design phase.
  @Patch(':id/engagements/:engagementId/design-review')
  reviewDesignPhase(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('engagementId') engagementId: string,
    @Body() dto: ApproveDocumentDto,
  ) {
    return this.projectRequestService.reviewDesignPhase(
      id,
      user.userId,
      engagementId,
      dto,
    );
  }

  // === Rooms / spaces ===

  @Post(':id/rooms')
  addRoom(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateRoomDto,
  ) {
    return this.projectRequestService.addRoom(id, user.userId, dto);
  }

  @Patch(':id/rooms/:roomId')
  updateRoom(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.projectRequestService.updateRoom(id, user.userId, roomId, dto);
  }

  @Delete(':id/rooms/:roomId')
  removeRoom(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('roomId') roomId: string,
  ) {
    return this.projectRequestService.removeRoom(id, user.userId, roomId);
  }

  // === Scope / takeoff (bill of works) ===

  @Post(':id/scope-items')
  addScopeItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateScopeItemDto,
  ) {
    return this.projectRequestService.addScopeItem(id, user.userId, dto);
  }

  // Bulk-import a parsed + service-matched estimate (steps + scope items).
  @Post(':id/import-estimate')
  importEstimate(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ImportEstimateDto,
  ) {
    return this.projectRequestService.importEstimate(id, user.userId, dto);
  }

  @Patch(':id/scope-items/:itemId')
  updateScopeItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateScopeItemDto,
  ) {
    return this.projectRequestService.updateScopeItem(
      id,
      user.userId,
      itemId,
      dto,
    );
  }

  @Delete(':id/scope-items/:itemId')
  removeScopeItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.projectRequestService.removeScopeItem(id, user.userId, itemId);
  }

  // === Moodboard === (static sub-paths declared before :itemId param routes)
  @Post(':id/moodboard')
  addMoodboardItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AddMoodboardItemDto,
  ) {
    return this.projectRequestService.addMoodboardItem(id, user.userId, dto);
  }

  @Post(':id/moodboard/from-url')
  moodboardFromUrl(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: MoodboardFromUrlDto,
  ) {
    return this.projectRequestService.moodboardFromUrl(id, user.userId, dto.url);
  }

  @Post(':id/moodboard/reorder')
  reorderMoodboard(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('orderedIds') orderedIds: string[],
  ) {
    return this.projectRequestService.reorderMoodboard(
      id,
      user.userId,
      orderedIds,
    );
  }

  @Patch(':id/moodboard/:itemId')
  updateMoodboardItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateMoodboardItemDto,
  ) {
    return this.projectRequestService.updateMoodboardItem(
      id,
      user.userId,
      itemId,
      dto,
    );
  }

  @Delete(':id/moodboard/:itemId')
  removeMoodboardItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.projectRequestService.removeMoodboardItem(
      id,
      user.userId,
      itemId,
    );
  }

  // Create + link an engagement for a service line so the client can run the
  // standard invite / open / book flow on it (pro-per-service).
  @Post(':id/scope-items/:itemId/engagement')
  engageScopeItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.projectRequestService.engageScopeItem(id, user.userId, itemId);
  }

  // === Palette & selections (designer/architect) ===

  @Post(':id/selections')
  addSelection(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateSelectionDto,
  ) {
    return this.projectRequestService.addSelection(id, user.userId, dto);
  }

  @Patch(':id/selections/:selectionId')
  updateSelection(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('selectionId') selectionId: string,
    @Body() dto: UpdateSelectionDto,
  ) {
    return this.projectRequestService.updateSelection(
      id,
      user.userId,
      selectionId,
      dto,
    );
  }

  @Delete(':id/selections/:selectionId')
  removeSelection(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('selectionId') selectionId: string,
  ) {
    return this.projectRequestService.removeSelection(
      id,
      user.userId,
      selectionId,
    );
  }

  @Post(':id/selections/:selectionId/options')
  addSelectionOption(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('selectionId') selectionId: string,
    @Body() dto: SelectionOptionDto,
  ) {
    return this.projectRequestService.addSelectionOption(
      id,
      user.userId,
      selectionId,
      dto,
    );
  }

  @Patch(':id/selections/:selectionId/options/:optionId')
  updateSelectionOption(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('selectionId') selectionId: string,
    @Param('optionId') optionId: string,
    @Body() dto: SelectionOptionDto,
  ) {
    return this.projectRequestService.updateSelectionOption(
      id,
      user.userId,
      selectionId,
      optionId,
      dto,
    );
  }

  @Delete(':id/selections/:selectionId/options/:optionId')
  removeSelectionOption(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('selectionId') selectionId: string,
    @Param('optionId') optionId: string,
  ) {
    return this.projectRequestService.removeSelectionOption(
      id,
      user.userId,
      selectionId,
      optionId,
    );
  }

  // Client picks an option (records choice + approves).
  @Patch(':id/selections/:selectionId/choose')
  chooseSelection(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('selectionId') selectionId: string,
    @Body() dto: ChooseSelectionDto,
  ) {
    return this.projectRequestService.chooseSelection(
      id,
      user.userId,
      selectionId,
      dto,
    );
  }

  // Client approves / requests changes.
  @Patch(':id/selections/:selectionId/review')
  reviewSelection(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('selectionId') selectionId: string,
    @Body() dto: ReviewSelectionDto,
  ) {
    return this.projectRequestService.reviewSelection(
      id,
      user.userId,
      selectionId,
      dto,
    );
  }

  // Materialize a selection's chosen option into a schedule line item.
  @Post(':id/selections/:selectionId/to-product')
  selectionToProduct(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('selectionId') selectionId: string,
  ) {
    return this.projectRequestService.selectionToProduct(
      id,
      user.userId,
      selectionId,
    );
  }
}
