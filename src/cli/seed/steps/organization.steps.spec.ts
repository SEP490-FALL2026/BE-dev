import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import { ORGANIZATION_STEPS, employeeBodyOf } from './organization.steps';
import type { DemoPerson } from '../fixture/demo-fixture.types';

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

describe('an employee the dataset leaves without a department (QĐ-93g)', () => {
  const unplaced: DemoPerson = {
    code: 'NV-NEW2',
    fullName: 'Âu Thị Xuyến',
    email: 'xuyen.au',
    department: null,
    employmentType: 'STAFF',
    account: 'EMPLOYEE',
  };
  const baseCtx = { fixture: { people: [unplaced], emailDomain: 'saoviet.example' }, today: '2026-11-17' };
  const employeesStep = ORGANIZATION_STEPS.find((step) => step.key === 'org.employees')!;
  const runWith = (profile: { fullName: string; department: { code: string } | null }) => {
    const call = jest.fn().mockResolvedValue(profile);
    const ctx = {
      ...baseCtx,
      mode: 'apply',
      superAdminEmail: 'sa@example.test',
      ids: { employees: new Map<string, string>(), departments: new Map<string, string>() },
      accounts: { findEmployees: () => Promise.resolve(new Map([['NV-NEW2', { id: 'e-1', status: 'ACTIVE' }]])) },
      api: { call },
    } as unknown as DemoRunContext;

    return { run: employeesStep.run(ctx), call };
  };

  it('sends no department for a person the fixture leaves unplaced', () => {
    const body = employeeBodyOf(baseCtx as unknown as DemoRunContext, unplaced);

    expect(body).not.toHaveProperty('departmentCode');
    expect(body).toMatchObject({ employeeCode: 'NV-NEW2', workEmail: 'xuyen.au@saoviet.example' });
  });

  it('counts the unplaced one as present when the profile has no department and the fixture name', async () => {
    const { run, call } = runWith({ fullName: 'Âu Thị Xuyến', department: null });

    await expect(run).resolves.toMatchObject({ status: 'present' });
    expect(call).toHaveBeenCalledWith('sa@example.test', 'GET', '/employees/e-1');
  });

  it('reports a conflict when somebody has already placed the unplaced one, or renamed them', async () => {
    await expect(runWith({ fullName: 'Âu Thị Xuyến', department: { code: 'ENG' } }).run).resolves.toMatchObject({
      status: 'conflict',
    });
    await expect(runWith({ fullName: 'Người khác', department: null }).run).resolves.toMatchObject({
      status: 'conflict',
    });
  });
});
