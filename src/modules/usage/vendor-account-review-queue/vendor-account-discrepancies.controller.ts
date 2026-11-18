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
import { VendorAccountDecisionService } from '../vendor-account-review/vendor-account-decision.service';
import {
  VendorAccountDecisionBodyDto,
  VendorAccountIdParamDto,
  VendorAccountListQueryDto,
  VendorAccountListResponseDto,
  VendorAccountResponseDto,
} from './vendor-account-review.dto';
import {
  VENDOR_ACCOUNT_ERROR_EXAMPLES as EXAMPLES,
  toVendorAccountApiException,
} from './vendor-account-review.http-errors';
import { VendorAccountReviewQueryService } from './vendor-account-review-query.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the IT Admin reviews the accounts at the vendors.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

/**
 * The review of the accounts at the vendors (`SBF-08`, RC-2, `QĐ-111y`): each difference between what the company has on record and what the vendor
 * shows, with both values, and the one decision of the IT Admin on it. A difference is made from what was found (an account with activity and no seat, an
 * identifier nobody owns, an invoice Finance suspects, a tool the collector sees that is not on the allowlist), never from a statement of a bank.
 */
@ApiTags('vendor-account-discrepancies')
@Controller({ path: 'vendor-account-discrepancies', version: '1' })
export class VendorAccountDiscrepanciesController {
  constructor(
    private readonly queries: VendorAccountReviewQueryService,
    private readonly decisions: VendorAccountDecisionService,
  ) {}

  @Get()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'vendorAccountDiscrepancyList',
    summary: 'List the differences of the accounts at the vendors',
  })
  @ApiSuccessResponse(VendorAccountListResponseDto, {
    message: 'VENDOR_ACCOUNT_DISCREPANCY.LISTED',
    description:
      'The newest seen first, each with what the company has on record and what the vendor shows, where it came from and the decision taken on it. Filter by state, source or application.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FORBIDDEN, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@Query() query: VendorAccountListQueryDto) {
    return this.queries.pageDiscrepancies(query);
  }

  @Post(':id/decision')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'vendorAccountDiscrepancyDecide',
    summary: 'Decide a difference of an account at the vendor',
  })
  @ApiSuccessResponse(VendorAccountResponseDto, {
    status: HttpStatus.CREATED,
    message: 'VENDOR_ACCOUNT_DISCREPANCY.DECIDED',
    description:
      'The IT Admin decides once, with a note. OUT_OF_PROCESS opens, in the same step, the case Finance or the IT Admin closes; the other decisions only record the choice, the Request and the revocation being done where they are done today.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FORBIDDEN,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The difference does not exist (VENDOR_ACCOUNT_DISCREPANCY.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The difference was decided already (VENDOR_ACCOUNT_DISCREPANCY.ALREADY_DECIDED).',
      examples: [EXAMPLES.ALREADY_DECIDED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The decision or the note is missing or not valid (VALIDATION_ERROR), or the difference is an invoice Finance closed as a suspicion, which is closed as a false alarm and never as a case outside the process (VENDOR_ACCOUNT_DISCREPANCY.DECISION_NOT_ALLOWED).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.DECISION_NOT_ALLOWED],
    },
  )
  async decide(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: VendorAccountIdParamDto,
    @Body() body: VendorAccountDecisionBodyDto,
  ) {
    try {
      return await this.queries.discrepancyOf(await this.decisions.decide(actor, params.id, body));
    } catch (error) {
      throw toVendorAccountApiException(error);
    }
  }
}
