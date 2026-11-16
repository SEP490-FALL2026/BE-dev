import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { VALIDATION_ERROR_BODY } from '../../../infrastructure/http/pipes/zod-validation.pipe';
import {
  PolicyChecklistHasNoError,
  PolicyChecklistIncompleteError,
  PolicyDecisionReasonRequiredError,
  PolicyVersionChangedError,
} from '../../policies/public/policy-checklist.errors';

/**
 * The answers of the checklist of a decision, turned into what the route says (`QĐ-111ap`): a version of the policy that is no longer in force is
 * 409, a checklist not answered in full, a No against a decision that goes on, and a refusal or a return with no reason to keep are 422. Null for any
 * other error, so every route that decides on a checklist asks this first.
 */
export function toChecklistApiException(error: unknown): ApiException | null {
  if (error instanceof PolicyVersionChangedError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'POLICY.VERSION_CHANGED',
      message: error.message,
      details: { stepCode: error.stepCode, policyVersionId: error.policyVersionId, versionNumber: error.versionNumber },
    });
  }
  if (error instanceof PolicyChecklistIncompleteError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'POLICY.CHECKLIST_INCOMPLETE',
      message: error.message,
      details: { stepCode: error.stepCode, missing: [...error.missing], unexpected: [...error.unexpected] },
    });
  }
  if (error instanceof PolicyChecklistHasNoError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'POLICY.CHECKLIST_HAS_NO',
      message: error.message,
      details: { stepCode: error.stepCode, items: error.items.map((item) => ({ ...item })) },
    });
  }
  if (error instanceof PolicyDecisionReasonRequiredError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      ...VALIDATION_ERROR_BODY,
      details: { issues: [{ code: 'custom', path: 'reason' }] },
    });
  }

  return null;
}

const example = (error: Error) => errorExampleOf(toChecklistApiException(error));

/** The examples of the answers above, for the routes that document them. */
export const CHECKLIST_ERROR_EXAMPLES = {
  VERSION_CHANGED: example(new PolicyVersionChangedError('1.2', 'v3', 3)),
  INCOMPLETE: example(new PolicyChecklistIncompleteError('1.2', ['1.2-05'], [])),
  HAS_NO: example(
    new PolicyChecklistHasNoError('1.2', [{ code: '1.2-05', text: 'The tools they have do not meet the need' }]),
  ),
} as const;
