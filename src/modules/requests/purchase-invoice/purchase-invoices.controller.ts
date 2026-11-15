import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
  PurchaseInvoiceIdParamDto,
  PurchaseInvoiceListQueryDto,
  PurchaseInvoiceListResponseDto,
  PurchaseInvoicePreviewBodyDto,
  PurchaseInvoicePreviewResponseDto,
  PurchaseInvoiceResponseDto,
  PurchaseInvoiceResubmitBodyDto,
  PurchaseInvoiceSubmitBodyDto,
} from './purchase-invoice.dto';
import {
  PURCHASE_INVOICE_ERROR_EXAMPLES as EXAMPLES,
  toPurchaseInvoiceApiException,
} from './purchase-invoice.http-errors';
import { toPreview } from './purchase-invoice.mapper';
import { PurchaseInvoiceQueryService } from './purchase-invoice-query.service';
import { PurchaseInvoiceSubmissionService } from './purchase-invoice-submission.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the IT Admin submits an invoice, and only the IT Admin and Finance read one.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

const SUBMIT_ERRORS = [
  ...AUTH_ERRORS,
  FORBIDDEN,
  {
    status: HttpStatus.NOT_FOUND,
    description:
      'The request or subscription does not exist or is not one the IT Admin works (PURCHASE_INVOICE.LINK_NOT_FOUND).',
    examples: [EXAMPLES.LINK_NOT_FOUND],
  },
  {
    status: HttpStatus.CONFLICT,
    description:
      'The request is not one whose purchase was approved to be spent (PURCHASE_INVOICE.REQUEST_NOT_PURCHASABLE), or the vendor has an invoice with this number that was not returned (PURCHASE_INVOICE.NUMBER_TAKEN).',
    examples: [EXAMPLES.REQUEST_NOT_PURCHASABLE, EXAMPLES.NUMBER_TAKEN],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The form is invalid (VALIDATION_ERROR: at least one file, at most twenty), the software has no vendor (PURCHASE_INVOICE.NO_VENDOR), or a file is not a finished purchase document of the person who submits it (PURCHASE_INVOICE.DOCUMENT_INVALID, with the reason in details).',
    examples: [VALIDATION_EXAMPLE, EXAMPLES.NO_VENDOR, EXAMPLES.DOCUMENT_INVALID],
  },
] as const;

/**
 * The IT Admin submits the invoice of a purchase with the request for the money, and reads what became of it; Finance reads every one and decides
 * (`PI-1`, `QĐ-111u`, `QĐ-111w`). The marks laid on an invoice never refuse it.
 */
@ApiTags('purchase-invoices')
@Controller({ path: 'purchase-invoices', version: '1' })
export class PurchaseInvoicesController {
  constructor(
    private readonly submissions: PurchaseInvoiceSubmissionService,
    private readonly queries: PurchaseInvoiceQueryService,
  ) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'purchaseInvoicePreview',
    summary: 'Read an invoice against its request or subscription before it is submitted',
  })
  @ApiSuccessResponse(PurchaseInvoicePreviewResponseDto, {
    message: 'PURCHASE_INVOICE.PREVIEWED',
    description:
      'What the invoice would be, with nothing kept: its label (new purchase, a period of the request, a renewal), the month and the period it pays for, whether the count and the price of one match what was approved or bought, the marks that would be laid on it, the Cost Center that would bear it and the commitment it would go into with what is left of it.',
  })
  @ApiErrorResponses(...SUBMIT_ERRORS)
  async preview(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: PurchaseInvoicePreviewBodyDto) {
    try {
      return toPreview(await this.submissions.preview(actor, body));
    } catch (error) {
      throw toPurchaseInvoiceApiException(error);
    }
  }

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'purchaseInvoiceSubmit',
    summary: 'Submit the invoice of a purchase for Finance to sign the money out',
  })
  @ApiSuccessResponse(PurchaseInvoiceResponseDto, {
    status: HttpStatus.CREATED,
    message: 'PURCHASE_INVOICE.SUBMITTED',
    description:
      'The invoice is kept as it was read against its request or subscription, with its files, and Finance is told. Nothing is spent until Finance signs. The amounts are what was taken out in dong; the count and the price of one are what the invoice says in the currency it states.',
  })
  @ApiErrorResponses(...SUBMIT_ERRORS)
  async submit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: PurchaseInvoiceSubmitBodyDto) {
    try {
      return await this.queries.detailOf(await this.submissions.submit(actor, body));
    } catch (error) {
      throw toPurchaseInvoiceApiException(error);
    }
  }

  @Post(':id/resubmission')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'purchaseInvoiceResubmit', summary: 'Submit a returned invoice again' })
  @ApiSuccessResponse(PurchaseInvoiceResponseDto, {
    status: HttpStatus.CREATED,
    message: 'PURCHASE_INVOICE.RESUBMITTED',
    description:
      'A new invoice for the same request or subscription that points back at the one Finance returned; the number of the returned one may come back. It says everything again, with its own files.',
  })
  @ApiErrorResponses(
    ...SUBMIT_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The invoice does not exist or was not submitted by the caller (PURCHASE_INVOICE.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The invoice was not returned (PURCHASE_INVOICE.NOT_RETURNED) or was already submitted again (PURCHASE_INVOICE.ALREADY_RESUBMITTED).',
      examples: [EXAMPLES.NOT_RETURNED, EXAMPLES.ALREADY_RESUBMITTED],
    },
  )
  async resubmit(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: PurchaseInvoiceIdParamDto,
    @Body() body: PurchaseInvoiceResubmitBodyDto,
  ) {
    try {
      return await this.queries.detailOf(await this.submissions.resubmit(actor, params.id, body));
    } catch (error) {
      throw toPurchaseInvoiceApiException(error);
    }
  }

  @Get()
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'purchaseInvoiceList', summary: 'List purchase invoices' })
  @ApiSuccessResponse(PurchaseInvoiceListResponseDto, {
    message: 'PURCHASE_INVOICE.LISTED',
    description:
      'The newest submitted first. Finance reads every invoice; the IT Admin reads the ones they submitted and the ones of the requests of the departments they work. Filter by state, label, vendor, subscription, request or the month of the period.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FORBIDDEN, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: PurchaseInvoiceListQueryDto) {
    return this.queries.page(actor, query);
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'purchaseInvoiceGet', summary: 'Read one purchase invoice' })
  @ApiSuccessResponse(PurchaseInvoiceResponseDto, {
    message: 'PURCHASE_INVOICE.READ',
    description:
      'The invoice with everything it says, its files, the reason it was returned and what was written when Finance signed it.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FORBIDDEN, {
    status: HttpStatus.NOT_FOUND,
    description: 'The invoice does not exist or is not one the caller may read (PURCHASE_INVOICE.NOT_FOUND).',
    examples: [EXAMPLES.NOT_FOUND],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: PurchaseInvoiceIdParamDto) {
    try {
      return await this.queries.get(actor, params.id);
    } catch (error) {
      throw toPurchaseInvoiceApiException(error);
    }
  }
}
