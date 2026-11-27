import { emptyIds, type DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { demoSteps } from '../seed-steps';
import { CATALOG_STEPS, subscriptionPrimaryPlan } from './catalog.steps';
import { renewalBody, RENEWAL_STEPS, type Adjustment } from './renewals.steps';

const adjustment: Adjustment = {
  subscriptionId: 'sub-1',
  renewalOn: '2026-11-26',
  target: 4,
  purchasedQuantity: 7,
  suggestedChoice: 'REDUCE',
  lines: [{ subscriptionLineId: 'line-1', plan: { id: 'plan-1', name: 'Plan 1' }, seatsToday: 7, need: 4, target: 4 }],
};
const spec = (key: string) => {
  const renewal = fixture.renewals.find((row) => row.subscription === key)!;
  const sub = fixture.subscriptions.find((row) => row.key === key)!;
  return { ...renewal, billingCycle: sub.billingCycle, unitPrice: sub.unitPrice, lines: sub.lines };
};

describe('the recorded subscription adjustments', () => {
  it('unwraps the adjustment resource returned by the API before recording it', async () => {
    const writes: unknown[] = [];
    const call = jest.fn((_email: string, method: string, path: string, body?: unknown) => {
      if (method === 'POST') writes.push(body);
      return Promise.resolve(path.startsWith('/subscription-renewals?') ? { items: [] } : { adjustment });
    });
    const ctx = {
      fixture: { ...fixture, renewals: [fixture.renewals[0]] },
      mode: 'apply',
      ids: { subscriptions: new Map([['adobe-cc-teams', 'sub-1']]), plans: new Map([['adobe-cc-teams', 'plan-1']]) },
      api: { call, signIn: jest.fn().mockResolvedValue(undefined) },
    } as unknown as DemoRunContext;
    await expect(RENEWAL_STEPS[0].run(ctx)).resolves.toMatchObject({ status: 'done' });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      subscriptionId: 'sub-1',
      choice: 'REDUCE',
      lines: [{ subscriptionLineId: 'line-1', quantity: 4 }],
    });
  });
  it('uses per-line target quantities and preserves line monthly unit prices in nextPeriod (W3-21)', () => {
    expect(renewalBody(adjustment, spec('adobe-cc-teams'), new Map([['adobe-cc-teams', 'plan-1']]))).toMatchObject({
      subscriptionId: 'sub-1',
      choice: 'REDUCE',
      lines: [{ subscriptionLineId: 'line-1', quantity: 4 }],
      outcome: 'AS_DECIDED',
      nextPeriod: {
        lines: [
          {
            subscriptionLineId: 'line-1',
            quantity: 4,
            monthlyUnitPrice: { amount: '1833333', currency: 'VND' },
          },
        ],
        startDate: '2026-11-26',
        endDate: '2027-11-25',
        renewalDate: '2027-11-26',
        billingCycle: 'ANNUAL',
        autoRenew: true,
        allowsMidTermReduction: false,
      },
    });
  });
  it('records a provider refusal with tagged evidence and no next period', () => {
    const body = renewalBody(
      {
        ...adjustment,
        target: 5,
        suggestedChoice: 'RENEW',
        lines: [
          { subscriptionLineId: 'line-1', plan: { id: 'plan-z', name: 'Zoom' }, seatsToday: 5, need: 5, target: 5 },
        ],
      },
      spec('zoom-pro'),
    );
    expect(body).toMatchObject({
      choice: 'RENEW',
      lines: [{ subscriptionLineId: 'line-1', quantity: 5 }],
      outcome: 'VENDOR_REFUSED',
    });
    expect(body.outcomeNote).toContain('[SV-SBF20-ZOOM]');
    expect(body).not.toHaveProperty('nextPeriod');
  });
  it('refuses an unsupported cancellation, missing lines, or an unknown server choice', () => {
    expect(() => renewalBody({ ...adjustment, target: 0, suggestedChoice: 'CANCEL' }, spec('adobe-cc-teams'))).toThrow(
      /target|cancel/i,
    );
    expect(() => renewalBody({ ...adjustment, suggestedChoice: null }, spec('adobe-cc-teams'))).toThrow(/choice/i);
    expect(() => renewalBody({ ...adjustment, lines: [] }, spec('adobe-cc-teams'))).toThrow(/lines/i);
  });
  it('records each renewal by the IT Admin responsible for its subscription, and runs after the rules and decisions', async () => {
    expect(fixture.renewals.map(({ subscription, by }) => [subscription, by])).toEqual([
      ['adobe-cc-teams', 'NV-ITA2'],
      ['zoom-pro', 'NV-ITA1'],
    ]);
    expect(fixture.subscriptions.find((row) => row.key === 'zoom-pro')!.responsible).toBe('NV-ITA1');
    const keys = demoSteps(fixture).map(({ key }) => key);
    expect(keys.indexOf(RENEWAL_STEPS[0].key)).toBeGreaterThan(keys.indexOf('ghost.decisions'));

    const call = jest
      .fn()
      .mockImplementation((_email: string, method: string) =>
        Promise.resolve(method === 'GET' ? { items: [], adjustment } : {}),
      );
    const zoomSub = fixture.subscriptions.find((row) => row.key === 'zoom-pro')!;
    const ctx = {
      fixture: {
        ...fixture,
        subscriptions: [zoomSub],
        renewals: [{ ...spec('zoom-pro'), by: 'NV-ITA2' }],
      },
      mode: 'apply',
      ids: { subscriptions: new Map([['zoom-pro', 'zoom-id']]), plans: new Map([['zoom-pro', 'plan-z']]) },
      api: { call, signIn: jest.fn().mockResolvedValue(undefined) },
    } as unknown as DemoRunContext;
    await expect(RENEWAL_STEPS[0].run(ctx)).resolves.toMatchObject({ status: 'done' });
    expect(call).toHaveBeenCalledWith('quan.ly@saoviet.example', 'POST', '/subscription-renewals', expect.anything());
  });
  it('leaves already recorded periods alone', async () => {
    const call = jest.fn().mockResolvedValue({ items: [{ id: 'renewal-1' }] });
    const ctx = {
      fixture,
      mode: 'apply',
      ids: {
        subscriptions: new Map([
          ['adobe-cc-teams', 'adobe'],
          ['zoom-pro', 'zoom'],
        ]),
        plans: new Map(),
      },
      api: { call, signIn: jest.fn().mockResolvedValue(undefined) },
    } as unknown as DemoRunContext;
    await expect(RENEWAL_STEPS[0].run(ctx)).resolves.toMatchObject({ status: 'present' });
    expect(call.mock.calls.every(([, method]) => method === 'GET')).toBe(true);
  });
});

describe('selecting the original subscription after recording a renewal', () => {
  it('keeps rows[0] and never creates, patches or completes a period when two active periods exist', async () => {
    const subscription = fixture.subscriptions.find((row) => row.key === 'adobe-cc-teams')!;
    const call = jest.fn().mockResolvedValue({
      items: [
        { id: 'original', status: 'ACTIVE' },
        { id: 'next-period', status: 'ACTIVE' },
      ],
    });
    const ids = emptyIds();
    ids.plans.set(subscriptionPrimaryPlan(subscription), 'plan-1');
    const ctx = {
      fixture: { ...fixture, subscriptions: [subscription] },
      mode: 'apply',
      ids,
      api: { call, signIn: jest.fn().mockResolvedValue(undefined) },
    } as unknown as DemoRunContext;
    await expect(CATALOG_STEPS.find(({ key }) => key === 'catalog.subscriptions')!.run(ctx)).resolves.toMatchObject({
      status: 'present',
    });
    expect(ids.subscriptions.get(subscription.key)).toBe('original');
    expect(call.mock.calls.every(([, method]) => method === 'GET')).toBe(true);
  });
});
