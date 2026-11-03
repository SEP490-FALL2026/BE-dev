import { Body, Controller, Header, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdParamDto } from '../budget/budget.dto';
import { BUDGET_ERROR_EXAMPLES as EXAMPLES } from '../budget/budget.http-errors';
import { BudgetAttachmentCompletionService } from './budget-attachment-completion.service';
import { BudgetAttachmentDeclarationService } from './budget-attachment-declaration.service';
import { BudgetAttachmentDiscardService } from './budget-attachment-discard.service';
import {
  BudgetAttachmentCompletedResponseDto,
  BudgetAttachmentResponseDto,
  CreateBudgetAttachmentDto,
  VersionAttachmentParamDto,
} from './budget-attachment.dto';
import {
  BUDGET_ATTACHMENT_ERROR_EXAMPLES as ATTACHMENT_EXAMPLES,
  toBudgetAttachmentApiException,
} from './budget-attachment.http-errors';
import { BudgetAttachmentRemovalService } from './budget-attachment-removal.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

@ApiTags('budgets')
@Controller({ version: '1' })
export class BudgetAttachmentUploadsController {
  constructor(
    private readonly declaration: BudgetAttachmentDeclarationService,
    private readonly completion: BudgetAttachmentCompletionService,
    private readonly removal: BudgetAttachmentRemovalService,
    private readonly discardService: BudgetAttachmentDiscardService,
  ) {}

