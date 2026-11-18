import { LINE_SUBJECT_KEYS, REQUEST_EVENT_ACTIONS, entryOf } from './request-events.policy';

describe('what an event of the trail says on the history of a request', () => {
  it('reads an allowed action as its kind, and leaves every other key of the snapshot behind', () => {
    const entry = entryOf({
      action: 'ACCESS_REQUEST.SPEND_APPROVED',
      after: {
        requestId: 'r-1',
        checkId: 'c-1',
        budgetSnapshot: { total: '1000000' },
        amountMinor: '500000',
        deciderRole: 'SPENDING_APPROVER',
        usesReserve: false,
      },
    });

    expect(entry).toEqual({
      kind: 'SPEND_APPROVED',
      lineEmployeeId: null,
      actorRole: 'SPENDING_APPROVER',
      reason: null,
    });
  });

  it('shows the reason a person wrote only for a refusal, a withdrawal, a closing, a return or the reserve', () => {
    expect(entryOf({ action: 'ACCESS_REQUEST.WITHDRAWN', after: { reason: 'Not needed any more' } })?.reason).toBe(
      'Not needed any more',
    );
    expect(
      entryOf({ action: 'ACCESS_REQUEST.RESERVE_CONFIRMED', after: { reason: 'Urgent', overBaseBy: '10' } }),
    ).toEqual({
      kind: 'RESERVE_CONFIRMED',
      lineEmployeeId: null,
      actorRole: null,
      reason: 'Urgent',
    });
    expect(
      entryOf({ action: 'ACCESS_REQUEST.GRANT_COMPLETED', after: { reason: 'should not leak' } })?.reason,
    ).toBeNull();
  });

  it('names the person of a request for a group an action is about, and reads it as the kind of the whole request', () => {
    expect(
      entryOf({ action: 'ACCESS_REQUEST.LINE_NEED_DECIDED', after: { beneficiaryEmployeeId: 'e-2', reason: 'No' } }),
    ).toEqual({
      kind: 'LINE_NEED_DECIDED',
      lineEmployeeId: 'e-2',
      actorRole: null,
      reason: 'No',
    });
    expect(entryOf({ action: 'ACCESS_REQUEST.LINE_CANCELLED', after: { employeeId: 'e-3' } })).toMatchObject({
      kind: 'CANCELLED',
      lineEmployeeId: 'e-3',
    });
  });

  it.each(['ACCESS_REQUEST.FETCHED', 'ACCESS_REQUEST.BUDGET_CHECKED', 'ACCESS_REQUEST.STEP_REMINDED', 'AUDIT.READ'])(
    'never shows %s',
    (action) => {
      expect(entryOf({ action, after: { reason: 'x' } })).toBeNull();
      expect(Object.keys(REQUEST_EVENT_ACTIONS)).not.toContain(action);
    },
  );

  it('tells the audit module the keys an action names a person of a group under', () => {
    expect(LINE_SUBJECT_KEYS).toEqual(['beneficiaryEmployeeId', 'employeeId']);
  });
});
