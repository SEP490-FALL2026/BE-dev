import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { demoSteps } from '../seed-steps';
import { STOP_REQUEST_STEPS } from './device-stops.steps';

describe('the two collector stop requests', () => {
  const step = () => STOP_REQUEST_STEPS[0];
  it('runs after intake and leaves one request open while completing the other', () => {
    const keys = demoSteps(fixture).map(({ key }) => key);
    expect(keys.indexOf('devices.stop-requests')).toBeGreaterThan(keys.indexOf('devices.collector'));
    expect(
      fixture.devices.filter(({ stop }) => stop).map(({ assetCode, holder, stop }) => [assetCode, holder, stop]),
    ).toEqual([
      ['SV-LT-003', 'NV-BOD1', 'COMPLETED'],
      ['SV-LT-004', 'NV-BOD4', 'OPEN'],
    ]);
  });
  it('reads both states and the holder inventory before creating, then uses the response stopRequest id', async () => {
    const seen: string[] = [];
    const call = jest.fn((_email: string, method: string, path: string) => {
      seen.push(`${method} ${path}`);
      if (method === 'GET' && path.startsWith('/device-stop-requests?')) return Promise.resolve({ items: [] });
      if (method === 'GET' && path.startsWith('/me/devices?'))
        return Promise.resolve({
          items: [
            {
              assetCode: 'SV-LT-003',
              registrationId: 'reg-3',
              stopRequestPending: false,
              acknowledgementState: 'ACKNOWLEDGED',
            },
          ],
          pagination: { totalPages: 1 },
        });
      if (path.endsWith('/stop-requests'))
        return Promise.resolve({ stopRequest: { id: 'stop-3', registrationId: 'reg-3', state: 'OPEN' } });
      return Promise.resolve({ stopRequest: { id: 'stop-3', state: 'COMPLETED' } });
    });
    const ctx = {
      fixture: { ...fixture, devices: fixture.devices.filter(({ assetCode }) => assetCode === 'SV-LT-003') },
      mode: 'apply',
      api: { call, signIn: jest.fn() },
    } as unknown as DemoRunContext;
    await expect(step().run(ctx)).resolves.toMatchObject({ status: 'done' });
    const post = seen.findIndex((path) => path.startsWith('POST'));
    expect(seen.slice(0, post).some((path) => path.includes('state=OPEN'))).toBe(true);
    expect(seen.slice(0, post).some((path) => path.includes('state=COMPLETED'))).toBe(true);
    expect(seen.slice(0, post).some((path) => path.includes('/me/devices?'))).toBe(true);
    expect(call).toHaveBeenCalledWith(
      'rang.mai@saoviet.example',
      'POST',
      '/device-stop-requests/stop-3/completion',
      {},
    );
  });
  it('never creates another stop when the holder has stopped or has a pending request', async () => {
    for (const [stopRequestPending, acknowledgementState] of [
      [true, 'ACKNOWLEDGED'],
      [false, 'STOPPED'],
    ] as const) {
      const call = jest.fn((_email: string, method: string, path: string) => {
        if (method !== 'GET') throw new Error('Must not write');
        if (path.startsWith('/me/devices?'))
          return Promise.resolve({
            items: [{ assetCode: 'SV-LT-004', registrationId: 'reg-4', stopRequestPending, acknowledgementState }],
            pagination: { totalPages: 1 },
          });
        return Promise.resolve({ items: [] });
      });
      const ctx = {
        fixture: { ...fixture, devices: fixture.devices.filter(({ assetCode }) => assetCode === 'SV-LT-004') },
        mode: 'apply',
        api: { call, signIn: jest.fn() },
      } as unknown as DemoRunContext;
      await expect(step().run(ctx)).resolves.toMatchObject({ status: 'present' });
    }
  });
});
