import { checkRenewable, checkRenewalSender, monthsBetween, routeRenewal } from './renewal-request.policy';

describe('the months of a renewal, rounded up (US-05-14 AC-1, AC-3)', () => {
  it('counts a whole month for a part of one', () => {
    expect(monthsBetween('2026-01-05', '2026-02-05')).toBe(1);
    expect(monthsBetween('2026-01-05', '2026-02-06')).toBe(2);
    expect(monthsBetween('2026-09-15', '2026-12-31')).toBe(4);
    expect(monthsBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(monthsBetween('2026-09-15', '2026-09-16')).toBe(1);
  });

  it('counts the last day of a month to the last day of a later month as whole months', () => {
    expect(monthsBetween('2026-09-30', '2026-12-31')).toBe(3);
    expect(monthsBetween('2026-01-31', '2026-02-28')).toBe(1);
    expect(monthsBetween('2026-01-31', '2026-04-30')).toBe(3);
    expect(monthsBetween('2026-09-30', '2027-01-31')).toBe(4);
    expect(monthsBetween('2026-09-30', '2026-12-30')).toBe(3);
  });

  it('is more than twelve when the right runs on for more than a year in all', () => {
    expect(monthsBetween('2026-10-05', '2027-08-31')).toBe(11);
    expect(monthsBetween('2026-10-05', '2027-10-05')).toBe(12);
    expect(monthsBetween('2026-10-05', '2027-10-06')).toBe(13);
    expect(monthsBetween('2026-10-05', '2027-12-31')).toBe(15);
  });
});

describe('who asks for the renewal of a right (US-05-14 AC-1, QĐ-100t)', () => {
  const facts = { actorEmployeeId: 'e1', holderEmployeeId: 'e1' };

  it('lets only the holder ask for themselves', () => {
    expect(checkRenewalSender(facts)).toEqual({ ok: true });
  });

  it('refuses anyone else, the head of the department of the holder included', () => {
    expect(checkRenewalSender({ ...facts, actorEmployeeId: 'e2' })).toEqual({ ok: false, refusal: 'NOT_HOLDER' });
    expect(checkRenewalSender({ ...facts, actorEmployeeId: 'head-of-holder-department' })).toEqual({
      ok: false,
      refusal: 'NOT_HOLDER',
    });
  });
});

describe('which right may be renewed (US-05-14)', () => {
  const renewable = {
    kind: 'PERSONAL' as const,
    hasSuccessor: false,
    open: true,
    expectedEndDate: '2026-09-30' as string | null,
    grant: 'COMPLETED' as const,
    revocationLive: false,
  };

  it('takes the personal record that is held, is the last of its chain and has an end date', () => {
    expect(checkRenewable(renewable)).toBeNull();
    expect(checkRenewable({ ...renewable, grant: 'NONE' })).toBeNull();
  });

  it('gives the first reason it cannot be renewed', () => {
    expect(checkRenewable({ ...renewable, kind: 'SERVICE', open: false })).toBe('SERVICE_ACCOUNT');
    expect(checkRenewable({ ...renewable, hasSuccessor: true, open: false })).toBe('NOT_CURRENT');
    expect(checkRenewable({ ...renewable, open: false })).toBe('NOT_OPEN');
    expect(checkRenewable({ ...renewable, expectedEndDate: null, grant: 'NOT_COMPLETED' })).toBe('NO_END_DATE');
    expect(checkRenewable({ ...renewable, grant: 'NOT_COMPLETED', revocationLive: true })).toBe('GRANT_NOT_COMPLETED');
    expect(checkRenewable({ ...renewable, revocationLive: true })).toBe('REVOCATION_PENDING');
  });
});

describe('before or after the end (US-05-14 AC-4, AC-5)', () => {
  it('renews up to the end, today included, and asks again as a new request after it', () => {
    expect(routeRenewal({ today: '2026-09-25', previousEnd: '2026-09-30' })).toBe('RENEWAL');
    expect(routeRenewal({ today: '2026-09-30', previousEnd: '2026-09-30' })).toBe('RENEWAL');
    expect(routeRenewal({ today: '2026-10-01', previousEnd: '2026-09-30' })).toBe('NEW_REQUEST');
  });
});
