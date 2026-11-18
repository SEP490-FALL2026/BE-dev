import { Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdParamDto } from '../budget/budget.dto';
import { BUDGET_ERROR_EXAMPLES as EXAMPLES } from '../budget/budget.http-errors';
import { BudgetAttachmentLinkService } from './budget-attachment-link.service';
import { BudgetAttachmentQueryService } from './budget-attachment-query.service';
import {
  BudgetAttachmentLinkResponseDto,
  BudgetAttachmentListQueryDto,
  BudgetAttachmentMinePageResponseDto,
  BudgetAttachmentPageResponseDto,
} from './budget-attachment.dto';
import {
  BUDGET_ATTACHMENT_ERROR_EXAMPLES as ATTACHMENT_EXAMPLES,
  toBudgetAttachmentApiException,
} from './budget-attachment.http-errors';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'Invalid input parameters or query shape.',
  examples: [VALIDATION_EXAMPLE],
} as const;

const PROPOSAL_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The proposal is not found or cannot be read by the caller (BUDGET.PROPOSAL_NOT_FOUND).',
  examples: [EXAMPLES.PROPOSAL_NOT_FOUND],
} as const;

const VERSION_FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description: 'You cannot read the attachments of budget versions.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

const VERSION_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The version is not found or not visible to the caller (BUDGET.VERSION_NOT_FOUND).',
  examples: [EXAMPLES.VERSION_NOT_FOUND],
} as const;

const ATTACHMENT_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The document is not found, not verified, or not readable (BUDGET_ATTACHMENT.NOT_FOUND).',
  examples: [ATTACHMENT_EXAMPLES.NOT_FOUND],
} as const;

@ApiTags('budgets')
@Controller({ version: '1' })
export class BudgetAttachmentReadsController {
  constructor(
    private readonly query: BudgetAttachmentQueryService,
    private readonly links: BudgetAttachmentLinkService,
  ) {}

  @Get('budget-proposals/:id/attachments')
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'budgetProposalAttachmentList',
    summary: 'List the attachments of a budget proposal',
  })
  @ApiSuccessResponse(BudgetAttachmentPageResponseDto, {
    message: 'BUDGET_ATTACHMENT.LISTED',
    description: 'The attachments of the budget proposal.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, PROPOSAL_NOT_FOUND, INVALID)
  async listProposalAttachments(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Query() query: BudgetAttachmentListQueryDto,
  ) {
    try {
      return await this.query.listProposalAttachments(actor, params.id, query);
    } catch (error) {
      throw toBudgetAttachmentApiException(error);
    }
  }

  @Get('budget-versions/:id/attachments')
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'budgetVersionAttachmentList',
    summary: 'List the attachments of a budget version',
  })
  @ApiSuccessResponse(BudgetAttachmentPageResponseDto, {
    message: 'BUDGET_ATTACHMENT.LISTED',
    description: 'The attachments of the budget version.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, VERSION_FORBIDDEN, VERSION_NOT_FOUND, INVALID)
  async listVersionAttachments(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Query() query: BudgetAttachmentListQueryDto,
  ) {
    try {
      return await this.query.listVersionAttachments(actor, params.id, query);
    } catch (error) {
      throw toBudgetAttachmentApiException(error);
    }
  }

  @Post('budget-attachments/:id/links')
  @AuthenticatedOnly()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'budgetAttachmentLink',
    summary: 'Issue a download link for an attachment',
  })
  @ApiSuccessResponse(BudgetAttachmentLinkResponseDto, {
    status: HttpStatus.OK,
    message: 'BUDGET_ATTACHMENT.LINK_ISSUED',
    description: 'A presigned download link for the attachment.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, ATTACHMENT_NOT_FOUND, INVALID)
  async issueLink(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto) {
    try {
      return await this.links.issue(actor, params.id);
    } catch (error) {
      throw toBudgetAttachmentApiException(error);
    }
  }

  @Get('budget-attachments/mine')
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'budgetAttachmentMineList',
    summary: 'List unattached uploads declared by the caller',
  })
  @ApiSuccessResponse(BudgetAttachmentMinePageResponseDto, {
    message: 'BUDGET_ATTACHMENT.MINE_LISTED',
    description: 'Unattached uploads declared by the caller.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, INVALID)
  async listMine(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: BudgetAttachmentListQueryDto) {
    try {
      return await this.query.listMine(actor, query);
    } catch (error) {
      throw toBudgetAttachmentApiException(error);
    }
  }
}
