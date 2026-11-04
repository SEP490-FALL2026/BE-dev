import { HttpStatus } from '@nestjs/common';
import {
  CurrencyNotSupportedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
} from '../../../core/money/money.errors';
import { FORBIDDEN_ERROR } from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { isCheckViolation, isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import {
  BudgetCommitmentExistsError,
  BudgetCommitmentNotFoundError,
  BudgetCommitmentRefusedError,
  BudgetCostCenterNotFoundError,
  BudgetCurrencyError,
  BudgetDecisionRefusedError,
  BudgetDepartmentHasNoHeadError,
  BudgetNotAHistoryReaderError,
  BudgetNotAReaderError,
  BudgetNotFinanceError,
  BudgetPlanNotFoundError,
  BudgetVersionNumberTakenError,
  BudgetCurrentExistsError,
  BudgetImportFileInvalidError,
  BudgetLineNotFoundError,
  BudgetNoCurrentError,
  BudgetNotYourCostCenterError,
  BudgetProposalIncompleteError,
  BudgetProposalNotFoundError,
  BudgetProposalOpenError,
  BudgetProposalStateError,
  BudgetQuartersMismatchError,
  BudgetReasonRequiredError,
  BudgetRevisionRequiredError,
  BudgetVersionInFlightError,
  BudgetVersionNotCurrentError,
  BudgetVersionNotEditableError,
  BudgetVersionNotFoundError,
  BudgetWindowBackwardsError,
  BudgetYearEndedError,
} from './budget.errors';

const refuse = (
  status: HttpStatus,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ApiException => new ApiException(status, { code, message, ...(details ? { details } : {}) });

const PROPOSAL_ACTIONS = {
  WITHDRAW: 'BUDGET.PROPOSAL_CANNOT_WITHDRAW',
  RETURN: 'BUDGET.PROPOSAL_CANNOT_RETURN',
  RESUBMIT: 'BUDGET.PROPOSAL_CANNOT_RESUBMIT',
  REVIEW: 'BUDGET.PROPOSAL_NOT_SUBMITTED',
} as const;

/** Maps the errors of the budget routes to their HTTP answers; a database that cannot answer is a 503. */
export function toBudgetApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof BudgetProposalNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'BUDGET.PROPOSAL_NOT_FOUND', error.message);
  }
  if (error instanceof BudgetVersionNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'BUDGET.VERSION_NOT_FOUND', error.message);
  }
  if (error instanceof BudgetLineNotFoundError)
    return refuse(HttpStatus.NOT_FOUND, 'BUDGET.LINE_NOT_FOUND', error.message);
  if (error instanceof BudgetCostCenterNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'BUDGET.COST_CENTER_NOT_FOUND', error.message);
  }
  if (error instanceof BudgetCommitmentNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'BUDGET.COMMITMENT_NOT_FOUND', error.message);
  }
  if (error instanceof BudgetCommitmentRefusedError) {
    const invalid = error.reason === 'REASON_REQUIRED' || error.reason === 'AMOUNT_NOT_POSITIVE';

    return refuse(
      invalid ? HttpStatus.UNPROCESSABLE_ENTITY : HttpStatus.CONFLICT,
      `BUDGET.COMMITMENT_${error.reason}`,
      error.message,
      error.year === null ? undefined : { year: error.year },
    );
  }
  if (error instanceof BudgetCommitmentExistsError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET.COMMITMENT_EXISTS', error.message, { year: error.year });
  }
  if (error instanceof BudgetDecisionRefusedError) {
    return error.reason === 'NOT_SENT'
      ? refuse(HttpStatus.CONFLICT, 'BUDGET.VERSION_NOT_SENT', error.message)
      : refuse(HttpStatus.FORBIDDEN, `BUDGET.${error.reason}`, error.message);
  }
  if (error instanceof BudgetNotAReaderError || error instanceof BudgetNotAHistoryReaderError) {
    return refuse(HttpStatus.FORBIDDEN, 'AUTHORIZATION.FORBIDDEN', error.message);
  }
  // What the role guard of the route answers, for the change reached without it (F13): the same code and message.
  if (error instanceof BudgetNotFinanceError) {
    return refuse(HttpStatus.FORBIDDEN, FORBIDDEN_ERROR.code, FORBIDDEN_ERROR.message);
  }
  // The department has no Cost Center in use yet (`QĐ-87d(1)`): Finance makes one first. Nothing was written (F27).
  if (error instanceof FinanceSetupIncompleteError) {
    return refuse(HttpStatus.CONFLICT, 'FINANCE.SETUP_INCOMPLETE', error.message);
  }
  if (error instanceof BudgetDepartmentHasNoHeadError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET.DEPARTMENT_HAS_NO_HEAD', error.message);
  }
  if (error instanceof BudgetVersionNumberTakenError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET.VERSION_NUMBER_TAKEN', error.message);
  }
  if (error instanceof BudgetPlanNotFoundError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET.PLAN_NOT_FOUND', error.message, {
      planIds: error.planIds,
    });
  }
  if (error instanceof BudgetNotYourCostCenterError) {
    return refuse(HttpStatus.FORBIDDEN, 'BUDGET.NOT_YOUR_COST_CENTER', error.message);
  }
  if (error instanceof BudgetYearEndedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET.YEAR_ENDED', error.message, { year: error.year });
  }
  if (error instanceof BudgetProposalIncompleteError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET.PROPOSAL_INCOMPLETE', error.message, { lines: error.lines });
  }
  if (error instanceof BudgetWindowBackwardsError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET.WINDOW_BACKWARDS', error.message, { lines: error.lines });
  }
  if (error instanceof BudgetCurrencyError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET.CURRENCY_NOT_REPORTING', error.message, {
      currency: error.currency,
      reporting: error.reporting,
    });
  }
  if (error instanceof BudgetQuartersMismatchError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET.QUARTERS_MISMATCH', error.message);
  }
  if (error instanceof BudgetReasonRequiredError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, `BUDGET.${error.what}_REASON_REQUIRED`, error.message);
  }
  if (error instanceof BudgetImportFileInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET.IMPORT_FILE_INVALID', error.message, {
      reason: error.reason,
      ...(error.detail ? { detail: error.detail } : {}),
    });
  }
  if (error instanceof BudgetProposalOpenError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET.PROPOSAL_ALREADY_OPEN', error.message);
  }
  if (error instanceof BudgetProposalStateError) {
    return refuse(HttpStatus.CONFLICT, PROPOSAL_ACTIONS[error.action], error.message, { state: error.state });
  }
  if (error instanceof BudgetVersionNotEditableError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET.VERSION_NOT_EDITABLE', error.message, { state: error.state });
  }
  if (error instanceof BudgetVersionInFlightError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET.VERSION_IN_FLIGHT', error.message);
  }
  if (error instanceof BudgetCurrentExistsError)
    return refuse(HttpStatus.CONFLICT, 'BUDGET.CURRENT_EXISTS', error.message);
  if (error instanceof BudgetNoCurrentError)
    return refuse(HttpStatus.CONFLICT, 'BUDGET.NO_CURRENT_BUDGET', error.message);
  if (error instanceof BudgetRevisionRequiredError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET.REVISION_REQUIRED', error.message);
  }
  if (error instanceof BudgetVersionNotCurrentError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET.VERSION_NOT_CURRENT', error.message);
  }
  // A race between two writers of the same Cost Center and year is stopped by the partial unique indexes. The loser
  // answers exactly what the check before the write answers: one code, one message (Owner, Prompt 02, 26/10/2026).
  // A unique violation names the index (in the message of the driver) and, with the pg adapter, its columns. An index is recognised by
  // its name, and by its columns only when no other index has them: `budget_proposals_open_key`, `budget_versions_current_key` and
  // `budget_versions_in_flight_key` all have (cost_center_id, year), so those three are told apart by their names alone and the columns
  // are never guessed from.
  if (isUniqueViolation(error, 'budget_proposals_open_key')) {
    return toBudgetApiException(new BudgetProposalOpenError());
  }
  if (isUniqueViolation(error, 'budget_versions_current_key')) {
    return refuse(
      HttpStatus.CONFLICT,
      'BUDGET.CURRENT_EXISTS',
      'The Cost Center already has a current budget for this year.',
    );
  }
  // Another writer took the number of the next version first (F39): its own code, not the one of a version in progress.
  // The key is named in the error when Prisma has no columns to name, and its columns (the number is the one only it has) when it has.
  if (isUniqueViolation(error, 'budget_versions_cost_center_id_year_number_key', '"number"')) {
    return toBudgetApiException(new BudgetVersionNumberTakenError());
  }
  if (
    isUniqueViolation(
      error,
      'budget_versions_in_flight_key',
      'budget_versions_rejected_predecessor_id_key',
      '"rejected_predecessor_id"',
    )
  ) {
    return toBudgetApiException(new BudgetVersionInFlightError());
  }
  // The rules of the successor of a proposal (spec J.1) that the database keeps when two writers meet: the loser answers what the
  // check before the write answers.
  if (
    isUniqueViolation(error, 'budget_proposals_successor_of_proposal_id_key', '"successor_of_proposal_id"') ||
    isCheckViolation(
      error,
      'budget_proposals_succession_guard',
      'budget_proposals_succession_check',
      'budget_proposals_succession_consistent',
    )
  ) {
    return toBudgetApiException(new BudgetProposalOpenError());
  }
  if (isCheckViolation(error, 'budget_versions_rejected_predecessor_guard')) {
    return toBudgetApiException(new BudgetProposalStateError('REVIEW', 'REVIEWED'));
  }

  const money = toMoneyApiException(error);
  if (money !== error) return money;

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toBudgetApiException(error));

