import { pricedPeople, type LineState } from '../access-request/group-request.types';
import { requestEndingOf, summarizeGroup } from './group-resolution.policy';

const summary = (lines: LineState[], state = 'PENDING') => summarizeGroup(lines, state);

describe('what a request for a group is, from its lines (US-05-17)', () => {
  it('waits for a need while any line waits for it, whatever the other lines are', () => {
    expect(summary(['AWAITING_NEED'])).toEqual({ stage: 'WAITING_NEED' });
    expect(summary(['NEED_CONFIRMED', 'AWAITING_NEED', 'NEED_REJECTED'])).toEqual({ stage: 'WAITING_NEED' });
  });

  it('is ready to be sent on as spend once no line waits and some are confirmed', () => {
    expect(summary(['NEED_CONFIRMED', 'NEED_REJECTED'])).toEqual({ stage: 'READY_FOR_SPEND' });
    expect(summary(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'DROPPED'])).toEqual({ stage: 'READY_FOR_SPEND' });
  });

  it('goes on for the people who remain when the line of one is cancelled', () => {
    expect(summary(['CANCELLED', 'AWAITING_NEED'])).toEqual({ stage: 'WAITING_NEED' });
    expect(summary(['CANCELLED', 'NEED_CONFIRMED'])).toEqual({ stage: 'READY_FOR_SPEND' });
    expect(summary(['CANCELLED', 'APPROVED'])).toEqual({ stage: 'GRANTING', state: 'AWAITING_EXECUTION' });
  });

  it('is waiting to be granted while the people approved have not been started, and being granted once one has', () => {
    expect(summary(['APPROVED', 'APPROVED', 'SPEND_REJECTED'])).toEqual({
      stage: 'GRANTING',
      state: 'AWAITING_EXECUTION',
    });
    expect(summary(['APPROVED', 'EXECUTING'], 'AWAITING_EXECUTION')).toEqual({ stage: 'GRANTING', state: 'EXECUTING' });
    expect(summary(['APPROVED', 'COMPLETED'], 'AWAITING_EXECUTION')).toEqual({ stage: 'GRANTING', state: 'EXECUTING' });
    expect(summary(['APPROVED', 'WITHDRAWN'], 'EXECUTING')).toEqual({ stage: 'GRANTING', state: 'EXECUTING' });
    expect(summary(['AWAITING_IT_CLOSE', 'APPROVED'], 'EXECUTING')).toEqual({ stage: 'GRANTING', state: 'EXECUTING' });
  });

  describe('when every line has ended', () => {
    it.each([
      [['COMPLETED', 'FAILED', 'NEED_REJECTED', 'WITHDRAWN'], 'COMPLETED'],
      [['COMPLETED'], 'COMPLETED'],
      [['FAILED', 'NEED_REJECTED', 'WITHDRAWN'], 'FAILED'],
      [['NEED_REJECTED', 'WITHDRAWN'], 'REJECTED'],
      [['SPEND_REJECTED', 'SPEND_REJECTED'], 'REJECTED'],
      [['NEED_REJECTED', 'SPEND_REJECTED', 'WITHDRAWN', 'DROPPED'], 'REJECTED'],
      [['CANCELLED', 'WITHDRAWN', 'DROPPED'], 'CANCELLED'],
      [['CANCELLED'], 'CANCELLED'],
      [['CANCELLED', 'NEED_REJECTED'], 'REJECTED'],
      [['CANCELLED', 'COMPLETED'], 'COMPLETED'],
      [['CANCELLED', 'FAILED'], 'FAILED'],
      [['WITHDRAWN', 'WITHDRAWN'], 'WITHDRAWN'],
      [['WITHDRAWN', 'DROPPED'], 'WITHDRAWN'],
    ] as Array<[LineState[], string]>)(
      '%j ends the request as %s: a granted person, then a failure, then a refusal, then a closing for a person who left, then a withdrawal',
      (lines, state) => {
        expect(summary(lines, 'EXECUTING')).toEqual({ stage: 'ENDED', state });
      },
    );
  });

  it('counts the people the request is priced for: not the refused, the withdrawn or the left out', () => {
    expect(
      pricedPeople([
        'AWAITING_NEED',
        'NEED_CONFIRMED',
        'APPROVED',
        'EXECUTING',
        'COMPLETED',
        'FAILED',
        'NEED_REJECTED',
        'SPEND_REJECTED',
        'WITHDRAWN',
        'DROPPED',
        'CANCELLED',
      ]),
    ).toBe(6);
    expect(pricedPeople([])).toBe(0);
  });
});

