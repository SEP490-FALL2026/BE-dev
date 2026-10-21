import { Body, Controller, Get, HttpStatus, Param, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { TaxProfileView } from '../../finance/finance.types';
import {
  DeclareTaxProfileBodyDto,
  DeclaredTaxProfileResponseDto,
  ListVendorsQueryDto,
  TaxEstimateQueryDto,
  TaxEstimateResponseDto,
  TaxProfileHistoryQueryDto,
  TaxProfileHistoryResponseDto,
  TaxProfileResponseDto,
  VendorIdParamDto,
  VendorPageResponseDto,
} from './vendor.dto';
import { toVendorApiException } from './vendor.http-errors';
import { VendorQueryService } from './vendor-query.service';
import { VendorTaxService } from './vendor-tax.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const READERS = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the IT Admin and Finance read vendors and their tax profiles.',
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The vendor does not exist (VENDOR.NOT_FOUND).',
} as const;
const INVALID_ID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id or the query is invalid (VALIDATION_ERROR).',
} as const;

const toProfileWire = (profile: TaxProfileView) => ({ ...profile, declaredAt: profile.declaredAt.toISOString() });

/**
 * The vendors of the organization and their tax profile (`US-12-09`). Finance declares the profile; the IT Admin reads
 * it to complete an evaluation. The department head, employees, the spending approver and the Super Admin see nothing
 * of it (AC-6, `SoD-1`). The system only estimates tax: no route computes a tax payable, files or marks a deduction,
 * and none deletes anything.
 */
@ApiTags('vendors')
@Controller({ path: 'vendors', version: '1' })
export class VendorsController {
  constructor(
    private readonly vendors: VendorQueryService,
    private readonly taxes: VendorTaxService,
  ) {}

  @Get()
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'vendorList', summary: 'List vendors' })
  @ApiSuccessResponse(VendorPageResponseDto, {
    message: 'VENDOR.LISTED',
    description:
      'A page of vendors by name, each saying whether its tax profile is declared; taxProfile=MISSING lists the vendors Finance still has to declare.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, INVALID_ID)
  async list(@Query() query: ListVendorsQueryDto) {
    try {
      return await this.vendors.list(query);
    } catch (error) {
      throw toVendorApiException(error);
    }
  }

  @Get(':id/tax-profile')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'vendorTaxProfileGet', summary: 'Get the tax profile of a vendor' })
  @ApiSuccessResponse(TaxProfileResponseDto, {
    message: 'VENDOR_TAX_PROFILE.FETCHED',
    description:
      'The newest declaration, or status MISSING with the default profile the vendor is estimated by until one is declared.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, INVALID_ID)
  async getTaxProfile(@Param() params: VendorIdParamDto) {
    try {
      const view = await this.taxes.get(params.id);

      return { ...view, profile: view.profile ? toProfileWire(view.profile) : null };
    } catch (error) {
      throw toVendorApiException(error);
    }
  }

  @Put(':id/tax-profile')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'vendorTaxProfileSet', summary: 'Declare the tax profile of a vendor' })
  @ApiSuccessResponse(DeclaredTaxProfileResponseDto, {
    message: 'VENDOR_TAX_PROFILE.DECLARED',
    description:
      'The profile is the current version; a declaration that differs from the current one is a new version and changed says so. The group defaults to T2.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only Finance declares a tax profile.' },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or a tax line is refused: VENDOR_TAX_PROFILE.TAX_TYPE_INVALID, TAX_TYPE_DUPLICATE, RATE_INVALID or TOO_MANY_LINES.',
    },
  )
  async declareTaxProfile(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: VendorIdParamDto,
    @Body() body: DeclareTaxProfileBodyDto,
  ) {
    try {
      const { profile, changed } = await this.taxes.declare(actor, params.id, body);

      return { profile: toProfileWire(profile), changed };
    } catch (error) {
      throw toVendorApiException(error);
    }
  }

  @Get(':id/tax-profile/history')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'vendorTaxProfileHistory', summary: 'List the declarations of a tax profile' })
  @ApiSuccessResponse(TaxProfileHistoryResponseDto, {
    message: 'VENDOR_TAX_PROFILE.HISTORY_LISTED',
    description: 'A page of the declarations, newest first, each with who declared it and when. None is ever changed.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, INVALID_ID)
  async history(@Param() params: VendorIdParamDto, @Query() query: TaxProfileHistoryQueryDto) {
    try {
      const page = await this.taxes.history(params.id, query);

      return { items: page.items.map(toProfileWire), pagination: page.pagination };
    } catch (error) {
      throw toVendorApiException(error);
    }
  }

  @Get(':id/tax-estimate')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'vendorTaxEstimate', summary: 'Estimate the tax on a price before tax' })
  @ApiSuccessResponse(TaxEstimateResponseDto, {
    message: 'VENDOR_TAX_PROFILE.ESTIMATED',
    description:
      'The estimated tax split into the deductible part and the real cost, and the estimated cost. basis and label say whether it comes from the vendor profile or from the default one. Nothing is stored; this is an estimate, not a tax payable.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The query is invalid (VALIDATION_ERROR), the amount is malformed, has too many decimals or is out of range (MONEY_*), or the currency is not supported (CURRENCY_NOT_SUPPORTED).',
  })
  async estimate(@Param() params: VendorIdParamDto, @Query() query: TaxEstimateQueryDto) {
    try {
      return await this.taxes.estimate(params.id, query);
    } catch (error) {
      throw toVendorApiException(error);
    }
  }
}
