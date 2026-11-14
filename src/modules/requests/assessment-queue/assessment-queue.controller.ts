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
import { AssessmentDecisionsQueryDto, AssessmentDecisionsResponseDto } from './assessment-decisions.dto';
import { AssessmentDecisionsService } from './assessment-decisions.service';
import {
  AssessmentQueueDepartmentsQueryDto,
  AssessmentQueueDepartmentsResponseDto,
  AssessmentQueueQueryDto,
  AssessmentQueueResponseDto,
} from './assessment-queue.dto';
import { AssessmentQueueService } from './assessment-queue.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/**
 * Where an IT Admin finds the assessments of new software that wait for IT. The list is read only; the assessment of a request is read,
 * saved, completed or refused by the routes of the request, which keep their own rules.
 */
@ApiTags('access-requests')
@Controller({ version: '1' })
export class AssessmentQueueController {
  constructor(
    private readonly queue: AssessmentQueueService,
    private readonly decisions: AssessmentDecisionsService,
  ) {}

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

  @Get('assessment-queue/departments')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'assessmentQueueDepartmentList',
    summary: 'Count the proposals waiting for IT assessment by department',
  })
  @ApiSuccessResponse(AssessmentQueueDepartmentsResponseDto, {
    message: 'ASSESSMENT_QUEUE.DEPARTMENTS_LISTED',
    description:
      'The departments the caller reads (the ones they are IT Admin in charge of and the ones nobody who works is in charge of) that have proposals waiting for IT assessment, each with how many, the department with the most first. A department with none waiting is not listed. The same proposals as the list, counted: filter the list by departmentId to read one.',
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
  async departments(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Query() query: AssessmentQueueDepartmentsQueryDto,
  ) {
    try {
      return await this.queue.departments(actor, query);
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }

  @Get('assessment-decisions')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'assessmentDecisionList', summary: 'List the assessments IT has decided' })
  @ApiSuccessResponse(AssessmentDecisionsResponseDto, {
    message: 'ASSESSMENT_DECISIONS.LISTED',
    description:
      'The proposals whose assessment has been decided, in the departments the caller reads, the newest decision first: completed (the request went on to the spend decision) or refused at the gate. Each says what the software is, who asked, who decided and when, how it ended and, for a refusal, its kind and the reason. The assessment itself is read by the route of the request.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin reads the decided assessments.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async decided(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: AssessmentDecisionsQueryDto) {
    try {
      return await this.decisions.page(actor, query);
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
