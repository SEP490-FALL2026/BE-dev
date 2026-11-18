import { emptyIds, type DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as fixture } from '../fixture/shared-demo-v4';
import { demoSteps } from '../seed-steps';
import { CATALOG_STEPS } from './catalog.steps';
import { renewalBody, RENEWAL_STEPS, type Adjustment } from './renewals.steps';

const adjustment: Adjustment = {
  subscriptionId: 'sub-1',
  renewalOn: '2026-11-26',
  target: 4,
  purchasedQuantity: 7,
  suggestedChoice: 'REDUCE',
};
const spec = (key: string) => {
  const renewal = fixture.renewals.find((row) => row.subscription === key)!;
  return { ...renewal, unitPrice: fixture.subscriptions.find((row) => row.key === key)!.unitPrice };
};

describe('the recorded subscription adjustments', () => {
  it('uses the server choice and target and carries the annual price as Money', () => {
    expect(renewalBody(adjustment, spec('adobe-cc-teams'))).toMatchObject({
      subscriptionId: 'sub-1',
      choice: 'REDUCE',
      proposedQuantity: 4,
      outcome: 'AS_DECIDED',
      nextPeriod: {
        purchasedQuantity: 4,
        startDate: '2026-11-26',
        endDate: '2027-11-25',
        renewalDate: '2027-11-26',
        unitPrice: { amount: '22000000', currency: 'VND' },
        billingCycle: 'ANNUAL',
        autoRenew: true,
        allowsMidTermReduction: false,
      },
    });
  });
  it('records a provider refusal with tagged evidence and no next period', () => {
    const body = renewalBody({ ...adjustment, target: 5, suggestedChoice: 'RENEW' }, spec('zoom-pro'));
    expect(body).toMatchObject({ choice: 'RENEW', proposedQuantity: 5, outcome: 'VENDOR_REFUSED' });
    expect(body.outcomeNote).toContain('[SV-SBF20-ZOOM]');
    expect(body).not.toHaveProperty('nextPeriod');
  });
  it('refuses an unsupported cancellation or an unknown server choice', () => {
    expect(() => renewalBody({ ...adjustment, target: 0, suggestedChoice: 'CANCEL' }, spec('adobe-cc-teams'))).toThrow(
      /target|cancel/i,
    );
    expect(() => renewalBody({ ...adjustment, suggestedChoice: null }, spec('adobe-cc-teams'))).toThrow(/choice/i);
  });
  it('records both as ITA2, including the Zoom period owned by ITA1, and runs after the rules and decisions', () => {
    expect(fixture.renewals.map(({ subscription, by }) => [subscription, by])).toEqual([
      ['adobe-cc-teams', 'NV-ITA2'],
      ['zoom-pro', 'NV-ITA2'],
    ]);
    expect(fixture.subscriptions.find((row) => row.key === 'zoom-pro')!.responsible).toBe('NV-ITA1');
    const keys = demoSteps(fixture).map(({ key }) => key);
    expect(keys.indexOf(RENEWAL_STEPS[0].key)).toBeGreaterThan(keys.indexOf('ghost.decisions'));
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
    ids.plans.set(subscription.plan, 'plan-1');
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
