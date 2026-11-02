import { firstPlacementProblem } from './employee-first-placement.policy';

const day = (value: string) => value;
const facts = {
  status: 'ACTIVE' as const,
  workState: 'WORKING' as const,
  hasPlacement: false,
  today: day('2026-11-03'),
  hireDate: day('2026-11-01'),
  effectiveFrom: day('2026-11-03'),
};
describe('first placement policy', () => {
  it('allows a current or future placement and rejects a prior day or hire date', () => {
    expect(firstPlacementProblem(facts)).toBeNull();
    expect(firstPlacementProblem({ ...facts, effectiveFrom: day('2026-11-04') })).toBeNull();
    expect(firstPlacementProblem({ ...facts, effectiveFrom: day('2026-11-02') })).toBe('DATE_INVALID');
    expect(firstPlacementProblem({ ...facts, hireDate: day('2026-11-04') })).toBe('DATE_INVALID');
  });
  it('rejects existing placements and employees handing over or terminated', () => {
    expect(firstPlacementProblem({ ...facts, hasPlacement: true })).toBe('ALREADY_PLACED');
    expect(firstPlacementProblem({ ...facts, workState: 'HANDING_OVER' })).toBe('EMPLOYEE_INACTIVE');
    expect(firstPlacementProblem({ ...facts, status: 'TERMINATED' })).toBe('EMPLOYEE_INACTIVE');
  });
});
