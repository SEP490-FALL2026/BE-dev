import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
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
  PlanTermsBlockTypeChangeError,
  PlanUpdateEmptyError,
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

  return toUnavailableApiException(error) ?? error;
}