  @Post('budget-versions/:id/attachments')
  @RequireRoles('FINANCE')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'budgetVersionAttachmentDeclare',
    summary: 'Declare a document to attach to a budget version',
  })
  @ApiSuccessResponse(BudgetAttachmentResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_ATTACHMENT.DECLARED',
    description: 'Upload instructions for the document.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance attaches documents to a version.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The version is not found (BUDGET.VERSION_NOT_FOUND).',
      examples: [EXAMPLES.VERSION_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The version is not editable (BUDGET.VERSION_NOT_EDITABLE), or the limit has been reached (BUDGET_ATTACHMENT.LIMIT_REACHED).',
      examples: [EXAMPLES.VERSION_NOT_EDITABLE, ATTACHMENT_EXAMPLES.LIMIT_REACHED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The file name or type is invalid, the file is too large, or the fiscal year has ended.',
      examples: [
        VALIDATION_EXAMPLE,
        ATTACHMENT_EXAMPLES.FILE_INVALID_NAME,
        ATTACHMENT_EXAMPLES.TYPE_NOT_ALLOWED,
        ATTACHMENT_EXAMPLES.TOO_LARGE,
        EXAMPLES.YEAR_ENDED,
      ],
    },
  )
  async declareVersionAttachment(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: CreateBudgetAttachmentDto,
  ) {
    try {
      const result = await this.declaration.declareVersion(actor, params.id, body);
      return {
        attachment: result.attachment,
        upload: result.upload,
      };
    } catch (error) {
      throw toBudgetAttachmentApiException(error);
    }
  }

  @Post('budget-proposals/attachments')
  @RequireRoles('MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'budgetProposalAttachmentDeclare',
    summary: 'Declare a document to attach to a budget proposal',
  })
  @ApiSuccessResponse(BudgetAttachmentResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_ATTACHMENT.DECLARED',
    description: 'Upload instructions for the document.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the head of the department proposes for its Cost Center (BUDGET.NOT_YOUR_COST_CENTER).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_YOUR_COST_CENTER],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'Finance setup is incomplete (FINANCE.SETUP_INCOMPLETE), or the limit has been reached (BUDGET_ATTACHMENT.LIMIT_REACHED).',
      examples: [EXAMPLES.FINANCE_SETUP_INCOMPLETE, ATTACHMENT_EXAMPLES.LIMIT_REACHED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The file name or type is invalid, or the file is too large.',
      examples: [
        VALIDATION_EXAMPLE,
        ATTACHMENT_EXAMPLES.FILE_INVALID_NAME,
        ATTACHMENT_EXAMPLES.TYPE_NOT_ALLOWED,
        ATTACHMENT_EXAMPLES.TOO_LARGE,
      ],
    },
  )
  async declareProposalAttachment(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Body() body: CreateBudgetAttachmentDto,
  ) {
    try {
      const result = await this.declaration.declareProposal(actor, body);
      return {
        attachment: result.attachment,
        upload: result.upload,
      };
    } catch (error) {
      throw toBudgetAttachmentApiException(error);
    }
  }

  @Post('budget-attachments/:id/complete')
  @RequireRoles('MANAGER', 'FINANCE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'budgetAttachmentComplete',
    summary: 'Complete the upload of a budget document',
  })
  @ApiSuccessResponse(BudgetAttachmentCompletedResponseDto, {
    status: HttpStatus.OK,
    message: 'BUDGET_ATTACHMENT.COMPLETED',
    description: 'The document upload is complete.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'You do not hold the required role for this attachment.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The document is not found or not owned by the caller (BUDGET_ATTACHMENT.NOT_FOUND).',
      examples: [ATTACHMENT_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The upload is still pending, expired, not awaiting upload, or the version is not editable.',
      examples: [
        EXAMPLES.VERSION_NOT_EDITABLE,
        ATTACHMENT_EXAMPLES.LIMIT_REACHED,
        ATTACHMENT_EXAMPLES.NOT_AWAITING_UPLOAD,
        ATTACHMENT_EXAMPLES.UPLOAD_PENDING,
        ATTACHMENT_EXAMPLES.UPLOAD_EXPIRED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The uploaded file does not match what was declared (BUDGET_ATTACHMENT.UPLOAD_MISMATCH), or the fiscal year has ended.',
      examples: [VALIDATION_EXAMPLE, ATTACHMENT_EXAMPLES.UPLOAD_MISMATCH, EXAMPLES.YEAR_ENDED],
    },
  )
  async completeAttachment(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto) {
    try {
      const attachment = await this.completion.complete(actor, params.id);
      return {
        attachment,
      };
    } catch (error) {
      throw toBudgetAttachmentApiException(error);
    }
  }

  @Post('budget-versions/:id/attachments/:attachmentId/removal')
  @RequireRoles('FINANCE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'budgetVersionAttachmentRemove',
    summary: 'Remove a document from a version',
  })
  @ApiSuccessResponse(BudgetAttachmentCompletedResponseDto, {
    status: HttpStatus.OK,
    message: 'BUDGET_ATTACHMENT.REMOVED',
    description: 'The document has been removed.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance removes documents from a version.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The document or version is not found (BUDGET_ATTACHMENT.NOT_FOUND, BUDGET.VERSION_NOT_FOUND).',
      examples: [ATTACHMENT_EXAMPLES.NOT_FOUND, EXAMPLES.VERSION_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The version is not editable (BUDGET.VERSION_NOT_EDITABLE), or the document was already removed (BUDGET_ATTACHMENT.ALREADY_REMOVED).',
      examples: [EXAMPLES.VERSION_NOT_EDITABLE, ATTACHMENT_EXAMPLES.ALREADY_REMOVED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The fiscal year has ended (BUDGET.YEAR_ENDED).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.YEAR_ENDED],
    },
  )
  async removeVersionAttachment(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: VersionAttachmentParamDto,
  ) {
    try {
      const attachment = await this.removal.remove(actor, params.id, params.attachmentId);
      return {
        attachment,
      };
    } catch (error) {
      throw toBudgetAttachmentApiException(error);
    }
  }

  @Post('budget-attachments/:id/discard')
  @AuthenticatedOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'budgetAttachmentDiscard',
    summary: 'Discard an unattached upload',
  })
  @ApiSuccessResponse(BudgetAttachmentCompletedResponseDto, {
    status: HttpStatus.OK,
    message: 'BUDGET_ATTACHMENT.DISCARDED',
    description: 'The unattached upload has been discarded.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The document is not found or not owned by the caller (BUDGET_ATTACHMENT.NOT_FOUND).',
      examples: [ATTACHMENT_EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The document is not discardable (BUDGET_ATTACHMENT.NOT_DISCARDABLE).',
      examples: [ATTACHMENT_EXAMPLES.NOT_DISCARDABLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'Invalid input parameters.',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async discardAttachment(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto) {
    try {
      const attachment = await this.discardService.discard(actor, params.id);
      return {
        attachment,
      };
    } catch (error) {
      throw toBudgetAttachmentApiException(error);
    }
  }
}
