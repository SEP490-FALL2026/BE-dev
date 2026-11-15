import { Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PolicyCodeParamDto } from '../library/library.dto';
import { AcknowledgementReportService } from './acknowledgement-report.service';
import {
  AcknowledgementReportQueryDto,
  AcknowledgementReportResponseDto,
  AcknowledgementResponseDto,
} from './acknowledgement.dto';
import {
  ACKNOWLEDGEMENT_ERROR_EXAMPLES as EXAMPLES,
  toAcknowledgementApiException,
} from './acknowledgement.http-errors';
import { AcknowledgementService } from './acknowledgement.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/** The reader says they have read the policy in force; the Super Admin sees who has and who has not. */
@ApiTags('policies')
@Controller({ path: 'policies/:code/acknowledgements', version: '1' })
export class AcknowledgementController {
  constructor(
    private readonly acknowledgements: AcknowledgementService,
    private readonly reports: AcknowledgementReportService,
  ) {}

  @Post()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'policyAcknowledgementCreate', summary: 'Acknowledge the policy in force' })
  @ApiSuccessResponse(AcknowledgementResponseDto, {
    status: HttpStatus.CREATED,
    message: 'POLICY_ACKNOWLEDGEMENT.RECORDED',
    description:
      'The acknowledgement of the version in force. Saying it again changes nothing and answers with alreadyAcknowledged. No other route refuses an account that has not acknowledged.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'No such policy (POLICY.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The policy has no published version (POLICY.NOT_PUBLISHED), or it applies to no role of this account (POLICY.ACKNOWLEDGEMENT_NOT_REQUIRED).',
      examples: [EXAMPLES.NOT_PUBLISHED, EXAMPLES.NOT_REQUIRED],
    },
  )
  async acknowledge(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: PolicyCodeParamDto) {
    try {
      const result = await this.acknowledgements.acknowledge(actor, params.code);

      return { ...result, acknowledgedAt: result.acknowledgedAt?.toISOString() ?? null };
    } catch (error) {
      throw toAcknowledgementApiException(error);
    }
  }

  @Get()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'policyAcknowledgementReport', summary: 'Who has acknowledged the policy in force' })
  @ApiSuccessResponse(AcknowledgementReportResponseDto, {
    message: 'POLICY_ACKNOWLEDGEMENT.REPORT_FETCHED',
    description:
      'A page of the accounts of the roles the version in force applies to, by employee code, each with done or pending and the latest version it acknowledged.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only the Super Admin.', examples: [FORBIDDEN_EXAMPLE] },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'No such policy (POLICY.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The policy has no published version (POLICY.NOT_PUBLISHED).',
      examples: [EXAMPLES.NOT_PUBLISHED],
    },
  )
  async report(@Param() params: PolicyCodeParamDto, @Query() query: AcknowledgementReportQueryDto) {
    try {
      const report = await this.reports.report(params.code, query.page, query.pageSize);

      return {
        policyCode: report.policyCode,
        currentVersionNumber: report.currentVersionNumber,
        items: report.rows.map((row) => ({
          ...row,
          acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
        })),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          totalItems: report.total,
          totalPages: Math.ceil(report.total / query.pageSize),
        },
      };
    } catch (error) {
      throw toAcknowledgementApiException(error);
    }
  }
}
