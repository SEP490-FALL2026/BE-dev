import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import {
  BudgetCommitmentExistsError,
  BudgetCommitmentNotFoundError,
  BudgetCommitmentRefusedError,
  BudgetCostCenterNotFoundError,
  BudgetCurrencyError,
  BudgetDecisionRefusedError,
  BudgetNotAReaderError,
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
  if (error instanceof BudgetNotAReaderError) {
    return refuse(HttpStatus.FORBIDDEN, 'AUTHORIZATION.FORBIDDEN', error.message);
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
  // A race between two writers of the same Cost Center and year is stopped by the partial unique indexes.
  if (isUniqueViolation(error, 'budget_proposals_open_key')) {
    return refuse(
      HttpStatus.CONFLICT,
      'BUDGET.PROPOSAL_ALREADY_OPEN',
      'The Cost Center already has a proposal for this year.',
    );
  }
  if (isUniqueViolation(error, 'budget_versions_current_key')) {
    return refuse(
      HttpStatus.CONFLICT,
      'BUDGET.CURRENT_EXISTS',
      'The Cost Center already has a current budget for this year.',
    );
  }
  if (isUniqueViolation(error, 'budget_versions_in_flight_key', 'budget_versions_cost_center_id_year_number_key')) {
    return refuse(
      HttpStatus.CONFLICT,
      'BUDGET.VERSION_IN_FLIGHT',
      'The Cost Center already has a version in progress for this year.',
    );
  }

  const money = toMoneyApiException(error);
  if (money !== error) return money;

  return toUnavailableApiException(error) ?? error;
}
