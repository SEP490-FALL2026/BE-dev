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
import { InvoiceDiscrepancyClosureService } from '../invoice-discrepancy/invoice-discrepancy-closure.service';
import {
  InvoiceDiscrepancyClosureBodyDto,
  InvoiceDiscrepancyIdParamDto,
  InvoiceDiscrepancyListQueryDto,
  InvoiceDiscrepancyListResponseDto,
  InvoiceDiscrepancyResponseDto,
} from './invoice-discrepancy.dto';
import {
  INVOICE_DISCREPANCY_ERROR_EXAMPLES as EXAMPLES,
  toInvoiceDiscrepancyApiException,
} from './invoice-discrepancy.http-errors';
import { InvoiceDiscrepancyQueryService } from './invoice-discrepancy-query.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The case does not exist or is not one the caller may read (INVOICE_DISCREPANCY.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

/**
 * The cases of the invoices that differ from what was approved or bought, which Finance works and the IT Admin who submitted the invoice reads
 * (`RC-1`, `QĐ-111y`, `R-29`). A case is opened when Finance signs such an invoice; here it is read and closed.
 */
@ApiTags('invoice-discrepancies')
@Controller({ path: 'invoice-discrepancies', version: '1' })
export class InvoiceDiscrepanciesController {
  constructor(
    private readonly queries: InvoiceDiscrepancyQueryService,
    private readonly closures: InvoiceDiscrepancyClosureService,
  ) {}

  @Get()
  @RequireRoles('FINANCE', 'IT_ADMIN')
  @ApiOperation({ operationId: 'invoiceDiscrepancyList', summary: 'List the cases of invoices that differ' })
  @ApiSuccessResponse(InvoiceDiscrepancyListResponseDto, {
    message: 'INVOICE_DISCREPANCY.LISTED',
    description:
      'The newest opened first, each with both sides of what differs: the seats and the price of one the invoice states against the ones approved or bought. Finance reads every case; the IT Admin the ones of the invoices they submitted and of the requests of the departments they work. Filter by state or outcome.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance and the IT Admin read the cases.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: InvoiceDiscrepancyListQueryDto) {
    return this.queries.page(actor, query);
  }

  @Get(':id')
  @RequireRoles('FINANCE', 'IT_ADMIN')
  @ApiOperation({ operationId: 'invoiceDiscrepancyGet', summary: 'Read one case of an invoice that differs' })
  @ApiSuccessResponse(InvoiceDiscrepancyResponseDto, {
    message: 'INVOICE_DISCREPANCY.READ',
    description: 'The case with both sides of what differs and, once closed, how and why it was closed.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance and the IT Admin read the cases.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is not an id (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: InvoiceDiscrepancyIdParamDto) {
    try {
      return await this.queries.get(actor, params.id);
    } catch (error) {
      throw toInvoiceDiscrepancyApiException(error);
    }
  }

  @Post(':id/closure')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'invoiceDiscrepancyClose', summary: 'Close a case of an invoice that differs' })
  @ApiSuccessResponse(InvoiceDiscrepancyResponseDto, {
    status: HttpStatus.CREATED,
    message: 'INVOICE_DISCREPANCY.CLOSED',
    description:
      'Finance closes the case with an outcome, a reason and the difference it works out in dong. A suspicion that the software was paid for outside the process is sent, in the same step, to the review of the accounts at the vendor. A case is closed once.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance closes a case.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The case was closed already (INVOICE_DISCREPANCY.ALREADY_CLOSED).',
      examples: [EXAMPLES.ALREADY_CLOSED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The reason is missing or blank, the outcome or the amount is not valid (VALIDATION_ERROR), the amount has digits after the point or is too large (MONEY_SCALE_EXCEEDED, MONEY_OUT_OF_RANGE), or the difference is below nothing or, for a suspicion, nothing (INVOICE_DISCREPANCY.DIFFERENCE_INVALID).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.MONEY_SCALE_EXCEEDED,
        EXAMPLES.MONEY_OUT_OF_RANGE,
        EXAMPLES.DIFFERENCE_INVALID,
      ],
    },
  )
  async close(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: InvoiceDiscrepancyIdParamDto,
    @Body() body: InvoiceDiscrepancyClosureBodyDto,
  ) {
    try {
      const closed = await this.closures.close(actor, params.id, {
        outcome: body.outcome,
        reason: body.reason,
        differenceAmount: body.differenceAmount.amount,
      });

      return await this.queries.detailOf(closed);
    } catch (error) {
      throw toInvoiceDiscrepancyApiException(error);
    }
  }
}
