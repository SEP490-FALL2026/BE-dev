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
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OutOfProcessCaseClosureService } from '../vendor-account-review/out-of-process-case-closure.service';
import {
  OutOfProcessClosureBodyDto,
  OutOfProcessListQueryDto,
  OutOfProcessListResponseDto,
  OutOfProcessResponseDto,
  VendorAccountIdParamDto,
} from './vendor-account-review.dto';
import {
  VENDOR_ACCOUNT_ERROR_EXAMPLES as EXAMPLES,
  toVendorAccountApiException,
} from './vendor-account-review.http-errors';
import { VendorAccountReviewQueryService } from './vendor-account-review-query.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only Finance and the IT Admin read and close the cases outside the process.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

/** What closing a case outside the process answers besides the shared authentication answers. */
const CLOSE_ERROR_RESPONSES = [
  {
    status: HttpStatus.FORBIDDEN,
    description:
      'Only Finance and the IT Admin close the cases outside the process, and only Finance records the money already spent (OUT_OF_PROCESS_CASE.FINANCE_ONLY) and only the IT Admin closes a case as revoked (OUT_OF_PROCESS_CASE.IT_ADMIN_ONLY).',
    examples: [FORBIDDEN_EXAMPLE, EXAMPLES.FINANCE_ONLY, EXAMPLES.IT_ADMIN_ONLY],
  },
  {
    status: HttpStatus.NOT_FOUND,
    description: 'The case does not exist (OUT_OF_PROCESS_CASE.NOT_FOUND).',
    examples: [EXAMPLES.CASE_NOT_FOUND],
  },
  {
    status: HttpStatus.CONFLICT,
    description:
      'The case was closed already (OUT_OF_PROCESS_CASE.ALREADY_CLOSED), or the vendor has an invoice with its number (OUT_OF_PROCESS_CASE.NUMBER_TAKEN).',
    examples: [EXAMPLES.CASE_ALREADY_CLOSED, EXAMPLES.NUMBER_TAKEN],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The note is missing (VALIDATION_ERROR); money is recorded with no proof of payment (OUT_OF_PROCESS_CASE.DOCUMENT_REQUIRED), with a file that is not a finished proof of payment of the person who closes it (OUT_OF_PROCESS_CASE.DOCUMENT_INVALID), without an amount or a Cost Center (OUT_OF_PROCESS_CASE.RECORD_FIELDS_MISSING) or with them on an outcome that records none (OUT_OF_PROCESS_CASE.RECORD_FIELDS_NOT_ALLOWED); the amount has digits after the point, is too large or is not above nothing (MONEY_SCALE_EXCEEDED, MONEY_OUT_OF_RANGE); the software has no vendor (OUT_OF_PROCESS_CASE.NO_VENDOR); the Cost Center does not exist (OUT_OF_PROCESS_CASE.COST_CENTER_NOT_FOUND); or a revocation is of a case that is not on a company asset (OUT_OF_PROCESS_CASE.REVOKE_NOT_ALLOWED) or lacks the cancelled renewal and its proof (OUT_OF_PROCESS_CASE.REVOKE_EVIDENCE_MISSING).',
    examples: [
      VALIDATION_EXAMPLE,
      EXAMPLES.DOCUMENT_REQUIRED,
      EXAMPLES.DOCUMENT_INVALID,
      EXAMPLES.RECORD_FIELDS_MISSING,
      EXAMPLES.RECORD_FIELDS_NOT_ALLOWED,
      EXAMPLES.MONEY_SCALE_EXCEEDED,
      EXAMPLES.MONEY_OUT_OF_RANGE,
      EXAMPLES.NO_VENDOR,
      EXAMPLES.COST_CENTER_NOT_FOUND,
      EXAMPLES.REVOKE_NOT_ALLOWED,
      EXAMPLES.REVOKE_EVIDENCE_MISSING,
    ],
  },
] as const;

/**
 * What happened outside the process (`SBF-07a`, RC-2, `QĐ-111y`, R-45, C-4): a case is opened by the decision OUT_OF_PROCESS on a difference of an
 * account at the vendor and closed once as a false alarm, as money already spent that has a proof of payment of the company, or as a report only.
 */
@ApiTags('out-of-process-cases')
@Controller({ path: 'out-of-process-cases', version: '1' })
export class OutOfProcessCasesController {
  constructor(
    private readonly queries: VendorAccountReviewQueryService,
    private readonly closures: OutOfProcessCaseClosureService,
  ) {}

  @Get()
  @RequireRoles('FINANCE', 'IT_ADMIN')
  @ApiOperation({ operationId: 'outOfProcessCaseList', summary: 'List the cases outside the process' })
  @ApiSuccessResponse(OutOfProcessListResponseDto, {
    message: 'OUT_OF_PROCESS_CASE.LISTED',
    description: 'The newest opened first. Filter by state or outcome.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FORBIDDEN, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@Query() query: OutOfProcessListQueryDto) {
    return this.queries.pageCases(query);
  }

  @Post(':id/closure')
  @RequireRoles('FINANCE', 'IT_ADMIN')
  @ApiOperation({ operationId: 'outOfProcessCaseClose', summary: 'Close a case outside the process' })
  @ApiSuccessResponse(OutOfProcessResponseDto, {
    status: HttpStatus.CREATED,
    message: 'OUT_OF_PROCESS_CASE.CLOSED',
    description:
      'The case is closed once with a note. RECORD_SPENT, which only Finance closes with, records the money already spent as one expense in dong with no commitment, in the same step: it needs at least one proof of payment of the company, an amount and a Cost Center or UNALLOCATED. With no proof the case can only be a false alarm or a report.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, ...CLOSE_ERROR_RESPONSES)
  async close(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: VendorAccountIdParamDto,
    @Body() body: OutOfProcessClosureBodyDto,
  ) {
    try {
      const closed = await this.closures.close(actor, params.id, {
        outcome: body.outcome,
        note: body.note,
        documentIds: body.documentIds ?? [],
        renewalCancelled: body.renewalCancelled === true,
        amount: body.amount,
        costCenterId:
          body.costCenterId === undefined ? undefined : body.costCenterId === 'UNALLOCATED' ? null : body.costCenterId,
      });

      return await this.queries.caseOf(closed);
    } catch (error) {
      throw toVendorAccountApiException(error);
    }
  }
}
