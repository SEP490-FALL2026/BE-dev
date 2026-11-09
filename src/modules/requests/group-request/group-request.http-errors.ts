import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { RequestPartyIneligibleError } from '../../identity-access/public/request-party.errors';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import {
  AccessRequestApplicationRetiredError,
  AccessRequestCancellationRefusedError,
  AccessRequestDecisionRefusedError,
  AccessRequestNoDepartmentError,
  AccessRequestNotFoundError,
  AccessRequestNotPriceableError,
  AccessRequestPlanNotFoundError,
  AccessRequestSuperAdminCannotRequestError,
  AccessRequestWithdrawalRefusedError,
} from '../access-request/access-request.errors';
import { SpendDecisionRefusedError, SpendSupplementRefusedError } from '../spend/spend.errors';
import { toRecheckedApiException, toSpendApiException } from '../spend/spend.http-errors';
import { GROUP_EMPLOYEE_MAX, GROUP_LINES_MIN } from './group-request.policy';
import {
  GroupRequestDuplicateLineError,
  GroupRequestLineHoldsAccessError,
  GroupRequestLineNotFoundError,
  GroupRequestLinesMismatchError,
  GroupRequestLinesRefusedError,
  GroupRequestPlanNotEligibleError,
  GroupRequestTermBeyondLimitError,
  GroupRequestTooFewLinesError,
  GroupRequestTooManyLinesError,
  GroupSupplementDropRefusedError,
} from './group-request.errors';

/**
 * Maps the errors of the request for a group to their HTTP answers. The rest are those of the request and of the spend decision,
 * which the routes of a group raise as they are (a refusal to decide, a withdrawal that cannot be made).
 */
export function toGroupRequestApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof GroupRequestPlanNotEligibleError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.PLAN_NOT_ELIGIBLE',
      message: error.message,
      details: { reason: error.reason },
    });
  }
  if (error instanceof GroupRequestTooManyLinesError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.TOO_MANY_LINES',
      message: error.message,
      details: { max: error.max },
    });
  }
  if (error instanceof GroupRequestTermBeyondLimitError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.TERM_BEYOND_LIMIT',
      message: error.message,
      details: { maxEndDate: error.maxEndDate },
    });
  }
  if (error instanceof GroupRequestTooFewLinesError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.TOO_FEW_LINES',
      message: error.message,
      details: { min: error.min },
    });
  }
  if (error instanceof GroupRequestDuplicateLineError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.DUPLICATE_LINE',
      message: error.message,
      details: { employeeIds: [...error.employeeIds] },
    });
  }
  if (error instanceof GroupRequestLinesRefusedError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.LINES_REFUSED',
      message: error.message,
      details: { lines: error.lines.map((line) => ({ employeeId: line.employeeId, reason: line.reason })) },
    });
  }
  if (error instanceof GroupRequestLinesMismatchError) {
    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'GROUP_REQUEST.LINES_MISMATCH',
      message: error.message,
      details: { missing: [...error.mismatch.missing], extra: [...error.mismatch.extra] },
    });
  }
  if (error instanceof GroupRequestLineHoldsAccessError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'GROUP_REQUEST.LINE_HOLDS_ACCESS',
      message: error.message,
      details: { lines: [...error.employeeIds] },
    });
  }
  if (error instanceof GroupRequestLineNotFoundError) {
    return new ApiException(HttpStatus.NOT_FOUND, { code: 'GROUP_REQUEST.LINE_NOT_FOUND', message: error.message });
  }
  if (error instanceof GroupSupplementDropRefusedError) {
    const status = error.reason === 'LINE_NOT_DROPPABLE' ? HttpStatus.CONFLICT : HttpStatus.UNPROCESSABLE_ENTITY;

    return new ApiException(status, {
      code: `SUPPLEMENT.${error.reason}`,
      message: error.message,
      ...(error.employeeIds.length > 0 ? { details: { employeeIds: [...error.employeeIds] } } : {}),
    });
  }

  return toSpendApiException(error);
}

