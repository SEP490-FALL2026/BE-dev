import type { RequestPartyBlock } from './request-party.types';

export const REQUEST_PARTY_INELIGIBLE = 'REQUEST_PARTY.INELIGIBLE';

/** Thrown by `RequestPartyEligibilityApi.assertEligible` when a person of the Request can never be a party of one. */
export class RequestPartyIneligibleError extends Error {
  constructor(readonly block: RequestPartyBlock) {
    super(
      'The spending approver and an employee who is not placed in a department cannot ask for or be given access through a request.',
    );
    this.name = 'RequestPartyIneligibleError';
  }
}

/**
 * The body of the 422 answer, written once: each `*.http-errors.ts` of a route that makes a Request wraps it as the unprocessable
 * entity answer of its own mapper.
 */
export function requestPartyRefusalBody(error: RequestPartyIneligibleError): {
  code: typeof REQUEST_PARTY_INELIGIBLE;
  message: string;
  details: RequestPartyBlock;
} {
  return {
    code: REQUEST_PARTY_INELIGIBLE,
    message: error.message,
    details: {
      reason: error.block.reason,
      party: error.block.party,
      employeeIds: [...error.block.employeeIds],
    },
  };
}
