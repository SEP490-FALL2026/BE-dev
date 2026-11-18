import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
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
import { BUDGET_ERROR_EXAMPLES as EXAMPLES, toBudgetApiException } from '../budget/budget.http-errors';
import { CommitmentIdParamDto } from '../commitment/commitment.dto';
import { InvoiceListQueryDto, InvoiceListResponseDto } from './invoice.dto';
import { InvoiceService } from './invoice.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The commitment does not exist (BUDGET.COMMITMENT_NOT_FOUND).',
  examples: [EXAMPLES.COMMITMENT_NOT_FOUND],
} as const;

/**
 * The invoices of a commitment, read by Finance only (`US-12-02`, `C-16`): the IT Admin and every other role cannot read them. Finance
 * records none by hand: an invoice enters the books when Finance signs a purchase invoice of the IT Admin (`PI-1`, `B6`), and is added
 * and never changed or deleted.
 */
@ApiTags('budget-commitments')
@Controller({ path: 'budget-commitments', version: '1' })
export class BudgetInvoicesController {
  constructor(private readonly invoices: InvoiceService) {}

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
