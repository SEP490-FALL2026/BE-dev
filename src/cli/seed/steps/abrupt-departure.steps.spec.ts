import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { demoSteps } from '../seed-steps';
import { ABRUPT_DEPARTURE_STEPS } from './personnel.steps';

describe('the abrupt departure of DEV7', () => {
  const step = ABRUPT_DEPARTURE_STEPS[0];
  it('runs after R57 and personnel events, before the ghost seat rules', () => {
    const keys = demoSteps(fixture).map(({ key }) => key);
    expect(step.needs).toEqual(['personnel.events', 'requests.R57']);
    expect(keys.indexOf(step.key)).toBeGreaterThan(keys.indexOf('requests.R57'));
    expect(keys.indexOf(step.key)).toBeGreaterThan(keys.indexOf('personnel.events'));
    expect(keys.indexOf(step.key)).toBeLessThan(keys.indexOf('rules.first-run'));
  });
  it('records BLOCK_NOW through the Super Admin and leaves an existing case alone', async () => {
    let exists = false;
    const call = jest
      .fn()
      .mockImplementation((_email: string, method: string) =>
        Promise.resolve(method === 'GET' ? { items: exists ? [{ id: 'case-1' }] : [] } : {}),
      );
    const ctx = {
      fixture,
      today: '2026-11-18',
      mode: 'apply',
      superAdminEmail: 'sa@example.test',
      ids: { employees: new Map([['NV-DEV7', 'dev7']]) },
      api: { call },
    } as unknown as DemoRunContext;
    await expect(step.run(ctx)).resolves.toMatchObject({ status: 'done' });
    expect(call).toHaveBeenCalledWith(
      'sa@example.test',
      'POST',
      '/offboarding-cases',
      expect.objectContaining({
        employeeId: 'dev7',
        lastWorkingDay: '2026-11-18',
        accessBlockMode: 'BLOCK_NOW',
        successor: { kind: 'NONE' },
      }),
    );
    exists = true;
    call.mockClear();
    await expect(step.run(ctx)).resolves.toMatchObject({ status: 'present' });
    expect(call.mock.calls.every(([, method]) => method === 'GET')).toBe(true);
  });
});
