import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as F } from '../fixture/shared-demo-v4';
import { baseFor } from './budget-targets';
import { budgetSteps, yearPlanOf } from './budget.steps';

const budget = (department: string) => F.budgets.find((candidate) => candidate.department === department)!;

describe('the base of the budget of the year (T9b)', () => {
  const ctx = { fixture: F, today: '2026-11-17' } as unknown as DemoRunContext;

  it('is counted from the day of the seed for the four departments that carry a light, and written once for the others', () => {
    for (const department of ['ENG', 'ITO', 'BOD', 'FIN']) {
      expect(yearPlanOf(ctx, budget(department)).base).toBe(String(baseFor(F, department, '2026-11-17')!.base));
    }
    for (const department of ['MKT', 'SAL', 'DES']) {
      expect(yearPlanOf(ctx, budget(department))).toEqual({ base: budget(department).base, label: '' });
    }
  });

  it('keeps ENG at 600 million and names the light in the label; a day too early says the light is not reached', () => {
    expect(yearPlanOf(ctx, budget('ENG'))).toEqual({ base: '600000000', label: ' (đèn UNDER)' });
    const early = yearPlanOf({ fixture: F, today: '2026-05-10' } as unknown as DemoRunContext, budget('ENG'));

    expect(early.label).toContain('chưa đạt được');
  });
});

describe('budget.year: the version of Finance (T9b)', () => {
  const step = budgetSteps().find((candidate) => candidate.key === 'budget.year')!;

  const run = async (department: string) => {
    const only = { ...F, budgets: [budget(department)] };
    const posts: { path: string; body: Record<string, unknown> }[] = [];
    const call = jest.fn((...[, method, path, body]: [string, string, string, unknown?]): Promise<unknown> => {
      if (method === 'POST') posts.push({ path, body: body as Record<string, unknown> });
      if (path.startsWith('/budget-proposals?')) {
        return Promise.resolve({
          items: [{ id: 'proposal-1', state: 'SUBMITTED', costCenter: { id: `cc-${department}` } }],
          pagination: { totalPages: 1 },
        });
      }
      if (path.startsWith('/budget-versions?')) return Promise.resolve({ items: [], pagination: { totalPages: 1 } });

      return Promise.resolve({});
    });
    const ctx = {
      fixture: only,
      today: '2026-11-17',
      mode: 'apply',
      api: { call, signIn: () => Promise.resolve() },
      ids: { costCenters: new Map([[department, `cc-${department}`]]) },
      demoPassword: 'x',
    } as unknown as DemoRunContext;
    await step.run(ctx);

    return posts.find((post) => post.path === '/budget-versions')!.body;
  };

  it('asks Finance for a reserve of 60 % with a reason that starts with the tag of the dataset, and no other department asks one', async () => {
    const fin = await run('FIN');

    expect(fin).toMatchObject({ proposalId: 'proposal-1', reservePercent: 60 });
    expect(String(fin.reserveReason).startsWith('[SV-RESERVE]')).toBe(true);
    expect(fin.base).toEqual({ amount: String(baseFor(F, 'FIN', '2026-11-17')!.base) });
    const eng = await run('ENG');

    expect(eng).not.toHaveProperty('reservePercent');
    expect(eng).not.toHaveProperty('reserveReason');
  });
});
