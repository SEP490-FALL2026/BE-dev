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
  PurchaseInvoiceMissingPeriodListResponseDto,
  PurchaseInvoiceMissingPeriodQueryDto,
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
import { PurchaseInvoiceMissingPeriodsQueryService } from './purchase-invoice-missing-periods-query.service';
import { PurchaseInvoiceQueryService } from './purchase-invoice-query.service';
import { PurchaseInvoiceSubmissionService } from './purchase-invoice-submission.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the IT Admin submits an invoice, and only the IT Admin and Finance read one.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;

const LINK_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The request or subscription does not exist or is not one the IT Admin works (PURCHASE_INVOICE.LINK_NOT_FOUND); any IT Admin works a subscription of the shared pool.',
  examples: [EXAMPLES.LINK_NOT_FOUND],
} as const;

const REFUSED_STATE =
  'The request is not one whose purchase was approved to be spent (PURCHASE_INVOICE.REQUEST_NOT_PURCHASABLE)';
const TAKEN_NUMBER = 'the vendor has an invoice with this number that was not returned (PURCHASE_INVOICE.NUMBER_TAKEN)';
const NO_PLACE =
  'the plan of the request has no subscription of the pool that can be taken from today, so there is nowhere to book the invoice (PURCHASE_INVOICE.NO_PLACE)';
const NOT_PURCHASABLE_OR_NO_PLACE = {
  status: HttpStatus.CONFLICT,
  description: `${REFUSED_STATE}, or ${NO_PLACE}.`,
  examples: [EXAMPLES.REQUEST_NOT_PURCHASABLE, EXAMPLES.NO_PLACE],
} as const;
const NOT_PURCHASABLE_TAKEN_OR_NO_PLACE = {
  status: HttpStatus.CONFLICT,
  description: `${REFUSED_STATE}, ${TAKEN_NUMBER}, or ${NO_PLACE}.`,
  examples: [EXAMPLES.REQUEST_NOT_PURCHASABLE, EXAMPLES.NUMBER_TAKEN, EXAMPLES.NO_PLACE],
} as const;
const NOT_PURCHASABLE_TAKEN_OR_NOT_RETURNED = {
  status: HttpStatus.CONFLICT,
  description: `${REFUSED_STATE}, ${TAKEN_NUMBER}, ${NO_PLACE}, the invoice was not returned (PURCHASE_INVOICE.NOT_RETURNED) or was already submitted again (PURCHASE_INVOICE.ALREADY_RESUBMITTED).`,
  examples: [
    EXAMPLES.REQUEST_NOT_PURCHASABLE,
    EXAMPLES.NUMBER_TAKEN,
    EXAMPLES.NO_PLACE,
    EXAMPLES.NOT_RETURNED,
    EXAMPLES.ALREADY_RESUBMITTED,
  ],
} as const;

const UNREADABLE_MONEY =
  'an amount is not a plain number (VALIDATION_ERROR), has more decimals than its currency (MONEY_SCALE_EXCEEDED), is too large, below nothing, or nothing where it must be more (MONEY_OUT_OF_RANGE), or a currency is not one the system prices in (CURRENCY_NOT_SUPPORTED)';
const MONEY_EXAMPLES = [EXAMPLES.MONEY_SCALE_EXCEEDED, EXAMPLES.MONEY_OUT_OF_RANGE, EXAMPLES.CURRENCY_NOT_SUPPORTED];

const INVALID_PREVIEW = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: `The form is invalid (VALIDATION_ERROR), ${UNREADABLE_MONEY}, or the software has no vendor (PURCHASE_INVOICE.NO_VENDOR).`,
  examples: [VALIDATION_EXAMPLE, ...MONEY_EXAMPLES, EXAMPLES.NO_VENDOR],
} as const;
const INVALID_SUBMISSION = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: `The form is invalid (VALIDATION_ERROR: at least one file, at most twenty), ${UNREADABLE_MONEY}, the software has no vendor (PURCHASE_INVOICE.NO_VENDOR), or a file is not a finished purchase document of the person who submits it (PURCHASE_INVOICE.DOCUMENT_INVALID, with the reason in details).`,
  examples: [VALIDATION_EXAMPLE, ...MONEY_EXAMPLES, EXAMPLES.NO_VENDOR, EXAMPLES.DOCUMENT_INVALID],
} as const;

