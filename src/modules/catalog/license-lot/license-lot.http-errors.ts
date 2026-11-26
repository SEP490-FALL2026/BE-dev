import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  CurrencyNotSupportedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
} from '../../../core/money/money.errors';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import {
  WorkspaceNotFoundError,
  WorkspaceRequiredError,
  WorkspaceVendorMismatchError,
} from '../workspace/workspace.errors';
import { LicenseLotAlreadyInvoicedError, LicenseLotReservedForRequestError } from '../public/catalog.errors';
import {
  LicenseLotContractReasonRequiredError,
  LicenseLotKeysExceedLicensesError,
  LicenseLotMismatchError,
  LicenseLotNotFoundError,
  LicenseLotNotResponsibleError,
  LicenseLotPriceNotVndError,
  LicenseLotPlanNotK4Error,
  LicenseLotPriceLockedError,
  LicenseLotPurposeNotAvailableError,
  LicenseLotRequestRequiredError,
  LicenseLotRequestTakenError,
  LicenseLotResponsibleNotItAdminError,
  LicenseLotStaleError,
  LicenseLotVendorAdminsRequiredError,
} from './license-lot.errors';

const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;
const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** What the database says of a lot it refuses, as the answer of the route that wrote it. */
function ofMismatch(error: LicenseLotMismatchError): ApiException {
  switch (error.rule) {
    case 'PLAN':
      return refuse(UNPROCESSABLE, 'LICENSE_LOT.PLAN_NOT_K4', error.message);
    case 'PURPOSE_BINDING':
      return refuse(UNPROCESSABLE, 'LICENSE_LOT.PURPOSE_NOT_AVAILABLE', error.message);
    case 'WORKSPACE_REQUIRED':
      return refuse(UNPROCESSABLE, 'LICENSE_LOT.WORKSPACE_REQUIRED', error.message);
    case 'WORKSPACE_VENDOR':
      return refuse(UNPROCESSABLE, 'LICENSE_LOT.WORKSPACE_VENDOR_MISMATCH', error.message);
    case 'CONTRACT_VENDOR':
      return refuse(UNPROCESSABLE, 'LICENSE_LOT.CONTRACT_VENDOR_MISMATCH', error.message);
  }
}

