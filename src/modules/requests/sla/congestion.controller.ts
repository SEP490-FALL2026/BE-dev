import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
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
  CongestionIncidentBodyDto,
  CongestionIncidentListQueryDto,
  CongestionIncidentListResponseDto,
  CongestionIncidentResponseDto,
  CongestionListQueryDto,
  CongestionListResponseDto,
  CongestionStepsQueryDto,
  CongestionStepsResponseDto,
} from './congestion.dto';
import { CONGESTION_ERROR_EXAMPLES, toCongestionApiException } from './congestion.http-errors';
import { CongestionService } from './congestion.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const SUPER_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the Super Admin reads the board and records incidents (AUTHORIZATION.FORBIDDEN).',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const INVALID_QUERY = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

/**
 * The board of the steps that wait too long, for the Super Admin: who is holding how many, how late, and the incidents written down
 * about them. The Super Admin sees and records; nothing on this page moves a step to somebody else, approves it or rejects it.
 */
@ApiTags('step-congestion')
@Controller({ path: 'step-congestion', version: '1' })
export class CongestionController {
  constructor(private readonly congestion: CongestionService) {}

  @Get()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'stepCongestionList', summary: 'List who holds how many steps and how late they are' })
  @ApiSuccessResponse(CongestionListResponseDto, {
    message: 'STEP_CONGESTION.LISTED',
    description:
      'A row for each person who holds steps still waiting, the one with most steps first, and one row without a person for the steps nobody holds. Each row has the number of steps, how many of them were reminded at least once, the age of the oldest in working days, the number of reminders, the day of the last one and whether the person holds more steps than the alert threshold. It shows no amount and no figure of a budget.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, INVALID_QUERY)
  async list(@Query() query: CongestionListQueryDto) {
    try {
      return await this.congestion.board(query);
    } catch (error) {
      throw toCongestionApiException(error);
    }
  }

  @Get('steps')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'stepCongestionStepList', summary: 'List the steps waiting on one person' })
  @ApiSuccessResponse(CongestionStepsResponseDto, {
    message: 'STEP_CONGESTION.STEPS_LISTED',
    description:
      'The steps that wait on the person named, the oldest first, with the kind of step, since when, its deadline and how many reminders it had. Without a person, the steps nobody holds.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, INVALID_QUERY)
  async steps(@Query() query: CongestionStepsQueryDto) {
    try {
      return await this.congestion.steps(query);
    } catch (error) {
      throw toCongestionApiException(error);
    }
  }

  @Post('incidents')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({
    operationId: 'stepCongestionIncidentRecord',
    summary: 'Record an incident about steps that wait too long',
  })
  @ApiSuccessResponse(CongestionIncidentResponseDto, {
    status: HttpStatus.CREATED,
    message: 'STEP_CONGESTION.INCIDENT_RECORDED',
    description:
      'Writes down what happened about a person whose steps wait (or about the steps nobody holds), with how many steps wait and how old the oldest is at this moment. It changes no step: the holder stays and nothing is approved or rejected.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    SUPER_ADMIN_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The person is not an employee of the organization (STEP_CONGESTION.HOLDER_NOT_FOUND).',
      examples: [CONGESTION_ERROR_EXAMPLES.HOLDER_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The form is invalid (VALIDATION_ERROR): the description is required and at most 1000 characters, and the person is an id or null. Nothing is written.',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async record(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CongestionIncidentBodyDto) {
    try {
      return { incident: await this.congestion.recordIncident(actor, body) };
    } catch (error) {
      throw toCongestionApiException(error);
    }
  }

  @Get('incidents')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'stepCongestionIncidentList', summary: 'List the incidents recorded about steps' })
  @ApiSuccessResponse(CongestionIncidentListResponseDto, {
    message: 'STEP_CONGESTION.INCIDENTS_LISTED',
    description:
      'The incidents, the newest first, with the person, the description and the number of steps and the age of the oldest when it was written down.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN_ONLY, INVALID_QUERY)
  async incidents(@Query() query: CongestionIncidentListQueryDto) {
    try {
      return await this.congestion.incidents(query);
    } catch (error) {
      throw toCongestionApiException(error);
    }
  }
}
