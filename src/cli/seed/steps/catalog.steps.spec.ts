import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import {
  CATALOG_STEPS,
  baselineSeatsOf,
  planBody,
  purchasedQuantityOf,
  subscriptionBody,
  workspaceProfileBody,
} from './catalog.steps';

/** QĐ-103d, QĐ-103e: one subscription per plan, in no department's name, bought for the seats of the baseline and the free ones. */
describe('the body of a subscription the dataset declares', () => {
  const employees = new Map(SHARED_DEMO_V4.people.map((person) => [person.code, `id-${person.code}`]));
  const departments = new Map([['ENG', 'id-ENG']]);
  const ctx = {
    fixture: SHARED_DEMO_V4,
    today: '2026-11-10',
    ids: { employees, departments },
  } as unknown as DemoRunContext;
  const subscription = (key: string) => SHARED_DEMO_V4.subscriptions.find((candidate) => candidate.key === key)!;

  it('names the IT Admin who answers for it, no owner department, and a month for a subscription paid by the month', () => {
    const body = subscriptionBody(ctx, subscription('jira'), 'plan-1');

    expect(body).toMatchObject({
      billingCycle: 'MONTHLY',
      commitmentTermMonths: 1,
      responsibleItAdminEmployeeId: 'id-NV-ITA1',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      renewalDate: '2026-11-30',
    });
    expect(body).not.toHaveProperty('ownerDepartmentId');
  });

  it('names no owner department for a K1 subscription either (QĐ-113g)', () => {
    expect(subscriptionBody(ctx, subscription('chatgpt'), 'plan-1')).not.toHaveProperty('ownerDepartmentId');
  });

  it('commits to a year that renews on the day the fixture says, counted from today', () => {
    expect(subscriptionBody(ctx, subscription('figma'), 'plan-1')).toMatchObject({
      billingCycle: 'ANNUAL',
      commitmentTermMonths: 12,
      renewalDate: '2026-12-30',
      endDate: '2026-12-29',
      startDate: '2025-12-30',
    });
  });

  it('writes the price in dong and, for the plan once priced in dollars, the original price beside it (FX-1)', () => {
    expect(subscriptionBody(ctx, subscription('cursor'), 'plan-1')).toMatchObject({
      unitPrice: { amount: '508000', currency: 'VND' },
      originalPrice: { amount: '20', currency: 'USD' },
    });
    const jira = subscriptionBody(ctx, subscription('jira'), 'plan-1');
    expect(jira).toMatchObject({ unitPrice: { amount: '200000', currency: 'VND' } });
    expect(jira).not.toHaveProperty('originalPrice');
  });

  it('declares a perpetual subscription with the day it was bought and no end', () => {
    const body = subscriptionBody(ctx, subscription('jetbrains'), 'plan-1');

    expect(body).toMatchObject({ kind: 'PERPETUAL', purchasedQuantity: 3, startDate: '2026-04-24' });
    expect(body).not.toHaveProperty('endDate');
  });

  it('buys the seats of the baseline file and the free ones, or the number the fixture names for a plan with no file', () => {
    for (const declared of SHARED_DEMO_V4.subscriptions) {
      expect(purchasedQuantityOf(ctx, declared)).toBe(
        declared.quantity ?? baselineSeatsOf(ctx, declared.key) + declared.freeAfterBaseline,
      );
    }
    expect(purchasedQuantityOf(ctx, subscription('onepassword'))).toBe(baselineSeatsOf(ctx, 'onepassword'));
  });
});