/**
 * What the 403 of the reads of the versions says: the service lets Finance and the spending approver read them
 * (`requireVersionReader`); the routes themselves have no role guard.
 */
export const VERSION_READERS_DESCRIPTION = 'Only Finance and the spending approver read the versions of a budget.';

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const BUDGET_ERROR_EXAMPLES = {
  PROPOSAL_NOT_FOUND: example(new BudgetProposalNotFoundError()),
  VERSION_NOT_FOUND: example(new BudgetVersionNotFoundError()),
  LINE_NOT_FOUND: example(new BudgetLineNotFoundError()),
  COST_CENTER_NOT_FOUND: example(new BudgetCostCenterNotFoundError()),
  COMMITMENT_NOT_FOUND: example(new BudgetCommitmentNotFoundError()),
  COMMITMENT_NOT_HELD: example(new BudgetCommitmentRefusedError('NOT_HELD', 2026)),
  COMMITMENT_REQUEST_OPEN: example(new BudgetCommitmentRefusedError('REQUEST_OPEN')),
  NOT_SPENDING_APPROVER: example(new BudgetDecisionRefusedError('NOT_SPENDING_APPROVER')),
  CONFLICT_OF_INTEREST: example(new BudgetDecisionRefusedError('CONFLICT_OF_INTEREST')),
  OWN_VERSION: example(new BudgetDecisionRefusedError('OWN_VERSION')),
  VERSION_NOT_SENT: example(new BudgetDecisionRefusedError('NOT_SENT')),
  NOT_A_READER: example(new BudgetNotAReaderError()),
  NOT_A_HISTORY_READER: example(new BudgetNotAHistoryReaderError()),
  FINANCE_SETUP_INCOMPLETE: example(new FinanceSetupIncompleteError('<department-id>')),
  DEPARTMENT_HAS_NO_HEAD: example(new BudgetDepartmentHasNoHeadError('<department-id>')),
  PLAN_NOT_FOUND: example(new BudgetPlanNotFoundError(['<plan-id>'])),
  // Not shown in the routes: the year lock lets two writers of a Cost Center and year take the number one after the other.
  VERSION_NUMBER_TAKEN: example(new BudgetVersionNumberTakenError()),
  NOT_YOUR_COST_CENTER: example(new BudgetNotYourCostCenterError()),
  YEAR_ENDED: example(new BudgetYearEndedError(2025)),
  PROPOSAL_INCOMPLETE: example(
    new BudgetProposalIncompleteError([{ line: 1, fields: ['servicePeriodMonths', 'repeatCycle'] }]),
  ),
  WINDOW_BACKWARDS: example(new BudgetWindowBackwardsError([1])),
  CURRENCY_NOT_REPORTING: example(new BudgetCurrencyError('USD', 'VND')),
  QUARTERS_MISMATCH: example(new BudgetQuartersMismatchError()),
  REVISION_REASON_REQUIRED: example(new BudgetReasonRequiredError('REVISION')),
  ADJUSTMENT_REASON_REQUIRED: example(new BudgetReasonRequiredError('ADJUSTMENT')),
  WINDOW_REASON_REQUIRED: example(new BudgetReasonRequiredError('WINDOW')),
  IMPORT_FILE_INVALID: example(new BudgetImportFileInvalidError('MISSING_COLUMNS', 'cost_center_code')),
  // Not shown yet: two writers at once answer the same code with the message given for the unique index above.
  PROPOSAL_ALREADY_OPEN: example(new BudgetProposalOpenError()),
  PROPOSAL_CANNOT_WITHDRAW: example(new BudgetProposalStateError('WITHDRAW', 'REVIEWED')),
  PROPOSAL_CANNOT_RETURN: example(new BudgetProposalStateError('RETURN', 'REVIEWED')),
  PROPOSAL_CANNOT_RESUBMIT: example(new BudgetProposalStateError('RESUBMIT', 'SUBMITTED')),
  PROPOSAL_NOT_SUBMITTED: example(new BudgetProposalStateError('REVIEW', 'WITHDRAWN')),
  VERSION_NOT_EDITABLE: example(new BudgetVersionNotEditableError('SENT')),
  VERSION_IN_FLIGHT: example(new BudgetVersionInFlightError()),
  NO_CURRENT_BUDGET: example(new BudgetNoCurrentError()),
  REVISION_REQUIRED: example(new BudgetRevisionRequiredError()),
  VERSION_NOT_CURRENT: example(new BudgetVersionNotCurrentError()),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(2)),
  MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError()),
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('XYZ')),
} as const;
