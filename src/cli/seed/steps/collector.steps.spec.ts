import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { COLLECTOR_STEPS, installKey, machinesToCollect, usageBatchBody, statusSnapshotsBody } from './collector.steps';

const ctx = { fixture, today: '2026-11-18' } as unknown as DemoRunContext;
const now = new Date('2026-11-18T08:00:00Z');
describe('the simulated collector payloads', () => {
  it('reports only today with partial coverage and deterministic values per device and day', () => {
    const body = usageBatchBody(ctx, fixture.devices[0], now);
    expect(body.days.map(({ date }) => date)).toEqual(['2026-11-18']);
    expect(new Date(body.generatedAt).getTime()).toBeLessThanOrEqual(now.getTime());
    expect(body.days[0].tools.every(({ coverage }) => coverage === 'PARTIAL')).toBe(true);
    expect(usageBatchBody(ctx, fixture.devices[0], new Date(now.getTime() + 3600000)).days).toEqual(body.days);
    expect(usageBatchBody({ ...ctx, today: '2026-11-19' }, fixture.devices[0], now).days[0].tools).not.toEqual(
      body.days[0].tools,
    );
  });
  it('has only Claude on LT-002 and an unobservable zero-count tool on LT-003', () => {
    expect(usageBatchBody(ctx, fixture.devices[1], now).days[0].tools.map(({ tool }) => tool)).toEqual(['CLAUDE_CODE']);
    const unobservable = usageBatchBody(ctx, fixture.devices[2], now).days[0].tools.find(
      ({ coverage }) => coverage === 'NOT_OBSERVABLE',
    )!;
    expect(unobservable).toBeDefined();
    expect(unobservable.responses).toBe(0);
    expect(unobservable.totalTokens).toBe(0);
  });
  it('reports logged-in quota windows using the codes owned by each tool', () => {
    const { snapshots } = statusSnapshotsBody(ctx, fixture.devices[0], now);
    expect(snapshots.map(({ tool, quota }) => [tool, quota.windows.map(({ code }) => code)])).toEqual([
      ['CLAUDE_CODE', ['SESSION', 'WEEKLY_ALL']],
      ['CODEX', ['PRIMARY', 'SECONDARY']],
    ]);
    for (const snapshot of snapshots) {
      expect(snapshot.auth.status).toBe('LOGGED_IN');
      expect(snapshot.quota.status).toBe('OK');
      expect(new Date(snapshot.observedAt).getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });
  it('makes a fresh base64url install key and excludes stopped or unacknowledged machines', () => {
    const keys = Array.from({ length: 8 }, () => installKey());
    expect(new Set(keys).size).toBe(8);
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      machinesToCollect([
        { assetCode: 'a', state: 'ACTIVE' },
        { assetCode: 'b', state: 'COLLECTION_STOPPED' },
        { assetCode: 'c', state: 'AWAITING_ACKNOWLEDGEMENT' },
      ]).map(({ assetCode }) => assetCode),
    ).toEqual(['a']);
  });

  it('never enrolls a stopped machine on the next business day', async () => {
    const call = jest.fn().mockResolvedValue({ items: [{ assetCode: 'SV-LT-003', state: 'COLLECTION_STOPPED' }] });
    const callPublic = jest.fn();
    const nextDay = {
      ...ctx,
      mode: 'apply',
      today: '2026-11-19',
      fixture: { ...fixture, devices: [fixture.devices[2]] },
      api: { call, callPublic, signIn: jest.fn() },
    } as unknown as DemoRunContext;
    await expect(COLLECTOR_STEPS[0].run(nextDay)).resolves.toMatchObject({ status: 'present' });
    expect(callPublic).not.toHaveBeenCalled();
    expect(call.mock.calls.every((args: unknown[]) => args[1] === 'GET')).toBe(true);
  });

  it('reports an intake rejection as a conflict and does not send status after rejected usage', async () => {
    const call = jest.fn((_email: string, _method: string, path: string) => {
      if (path.startsWith('/devices?'))
        return Promise.resolve({
          items: [{ id: 'machine-1', assetCode: 'SV-LT-001', state: 'ACTIVE', registrationId: 'reg-1' }],
        });
      if (path.endsWith('/usage?page=1&pageSize=100')) return Promise.resolve({ items: [] });
      return Promise.resolve({ code: 'test-enrollment' });
    });
    const callAsDevice = jest.fn((_token: string, method: string) =>
      Promise.resolve(
        method === 'GET' ? { state: 'ACTIVE', timezone: 'Asia/Ho_Chi_Minh' } : { results: [{ outcome: 'REJECTED' }] },
      ),
    );
    const current = {
      ...ctx,
      mode: 'apply',
      fixture: { ...fixture, devices: [fixture.devices[0]] },
      api: { call, callAsDevice, callPublic: jest.fn().mockResolvedValue({ token: 'fake-token' }), signIn: jest.fn() },
    } as unknown as DemoRunContext;
    await expect(COLLECTOR_STEPS[0].run(current)).resolves.toMatchObject({ status: 'conflict' });
    expect(callAsDevice).toHaveBeenCalledTimes(2);
  });

  it('sends the business day of the machine when the first run has passed midnight', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(new Date('2026-11-18T17:30:00Z'));
    try {
      const call = jest.fn((_email: string, _method: string, path: string) => {
        if (path.startsWith('/devices?'))
          return Promise.resolve({
            items: [{ id: 'machine-1', assetCode: 'SV-LT-001', state: 'ACTIVE', registrationId: 'reg-1' }],
          });
        if (path.endsWith('/usage?page=1&pageSize=100')) return Promise.resolve({ items: [] });
        return Promise.resolve({ code: 'test-enrollment' });
      });
      const sent: { days?: { date: string }[] }[] = [];
      const callAsDevice = jest.fn(
        (_token: string, method: string, _path: string, body?: { days?: { date: string }[] }) => {
          if (method === 'GET') return Promise.resolve({ state: 'ACTIVE', timezone: 'Asia/Ho_Chi_Minh' });
          if (body) sent.push(body);
          return Promise.resolve({ results: [{ outcome: 'ACCEPTED' }] });
        },
      );
      const current = {
        ...ctx,
        mode: 'apply',
        today: '2026-11-18',
        fixture: { ...fixture, devices: [fixture.devices[0]] },
        api: {
          call,
          callAsDevice,
          callPublic: jest.fn().mockResolvedValue({ token: 'fake-token' }),
          signIn: jest.fn(),
        },
      } as unknown as DemoRunContext;
      await expect(COLLECTOR_STEPS[0].run(current)).resolves.toMatchObject({ status: 'done' });
      expect(sent[0].days?.map(({ date }) => date)).toEqual(['2026-11-19']);
    } finally {
      jest.useRealTimers();
    }
  });
});
