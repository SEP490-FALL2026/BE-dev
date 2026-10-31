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
import { AssessmentQueueQueryDto, AssessmentQueueResponseDto } from './assessment-queue.dto';
import { AssessmentQueueService } from './assessment-queue.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/**
 * Where an IT Admin finds the assessments of new software that wait for IT. The list is read only; the assessment of a request is read,
 * saved, completed or refused by the routes of the request, which keep their own rules.
 */
@ApiTags('access-requests')
@Controller({ version: '1' })
export class AssessmentQueueController {
  constructor(private readonly queue: AssessmentQueueService) {}

  @Get('assessment-queue')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'assessmentQueueList', summary: 'List the proposals waiting for IT assessment' })
  @ApiSuccessResponse(AssessmentQueueResponseDto, {
    message: 'ASSESSMENT_QUEUE.LISTED',
    description:
      'The proposals of software that is not in the catalog whose assessment has come to IT, in the departments the caller is IT Admin in charge of and in the ones nobody who works is in charge of, the oldest first. Each says what the software is, who asked, who holds the step (the caller, another IT Admin, or nobody), whether the caller may fill it, how far the assessment has come, what completing it would do now and whether a quote is recorded. A proposal that is completed, refused, withdrawn or closed is not listed. The assessment itself is read and filled by the routes of the request.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin reads the proposals that wait for IT assessment.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: AssessmentQueueQueryDto) {
    try {
      return await this.queue.page(actor, query);
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