describe('what the request is left with when every line has ended (US-05-17, US-05-08, US-03-04)', () => {
  const at = (day: string) => new Date(`${day}T00:00:00Z`);
  const line = (extra: Record<string, unknown>) => ({
    state: 'COMPLETED' as const,
    endedAt: null,
    endedByEmployeeId: null,
    endReason: null,
    cancelCause: null,
    withdrawalRequestedAt: null,
    ...extra,
  });
  const now = at('2026-11-20');

  it('ends granted or failed with the day the last line ended, or today when none says', () => {
    expect(
      requestEndingOf(
        'COMPLETED',
        [line({ endedAt: at('2026-11-02') }), line({ endedAt: at('2026-11-09') }), line({})],
        'sender',
        now,
      ),
    ).toEqual({ kind: 'GRANT_OUTCOME', outcome: 'COMPLETED', endedAt: at('2026-11-09') });
    expect(requestEndingOf('FAILED', [line({ state: 'FAILED' })], 'sender', now)).toEqual({
      kind: 'GRANT_OUTCOME',
      outcome: 'FAILED',
      endedAt: now,
    });
  });

  it('is cancelled by the hand that closed the last cancelled line, for the cause and with the note it gave', () => {
    const lines = [
      line({
        state: 'CANCELLED',
        endedAt: at('2026-11-02'),
        endedByEmployeeId: 'it-1',
        cancelCause: 'BENEFICIARY_LEFT',
        endReason: 'sớm',
      }),
      line({
        state: 'CANCELLED',
        endedAt: at('2026-11-09'),
        endedByEmployeeId: 'it-2',
        cancelCause: 'BENEFICIARY_TRANSFERRED',
        endReason: 'muộn',
      }),
      line({ state: 'WITHDRAWN', endedAt: at('2026-11-15'), endedByEmployeeId: 'other' }),
    ];

    expect(requestEndingOf('CANCELLED', lines, 'sender', now)).toEqual({
      kind: 'CANCELLATION',
      cancelledAt: at('2026-11-09'),
      cancelledByEmployeeId: 'it-2',
      cause: 'BENEFICIARY_TRANSFERRED',
      note: 'muộn',
    });
  });

  it('is cancelled by nobody when the last cancelled line was closed by the system: the sender did not close it (QĐ-110d)', () => {
    const lines = [
      line({
        state: 'CANCELLED',
        endedAt: at('2026-11-02'),
        endedByEmployeeId: 'it-1',
        cancelCause: 'BENEFICIARY_LEFT',
      }),
      line({
        state: 'CANCELLED',
        endedAt: at('2026-11-09'),
        endedByEmployeeId: null,
        cancelCause: 'SYSTEM_BENEFICIARY_TRANSFERRED',
      }),
    ];

    expect(requestEndingOf('CANCELLED', lines, 'sender', now)).toEqual({
      kind: 'CANCELLATION',
      cancelledAt: at('2026-11-09'),
      cancelledByEmployeeId: null,
      cause: 'SYSTEM_BENEFICIARY_TRANSFERRED',
      note: null,
    });
  });

  it('is cancelled by the sender, today, because the person left, when no cancelled line says otherwise', () => {
    expect(requestEndingOf('CANCELLED', [line({ state: 'CANCELLED' })], 'sender', now)).toEqual({
      kind: 'CANCELLATION',
      cancelledAt: now,
      cancelledByEmployeeId: 'sender',
      cause: 'BENEFICIARY_LEFT',
      note: null,
    });
  });

  it('is withdrawn when the last withdrawn line was asked, by whom and why, or by the sender today when none says', () => {
    const lines = [
      line({
        state: 'WITHDRAWN',
        endedAt: at('2026-11-09'),
        endedByEmployeeId: 'head',
        endReason: 'Không cần',
        withdrawalRequestedAt: at('2026-11-08'),
      }),
    ];

    expect(requestEndingOf('WITHDRAWN', lines, 'sender', now)).toEqual({
      kind: 'WITHDRAWAL',
      requestedAt: at('2026-11-08'),
      requestedByEmployeeId: 'head',
      reason: 'Không cần',
      withdrawnAt: at('2026-11-09'),
    });
    expect(requestEndingOf('WITHDRAWN', [line({ state: 'WITHDRAWN' })], 'sender', now)).toEqual({
      kind: 'WITHDRAWAL',
      requestedAt: now,
      requestedByEmployeeId: 'sender',
      reason: null,
      withdrawnAt: now,
    });
  });

  it('goes to the state it was refused in, and nothing else is written', () => {
    expect(requestEndingOf('REJECTED', [line({ state: 'NEED_REJECTED' })], 'sender', now)).toEqual({
      kind: 'STATE',
      state: 'REJECTED',
    });
  });
});
