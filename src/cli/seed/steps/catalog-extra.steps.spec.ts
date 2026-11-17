import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import { CATALOG_EXTRA_STEPS, planTermsBody } from './catalog-extra.steps';

const ctxOf = (overrides: Record<string, unknown> = {}) =>
  ({
    fixture: SHARED_DEMO_V4,
    today: '2026-11-17',
    mode: 'apply',
    superAdminEmail: 'sa@example.test',
    ...overrides,
  }) as unknown as DemoRunContext;
const termsOf = (plan: string) => SHARED_DEMO_V4.planTerms.find((candidate) => candidate.plan === plan)!;

describe('the body of the terms of a plan (SPEC S06)', () => {
  it('counts the day of the last review from today: Notion Plus was reviewed 400 days ago, so its review is long due', () => {
    expect(planTermsBody(ctxOf(), termsOf('notion-plus'))).toMatchObject({ lastReviewedOn: '2025-10-13' });
  });

  it('keeps Microsoft 365 Standard reviewed 10 days ago with the two points of the checklist it was given', () => {
    expect(planTermsBody(ctxOf(), termsOf('m365-standard'))).toMatchObject({ lastReviewedOn: '2026-11-07' });
    const body = planTermsBody(ctxOf(), termsOf('m365-standard'));
    expect(typeof body.aiTraining).toBe('string');
    expect(typeof body.dataLocation).toBe('string');
  });

  it('limits a Visio key to two machines, as a number, because only a K4 plan keeps that point as a number', () => {
    expect(planTermsBody(ctxOf(), termsOf('visio-pro'))).toMatchObject({ installLimit: { maxDevicesPerKey: 2 } });
  });

  it('says in Claude Team that the customer data is not used to train the model', () => {
    expect(String(planTermsBody(ctxOf(), termsOf('claude-team')).aiTraining)).toContain('huấn luyện');
  });

  it('names exactly four plans of the catalog, none of them the plan with no terms on purpose (Confluence Premium) or Figma', () => {
    expect(SHARED_DEMO_V4.planTerms.map((terms) => terms.plan).sort()).toEqual([
      'claude-team',
      'm365-standard',
      'notion-plus',
      'visio-pro',
    ]);
    const plans = SHARED_DEMO_V4.applications.flatMap((app) => app.plans.map((plan) => plan.key));
    for (const terms of SHARED_DEMO_V4.planTerms) expect(plans).toContain(terms.plan);
  });

  it('never dates a review in the future (the API refuses one)', () => {
    for (const terms of SHARED_DEMO_V4.planTerms) expect(terms.lastReviewedDaysAgo ?? 0).toBeGreaterThanOrEqual(0);
  });
});

describe('catalog.plan-terms', () => {
  const step = CATALOG_EXTRA_STEPS.find((candidate) => candidate.key === 'catalog.plan-terms')!;
  const plans = new Map(SHARED_DEMO_V4.planTerms.map((terms) => [terms.plan, `plan-${terms.plan}`]));

  const run = (written: Set<string>, mode: 'apply' | 'plan' = 'apply') => {
    const call = jest.fn((...[, method, path]: [string, string, string, unknown?]): Promise<unknown> => {
      if (method === 'GET') {
        const key = [...plans].find(([, id]) => path === `/plans/${id}/terms`)?.[0] ?? '';
        return Promise.resolve({ terms: written.has(key) ? { termsUrl: null } : null });
      }
      return Promise.resolve({ terms: {}, changed: true });
    });
    const ids = { plans, employees: new Map(), departments: new Map() };
    const api = {
      call,
      hasSession: () => true,
      signIn: () => Promise.resolve(),
    };

    return { outcome: step.run(ctxOf({ mode, api, ids, demoPassword: 'x' })), call };
  };

  it('needs the subscriptions: the warning of a review reads them', () => {
    expect(step.needs).toEqual(['catalog.subscriptions']);
  });

  it('writes the terms of the four plans that have none', async () => {
    const { outcome, call } = run(new Set());

    await expect(outcome).resolves.toMatchObject({ status: 'done' });
    expect(
      call.mock.calls
        .filter((args) => args[1] === 'PUT')
        .map((args) => args[2])
        .sort(),
    ).toEqual([...plans.values()].map((id) => `/plans/${id}/terms`).sort());
  });

  it('leaves a plan whose terms exist as they are, even when somebody changed them', async () => {
    const { outcome, call } = run(new Set(plans.keys()));

    await expect(outcome).resolves.toMatchObject({ status: 'present' });
    expect(call.mock.calls.some((args) => args[1] === 'PUT')).toBe(false);
  });

  it('writes nothing in plan mode', async () => {
    const { outcome, call } = run(new Set(), 'plan');

    await expect(outcome).resolves.toMatchObject({ status: 'planned' });
    expect(call.mock.calls.some((args) => args[1] === 'PUT')).toBe(false);
  });
});
