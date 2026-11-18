import { isExpiringSoon, rightStatusOf, type RightFacts } from './my-software.policy';

const TODAY = '2026-10-23';
const held: RightFacts = {
  effectiveFrom: '2026-01-05',
  validUntil: null,
  expectedEndDate: null,
  grantOpen: false,
  revocationOpen: false,
  accessUntilPaidEnd: false,
  continued: false,
};
const right = (facts: Partial<RightFacts>): RightFacts => ({ ...held, ...facts });

describe('the status of a right of a person on the business day', () => {
  it('is active when held, in force and with nothing under way', () => {
    expect(rightStatusOf(held, TODAY)).toBe('ACTIVE');
  });

  it('is ended from the first day it is no longer held, and not before', () => {
    expect(rightStatusOf(right({ validUntil: TODAY }), TODAY)).toBe('ENDED');
    expect(rightStatusOf(right({ validUntil: '2026-10-01' }), TODAY)).toBe('ENDED');
    expect(rightStatusOf(right({ validUntil: '2026-10-24' }), TODAY)).toBe('ACTIVE');
  });

  it('is upcoming while it starts on a later day, and active from the day it starts', () => {
    expect(rightStatusOf(right({ effectiveFrom: '2026-10-24' }), TODAY)).toBe('UPCOMING');
    expect(rightStatusOf(right({ effectiveFrom: TODAY }), TODAY)).toBe('ACTIVE');
  });

  it('is provisioning while its grant is not done, before anything about its end', () => {
    expect(rightStatusOf(right({ grantOpen: true, expectedEndDate: '2026-10-01' }), TODAY)).toBe('PROVISIONING');
  });

  it('is revoking while a revocation of it is open, even when its end day has passed', () => {
    expect(rightStatusOf(right({ revocationOpen: true, expectedEndDate: '2026-10-01' }), TODAY)).toBe('REVOKING');
  });

  it('is ending when a K1 renewal was cancelled and access runs to the end of the paid period', () => {
    expect(rightStatusOf(right({ accessUntilPaidEnd: true, validUntil: '2026-11-30' }), TODAY)).toBe('ENDING');
    // Once that day is reached it has ended.
    expect(rightStatusOf(right({ accessUntilPaidEnd: true, validUntil: TODAY }), TODAY)).toBe('ENDED');
  });

  // US-03-05 AC-2: the right ends on its last day.
  it('is expired from the day after its expected end, and still active on that last day', () => {
    expect(rightStatusOf(right({ expectedEndDate: '2026-10-22' }), TODAY)).toBe('EXPIRED');
    expect(rightStatusOf(right({ expectedEndDate: TODAY }), TODAY)).toBe('ACTIVE');
  });

  it('is not expired when a renewal continues it: the old record runs until the new one takes over', () => {
    expect(
      rightStatusOf(right({ expectedEndDate: '2026-10-22', validUntil: '2026-10-30', continued: true }), TODAY),
    ).toBe('ACTIVE');
  });
});

describe('whether a right is about to end', () => {
  const soon = (facts: Partial<RightFacts>) => {
    const value = right(facts);

    return isExpiringSoon(value, rightStatusOf(value, TODAY), TODAY);
  };

  it('is about to end from seven days before its last day up to that day', () => {
    expect(soon({ expectedEndDate: TODAY })).toBe(true);
    expect(soon({ expectedEndDate: '2026-10-30' })).toBe(true);
    expect(soon({ expectedEndDate: '2026-10-31' })).toBe(false);
  });

  it('is not when it has no end, has passed it, or a renewal continues it', () => {
    expect(soon({})).toBe(false);
    expect(soon({ expectedEndDate: '2026-10-22' })).toBe(false);
    expect(soon({ expectedEndDate: '2026-10-25', validUntil: '2026-10-25', continued: true })).toBe(false);
  });

  it('counts a right whose grant is not done yet, and never one that is upcoming, ending or being revoked', () => {
    expect(soon({ expectedEndDate: '2026-10-25', grantOpen: true })).toBe(true);
    expect(soon({ expectedEndDate: '2026-10-25', effectiveFrom: '2026-10-24' })).toBe(false);
    expect(soon({ expectedEndDate: '2026-10-25', revocationOpen: true })).toBe(false);
  });
});
