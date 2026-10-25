import { checkDelegation, isHeadOwnShare, type DelegationFacts } from './delegated-request.policy';

const facts: DelegationFacts = {
  actorEmployeeId: 'head',
  actorHeadedDepartmentId: 'P-DES',
  beneficiaryEmployeeId: 'n1',
  beneficiaryDepartmentId: 'P-DES',
  beneficiaryActive: true,
  beneficiaryWorkEmail: 'n1@acme.vn',
  beneficiaryEmploymentType: 'STAFF',
  beneficiaryHireDate: '2026-10-01',
  today: '2026-09-20',
  expectedEndDate: undefined,
  termMonths: 6,
  termConfirmed: false,
  longTermMonths: 12,
};

describe('a head sending requests for the people of the department', () => {
  it('lets the head send for a member of the department who has a work email', () => {
    expect(checkDelegation(facts)).toBeNull();
  });

  it('lets the head send for a person who starts later, since they are of the department from when the record is written (AC-12)', () => {
    expect(checkDelegation({ ...facts, beneficiaryHireDate: '2026-10-01', today: '2026-09-20' })).toBeNull();
  });

  it.each([
    ['somebody who heads no department (AC-11)', { actorHeadedDepartmentId: null }, 'NOT_HEAD'],
    ['a person of another department (AC-5)', { beneficiaryDepartmentId: 'P-FIN' }, 'OUTSIDE_DEPARTMENT'],
    ['a person who has no department', { beneficiaryDepartmentId: null }, 'OUTSIDE_DEPARTMENT'],
    ['a person who left', { beneficiaryActive: false }, 'BENEFICIARY_NOT_ACTIVE'],
    ['a person with no work email (AC-3)', { beneficiaryWorkEmail: null }, 'EMAIL_REQUIRED'],
    ['a person with a blank work email', { beneficiaryWorkEmail: '  ' }, 'EMAIL_REQUIRED'],
    ['a long term nobody confirmed', { termMonths: 13 }, 'TERM_CONFIRMATION_REQUIRED'],
  ])('refuses %s', (_name, change, refusal) => {
    expect(checkDelegation({ ...facts, ...change })).toBe(refusal);
  });

  it('lets a long term through when it is confirmed in words', () => {
    expect(checkDelegation({ ...facts, termMonths: 13, termConfirmed: true })).toBeNull();
  });

  describe('a person who is not staff (AC-10)', () => {
    it.each(['CONTRACTOR', 'FREELANCER', 'INTERN'])('needs the day the access ends for a %s', (employmentType) => {
      const intern = { ...facts, beneficiaryEmploymentType: employmentType };

      expect(checkDelegation(intern)).toBe('END_DATE_REQUIRED');
      expect(checkDelegation({ ...intern, expectedEndDate: '2026-12-31' })).toBeNull();
    });

    it('refuses an end that comes before the access can begin, which is the later of today and the first day of work', () => {
      const intern = { ...facts, beneficiaryEmploymentType: 'INTERN' };

      expect(checkDelegation({ ...intern, expectedEndDate: '2026-09-30' })).toBe('END_DATE_TOO_EARLY');
      expect(checkDelegation({ ...intern, expectedEndDate: '2026-10-01' })).toBeNull();
      expect(checkDelegation({ ...intern, beneficiaryHireDate: '2026-01-01', expectedEndDate: '2026-09-19' })).toBe(
        'END_DATE_TOO_EARLY',
      );
    });
  });

  describe("the head's own share (AC-8)", () => {
    const own = { ...facts, beneficiaryEmployeeId: 'head' };

    it('is the head', () => {
      expect(isHeadOwnShare(own)).toBe(true);
      expect(isHeadOwnShare(facts)).toBe(false);
    });

    it('asks nothing of the head that is asked of somebody else: no email, no end day, no confirmation', () => {
      expect(
        checkDelegation({
          ...own,
          beneficiaryWorkEmail: null,
          beneficiaryEmploymentType: 'INTERN',
          termMonths: 24,
        }),
      ).toBeNull();
    });
  });
});
