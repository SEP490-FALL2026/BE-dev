import { reviewRefusal, submitRefusal, verdictOf } from './service-account-request.policy';

describe('when a request for a service account may be sent (US-05-21 AC-1, FR-9.4)', () => {
  it('is accepted for the kinds granted by a seat on a subscription or in internal software, once the baseline is closed', () => {
    for (const provisioningType of ['K1', 'K2', 'K5'] as const) {
      expect(submitRefusal({ baselineClosed: true, provisioningType })).toBeNull();
    }
  });

  it('is refused while the seat baseline is open, whatever the plan', () => {
    for (const provisioningType of ['K1', 'K4'] as const) {
      expect(submitRefusal({ baselineClosed: false, provisioningType })).toBe('BASELINE_NOT_CLOSED');
    }
  });

  it('is refused for a plan that cannot be granted yet (K3) or that is a key tied to a device (K4)', () => {
    for (const provisioningType of ['K3', 'K4'] as const) {
      expect(submitRefusal({ baselineClosed: true, provisioningType })).toBe('PLAN_NOT_SUPPORTED');
    }
  });
});

describe('when the IT Admin may give the verdict on the boundary (US-05-21 AC-3)', () => {
  const pending = { boundaryState: 'PENDING' as const };

  it('is allowed once, for a request of a service account that waits to be carried out', () => {
    expect(reviewRefusal({ type: 'SERVICE_ACCOUNT', state: 'AWAITING_EXECUTION', serviceAccount: pending })).toBeNull();
  });

  it('is not for a request of another kind, or one that is not yet approved in full or has ended', () => {
    expect(reviewRefusal({ type: 'GRANT', state: 'AWAITING_EXECUTION', serviceAccount: null })).toBe('NOT_REVIEWABLE');
    for (const state of ['PENDING', 'AWAITING_SPEND_DECISION', 'WITHDRAWN', 'COMPLETED'] as const) {
      expect(reviewRefusal({ type: 'SERVICE_ACCOUNT', state, serviceAccount: pending })).toBe('NOT_REVIEWABLE');
    }
  });

  it('is given once: after an acceptance or a refusal, whatever became of the request', () => {
    for (const [boundaryState, state] of [
      ['ACCEPTED', 'AWAITING_EXECUTION'],
      ['ACCEPTED', 'EXECUTING'],
      ['REJECTED', 'IT_REJECTED'],
    ] as const) {
      expect(reviewRefusal({ type: 'SERVICE_ACCOUNT', state, serviceAccount: { boundaryState } })).toBe(
        'BOUNDARY_ALREADY_DECIDED',
      );
    }
  });
});

describe('the verdict a decision writes', () => {
  it('has no reason for an acceptance, and keeps the trimmed reason of a refusal', () => {
    expect(verdictOf({ decision: 'ACCEPT' })).toEqual({ state: 'ACCEPTED', reason: null });
    expect(verdictOf({ decision: 'REJECT', reason: '  Shared by three people  ' })).toEqual({
      state: 'REJECTED',
      reason: 'Shared by three people',
    });
  });

  it('has none for a refusal that gives no reason', () => {
    expect(verdictOf({ decision: 'REJECT' })).toBeNull();
    expect(verdictOf({ decision: 'REJECT', reason: '   ' })).toBeNull();
  });
});