/** QĐ-110k, R-53 (X-IT-R5): a plan the company administers at the vendor has a profile with two different IT Admins before its subscription is made. */
describe('the workspace profile the dataset records for the plans that need admins at the vendor', () => {
  const employees = new Map(SHARED_DEMO_V4.people.map((person) => [person.code, `id-${person.code}`]));
  const ctx = { fixture: SHARED_DEMO_V4, today: '2026-11-10', ids: { employees } } as unknown as DemoRunContext;
  const plan = (key: string) => SHARED_DEMO_V4.applications.flatMap((app) => app.plans).find((p) => p.key === key)!;

  it('names the IT Admin who answers for the subscription as the owner and another IT Admin as the admin, for every plan that needs them', () => {
    const needing = SHARED_DEMO_V4.applications
      .flatMap((app) => app.plans)
      .filter((p) => p.provisioningType === 'K2' || p.hasAdminConsole === true)
      // A plan with no subscription (Skype, retired in S21) has no IT Admin who answers for it and so no profile.
      .filter((p) => SHARED_DEMO_V4.subscriptions.some((s) => s.plan === p.key) || p.key === 'skype-online');
    expect(needing.map((p) => p.key)).toContain('jetbrains-all');
    for (const needed of needing) {
      if (needed.key === 'skype-online') {
        expect(workspaceProfileBody(ctx, needed)).toBeNull();
        continue;
      }
      const body = workspaceProfileBody(ctx, needed)!;
      const responsible = SHARED_DEMO_V4.subscriptions.find((s) => s.plan === needed.key)!.responsible;

      expect(body.primaryOwnerEmployeeId).toBe(`id-${responsible}`);
      expect(body.members).toHaveLength(2);
      expect(new Set(body.members.map((member) => member.employeeId)).size).toBe(2);
      expect(body.members).toContainEqual({ employeeId: `id-${responsible}`, role: 'OWNER' });
      if (needed.vendorAdmin)
        expect(body.members).toContainEqual({ employeeId: `id-${needed.vendorAdmin}`, role: 'ADMIN' });
    }
  });

  it('records the company account at the vendor for every profile but the one left without it to show the flag (QĐ-110u)', () => {
    expect(workspaceProfileBody(ctx, plan('canva-teams'))).not.toHaveProperty('ownerAccountEmail');
    expect(workspaceProfileBody(ctx, plan('jira-standard'))?.ownerAccountEmail).toBe(
      'it-jira-standard@saoviet.example',
    );
  });

  it('asks nothing of a plan that needs no admins at the vendor (K1, K4 with no console, K5)', () => {
    for (const key of ['chatgpt-plus', 'jetbrains-datagrip', 'hr-portal-access']) {
      expect(workspaceProfileBody(ctx, plan(key))).toBeNull();
    }
  });

  it('is a step of its own that the subscriptions wait for', () => {
    const steps = new Map(CATALOG_STEPS.map((step) => [step.key, step]));

    expect(steps.get('catalog.workspace-profiles')?.needs).toEqual(['catalog.plans']);
    expect(steps.get('catalog.subscriptions')?.needs).toContain('catalog.workspace-profiles');
  });
});

