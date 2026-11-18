import { emptyIds, type DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { demoSteps } from '../seed-steps';
import { AI_STEPS } from './ai.steps';

describe('simulated AI summaries', () => {
  it('only enables the two switches, never writes provider mode, and skips switches already on', async () => {
    const call = jest.fn((_email: string, method: string) =>
      Promise.resolve(
        method === 'GET'
          ? {
              items: [
                { key: 'AI_ENABLED', value: 'OFF' },
                { key: 'AI_ACCESS_REQUEST_SUMMARY_ENABLED', value: 'ON' },
                { key: 'AI_PROVIDER_MODE', value: 'SIMULATED' },
              ],
            }
          : {},
      ),
    );
    const ctx = {
      fixture,
      mode: 'apply',
      superAdminEmail: 'sa@example.test',
      api: { call },
    } as unknown as DemoRunContext;
    await expect(AI_STEPS[0].run(ctx)).resolves.toMatchObject({ status: 'done' });
    expect(call.mock.calls.filter((args) => args[1] === 'PUT')).toHaveLength(1);
    expect(call).toHaveBeenCalledWith('sa@example.test', 'PUT', '/operating-parameters/AI_ENABLED', { value: 'ON' });
  });
  it('uses three non-SA callers and runs after every request', () => {
    expect(fixture.aiSummaries).toEqual(['NV-ENGH', 'NV-CEO', 'NV-ITOH']);
    const steps = demoSteps(fixture);
    const summary = steps.find(({ key }) => key === 'ai.summaries')!;
    for (const request of fixture.requests) expect(summary.needs).toContain(`requests.${request.key}`);
    for (const code of fixture.aiSummaries)
      expect(fixture.people.find((person) => person.code === code)!.account).not.toBeNull();
  });
  it('does not call a model or change provider mode when the operator selected MODEL', async () => {
    const call = jest.fn().mockResolvedValue({ items: [{ key: 'AI_PROVIDER_MODE', value: 'MODEL' }] });
    const ctx = {
      fixture,
      mode: 'apply',
      superAdminEmail: 'sa@example.test',
      api: { call },
    } as unknown as DemoRunContext;
    await expect(AI_STEPS[0].run(ctx)).resolves.toMatchObject({ status: 'conflict' });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('is present when both switches are on, even after the operator moved the provider mode to MODEL', async () => {
    const call = jest.fn().mockResolvedValue({
      items: [
        { key: 'AI_PROVIDER_MODE', value: 'MODEL' },
        { key: 'AI_ENABLED', value: 'ON' },
        { key: 'AI_ACCESS_REQUEST_SUMMARY_ENABLED', value: 'ON' },
      ],
    });
    const ctx = {
      fixture,
      mode: 'apply',
      superAdminEmail: 'sa@example.test',
      api: { call },
    } as unknown as DemoRunContext;
    await expect(AI_STEPS[0].run(ctx)).resolves.toMatchObject({ status: 'present' });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('returns done after an accepted POST even if the optional detail is still pending', async () => {
    const ids = emptyIds();
    ids.appUsers.set('NV-ENGH', 'user-1');
    const call = jest.fn((_email: string, method: string, path: string) => {
      if (path.startsWith('/audit-events?')) return Promise.resolve({ items: [] });
      if (path.endsWith('/source')) return Promise.resolve({ queueRevision: 'revision-1' });
      if (method === 'POST') return Promise.resolve({ invocationId: 'inv-1', status: 'PENDING' });
      return Promise.resolve({ status: 'PENDING', simulated: true });
    });
    const ctx = {
      fixture: { ...fixture, aiSummaries: ['NV-ENGH'] },
      ids,
      mode: 'apply',
      superAdminEmail: 'sa@example.test',
      api: { call, signIn: jest.fn() },
    } as unknown as DemoRunContext;
    await expect(AI_STEPS[1].run(ctx)).resolves.toMatchObject({ status: 'done' });
    expect(call).toHaveBeenCalledWith('cuong.le@saoviet.example', 'POST', '/ai/access-request-summaries', {
      queueRevision: 'revision-1',
    });
  });
  it('does not request another summary when the caller already has its audit event', async () => {
    const ids = emptyIds();
    ids.appUsers.set('NV-ENGH', 'user-1');
    const call = jest.fn().mockResolvedValue({ items: [{ id: 'event-1' }] });
    const ctx = {
      fixture: { ...fixture, aiSummaries: ['NV-ENGH'] },
      ids,
      mode: 'apply',
      superAdminEmail: 'sa@example.test',
      api: { call, signIn: jest.fn() },
    } as unknown as DemoRunContext;
    await expect(AI_STEPS[1].run(ctx)).resolves.toMatchObject({ status: 'present' });
    expect(call).toHaveBeenCalledTimes(1);
  });
});
