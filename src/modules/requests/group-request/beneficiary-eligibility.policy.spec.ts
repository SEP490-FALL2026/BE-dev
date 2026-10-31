import { checkBeneficiary, type BeneficiaryFacts } from './beneficiary-eligibility.policy';

const facts: BeneficiaryFacts = {
  active: true,
  workEmail: 'n1@acme.vn',
  employmentType: 'STAFF',
  hireDate: '2026-10-01',
  today: '2026-09-20',
  expectedEndDate: undefined,
};
const asked = { skipContact: false };

describe('what a person must have to be given access by the request of somebody else', () => {
  it('takes a person who works here and has a work email', () => {
    expect(checkBeneficiary(facts, asked)).toBeNull();
  });

  it.each([
    ['who left', { active: false }, 'NOT_ACTIVE'],
    ['with no work email', { workEmail: null }, 'EMAIL_REQUIRED'],
    ['with a blank work email', { workEmail: '  ' }, 'EMAIL_REQUIRED'],
  ])('refuses a person %s', (_name, change, refusal) => {
    expect(checkBeneficiary({ ...facts, ...change }, asked)).toBe(refusal);
  });

  it.each(['CONTRACTOR', 'FREELANCER', 'INTERN'])('needs the day the access ends for a %s', (employmentType) => {
    const limited = { ...facts, employmentType };

    expect(checkBeneficiary(limited, asked)).toBe('END_DATE_REQUIRED');
    expect(checkBeneficiary({ ...limited, expectedEndDate: '2026-12-31' }, asked)).toBeNull();
  });

  it('refuses an end that comes before the access can begin, the later of today and the first day of work', () => {
    const intern = { ...facts, employmentType: 'INTERN' };

    expect(checkBeneficiary({ ...intern, expectedEndDate: '2026-09-30' }, asked)).toBe('END_DATE_TOO_EARLY');
    expect(checkBeneficiary({ ...intern, expectedEndDate: '2026-10-01' }, asked)).toBeNull();
    expect(checkBeneficiary({ ...intern, hireDate: '2026-01-01', expectedEndDate: '2026-09-19' }, asked)).toBe(
      'END_DATE_TOO_EARLY',
    );
  });

  it('asks no email and no end day when told to skip the contact, but still refuses a person who left', () => {
    const own = { skipContact: true };

    expect(checkBeneficiary({ ...facts, workEmail: null, employmentType: 'INTERN' }, own)).toBeNull();
    expect(checkBeneficiary({ ...facts, active: false }, own)).toBe('NOT_ACTIVE');
  });
});
