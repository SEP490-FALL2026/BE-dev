import { Body, Controller, Get, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  APPLICATION_ERROR_EXAMPLES as EXAMPLES,
  toApplicationApiException,
} from '../catalog-entry/application.http-errors';
import {
  ConfirmRetirementBodyDto,
  RetirementConfirmationResponseDto,
  RetirementParamDto,
  RetirementResponseDto,
  RetiredResponseDto,
} from './application-retirement.dto';
import type { RetirementConfirmationRecord } from './application-retirement.repo';
import { ApplicationRetirementService } from './application-retirement.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The application does not exist (APPLICATION.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

const confirmationWire = (confirmation: RetirementConfirmationRecord) => ({
  id: confirmation.id,
  applicationId: confirmation.applicationId,
  businessOwnerEmployeeId: confirmation.businessOwnerEmployeeId,
  note: confirmation.note,
  recordedBy: confirmation.recordedByAppUserId,
  recordedAt: confirmation.recordedAt.toISOString(),
});

/**
 * Retiring an application (`US-04-01` AC-8, AC-9, AC-14): the confirmation of the Business Owner, a look at what would stop
 * it, and the retirement itself. Nothing here revokes a seat, cancels a subscription or brings an application back.
 */
@ApiTags('applications')
@Controller({ path: 'applications', version: '1' })
export class ApplicationRetirementController {
  constructor(private readonly retirement: ApplicationRetirementService) {}

  @Post(':id/retirement-confirmations')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'applicationRetirementConfirm',
    summary: 'Record the confirmation of the Business Owner to retire an application',
  })
  @ApiSuccessResponse(RetirementConfirmationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'APPLICATION.RETIREMENT_CONFIRMED',
    description:
      'The confirmation of the Business Owner of today, with its content and who recorded it, kept for good. The audit trail names the person who recorded it, the Business Owner and the content.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin records the confirmation.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The application is retired already (APPLICATION.ALREADY_RETIRED).',
      examples: [EXAMPLES.ALREADY_RETIRED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the person is not the Business Owner of today or has left (APPLICATION.RETIREMENT_NOT_BUSINESS_OWNER), or the note is blank (APPLICATION.RETIREMENT_NOTE_REQUIRED).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.RETIREMENT_NOT_BUSINESS_OWNER, EXAMPLES.RETIREMENT_NOTE_REQUIRED],
    },
  )
  async confirm(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RetirementParamDto,
    @Body() body: ConfirmRetirementBodyDto,
  ) {
    try {
      return { confirmation: confirmationWire(await this.retirement.confirm(actor, params.id, body)) };
    } catch (error) {
      throw toApplicationApiException(error);
    }
  }

  @Get(':id/retirement')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({
    operationId: 'applicationRetirementGet',
    summary: 'See what stands between an application and its retirement',
  })
  @ApiSuccessResponse(RetirementResponseDto, {
    message: 'APPLICATION.RETIREMENT_FETCHED',
    description:
      'The newest 50 confirmations recorded and how many there are, whether the Business Owner of today has confirmed, the first 50 assignments and running term subscriptions that would stop the retirement with their totals and the number of assignments per plan, and whether it would go through now.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin and Finance read it.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async get(@Param() params: RetirementParamDto) {
    try {
      const view = await this.retirement.get(params.id);

      return {
        retirement: {
          ...view,
          retiredAt: view.retiredAt?.toISOString() ?? null,
          confirmations: view.confirmations.map(confirmationWire),
        },
      };
    } catch (error) {
      throw toApplicationApiException(error);
    }
  }

  @Post(':id/retire')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'applicationRetire', summary: 'Retire an application' })
  @ApiSuccessResponse(RetiredResponseDto, {
    message: 'APPLICATION.RETIRED',
    description:
      'The application is retired for good, on the confirmation of its Business Owner. Nothing is revoked or cancelled for it: an application that something still holds is refused instead.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin retires an application.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The application is retired already (APPLICATION.ALREADY_RETIRED), or assignments or running term subscriptions hold it (APPLICATION.RETIREMENT_BLOCKED, details.assignments and details.subscriptions list the first 50 of them, details.assignmentTotal and details.subscriptionTotal count them all).',
      examples: [EXAMPLES.ALREADY_RETIRED, EXAMPLES.RETIREMENT_BLOCKED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The id is invalid (VALIDATION_ERROR), or the Business Owner of today has not confirmed (APPLICATION.RETIREMENT_NEEDS_CONFIRMATION).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.RETIREMENT_NEEDS_CONFIRMATION],
    },
  )
  async retire(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: RetirementParamDto) {
    try {
      await this.retirement.retire(actor, params.id);

      return { id: params.id, status: 'RETIRED' as const };
    } catch (error) {
      throw toApplicationApiException(error);
    }
  }
}
