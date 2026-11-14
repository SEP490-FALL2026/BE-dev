import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import { employeeBodyOf } from './organization.steps';

/** RQ-2, D-21: the end of a person's contract is a field of the employee the Super Admin writes; a request names months and is cut there. */
describe('the body of an employee the dataset declares', () => {
  const ctx = {
    fixture: SHARED_DEMO_V4,
    today: '2026-11-10',
    superAdminEmail: 'sa@example.test',
  } as unknown as DemoRunContext;
  const person = (code: string) => SHARED_DEMO_V4.people.find((candidate) => candidate.code === code)!;

  it('gives the contractor the day his contract ends, counted from today', () => {
    expect(employeeBodyOf(ctx, person('NV-CTR1'))).toMatchObject({
      employmentType: 'CONTRACTOR',
      contractEndDate: '2026-11-30',
    });
  });

  it('gives a staff member no contract end (the API refuses one)', () => {
    const body = employeeBodyOf(ctx, person('NV-DEV1'));

    expect(body).toMatchObject({ employmentType: 'STAFF' });
    expect(body).not.toHaveProperty('contractEndDate');
  });

  it('puts the end of a contract after the day the person started', () => {
    for (const declared of SHARED_DEMO_V4.people.filter((candidate) => candidate.contractEndInDays !== undefined)) {
      const body = employeeBodyOf(ctx, declared) as { hireDate: string; contractEndDate: string };

      expect(body.contractEndDate > body.hireDate).toBe(true);
    }
  });
});
