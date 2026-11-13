import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  PlanNameInvalidError,
  PlanNoteInvalidError,
  PlanNotFoundError,
  PlanNameTakenError,
  PlanApplicationNotFoundError,
  PlanApplicationRetiredError,
  PlanProvisioningTypeNotSupportedError,
  PlanProvisioningTypeMismatchError,
  PlanPricingModelRequiredError,
  PlanPricingModelNotApplicableError,
  PlanControlLevelRequiredError,
  PlanDataLossNoteRequiredError,
  PlanInUseBlocksChangeError,
  PlanTermsBlockTypeChangeError,
  PlanUpdateEmptyError,
  PlanAdminConsoleNotApplicableError,
  PlanVendorAdminsInvalidError,
  PlanWorkspaceProfileNotApplicableError,
  PlanWorkspacePersonInvalidError,
  PlanPrimaryOwnerNotListedError,
  PlanWorkspaceMemberDuplicateError,
  PlanWorkspaceLimitExceededError,
  PlanWorkspaceTextInvalidError,
  PlanWorkspaceProfileBlocksTypeChangeError,
} from './plan.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps the errors of the plan routes to their HTTP answers; anything unknown goes on unchanged. */
export function toPlanApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof PlanNameInvalidError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.NAME_INVALID', error.message);
  if (error instanceof PlanNoteInvalidError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.NOTE_INVALID', error.message);
  if (error instanceof PlanNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'PLAN.NOT_FOUND', error.message);
  if (error instanceof PlanNameTakenError) return refuse(HttpStatus.CONFLICT, 'PLAN.NAME_TAKEN', error.message);
  if (error instanceof PlanApplicationNotFoundError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.APPLICATION_NOT_FOUND', error.message);
  if (error instanceof PlanApplicationRetiredError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.APPLICATION_RETIRED', error.message);
  if (error instanceof PlanProvisioningTypeNotSupportedError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.PROVISIONING_TYPE_NOT_SUPPORTED', error.message);
  if (error instanceof PlanProvisioningTypeMismatchError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.PROVISIONING_TYPE_MISMATCH', error.message);
  if (error instanceof PlanPricingModelRequiredError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.PRICING_MODEL_REQUIRED', error.message);
  if (error instanceof PlanPricingModelNotApplicableError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.PRICING_MODEL_NOT_APPLICABLE', error.message);
  if (error instanceof PlanControlLevelRequiredError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.CONTROL_LEVEL_REQUIRED', error.message);
  if (error instanceof PlanDataLossNoteRequiredError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.DATA_LOSS_NOTE_REQUIRED', error.message);
  if (error instanceof PlanUpdateEmptyError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.UPDATE_EMPTY', error.message);
  if (error instanceof PlanAdminConsoleNotApplicableError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.ADMIN_CONSOLE_NOT_APPLICABLE', error.message);
  if (error instanceof PlanVendorAdminsInvalidError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.VENDOR_ADMINS_INVALID', error.message, {
      given: error.given,
      required: error.required,
    });
  if (error instanceof PlanWorkspaceProfileNotApplicableError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.WORKSPACE_PROFILE_NOT_APPLICABLE', error.message);
  if (error instanceof PlanWorkspacePersonInvalidError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.WORKSPACE_PERSON_INVALID', error.message, {
      employeeId: error.employeeId,
    });
  if (error instanceof PlanPrimaryOwnerNotListedError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.PRIMARY_OWNER_NOT_LISTED', error.message);
  if (error instanceof PlanWorkspaceMemberDuplicateError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.WORKSPACE_MEMBER_DUPLICATE', error.message, {
      employeeId: error.employeeId,
    });
  if (error instanceof PlanWorkspaceLimitExceededError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.WORKSPACE_LIMIT_EXCEEDED', error.message, {
      role: error.role,
    });
  if (error instanceof PlanWorkspaceTextInvalidError)
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN.WORKSPACE_TEXT_INVALID', error.message);
  if (error instanceof PlanTermsBlockTypeChangeError) {
    return refuse(HttpStatus.CONFLICT, 'PLAN.TERMS_BLOCK_TYPE_CHANGE', error.message);
  }
  if (error instanceof PlanWorkspaceProfileBlocksTypeChangeError)
    return refuse(HttpStatus.CONFLICT, 'PLAN.WORKSPACE_PROFILE_BLOCKS_TYPE_CHANGE', error.message);
  if (error instanceof PlanInUseBlocksChangeError) {
    return refuse(HttpStatus.CONFLICT, 'PLAN.IN_USE_BLOCKS_CHANGE', error.message, { reason: error.reason });
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toPlanApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const PLAN_ERROR_EXAMPLES = {
  NOT_FOUND: example(new PlanNotFoundError()),
  NAME_TAKEN: example(new PlanNameTakenError()),
  NAME_INVALID: example(new PlanNameInvalidError()),
  NOTE_INVALID: example(new PlanNoteInvalidError()),
  APPLICATION_NOT_FOUND: example(new PlanApplicationNotFoundError()),
  APPLICATION_RETIRED: example(new PlanApplicationRetiredError()),
  PROVISIONING_TYPE_NOT_SUPPORTED: example(new PlanProvisioningTypeNotSupportedError()),
  PROVISIONING_TYPE_MISMATCH: example(new PlanProvisioningTypeMismatchError()),
  PRICING_MODEL_REQUIRED: example(new PlanPricingModelRequiredError()),
  PRICING_MODEL_NOT_APPLICABLE: example(new PlanPricingModelNotApplicableError()),
  CONTROL_LEVEL_REQUIRED: example(new PlanControlLevelRequiredError()),
  DATA_LOSS_NOTE_REQUIRED: example(new PlanDataLossNoteRequiredError()),
  UPDATE_EMPTY: example(new PlanUpdateEmptyError()),
  ADMIN_CONSOLE_NOT_APPLICABLE: example(new PlanAdminConsoleNotApplicableError()),
  VENDOR_ADMINS_INVALID: example(new PlanVendorAdminsInvalidError(1, 2)),
  WORKSPACE_PROFILE_NOT_APPLICABLE: example(new PlanWorkspaceProfileNotApplicableError()),
  WORKSPACE_PERSON_INVALID: example(new PlanWorkspacePersonInvalidError('<employee-id>')),
  PRIMARY_OWNER_NOT_LISTED: example(new PlanPrimaryOwnerNotListedError()),
  WORKSPACE_MEMBER_DUPLICATE: example(new PlanWorkspaceMemberDuplicateError('<employee-id>')),
  WORKSPACE_LIMIT_EXCEEDED: example(new PlanWorkspaceLimitExceededError('OWNER')),
  WORKSPACE_TEXT_INVALID: example(new PlanWorkspaceTextInvalidError()),
  TERMS_BLOCK_TYPE_CHANGE: example(new PlanTermsBlockTypeChangeError()),
  WORKSPACE_PROFILE_BLOCKS_TYPE_CHANGE: example(new PlanWorkspaceProfileBlocksTypeChangeError()),
  IN_USE_BLOCKS_CHANGE: example(new PlanInUseBlocksChangeError('LICENSE_KEYS')),
} as const;
