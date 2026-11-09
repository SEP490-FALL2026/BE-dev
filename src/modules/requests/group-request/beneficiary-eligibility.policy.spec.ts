import { checkBeneficiary, type BeneficiaryFacts } from './beneficiary-eligibility.policy';

const facts: BeneficiaryFacts = {
  active: true,
  workEmail: 'n1@acme.vn',
  employmentType: 'STAFF',
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

  it('does not ask a contractor, a freelancer or an intern for the day the access ends: the system works it out (QĐ-100)', () => {
    for (const employmentType of ['CONTRACTOR', 'FREELANCER', 'INTERN']) {
      expect(checkBeneficiary({ ...facts, employmentType }, asked)).toBeNull();
    }
  });

  it('asks no email when told to skip the contact, but still refuses a person who left', () => {
    const own = { skipContact: true };

    expect(checkBeneficiary({ ...facts, workEmail: null, employmentType: 'INTERN' }, own)).toBeNull();
    expect(checkBeneficiary({ ...facts, active: false }, own)).toBe('NOT_ACTIVE');
  });
});
