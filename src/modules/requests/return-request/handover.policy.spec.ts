import { addWorkingDays, handoverFor, handoverGate } from './handover.policy';

// 2026-10-23 is a Friday: 24 and 25 are the weekend.
describe('working days (QĐ-66p)', () => {
  it('counts Monday to Friday, skipping the weekend', () => {
    expect(addWorkingDays('2026-10-21', 1)).toBe('2026-10-22');
    expect(addWorkingDays('2026-10-23', 1)).toBe('2026-10-26');
    expect(addWorkingDays('2026-10-24', 1)).toBe('2026-10-26');
    expect(addWorkingDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addWorkingDays('2026-10-22', 3)).toBe('2026-10-27');
    expect(addWorkingDays('2026-10-23', 6)).toBe('2026-11-02');
  });

  it('leaves the day alone for no days, even a day that is not a working day', () => {
    expect(addWorkingDays('2026-10-23', 0)).toBe('2026-10-23');
    expect(addWorkingDays('2026-10-24', 0)).toBe('2026-10-24');
  });
});

describe('what a return asks of the handover (US-05-13 AC-6, AC-7)', () => {
  it('asks nothing of a plan whose removal loses no data, whatever its note says', () => {
    expect(handoverFor({ dataLossOnRemoval: false, requestedOn: '2026-10-21', shortDeadlineWorkingDays: 1 })).toEqual({
      required: false,
      dueOn: null,
    });
  });

  it('asks a plan that loses data for a confirmation by the working day that is N after the day it was sent', () => {
    expect(handoverFor({ dataLossOnRemoval: true, requestedOn: '2026-10-21', shortDeadlineWorkingDays: 1 })).toEqual({
      required: true,
      dueOn: '2026-10-22',
    });
    expect(handoverFor({ dataLossOnRemoval: true, requestedOn: '2026-10-23', shortDeadlineWorkingDays: 1 })).toEqual({
      required: true,
      dueOn: '2026-10-26',
    });
    expect(handoverFor({ dataLossOnRemoval: true, requestedOn: '2026-10-21', shortDeadlineWorkingDays: 3 }).dueOn).toBe(
      '2026-10-26',
    );
  });
});

describe('what the completion of the revocation does with the handover (US-05-13 AC-6, AC-7)', () => {
  const asked = { required: true, confirmed: false, dueOn: '2026-10-22' as string | null };

  it('waits for the confirmation up to and including the deadline', () => {
    expect(handoverGate({ ...asked, today: '2026-10-21' })).toBe('BLOCKED');
    expect(handoverGate({ ...asked, today: '2026-10-22' })).toBe('BLOCKED');
  });

  it('lets it go through after the deadline and flags it as completed without the confirmation', () => {
    expect(handoverGate({ ...asked, today: '2026-10-23' })).toBe('FLAGGED');
  });

  it('has nothing to wait for once confirmed, or when none was asked', () => {
    expect(handoverGate({ ...asked, confirmed: true, today: '2026-10-21' })).toBe('OPEN');
    expect(handoverGate({ required: false, confirmed: false, dueOn: null, today: '2026-10-21' })).toBe('OPEN');
    expect(handoverGate({ ...asked, confirmed: true, today: '2026-11-30' })).toBe('OPEN');
  });
});
