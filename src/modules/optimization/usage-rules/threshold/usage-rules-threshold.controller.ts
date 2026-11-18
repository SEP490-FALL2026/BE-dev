import { Body, Controller, Delete, Get, HttpStatus, Param, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  type ErrorResponseDeclaration,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  ThresholdBodyDto,
  ThresholdDeletedResponseDto,
  ThresholdListQueryDto,
  ThresholdListResponseDto,
  ThresholdParamDto,
  ThresholdResponseDto,
} from './usage-rules-threshold.dto';
import { THRESHOLD_ERROR_EXAMPLES as EXAMPLES, toThresholdApiException } from './usage-rules-threshold.http-errors';
import { UsageRulesThresholdService } from './usage-rules-threshold.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The body or the id is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const forbidden = (who: string): ErrorResponseDeclaration => ({
  status: HttpStatus.FORBIDDEN,
  description: `Only ${who} may do this.`,
  examples: [FORBIDDEN_EXAMPLE],
});

/** The days without use that make a seat watched, reviewed and acted on, per application (`FR-4.13`). */
@ApiTags('ghost-seats')
@Controller({ version: '1' })
export class UsageRulesThresholdController {
  constructor(private readonly thresholds: UsageRulesThresholdService) {}

  @Get('ghost-seat-thresholds')
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({
    operationId: 'ghostSeatThresholdList',
    summary: 'List the thresholds of days without use set for applications',
  })
  @ApiSuccessResponse(ThresholdListResponseDto, {
    message: 'GHOST_SEAT_THRESHOLDS.LISTED',
    description:
      'The applications that have thresholds of their own; the others use the parameter of the organization.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, forbidden('the Super Admin or an IT Admin'), INVALID)
  async list(@Query() query: ThresholdListQueryDto) {
    try {
      return await this.thresholds.list(query);
    } catch (error) {
      throw toThresholdApiException(error);
    }
  }

  @Put('ghost-seat-thresholds/:applicationId')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({
    operationId: 'ghostSeatThresholdSet',
    summary: 'Set the thresholds of days without use of an application',
  })
  @ApiSuccessResponse(ThresholdResponseDto, {
    message: 'GHOST_SEAT_THRESHOLD.SET',
    description:
      'The thresholds apply from the next weekly pass; the change is audited with the days before and after.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    forbidden('the Super Admin'),
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The application does not exist (GHOST_SEAT.APPLICATION_NOT_FOUND).',
      examples: [EXAMPLES.APPLICATION_NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The days do not rise (GHOST_SEAT.THRESHOLD_ORDER), the application is internal (GHOST_SEAT.APPLICATION_INTERNAL) or the body is invalid.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.THRESHOLD_ORDER, EXAMPLES.APPLICATION_INTERNAL],
    },
  )
  async set(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ThresholdParamDto,
    @Body() body: ThresholdBodyDto,
  ) {
    try {
      return await this.thresholds.set(actor, params.applicationId, body);
    } catch (error) {
      throw toThresholdApiException(error);
    }
  }

  @Delete('ghost-seat-thresholds/:applicationId')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'ghostSeatThresholdDelete', summary: 'Remove the thresholds of an application' })
  @ApiSuccessResponse(ThresholdDeletedResponseDto, {
    message: 'GHOST_SEAT_THRESHOLD.DELETED',
    description: 'The application goes back to the thresholds of the organization from the next weekly pass.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, forbidden('the Super Admin'), INVALID, {
    status: HttpStatus.NOT_FOUND,
    description: 'The application has no thresholds of its own (GHOST_SEAT.APPLICATION_NOT_FOUND).',
    examples: [EXAMPLES.APPLICATION_NOT_FOUND],
  })
  async remove(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: ThresholdParamDto) {
    try {
      return await this.thresholds.remove(actor, params.applicationId);
    } catch (error) {
      throw toThresholdApiException(error);
    }
  }
}