/** Maps the errors of the routes of the lots to their HTTP answers; the money errors keep the answers of the subscription routes. */
export function toLicenseLotApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof LicenseLotNotFoundError)
    return refuse(HttpStatus.NOT_FOUND, 'LICENSE_LOT.NOT_FOUND', error.message);
  if (error instanceof LicenseLotNotResponsibleError) {
    return refuse(HttpStatus.FORBIDDEN, 'LICENSE_LOT.NOT_RESPONSIBLE', error.message);
  }
  if (error instanceof LicenseLotStaleError) {
    return refuse(HttpStatus.CONFLICT, 'LICENSE_LOT.STALE', error.message, {
      currentUpdatedAt: error.currentUpdatedAt.toISOString(),
    });
  }
  if (error instanceof LicenseLotPriceLockedError)
    return refuse(HttpStatus.CONFLICT, 'LICENSE_LOT.PRICE_LOCKED', error.message);
  if (error instanceof LicenseLotAlreadyInvoicedError)
    return refuse(HttpStatus.CONFLICT, 'LICENSE_LOT.ALREADY_INVOICED', error.message);
  if (error instanceof LicenseLotReservedForRequestError)
    return refuse(HttpStatus.CONFLICT, 'LICENSE_LOT.RESERVED_FOR_REQUEST', error.message, { lotId: error.lotId });
  if (error instanceof LicenseLotRequestTakenError) {
    return refuse(HttpStatus.CONFLICT, 'LICENSE_LOT.REQUEST_HAS_LOT', error.message);
  }
  if (error instanceof LicenseLotContractReasonRequiredError) {
    return refuse(UNPROCESSABLE, 'LICENSE_LOT.CONTRACT_REASON_REQUIRED', error.message);
  }
  if (error instanceof LicenseLotPlanNotK4Error) return refuse(UNPROCESSABLE, 'LICENSE_LOT.PLAN_NOT_K4', error.message);
  if (error instanceof LicenseLotPurposeNotAvailableError) {
    return refuse(UNPROCESSABLE, 'LICENSE_LOT.PURPOSE_NOT_AVAILABLE', error.message);
  }
  if (error instanceof LicenseLotRequestRequiredError) {
    return refuse(UNPROCESSABLE, 'LICENSE_LOT.REQUEST_REQUIRED', error.message);
  }
  if (error instanceof LicenseLotResponsibleNotItAdminError) {
    return refuse(UNPROCESSABLE, 'LICENSE_LOT.RESPONSIBLE_NOT_IT_ADMIN', error.message);
  }
  if (error instanceof LicenseLotKeysExceedLicensesError) {
    return refuse(UNPROCESSABLE, 'LICENSE_LOT.KEYS_EXCEED_LICENSES', error.message, {
      licenseCount: error.licenseCount,
      keysNotWithdrawn: error.keysNotWithdrawn,
    });
  }
  if (error instanceof LicenseLotMismatchError) return ofMismatch(error);
  if (error instanceof WorkspaceRequiredError) {
    return refuse(UNPROCESSABLE, 'LICENSE_LOT.WORKSPACE_REQUIRED', error.message, {
      workspaceIds: [...error.workspaceIds],
    });
  }
  if (error instanceof WorkspaceVendorMismatchError) {
    return refuse(UNPROCESSABLE, 'LICENSE_LOT.WORKSPACE_VENDOR_MISMATCH', error.message);
  }
  if (error instanceof WorkspaceNotFoundError)
    return refuse(HttpStatus.NOT_FOUND, 'WORKSPACE.NOT_FOUND', error.message);

  if (error instanceof LicenseLotPriceNotVndError) {
    return refuse(UNPROCESSABLE, 'LICENSE_LOT.PRICE_NOT_VND', error.message, { currency: error.currency });
  }
  if (error instanceof LicenseLotVendorAdminsRequiredError) {
    return refuse(UNPROCESSABLE, 'LICENSE_LOT.VENDOR_ADMINS_REQUIRED', error.message, {
      planId: error.planId,
      given: error.given,
      required: error.required,
    });
  }
  const money = toMoneyApiException(error);
  if (money !== error) return money;

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toLicenseLotApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const LICENSE_LOT_ERROR_EXAMPLES = {
  NOT_FOUND: example(new LicenseLotNotFoundError()),
  NOT_RESPONSIBLE: example(new LicenseLotNotResponsibleError()),
  // The same stand-in date as `SUBSCRIPTION.STALE`: an example never carries a real timestamp.
  STALE: example(new LicenseLotStaleError(new Date('2026-01-01T00:00:00.000Z'))),
  PRICE_LOCKED: example(new LicenseLotPriceLockedError()),
  REQUEST_HAS_LOT: example(new LicenseLotRequestTakenError()),
  CONTRACT_REASON_REQUIRED: example(new LicenseLotContractReasonRequiredError()),
  CONTRACT_VENDOR_MISMATCH: example(new LicenseLotMismatchError('CONTRACT_VENDOR')),
  PLAN_NOT_K4: example(new LicenseLotPlanNotK4Error()),
  PURPOSE_NOT_AVAILABLE: example(new LicenseLotPurposeNotAvailableError()),
  REQUEST_REQUIRED: example(new LicenseLotRequestRequiredError()),
  WORKSPACE_REQUIRED: example(new WorkspaceRequiredError(['<workspace-id>', '<other-workspace-id>'])),
  WORKSPACE_VENDOR_MISMATCH: example(new WorkspaceVendorMismatchError()),
  RESPONSIBLE_NOT_IT_ADMIN: example(new LicenseLotResponsibleNotItAdminError()),
  KEYS_EXCEED_LICENSES: example(new LicenseLotKeysExceedLicensesError(3, 3)),
  PRICE_NOT_VND: example(new LicenseLotPriceNotVndError('USD')),
  VENDOR_ADMINS_REQUIRED: example(new LicenseLotVendorAdminsRequiredError('<plan-id>', 1, 2)),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(2, 'unitPrice')),
  MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError('unitPrice')),
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('XYZ', 'originalUnitPrice')),
} as const;
