import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ControlledWaitListQueryDto, ControlledWaitListResponseDto } from './controlled-wait.dto';
import { ControlledWaitQueryService } from './controlled-wait-query.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const ROLE_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the Super Admin and an IT Admin read the queue (AUTHORIZATION.FORBIDDEN).',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

/**
 * The steps that wait under control because nobody valid can hold them. The Super Admin reads every one and an IT Admin the
 * requests of the departments they are in charge of: they are the people who put it right by setting a role, naming a head or
 * naming an IT Admin, so the row says what is missing and shows no amount and no figure of a budget.
 */
@ApiTags('controlled-waits')
@Controller({ version: '1' })
export class ControlledWaitController {
  constructor(private readonly waits: ControlledWaitQueryService) {}

  @Get('controlled-waits')
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({ operationId: 'controlledWaitList', summary: 'List the steps that wait for somebody valid' })
  @ApiSuccessResponse(ControlledWaitListResponseDto, {
    message: 'CONTROLLED_WAIT.LISTED',
    description:
      'The steps nobody valid can hold, the longest waiting first: the request, the kind of step, why it waits, what ends the wait, since when, who sent it and for which department, and when the people who can put it right were told. The Super Admin reads all of them, an IT Admin those of the departments they are in charge of.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, ROLE_ONLY, INVALID)
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ControlledWaitListQueryDto) {
    try {
      return await this.waits.page(actor, query);
    } catch (error) {
      // A database that cannot answer is a 503 like on every guarded route; anything else goes to the global filter.
      throw toUnavailableApiException(error) ?? error;
    }
  }
}
