import { DirectionRefusedError } from '../public/cost-center-direction.errors';
import { assertDirectionRules } from './cost-center-direction.policy';

const base = { environment: 'SHARED' as const, approvedBy: 'finance-lead', operator: 'ops-1' };

describe('ops:cost-center-direction rules that need no database (spec L.11)', () => {
  it('accepts a basis and a release evidence of 2 to 200 characters', () => {
    expect(() => assertDirectionRules({ ...base, basis: 'xy', releaseEvidence: 'y'.repeat(200) })).not.toThrow();
  });

  it.each([
    ['a one-character basis', { basis: 'x' }, 'BASIS_INVALID'],
    ['a basis over 200 characters', { basis: 'y'.repeat(201) }, 'BASIS_INVALID'],
    ['a one-character evidence', { releaseEvidence: 'x' }, 'RELEASE_EVIDENCE_INVALID'],
    ['an evidence over 200 characters', { releaseEvidence: 'y'.repeat(201) }, 'RELEASE_EVIDENCE_INVALID'],
  ])('refuses %s', (_case, change, problem) => {
    expect(() => assertDirectionRules({ ...base, ...change })).toThrow(DirectionRefusedError);
    expect(() => assertDirectionRules({ ...base, ...change })).toThrow(problem);
  });

  it('refuses the same person as approver and operator in SHARED, whatever the case or spaces', () => {
    expect(() => assertDirectionRules({ ...base, approvedBy: ' Ops-1 ' })).toThrow('APPROVER_IS_OPERATOR');
  });

  it('lets one person be both in LOCAL_TEST: the Audit Trail records the environment', () => {
    expect(() => assertDirectionRules({ ...base, environment: 'LOCAL_TEST', approvedBy: 'ops-1' })).not.toThrow();
  });
});
