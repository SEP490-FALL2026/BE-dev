import { HttpStatus } from '@nestjs/common';
import { CurrencyNotSupportedError, MoneyScaleExceededError } from '../../../core/money/money.errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { RevocationRefusedError } from '../public/licensing.errors';
import { toProvisioningApiException } from '../provisioning/provisioning.http-errors';
import { RenewalError, type RenewalProblem } from './subscription-renewal.errors';

const ANSWERS: Readonly<Record<RenewalProblem, { status: HttpStatus; message: string }>> = {
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'There is no renewal or subscription with this id.' },
  READ_FORBIDDEN: {
    status: HttpStatus.FORBIDDEN,
    message: 'Only the IT Admin, Finance and the head of the department that owns the subscription read the renewals.',
  },
  NOT_RENEWABLE: {
    status: HttpStatus.CONFLICT,
    message: 'A perpetual purchase, internal software, a draft or a period already continued has no renewal.',
  },
  CONTRACT_DATA_INCOMPLETE: {
    status: HttpStatus.CONFLICT,
    message:
      'The subscription has no cancellation deadline or end date to count from: complete its contract data first.',
  },
  ALREADY_PROPOSED: { status: HttpStatus.CONFLICT, message: 'This period already has a renewal proposal.' },
  QUANTITY_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'A reduction names fewer seats than are bought; renewing as it is and cancelling name none.',
  },
  NOT_DECIDER: {
    status: HttpStatus.FORBIDDEN,
    message: 'Only the head of the department that owns the subscription may confirm this renewal.',
  },
  PROPOSER_IS_OWNER_HEAD: {
    status: HttpStatus.CONFLICT,
    message:
      'The IT Admin who proposes heads the department that owns the subscription and would confirm their own proposal: another IT Admin proposes.',
  },
  NOT_AWAITING_DECISION: { status: HttpStatus.CONFLICT, message: 'The renewal is not waiting for a decision.' },
  ACTIVE_USERS_NOT_ACKNOWLEDGED: {
    status: HttpStatus.CONFLICT,
    message: 'People still use the subscription: confirm the cancellation after seeing how many.',
  },
  EXCESS_SELECTION_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Choose exactly the seats above the new number, each a seat in use of this subscription.',
  },
  PROPOSAL_STALE: {
    status: HttpStatus.CONFLICT,
    message:
      'The seats proposed to take back no longer match the seats in use: this proposal is closed as out of date and the IT Admin proposes again.',
  },
  MID_TERM_NOT_ALLOWED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Only a reduction of a subscription that allows one mid-term is carried out within the paid period.',
  },
  NOT_AWAITING_OUTCOME: { status: HttpStatus.CONFLICT, message: 'The renewal is not waiting for its outcome.' },
  OUTCOME_MISMATCH: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'This outcome is not the decision: record what the vendor did as a different outcome.',
  },
  EXCESS_NOT_REVOKED: {
    status: HttpStatus.CONFLICT,
    message: 'More seats are still in use than the new period buys: take the excess back first.',
  },
  SEATS_HAVE_OPEN_TASKS: {
    status: HttpStatus.CONFLICT,
    message: 'A seat to carry to the new period still has an open task of the provisioning queue.',
  },
  PERIOD_REFUSED: {
    status: HttpStatus.CONFLICT,
    message: 'The new period cannot be recorded as the continuation of this one.',
  },
};

/**
 * Maps the refusals of the renewal routes to their codes (`SUBSCRIPTION_RENEWAL.*`); the money of a new period and the refusals
 * of the revocation gate keep their own codes. A subscription whose owner department has no Cost Center is renewed all the same:
 * the proposal never raises the quantity (`QĐ-94m`(2)).
 */
export function toRenewalApiException(error: unknown): unknown {
  if (error instanceof RenewalError) {
    const answer = ANSWERS[error.problem];

    return new ApiException(answer.status, {
      code: `SUBSCRIPTION_RENEWAL.${error.problem}`,
      message: answer.message,
      ...(Object.keys(error.details).length > 0 ? { details: error.details } : {}),
    });
  }
  const money = toMoneyApiException(error);
  if (money !== error) return money;

  return toProvisioningApiException(error);
}

const example = (error: Error) => errorExampleOf(toRenewalApiException(error));
const renewal = (problem: RenewalProblem, details?: Record<string, string | number>) =>
  example(new RenewalError(problem, details));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const RENEWAL_ERROR_EXAMPLES = {
  NOT_FOUND: renewal('NOT_FOUND'),
  READ_FORBIDDEN: renewal('READ_FORBIDDEN'),
  NOT_RENEWABLE: renewal('NOT_RENEWABLE'),
  CONTRACT_DATA_INCOMPLETE: renewal('CONTRACT_DATA_INCOMPLETE'),
  ALREADY_PROPOSED: renewal('ALREADY_PROPOSED'),
  QUANTITY_INVALID: renewal('QUANTITY_INVALID'),
  NOT_DECIDER: renewal('NOT_DECIDER'),
  PROPOSER_IS_OWNER_HEAD: renewal('PROPOSER_IS_OWNER_HEAD'),
  NOT_AWAITING_DECISION: renewal('NOT_AWAITING_DECISION'),
  ACTIVE_USERS_NOT_ACKNOWLEDGED: renewal('ACTIVE_USERS_NOT_ACKNOWLEDGED', { seatsInUse: 5 }),
  EXCESS_SELECTION_INVALID: renewal('EXCESS_SELECTION_INVALID', { required: 4, selected: 3 }),
  PROPOSAL_STALE: renewal('PROPOSAL_STALE', { required: 2, stillHeld: 1 }),
  MID_TERM_NOT_ALLOWED: renewal('MID_TERM_NOT_ALLOWED'),
  NOT_AWAITING_OUTCOME: renewal('NOT_AWAITING_OUTCOME'),
  OUTCOME_MISMATCH: renewal('OUTCOME_MISMATCH'),
  EXCESS_NOT_REVOKED: renewal('EXCESS_NOT_REVOKED', { seatsInUse: 89, quantity: 88 }),
  SEATS_HAVE_OPEN_TASKS: renewal('SEATS_HAVE_OPEN_TASKS', { seats: 1 }),
  PERIOD_REFUSED: renewal('PERIOD_REFUSED', { reason: 'ALREADY_RENEWED' }),
  REVOCATION_TYPE_NOT_SUPPORTED: example(new RevocationRefusedError('TYPE_NOT_SUPPORTED', 'K4')),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(2)),
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('XYZ')),
} as const;
