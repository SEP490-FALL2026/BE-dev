import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { ORGANIZATION_STEPS } from './organization.steps';

describe('employees after the dataset personnel events', () => {
  const step = ORGANIZATION_STEPS.find(({ key }) => key === 'org.employees')!;
  const run = (code: string, profile: Record<string, unknown>, today = '2026-11-19') => {
    const person = fixture.people.find((candidate) => candidate.code === code)!;
    const call = jest
      .fn()
      .mockImplementation((_email: string, _method: string, path: string) =>
        Promise.resolve(
          path.startsWith('/employees/')
            ? { fullName: person.fullName, status: 'ACTIVE', workState: 'WORKING', ...profile }
            : path.startsWith('/department-transfers?')
              ? { items: [{ effectiveOn: '2026-11-19', status: 'EFFECTIVE', to: { department: { code: 'ITO' } } }] }
              : { items: [] },
        ),
      );
    const ctx = {
      fixture: { ...fixture, people: [person] },
      mode: 'apply',
      today,
      superAdminEmail: 'sa@example.test',
      ids: {
        employees: new Map(),
        departments: new Map([
          ['ENG', 'eng'],
          ['ITO', 'ito'],
        ]),
      },
      accounts: { findEmployees: () => Promise.resolve(new Map([[code, { id: 'e-1', status: 'ACTIVE' }]])) },
      api: { call },
    } as unknown as DemoRunContext;
    return { result: step.run(ctx), call };
  };

  it('accepts DEV4 in ITO once the recorded transfer becomes effective', async () => {
    const { result, call } = run('NV-DEV4', { department: { code: 'ITO' } });
    await expect(result).resolves.toMatchObject({ status: 'present' });
    expect(call).toHaveBeenCalledWith('sa@example.test', 'GET', '/employees/e-1');
  });
  it('accepts the original department before the transfer day and rejects an early or unrelated move', async () => {
    await expect(run('NV-DEV4', { department: { code: 'ENG' } }, '2026-11-18').result).resolves.toMatchObject({
      status: 'present',
    });
    await expect(run('NV-DEV4', { department: { code: 'ITO' } }, '2026-11-18').result).resolves.toMatchObject({
      status: 'conflict',
    });
    await expect(run('NV-DEV4', { department: { code: 'FIN' } }).result).resolves.toMatchObject({ status: 'conflict' });
  });
  it.each(['NV-OFF1', 'NV-DEV7'])('accepts %s after departure or while handing over', async (code) => {
    for (const profile of [
      { department: null, status: 'TERMINATED' },
      { department: null, workState: 'LEFT' },
      { department: null, workState: 'HANDING_OVER' },
    ]) {
      await expect(run(code, profile).result).resolves.toMatchObject({ status: 'present' });
    }
  });
  it('still rejects a renamed employee and a person without an event in another department', async () => {
    await expect(
      run('NV-DEV4', { department: { code: 'ITO' }, fullName: 'Someone else' }).result,
    ).resolves.toMatchObject({ status: 'conflict' });
    await expect(run('NV-DEV5', { department: { code: 'ITO' } }).result).resolves.toMatchObject({ status: 'conflict' });
  });
});
