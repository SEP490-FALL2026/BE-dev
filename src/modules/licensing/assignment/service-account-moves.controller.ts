import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import {
  CancelMoveBodyDto,
  ListServiceAccountMovesQueryDto,
  ServiceAccountMoveIdParamDto,
  ServiceAccountMovePageResponseDto,
  ServiceAccountMoveResponseDto,
} from './service-account.dto';
import {
  SERVICE_ACCOUNT_ERROR_EXAMPLES as EXAMPLES,
  toServiceAccountApiException,
} from './service-account.http-errors';
import { ServiceAccountMoveViewService } from './service-account-move-view.service';
import { ServiceAccountMoveService } from './service-account-move.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The move does not exist (SERVICE_ACCOUNT_MOVE.NOT_FOUND).',
  examples: [EXAMPLES.MOVE_NOT_FOUND],
} as const;

/**
 * The proposals to move a service account to another department (`US-03-08`). Any signed-in person may ask: what a person sees and
 * may confirm is judged from the receiving department of the proposal, because the head of a department holds no role of their own.
 */
@ApiTags('service-account-moves')
@Controller({ path: 'service-account-moves', version: '1' })
export class ServiceAccountMovesController {
  constructor(
    private readonly moves: ServiceAccountMoveService,
    private readonly views: ServiceAccountMoveViewService,
  ) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'serviceAccountMoveList', summary: 'List the proposals to move a service account' })
  @ApiSuccessResponse(ServiceAccountMovePageResponseDto, {
    message: 'SERVICE_ACCOUNT_MOVE.LISTED',
    description:
      'A page of proposals, the earliest day first. An IT Admin sees every proposal and may filter by state. The head of a department sees the proposals into it that wait for them to confirm, and the fallback approver those into a department that has no head. Anyone else sees an empty page.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'A filter is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListServiceAccountMovesQueryDto) {
    try {
      return await this.views.list(actor, query);
    } catch (error) {
      throw toServiceAccountApiException(error);
    }
  }

  @Post(':id/confirmations')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'serviceAccountMoveConfirm', summary: 'Confirm the move of a service account' })
  @ApiSuccessResponse(ServiceAccountMoveResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SERVICE_ACCOUNT_MOVE.CONFIRMED',
    description:
      'The old assignment ends the day the move takes effect and the new one begins that day in the receiving department, owned and charged there, chained to the old one, with the same plan, subscription, account and reason. The seats taken do not change on any day; nothing is granted or revoked and no commitment moves. Who confirmed and in which role is recorded.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is not the head of the receiving department, nor the fallback approver while the department has no head (SERVICE_ACCOUNT_MOVE.NOT_CONFIRMER). Nothing is written.',
      examples: [EXAMPLES.NOT_CONFIRMER],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The move was confirmed or cancelled already (SERVICE_ACCOUNT_MOVE.NOT_PENDING), the day it takes effect has passed (MOVE_EFFECTIVE_DATE_PASSED: propose it again), or the account has ended meanwhile (LICENSE_ASSIGNMENT.NOT_OPEN).',
      examples: [EXAMPLES.NOT_PENDING, EXAMPLES.MOVE_EFFECTIVE_DATE_PASSED, EXAMPLES.ASSIGNMENT_NOT_OPEN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The id is invalid (VALIDATION_ERROR), or the department or the person no longer fits (SERVICE_ACCOUNT_MOVE.TARGET_DEPARTMENT_INVALID, RESPONSIBLE_INVALID, LICENSE_ASSIGNMENT.EXPECTED_END_REQUIRED).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.TARGET_DEPARTMENT_INVALID,
        EXAMPLES.MOVE_RESPONSIBLE_INVALID,
        EXAMPLES.EXPECTED_END_REQUIRED,
      ],
    },
  )
  async confirm(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: ServiceAccountMoveIdParamDto) {
    try {
      const move = await this.moves.confirm(actor, params.id);

      return (await this.views.wireOf([move]))[0];
    } catch (error) {
      throw toServiceAccountApiException(error);
    }
  }

  @Post(':id/cancellation')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'serviceAccountMoveCancel', summary: 'Cancel the proposal to move a service account' })
  @ApiSuccessResponse(ServiceAccountMoveResponseDto, {
    message: 'SERVICE_ACCOUNT_MOVE.CANCELLED',
    description:
      'The proposal that still waits is withdrawn with its reason; the service account stays where it is and nothing is changed.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin cancels a proposal.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The move was confirmed or cancelled already (SERVICE_ACCOUNT_MOVE.NOT_PENDING).',
      examples: [EXAMPLES.NOT_PENDING],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR) or has no reason (SERVICE_ACCOUNT_MOVE.REASON_REQUIRED).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.REASON_REQUIRED],
    },
  )
  async cancel(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ServiceAccountMoveIdParamDto,
    @Body() body: CancelMoveBodyDto,
  ) {
    try {
      const move = await this.moves.cancel(actor, params.id, body.reason ?? '');

      return (await this.views.wireOf([move]))[0];
    } catch (error) {
      throw toServiceAccountApiException(error);
    }
  }
}