const example = (error: Error) => errorExampleOf(toGroupRequestApiException(error));
const PERSON = '<employee-id>';

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const GROUP_REQUEST_ERROR_EXAMPLES = {
  PLAN_NOT_FOUND: example(new AccessRequestPlanNotFoundError()),
  APPLICATION_RETIRED: example(new AccessRequestApplicationRetiredError()),
  NO_DEPARTMENT: example(new AccessRequestNoDepartmentError()),
  FINANCE_SETUP_INCOMPLETE: example(new FinanceSetupIncompleteError('<department-id>')),
  REQUEST_PARTY_INELIGIBLE: example(
    new RequestPartyIneligibleError({ reason: 'SPENDING_APPROVER', party: 'REQUESTER', employeeIds: [PERSON] }),
  ),
  SUPER_ADMIN_CANNOT_REQUEST: example(new AccessRequestSuperAdminCannotRequestError()),
  PLAN_NOT_ELIGIBLE: example(new GroupRequestPlanNotEligibleError('KIND_NOT_MULTI_SEAT')),
  TOO_MANY_LINES: example(new GroupRequestTooManyLinesError(GROUP_EMPLOYEE_MAX)),
  TOO_FEW_LINES: example(new GroupRequestTooFewLinesError(GROUP_LINES_MIN)),
  TERM_BEYOND_LIMIT: example(new GroupRequestTermBeyondLimitError('2027-11-09')),
  DUPLICATE_LINE: example(new GroupRequestDuplicateLineError([PERSON])),
  LINES_REFUSED: example(new GroupRequestLinesRefusedError([{ employeeId: PERSON, reason: 'OUTSIDE_DEPARTMENT' }])),
  REQUEST_NOT_FOUND: example(new AccessRequestNotFoundError()),
  CLOSURE_ALREADY_ENDED: example(new AccessRequestCancellationRefusedError('ALREADY_ENDED')),
  CLOSURE_WITHDRAWAL_PENDING: example(new AccessRequestCancellationRefusedError('WITHDRAWAL_PENDING')),
  BENEFICIARY_NOT_LEFT: example(new AccessRequestCancellationRefusedError('BENEFICIARY_NOT_LEFT')),
  BENEFICIARY_NOT_TRANSFERRED: example(new AccessRequestCancellationRefusedError('BENEFICIARY_NOT_TRANSFERRED')),
  EVIDENCE_REQUIRED: example(new AccessRequestCancellationRefusedError('EVIDENCE_REQUIRED')),
  NEED_OWN_REQUEST: example(new AccessRequestDecisionRefusedError('OWN_REQUEST')),
  NEED_NOT_THE_ASSIGNEE: example(new AccessRequestDecisionRefusedError('NOT_THE_ASSIGNEE')),
  NEED_STEP_NOT_PENDING: example(new AccessRequestDecisionRefusedError('STEP_NOT_PENDING')),
  LINE_HOLDS_ACCESS: example(new GroupRequestLineHoldsAccessError([PERSON])),
  LINES_MISMATCH: example(new GroupRequestLinesMismatchError({ missing: [PERSON], extra: [] })),
  SPEND_NOT_THE_ASSIGNEE: example(new SpendDecisionRefusedError('NOT_THE_ASSIGNEE')),
  SPEND_OWN_REQUEST: example(new SpendDecisionRefusedError('OWN_REQUEST')),
  NO_SPEND_STEP: example(new SpendDecisionRefusedError('NO_SPEND_STEP')),
  NOT_CHECKABLE: example(new SpendDecisionRefusedError('NOT_CHECKABLE')),
  REVIEWER_IS_APPROVER: example(new SpendDecisionRefusedError('REVIEWER_IS_APPROVER')),
  OVERRIDE_REQUIRED: example(new SpendDecisionRefusedError('OVERRIDE_REQUIRED', [2026])),
  OVERRIDE_MISMATCH: example(new SpendDecisionRefusedError('OVERRIDE_MISMATCH', [2026])),
  OVERRIDE_NOT_NEEDED: example(new SpendDecisionRefusedError('OVERRIDE_NOT_NEEDED')),
  RECHECKED_NEEDS_FINANCE_REVIEW: example(toRecheckedApiException({ to: 'FINANCE_REVIEW' })),
  RECHECKED_RETURNED_TO_HEAD: example(toRecheckedApiException({ to: 'HEAD', reason: 'STALE_COST_EVIDENCE' })),
  NOT_REQUESTER: example(new AccessRequestWithdrawalRefusedError('NOT_REQUESTER')),
  WITHDRAWAL_ALREADY_ENDED: example(new AccessRequestWithdrawalRefusedError('ALREADY_ENDED')),
  WITHDRAWAL_PENDING: example(new AccessRequestWithdrawalRefusedError('WITHDRAWAL_PENDING')),
  GRANT_RUNNING: example(new AccessRequestWithdrawalRefusedError('GRANT_RUNNING', { employeeIds: [PERSON] })),
  GRANT_COMPLETED: example(
    new AccessRequestWithdrawalRefusedError('GRANT_COMPLETED', { assignmentId: '<assignment-id>' }),
  ),
  REASON_REQUIRED: example(new AccessRequestWithdrawalRefusedError('REASON_REQUIRED')),
  SUPPLEMENT_NOT_IN_QUEUE: example(new SpendSupplementRefusedError('NOT_IN_QUEUE')),
  SUPPLEMENT_NOT_PRICED: example(new SpendSupplementRefusedError('NOT_PRICED')),
  SUPPLEMENT_NO_CHANGE: example(new SpendSupplementRefusedError('NO_CHANGE')),
  NOT_PRICEABLE: example(new AccessRequestNotPriceableError()),
  LINE_NOT_DROPPABLE: example(new GroupSupplementDropRefusedError('LINE_NOT_DROPPABLE', [PERSON])),
  CANNOT_DROP_LAST_LINE: example(new GroupSupplementDropRefusedError('CANNOT_DROP_LAST_LINE')),
  DROP_NOT_FOR_GROUP: example(new GroupSupplementDropRefusedError('DROP_NOT_FOR_GROUP')),
} as const;
