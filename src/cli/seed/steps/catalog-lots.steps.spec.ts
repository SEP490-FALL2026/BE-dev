import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import { CATALOG_LOT_STEPS, lotBody } from './catalog-lots.steps';

const lot = (key: string) => SHARED_DEMO_V4.lots.find((candidate) => candidate.key === key)!;
const step = CATALOG_LOT_STEPS[0];

/** A run whose API answers the lots already made (`existing`, by plan) and records every call. */
function run(
  existing: Record<string, { id: string; licenseCount: number; amount: string }[]> = {},
  mode: 'apply' | 'plan' = 'apply',
) {
  const plans = new Map(
    SHARED_DEMO_V4.applications.flatMap((app) => app.plans).map((plan) => [plan.key, `plan-${plan.key}`]),
  );
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const api = {
    signIn: jest.fn().mockResolvedValue(undefined),
    call: jest.fn((_email: string, method: string, path: string, body?: unknown): Promise<unknown> => {
      calls.push({ method, path, body });
      if (method === 'GET') {
        const planId = new URL(`http://x${path}`).searchParams.get('planId') ?? '';
        const rows = (existing[planId.replace('plan-', '')] ?? []).map((row) => ({
          id: row.id,
          licenseCount: row.licenseCount,
          unitPrice: { amount: row.amount, currency: 'VND' },
        }));

        return Promise.resolve({ items: rows, pagination: { page: 1, totalPages: 1 } });
      }

      return Promise.resolve({ id: `new-${calls.length}` });
    }),
  };
  const ctx = {
    fixture: SHARED_DEMO_V4,
    today: '2026-11-17',
    mode,
    superAdminEmail: 'sa@example.test',
    demoPassword: 'demo-password',
    api,
    ids: {
      plans,
      lots: new Map<string, string>(),
      appUsers: new Map(SHARED_DEMO_V4.people.map((person) => [person.code, `user-${person.code}`])),
      employees: new Map(SHARED_DEMO_V4.people.map((person) => [person.code, `emp-${person.code}`])),
    },
  } as unknown as DemoRunContext;

  return { ctx, calls, outcome: () => step.run(ctx) };
}

describe('the body of a lot the dataset declares (W3-28)', () => {
  const { ctx } = run();

  it('buys the licenses on a day in the past at the price of one license in dong, for the purpose the plan takes', () => {
    expect(lotBody(ctx, lot('jetbrains'), 'plan-1')).toEqual({
      planId: 'plan-1',
      purchasedOn: '2026-05-01',
      licenseCount: 3,
      unitPrice: { amount: '6000000', currency: 'VND' },
      purpose: 'REPLACEMENT',
    });
    expect(lotBody(ctx, lot('office-ltsc-2024'), 'plan-2')).toMatchObject({ licenseCount: 25, purpose: 'STOCK' });
  });

  it('writes no field the route refuses (a lot has no owner or number of seats of its own to send)', () => {
    for (const declared of SHARED_DEMO_V4.lots) {
      expect(Object.keys(lotBody(ctx, declared, 'plan-1')).sort()).toEqual([
        'licenseCount',
        'planId',
        'purchasedOn',
        'purpose',
        'unitPrice',
      ]);
    }
  });
});

describe('catalog.lots', () => {
  it('is a step that waits for the plans and the workspace profiles, and the key store waits for it', () => {
    expect(step.needs).toEqual(['catalog.plans', 'catalog.workspace-profiles']);
  });

  it('makes every lot of the fixture, each by the IT Admin who answers for it, and keeps the id by the key of the lot', async () => {
    const { ctx, calls, outcome } = run();

    const result = await outcome();

    const posts = calls.filter((call) => call.method === 'POST');
    expect(posts).toHaveLength(SHARED_DEMO_V4.lots.length);
    expect(posts.every((call) => call.path === '/license-lots')).toBe(true);
    expect([...ctx.ids.lots.keys()].sort()).toEqual(SHARED_DEMO_V4.lots.map((declared) => declared.key).sort());
    expect(result.status).toBe('done');
  });

  it('makes a second lot of a plan that has one at another price, and not the lot that is already there', async () => {
    const { ctx, calls, outcome } = run({
      'jetbrains-all': [{ id: 'lot-first', licenseCount: 3, amount: '6000000.00' }],
    });

    await outcome();

    const made = calls
      .filter((call) => call.method === 'POST')
      .map((call) => (call.body as { licenseCount: number }).licenseCount);
    expect(ctx.ids.lots.get('jetbrains')).toBe('lot-first');
    expect(made).not.toContain(undefined);
    expect(made.filter((count) => count === 3)).toHaveLength(1);
    expect(ctx.ids.lots.get('jetbrains-second')).toBeDefined();
  });

  it('writes nothing on a second run: every lot is found by its licenses and price', async () => {
    const existing = Object.fromEntries(
      SHARED_DEMO_V4.lots.map((declared) => [
        declared.plan,
        SHARED_DEMO_V4.lots
          .filter((candidate) => candidate.plan === declared.plan)
          .map((candidate) => ({
            id: `id-${candidate.key}`,
            licenseCount: candidate.licenseCount,
            amount: candidate.unitPrice.amount,
          })),
      ]),
    );
    const { calls, outcome } = run(existing);

    const result = await outcome();

    expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
    expect(result.status).toBe('present');
  });

  it('only plans in a dry run, and writes nothing', async () => {
    const { calls, outcome } = run({}, 'plan');

    const result = await outcome();

    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
    expect(result.status).toBe('planned');
  });
});