const PREVIEW_ERRORS = [
  ...AUTH_ERRORS,
  FORBIDDEN,
  LINK_NOT_FOUND,
  NOT_PURCHASABLE_OR_NO_PLACE,
  INVALID_PREVIEW,
] as const;
const SUBMIT_ERRORS = [
  ...AUTH_ERRORS,
  FORBIDDEN,
  LINK_NOT_FOUND,
  NOT_PURCHASABLE_TAKEN_OR_NO_PLACE,
  INVALID_SUBMISSION,
] as const;
const RESUBMIT_ERRORS = [
  ...AUTH_ERRORS,
  FORBIDDEN,
  {
    status: HttpStatus.NOT_FOUND,
    description:
      'The invoice does not exist or was not submitted by the caller (PURCHASE_INVOICE.NOT_FOUND), or its request or subscription is not one the IT Admin works (PURCHASE_INVOICE.LINK_NOT_FOUND).',
    examples: [EXAMPLES.LINK_NOT_FOUND, EXAMPLES.NOT_FOUND],
  },
  NOT_PURCHASABLE_TAKEN_OR_NOT_RETURNED,
  INVALID_SUBMISSION,
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
    private readonly missingPeriods: PurchaseInvoiceMissingPeriodsQueryService,
  ) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'purchaseInvoicePreview',
    summary: 'Read an invoice against its request before it is submitted',
  })
  @ApiSuccessResponse(PurchaseInvoicePreviewResponseDto, {
    message: 'PURCHASE_INVOICE.PREVIEWED',
    description:
      'What the invoice would be, with nothing kept: its label (new purchase, a period of the request, a renewal), the month and the period it pays for, whether the count and the price of one match what was approved or bought, the marks that would be laid on it, the Cost Center that would bear it and the commitment it would go into with what is left of it.',
  })
  @ApiErrorResponses(...PREVIEW_ERRORS)
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
      'The invoice is kept as it was read against its request or subscription (any IT Admin may submit the invoice of a subscription period, as it has no owning department; one for a request is submitted by the IT Admin of the department of the request), with its files, and Finance is told. Nothing is spent until Finance signs. The amounts are what was taken out in dong; the count and the price of one are what the invoice says in the currency it states.',
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
  @ApiErrorResponses(...RESUBMIT_ERRORS)
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

  /** Declared before `:id`, so that `missing-periods` is a route and not an id. */
  @Get('missing-periods')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({
    operationId: 'purchaseInvoiceMissingPeriodList',
    summary: 'List the periods that have no invoice',
  })
  @ApiSuccessResponse(PurchaseInvoiceMissingPeriodListResponseDto, {
    message: 'PURCHASE_INVOICE.MISSING_PERIODS_LISTED',
    description:
      'Each period of a right paid by the month (a request for months of use of a plan bought by the month, while a seat of it is held) or by the cycle of a subscription whose invoice has not been submitted by the fifth working day, the payment day being the first when it is a working day. The oldest due day first. An invoice that was returned does not count. Finance reads every period; the IT Admin the ones of the departments they work and of the shared pool, which every IT Admin works.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FORBIDDEN, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async missing(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Query() query: PurchaseInvoiceMissingPeriodQueryDto,
  ) {
    return this.missingPeriods.pageFor(actor, query);
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'purchaseInvoiceGet', summary: 'Read one purchase invoice' })
  @ApiSuccessResponse(PurchaseInvoiceResponseDto, {
    message: 'PURCHASE_INVOICE.READ',
    description:
      'The invoice with everything it says, its files, the reason it was returned and what was written when Finance signed it.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FORBIDDEN,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is not an id (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The invoice does not exist or is not one the caller may read (PURCHASE_INVOICE.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
  )
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: PurchaseInvoiceIdParamDto) {
    try {
      return await this.queries.get(actor, params.id);
    } catch (error) {
      throw toPurchaseInvoiceApiException(error);
    }
  }
}
