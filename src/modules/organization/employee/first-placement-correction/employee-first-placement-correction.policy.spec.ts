import { firstPlacementCorrectionProblem } from './employee-first-placement-correction.policy';

const facts = {
  status: 'ACTIVE' as const,
  workState: 'WORKING' as const,
  placements: [{ validFrom: '2026-12-01' }],
  today: '2026-11-18',
  use: null,
};

/** When the first placement may still be corrected (`QĐ-113e`): one placement, not yet in effect, nothing hangs on it. */
describe('firstPlacementCorrectionProblem', () => {
  it('allows the one placement of an active employee that starts after today and has nothing on it', () => {
    expect(firstPlacementCorrectionProblem(facts)).toBeNull();
  });

  it('refuses an employee who is leaving or not active, before anything else', () => {
    expect(firstPlacementCorrectionProblem({ ...facts, workState: 'HANDING_OVER' })).toBe('EMPLOYEE_LEAVING');
    expect(firstPlacementCorrectionProblem({ ...facts, status: 'TERMINATED' })).toBe('EMPLOYEE_INACTIVE');
    expect(firstPlacementCorrectionProblem({ ...facts, workState: 'LEFT' })).toBe('EMPLOYEE_INACTIVE');
  });

  it('refuses an employee with no placement', () => {
    expect(firstPlacementCorrectionProblem({ ...facts, placements: [] })).toBe('NOT_PLACED');
  });

  it('refuses a placement that starts today or before: a change of department is then a transfer', () => {
    expect(firstPlacementCorrectionProblem({ ...facts, placements: [{ validFrom: '2026-11-18' }] })).toBe(
      'ALREADY_EFFECTIVE',
    );
    expect(firstPlacementCorrectionProblem({ ...facts, placements: [{ validFrom: '2026-01-01' }] })).toBe(
      'ALREADY_EFFECTIVE',
    );
  });

  it('refuses a person with more than one placement: the first one is no longer the only one', () => {
    expect(
      firstPlacementCorrectionProblem({
        ...facts,
        placements: [{ validFrom: '2026-12-01' }, { validFrom: '2027-01-01' }],
      }),
    ).toBe('ALREADY_EFFECTIVE');
  });

  it('refuses a placement that something refers to, whatever refers to it', () => {
    expect(firstPlacementCorrectionProblem({ ...facts, use: 'REQUEST' })).toBe('IN_USE');
    expect(firstPlacementCorrectionProblem({ ...facts, use: 'HEAD_PERIOD' })).toBe('IN_USE');
  });
});
