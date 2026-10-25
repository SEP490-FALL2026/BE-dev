import { pricedPeople, type LineState } from './group-request.types';
import { summarizeGroup } from './group-resolution.policy';

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
