import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
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
  ChangeLicenseLotResponsibleBodyDto,
  LicenseLotChangeResponseDto,
  LicenseLotDetailResponseDto,
  LicenseLotIdParamDto,
  LicenseLotPageResponseDto,
  ListLicenseLotsQueryDto,
  UpdateLicenseLotBodyDto,
} from './license-lot.dto';
import { LICENSE_LOT_ERROR_EXAMPLES as EXAMPLES, toLicenseLotApiException } from './license-lot.http-errors';
import { toLicenseLotWire } from './license-lot.mapper';
import { LicenseLotService } from './license-lot.service';
import { LicenseLotResponsibleService } from './license-lot-responsible.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const READERS = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the IT Admin, Finance and the Super Admin read lots.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The lot does not exist (LICENSE_LOT.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;
const INVALID_ID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id is not a UUID (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

/**
 * The lots of licenses of a K4 plan (`QĐ-115n`): what the IT Admin buys in one purchase, with the licenses it gave out and the ones left. Any IT Admin, Finance and
 * the Super Admin read them; only the IT Admin who answers for a lot changes it; only the Super Admin changes who answers for it (`QĐ-118d/f/l`). The lot is made
 * and its keys are put in it by the routes of the vault of keys (`POST /license-lots` and `POST /license-lots/{id}/keys`).
 */
@ApiTags('license-lots')
@Controller({ path: 'license-lots', version: '1' })
export class LicenseLotsController {
  constructor(
    private readonly lots: LicenseLotService,
    private readonly responsible: LicenseLotResponsibleService,
  ) {}

  @Get()
  @RequireRoles('IT_ADMIN', 'FINANCE', 'SUPER_ADMIN')
  @ApiOperation({ operationId: 'licenseLotList', summary: 'List the lots of licenses' })
  @ApiSuccessResponse(LicenseLotPageResponseDto, {
    message: 'LICENSE_LOT.LISTED',
    description:
      'A page of lots, the newest purchase first, optionally of one plan: for each the licenses bought, taken and free, the keys in the store, the keys that can be given at once, the price of a license and what the free ones are worth.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@Query() query: ListLicenseLotsQueryDto) {
    try {
      const page = await this.lots.list(query);

      return { ...page, items: page.items.map(toLicenseLotWire) };
    } catch (error) {
      throw toLicenseLotApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN', 'FINANCE', 'SUPER_ADMIN')
  @ApiOperation({ operationId: 'licenseLotGet', summary: 'Get a lot of licenses' })
  @ApiSuccessResponse(LicenseLotDetailResponseDto, {
    message: 'LICENSE_LOT.FETCHED',
    description:
      'The lot with its plan, the licenses bought, taken and free, the keys it holds, its price, its contract and workspace, who answers for it, its note, the request it was bought for and what Finance confirmed its invoice at.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, INVALID_ID)
  async get(@Param() params: LicenseLotIdParamDto) {
    try {
      return toLicenseLotWire(await this.lots.get(params.id));
    } catch (error) {
      throw toLicenseLotApiException(error);
    }
  }

  @Patch(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'licenseLotUpdate', summary: 'Change the contract, the note or the price of a lot' })
  @ApiSuccessResponse(LicenseLotDetailResponseDto, {
    message: 'LICENSE_LOT.UPDATED',
    description:
      'The lot as it is now. The version the caller read (expectedUpdatedAt) is required. A contract left for another, or for none, names its reason; the price is changed only while no key of the lot was given and no invoice of it was confirmed.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin who answers for the lot changes it (LICENSE_LOT.NOT_RESPONSIBLE).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_RESPONSIBLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The lot changed since it was read (LICENSE_LOT.STALE), or its price is locked (LICENSE_LOT.PRICE_LOCKED).',
      examples: [EXAMPLES.STALE, EXAMPLES.PRICE_LOCKED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the reason of a change of contract is missing (LICENSE_LOT.CONTRACT_REASON_REQUIRED) or the contract is another vendor’s (LICENSE_LOT.CONTRACT_VENDOR_MISMATCH).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.CONTRACT_REASON_REQUIRED, EXAMPLES.CONTRACT_VENDOR_MISMATCH],
    },
  )
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LicenseLotIdParamDto,
    @Body() body: UpdateLicenseLotBodyDto,
  ) {
    try {
      const { expectedUpdatedAt, ...changes } = body;

      return toLicenseLotWire(
        await this.lots.update(actor, params.id, { ...changes, expectedUpdatedAt: new Date(expectedUpdatedAt) }),
      );
    } catch (error) {
      throw toLicenseLotApiException(error);
    }
  }

  @Post(':id/responsible-it-admin')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({
    operationId: 'licenseLotResponsibleItAdminChange',
    summary: 'Name the IT Admin who answers for a lot',
  })
  @ApiSuccessResponse(LicenseLotChangeResponseDto, {
    message: 'LICENSE_LOT.RESPONSIBLE_CHANGED',
    description:
      'The lot with the IT Admin named; changed is false when they already answered for it and nothing was written. Only the Super Admin changes who answers for a lot.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the Super Admin changes who answers for a lot.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or the person named is not an IT Admin who works now (LICENSE_LOT.RESPONSIBLE_NOT_IT_ADMIN).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.RESPONSIBLE_NOT_IT_ADMIN],
    },
  )
  async changeResponsible(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LicenseLotIdParamDto,
    @Body() body: ChangeLicenseLotResponsibleBodyDto,
  ) {
    try {
      const result = await this.responsible.change(actor, params.id, body);

      return { lot: toLicenseLotWire(result.lot), changed: result.changed };
    } catch (error) {
      throw toLicenseLotApiException(error);
    }
  }
}
