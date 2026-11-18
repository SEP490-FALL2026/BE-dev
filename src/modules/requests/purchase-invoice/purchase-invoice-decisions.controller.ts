import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
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
import { PurchaseInvoiceConfirmationService } from './confirmation/purchase-invoice-confirmation.service';
import { PurchaseInvoiceReturnBodyDto } from './purchase-invoice-decision.dto';
import { PurchaseInvoiceIdParamDto, PurchaseInvoiceResponseDto } from './purchase-invoice.dto';
import {
  PURCHASE_INVOICE_ERROR_EXAMPLES as EXAMPLES,
  toPurchaseInvoiceApiException,
} from './purchase-invoice.http-errors';
import { PurchaseInvoiceQueryService } from './purchase-invoice-query.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const FINANCE_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only Finance signs or returns a purchase invoice.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The invoice does not exist (PURCHASE_INVOICE.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

/**
 * Finance signs the money out for a purchase invoice, or returns it with a reason (`PI-1.6`, `QĐ-111u`). Each is decided once; there is no step
 * where the IT Admin confirms that the money arrived (`QĐ-111v`).
 */
@ApiTags('purchase-invoices')
@Controller({ path: 'purchase-invoices', version: '1' })
export class PurchaseInvoiceDecisionsController {
  constructor(
    private readonly decisions: PurchaseInvoiceConfirmationService,
    private readonly queries: PurchaseInvoiceQueryService,
  ) {}

  @Post(':id/confirmation')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'purchaseInvoiceConfirm', summary: 'Sign the money out for a purchase invoice' })
  @ApiSuccessResponse(PurchaseInvoiceResponseDto, {
    status: HttpStatus.CREATED,
    message: 'PURCHASE_INVOICE.CONFIRMED',
    description:
      'Finance signs: the signer and the time are kept and the one invoice of the purchase is written, booked to the month and the year of the period (into the commitment of the request when the department that bears it is its own, as an expense of that department otherwise, as a line of the subscription for a renewal). The IT Admin who submitted it is told. Never signed by the person who submitted it.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The invoice was decided already (PURCHASE_INVOICE.NOT_SUBMITTED), the person signing is the one who submitted it (PURCHASE_INVOICE.SAME_PERSON), the vendor already has an invoice with this number (PURCHASE_INVOICE.NUMBER_TAKEN), or there is nowhere to book it (PURCHASE_INVOICE.NO_PLACE).',
      examples: [EXAMPLES.NOT_SUBMITTED, EXAMPLES.SAME_PERSON, EXAMPLES.NUMBER_TAKEN, EXAMPLES.NO_PLACE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is not an id (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async confirm(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: PurchaseInvoiceIdParamDto) {
    try {
      return await this.queries.detailOf(await this.decisions.confirm(actor, params.id));
    } catch (error) {
      throw toPurchaseInvoiceApiException(error);
    }
  }

  @Post(':id/return')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'purchaseInvoiceReturn', summary: 'Return a purchase invoice with a reason' })
  @ApiSuccessResponse(PurchaseInvoiceResponseDto, {
    status: HttpStatus.CREATED,
    message: 'PURCHASE_INVOICE.RETURNED',
    description:
      'Finance returns the invoice with the reason, which the IT Admin who submitted it reads and is told of. Nothing is written to the budget. The IT Admin submits it again as a new invoice that points back at this one.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The invoice was decided already (PURCHASE_INVOICE.NOT_SUBMITTED).',
      examples: [EXAMPLES.NOT_SUBMITTED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The reason is missing or blank, or the id is not an id (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async giveBack(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: PurchaseInvoiceIdParamDto,
    @Body() body: PurchaseInvoiceReturnBodyDto,
  ) {
    try {
      return await this.queries.detailOf(await this.decisions.giveBack(actor, params.id, body.reason));
    } catch (error) {
      throw toPurchaseInvoiceApiException(error);
    }
  }
}
