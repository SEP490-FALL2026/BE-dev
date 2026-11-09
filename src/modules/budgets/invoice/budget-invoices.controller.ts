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
import { BUDGET_ERROR_EXAMPLES as EXAMPLES, toBudgetApiException } from '../budget/budget.http-errors';
import { CommitmentIdParamDto } from '../commitment/commitment.dto';
import { InvoiceBodyDto, InvoiceListQueryDto, InvoiceListResponseDto, InvoiceRecordedResponseDto } from './invoice.dto';
import { InvoiceService } from './invoice.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The commitment does not exist (BUDGET.COMMITMENT_NOT_FOUND).',
  examples: [EXAMPLES.COMMITMENT_NOT_FOUND],
} as const;

/**
 * The invoices of a commitment, recorded by Finance only (`US-12-02`, `C-16`): the IT Admin and every other role cannot record
 * or read them. An invoice is added and never changed or deleted.
 */
@ApiTags('budget-commitments')
@Controller({ path: 'budget-commitments', version: '1' })
export class BudgetInvoicesController {
  constructor(private readonly invoices: InvoiceService) {}

  @Post(':id/invoices')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetCommitmentInvoiceRecord', summary: 'Record an invoice against a commitment' })
  @ApiSuccessResponse(InvoiceRecordedResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_COMMITMENT.INVOICE_RECORDED',
    description:
      "Finance records an invoice for a commitment: the price before tax, the tax that can be deducted (shown apart, not an expense) and the tax that cannot (an expense). The commitment goes down by the price, as far as it still holds anything, and becomes an expense when nothing is left; the spend of the Cost Center and year rises by what the invoice cost. The currency is the commitment's and the vendor is the one of its request. An invoice is never refused for being over the budget; one for more than the commitment allowed is flagged. The answer gives the invoice and the commitment as it stands now.",
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance records an invoice.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The vendor already has an invoice with this number (INVOICE.DUPLICATE), the vendor of the commitment cannot be told (INVOICE.VENDOR_UNKNOWN), or the commitment was released (INVOICE.COMMITMENT_RELEASED).',
      examples: [EXAMPLES.INVOICE_DUPLICATE, EXAMPLES.INVOICE_VENDOR_UNKNOWN, EXAMPLES.INVOICE_COMMITMENT_RELEASED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR): a missing number or date, an amount that is not a number, or a currency named by the client; or an amount the currency cannot hold (MONEY_SCALE_EXCEEDED: more decimals than the currency has; MONEY_OUT_OF_RANGE: a price that is not more than nothing, a tax below nothing, or an amount that is too large).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.MONEY_SCALE_EXCEEDED, EXAMPLES.MONEY_OUT_OF_RANGE],
    },
  )
  async record(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: CommitmentIdParamDto,
    @Body() body: InvoiceBodyDto,
  ) {
    try {
      return await this.invoices.record(actor, params.id, body);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get(':id/invoices')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetCommitmentInvoiceList', summary: 'List the invoices of a commitment' })
  @ApiSuccessResponse(InvoiceListResponseDto, {
    message: 'BUDGET_COMMITMENT.INVOICES_LISTED',
    description:
      'The invoices recorded against the commitment, the newest first: the number and date, the price before tax, both kinds of tax, what the invoice cost, how it stands against what the commitment allowed, who recorded it and when.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only Finance reads the invoices.', examples: [FORBIDDEN_EXAMPLE] },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@Param() params: CommitmentIdParamDto, @Query() query: InvoiceListQueryDto) {
    try {
      return await this.invoices.page(params.id, query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }
}
