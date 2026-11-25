import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CreateLicenseLotBodyDto, LicenseLotCreatedResponseDto } from './license-lot-create.dto';
import { ProvisioningNotInChargeError } from '../provisioning/provisioning.errors';
import { toLicenseKeyApiException } from '../license-key/license-key.http-errors';
import { LicenseKeyLotRequestNotOpenError } from '../license-key/license-key.errors';
import { LicenseLotCreateService } from './license-lot-create.service';

const notInCharge = new ApiException(HttpStatus.FORBIDDEN, {
  code: 'LICENSE_LOT.NOT_IN_CHARGE',
  message:
    'Only the IT Admin who acts for the department of the person the request is for makes a lot for that request.',
});
const requestRequired = new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
  code: 'LICENSE_LOT.REQUEST_REQUIRED',
  message: new LicenseKeyLotRequestNotOpenError().message,
});
const refusedLot = (status: HttpStatus, code: string, message: string) => new ApiException(status, { code, message });
const LOT_REFUSALS = {
  workspaceNotFound: refusedLot(HttpStatus.NOT_FOUND, 'WORKSPACE.NOT_FOUND', 'The workspace does not exist.'),
  requestHasLot: refusedLot(
    HttpStatus.CONFLICT,
    'LICENSE_LOT.REQUEST_HAS_LOT',
    'This request already has a lot of licenses.',
  ),
  planNotK4: refusedLot(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'LICENSE_LOT.PLAN_NOT_K4',
    'A lot is of a plan of license keys bought once.',
  ),
  purposeNotAvailable: refusedLot(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'LICENSE_LOT.PURPOSE_NOT_AVAILABLE',
    'This purpose is not available for the plan of the lot.',
  ),
  workspaceRequired: refusedLot(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'LICENSE_LOT.WORKSPACE_REQUIRED',
    'The vendor has several workspaces: name the one the lot is held in.',
  ),
  workspaceVendorMismatch: refusedLot(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'LICENSE_LOT.WORKSPACE_VENDOR_MISMATCH',
    'The workspace is held at another vendor than the plan.',
  ),
  contractVendorMismatch: refusedLot(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'LICENSE_LOT.CONTRACT_VENDOR_MISMATCH',
    'The contract is with another vendor than the plan.',
  ),
  priceNotVnd: refusedLot(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'LICENSE_LOT.PRICE_NOT_VND',
    'The unit price of a lot is entered in dong only.',
  ),
};

/** What this route answers for the two refusals only licensing knows; the rest is the answer of the lot routes of the catalog. */
function toLotCreateApiException(error: unknown): unknown {
  if (error instanceof ProvisioningNotInChargeError) return notInCharge;
  if (error instanceof LicenseKeyLotRequestNotOpenError) return requestRequired;

  return toLicenseKeyApiException(error);
}

/**
 * Makes a lot of licenses of a K4 plan (`QĐ-115n`, W3-24). The lot is read and changed by the routes of `license-lots` in the catalog; it is made here because a lot
 * bought for a request is judged against the grant task of that request, which licensing owns.
 */
@ApiTags('license-lots')
@Controller({ path: 'license-lots', version: '1' })
export class LicenseLotCreateController {
  constructor(private readonly lots: LicenseLotCreateService) {}

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'licenseLotCreate', summary: 'Make a lot of licenses of a K4 plan' })
  @ApiSuccessResponse(LicenseLotCreatedResponseDto, {
    status: HttpStatus.CREATED,
    message: 'LICENSE_LOT.CREATED',
    description:
      'The lot is made and the IT Admin who made it answers for it; read it with the id. A lot for a request names the request and needs the grant task of it still open for the plan; a lot kept in stock is of a plan whose key goes on a machine; a plan with an admin console is held in the workspace of its vendor.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an IT Admin makes a lot, and for a request only the one who acts for the department of the person the request is for (LICENSE_LOT.NOT_IN_CHARGE).',
      examples: [FORBIDDEN_EXAMPLE, errorExampleOf(notInCharge)],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the plan is not a plan of keys bought once, the purpose does not fit the plan, a lot for a request has no open grant task, or the workspace, the contract or the price does not fit (LICENSE_LOT.PLAN_NOT_K4, LICENSE_LOT.PURPOSE_NOT_AVAILABLE, LICENSE_LOT.REQUEST_REQUIRED, LICENSE_LOT.WORKSPACE_REQUIRED, LICENSE_LOT.CONTRACT_VENDOR_MISMATCH).',
      examples: [
        VALIDATION_EXAMPLE,
        errorExampleOf(requestRequired),
        errorExampleOf(LOT_REFUSALS.planNotK4),
        errorExampleOf(LOT_REFUSALS.purposeNotAvailable),
        errorExampleOf(LOT_REFUSALS.workspaceRequired),
        errorExampleOf(LOT_REFUSALS.workspaceVendorMismatch),
        errorExampleOf(LOT_REFUSALS.contractVendorMismatch),
        errorExampleOf(LOT_REFUSALS.priceNotVnd),
      ],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The workspace named does not exist (WORKSPACE.NOT_FOUND).',
      examples: [errorExampleOf(LOT_REFUSALS.workspaceNotFound)],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The request already has a lot; a request has at most one (LICENSE_LOT.REQUEST_HAS_LOT).',
      examples: [errorExampleOf(LOT_REFUSALS.requestHasLot)],
    },
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateLicenseLotBodyDto) {
    try {
      return await this.lots.create(actor, body);
    } catch (error) {
      throw toLotCreateApiException(error);
    }
  }
}