/** Q5, SPEC 4.5: the days of a subscription are counted from the day the seed runs, so the demo has plans inside and outside the adjustment window on any day. */
describe('the days of a subscription counted from the day of the seed (T5)', () => {
  const employees = new Map(SHARED_DEMO_V4.people.map((person) => [person.code, `id-${person.code}`]));
  const ctxOn = (today: string) =>
    ({ fixture: SHARED_DEMO_V4, today, ids: { employees, departments: new Map() } }) as unknown as DemoRunContext;
  const declared = (key: string) => SHARED_DEMO_V4.subscriptions.find((candidate) => candidate.key === key)!;
  const monthly = (renewalInDays: number) => ({ ...declared('jira'), renewalInDays });
  const annual = (extra: Record<string, unknown>) => ({ ...declared('figma'), ...extra });

  it('anchors the payment day of a monthly plan on today', () => {
    expect(subscriptionBody(ctxOn('2026-11-17'), monthly(20), 'p')).toMatchObject({
      renewalDate: '2026-12-07',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
  });

  it('moves the end of a monthly plan past the year when its payment day is next year', () => {
    expect(subscriptionBody(ctxOn('2026-12-20'), monthly(20), 'p')).toMatchObject({
      renewalDate: '2027-01-09',
      endDate: '2027-01-08',
    });
  });

  it('declares the deadline to cancel of an annual plan when the fixture names one', () => {
    const body = subscriptionBody(ctxOn('2026-11-17'), annual({ renewalInDays: 70, noticeDeadlineInDays: 25 }), 'p');

    expect(body).toMatchObject({ renewalDate: '2027-01-26', noticeDeadline: '2026-12-12', autoRenew: true });
    expect(subscriptionBody(ctxOn('2026-11-17'), annual({}), 'p')).not.toHaveProperty('noticeDeadline');
  });

  it('writes no date to alert from for a plan the fixture leaves without dates', () => {
    const body = subscriptionBody(ctxOn('2026-11-17'), annual({ renewalInDays: undefined, withoutDates: true }), 'p');

    expect(body).toMatchObject({
      billingCycle: 'ANNUAL',
      commitmentTermMonths: 12,
      startDate: '2026-05-01',
      autoRenew: false,
    });
    for (const field of ['endDate', 'renewalDate', 'noticePeriodDays', 'noticeDeadline']) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('lets a plan opt out of the automatic renewal', () => {
    expect(subscriptionBody(ctxOn('2026-11-17'), annual({ autoRenew: false }), 'p')).toMatchObject({
      autoRenew: false,
    });
  });

  it('leaves a monthly plan with no payment day on the calendar year', () => {
    const body = subscriptionBody(ctxOn('2026-11-17'), { ...declared('jira'), renewalInDays: undefined }, 'p');

    expect(body).toMatchObject({ startDate: '2026-01-01', endDate: '2026-12-31' });
    expect(body).not.toHaveProperty('renewalDate');
  });

  it.each(['2026-12-31', '2028-02-29', '2027-01-31'])(
    'keeps renewalDate at most one day after endDate on %s',
    (today) => {
      for (const days of [1, 3, 20]) {
        const body = subscriptionBody(ctxOn(today), monthly(days), 'p') as {
          startDate: string;
          endDate: string;
          renewalDate: string;
        };
        const dayAfterEnd = new Date(`${body.endDate}T00:00:00Z`).getTime() + 86_400_000;

        expect(new Date(`${body.renewalDate}T00:00:00Z`).getTime()).toBeLessThanOrEqual(dayAfterEnd);
        expect(body.startDate <= body.endDate).toBe(true);
      }
    },
  );

  it('gives the seven monthly K2 plans of the first dataset a payment day 20 days away, and Figma stays at 50', () => {
    for (const key of ['jira', 'slack', 'github', 'onepassword', 'postman', 'mailchimp', 'canva']) {
      expect(declared(key).renewalInDays).toBe(20);
    }
    expect(declared('figma').renewalInDays).toBe(50);
    for (const key of ['chatgpt', 'cursor', 'grammarly']) expect(declared(key).renewalInDays).toBeUndefined();
  });
});

/** SPEC S05: thirteen more workspace profiles (the twelve K2 plans with a subscription and Visio); Notion Business names no company account. */
describe('the workspace profiles of the plans of T4 and T6', () => {
  const employees = new Map(SHARED_DEMO_V4.people.map((person) => [person.code, `id-${person.code}`]));
  const ctx = { fixture: SHARED_DEMO_V4, today: '2026-11-17', ids: { employees } } as unknown as DemoRunContext;
  const plans = SHARED_DEMO_V4.applications.flatMap((app) => app.plans);

  it('records a profile for each K2 plan with a subscription and for Visio, and none for Skype or the K1, K5 plans', () => {
    const withProfile = plans.filter((plan) => workspaceProfileBody(ctx, plan) !== null).map((plan) => plan.key);
    const added = withProfile.filter(
      (key) =>
        ![
          'jira-standard',
          'figma-professional',
          'slack-pro',
          'github-team',
          'onepassword-business',
          'postman-professional',
          'mailchimp-standard',
          'canva-teams',
          'jetbrains-all',
        ].includes(key),
    );

    // Claude Team is two plans of two workspaces (QĐ-113b): thirteen K2 plans with a subscription and Visio, as before, plus one.
    expect(added).toHaveLength(14);
    expect(added).toContain('visio-pro');
    expect(withProfile).not.toContain('skype-online');
    expect(withProfile).not.toContain('claude-pro');
    expect(withProfile).not.toContain('sublime-license');
  });

  it('names the third IT Admin as the vendor admin of Microsoft 365 and Visio, and leaves Notion Business without a company account', () => {
    const body = (key: string) =>
      workspaceProfileBody(
        ctx,
        plans.find((plan) => plan.key === key)!,
      )!;

    expect(body('m365-basic').members).toContainEqual({ employeeId: 'id-NV-ITA3', role: 'ADMIN' });
    expect(body('visio-pro').members).toContainEqual({ employeeId: 'id-NV-ITA3', role: 'ADMIN' });
    expect(body('notion-business')).not.toHaveProperty('ownerAccountEmail');
    expect(body('notion-plus').ownerAccountEmail).toBe('it-notion-plus@saoviet.example');
  });
});

/** QĐ-113a: a paid plan carries its reference price in dong before tax; a plan with none (K5) sends no field. */
describe('the body of a plan the dataset declares', () => {
  const plan = (key: string) => SHARED_DEMO_V4.applications.flatMap((app) => app.plans).find((p) => p.key === key)!;

  it('writes the reference price of a paid plan in dong', () => {
    expect(planBody('app-1', plan('claude-team-standard'))).toMatchObject({
      name: 'Claude Team Standard',
      referencePrice: { amount: '500000', currency: 'VND' },
    });
    expect(planBody('app-1', plan('claude-team-premium'))).toMatchObject({
      referencePrice: { amount: '2500000', currency: 'VND' },
    });
    expect(planBody('app-1', plan('jetbrains-all'))).toMatchObject({
      referencePrice: { amount: '6000000', currency: 'VND' },
    });
  });

  it('writes the price of the K1 plan that has no subscription, and none for an internal K5 plan', () => {
    expect(planBody('app-1', plan('grammarly-business'))).toMatchObject({
      provisioningType: 'K1',
      referencePrice: { amount: '360000', currency: 'VND' },
    });
    expect(planBody('app-1', plan('hr-portal-access'))).not.toHaveProperty('referencePrice');
  });

  it('writes the key binding of a K4 plan the fixture binds to the machine, the Windows bundled with it with no price, and none for the others (W2-17)', () => {
    expect(planBody('app-1', plan('office-ltsc-2024'))).toMatchObject({
      provisioningType: 'K4',
      keyBinding: 'DEVICE_KEY',
      referencePrice: { amount: '3500000', currency: 'VND' },
    });
    const windows = planBody('app-1', plan('windows-11-pro-oem'));
    expect(windows).toMatchObject({ provisioningType: 'K4', keyBinding: 'DEVICE_BUNDLED' });
    expect(windows).not.toHaveProperty('referencePrice');
    expect(windows).not.toHaveProperty('hasAdminConsole');
    expect(planBody('app-1', plan('jetbrains-all'))).not.toHaveProperty('keyBinding');
    expect(planBody('app-1', plan('claude-team-standard'))).not.toHaveProperty('keyBinding');
  });
});

describe('catalog.subscriptions step', () => {
  it('sends expectedUpdatedAt from the found draft when patching its terms', async () => {
    const step = CATALOG_STEPS.find((s) => s.key === 'catalog.subscriptions')!;
    const call = jest.fn((_actor: string, method: string, path: string) => {
      if (method === 'GET' && path.startsWith('/subscriptions?')) {
        return Promise.resolve({
          items: [{ id: 'sub-draft-1', status: 'DRAFT', updatedAt: '2026-11-10T00:00:00.000Z' }],
          pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
        });
      }
      return Promise.resolve(undefined);
    });
    const employees = new Map(SHARED_DEMO_V4.people.map((person) => [person.code, `id-${person.code}`]));
    const plans = new Map(SHARED_DEMO_V4.applications.flatMap((app) => app.plans.map((p) => [p.key, `id-${p.key}`])));
    const ctx = {
      fixture: { ...SHARED_DEMO_V4, subscriptions: [SHARED_DEMO_V4.subscriptions[0]] },
      today: '2026-11-10',
      mode: 'apply',
      demoPassword: 'demo',
      tokens: new Map([['NV-ITA1', 'token-1']]),
      ids: { employees, departments: new Map(), plans, subscriptions: new Map() },
      api: { call, signIn: jest.fn().mockResolvedValue('token-1') },
    } as unknown as DemoRunContext;

    await step.run(ctx);

    const calls = call.mock.calls as Array<[string, string, string, unknown?]>;
    const patchCall = calls.find((c) => c[1] === 'PATCH');
    expect(patchCall).toBeDefined();
    expect(patchCall![2]).toBe('/subscriptions/sub-draft-1');
    expect(patchCall![3]).toMatchObject({ expectedUpdatedAt: '2026-11-10T00:00:00.000Z' });
  });
});
