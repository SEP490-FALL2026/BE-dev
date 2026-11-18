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
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { toAccessRequestApiException } from '../access-request/access-request.http-errors';
import { GrantQueueQueryDto, GrantQueueResponseDto } from './grant-queue.dto';
import { GrantQueueService } from './grant-queue.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/** The IT Admin reads the approved requests to carry out, person by person, and where each grant stands (`US-03-02`, `QĐ-111m`). */
@ApiTags('grant-queue')
@Controller({ version: '1' })
export class GrantQueueController {
  constructor(private readonly queue: GrantQueueService) {}

  @Get('grant-queue')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'grantQueueList', summary: 'List the approved requests to carry out, person by person' })
  @ApiSuccessResponse(GrantQueueResponseDto, {
    message: 'GRANT_QUEUE.LISTED',
    description:
      'The requests approved in full, one row for each person, of the departments the IT Admin works only (the ones that name them in charge, and the ones nobody usable is in charge of); a filter that names a person of another department is an empty answer. Each row says where the grant of its person stands (state: WAITING, EXECUTING or DONE) and, once a task exists, which task (execution: its state, why it failed and what may be done next), who asked, the tool with its logo, the department, and the day the access ends for a person who is not staff. Without state every state is listed, the waiting ones first, then kept together by the person and by when they were sent; planId and state=WAITING list what waits for one plan.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin reads what waits to be carried out.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async grantQueue(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: GrantQueueQueryDto) {
    try {
      return await this.queue.page(actor, query);
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
