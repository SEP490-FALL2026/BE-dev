jest.mock('./budget-files', () => ({
  proposalFile: jest.fn().mockResolvedValue({ name: 'proposal.xlsx', content: Buffer.from('x') }),
  versionFile: jest.fn().mockResolvedValue({ name: 'version.xlsx', content: Buffer.from('x') }),
}));
jest.mock('./file-kit', () => ({
  uploadBudgetFile: jest.fn().mockResolvedValue('uploaded-file-1'),
}));
jest.mock('./checklist-kit', () => ({
  yesChecklist: jest.fn().mockResolvedValue({ policyVersionId: 'pv-1', answers: [{ itemCode: 'C1', answer: 'YES' }] }),
}));

import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 as F } from '../fixture/shared-demo-v4';
import { baseFor, tightBaseFor } from './budget-targets';
import { budgetSteps, yearPlanOf } from './budget.steps';

const budget = (department: string) => F.budgets.find((candidate) => candidate.department === department)!;

describe('the base of the budget of the year (T9b)', () => {
  const ctx = { fixture: F, today: '2026-11-17' } as unknown as DemoRunContext;

  it('is counted from the day of the seed for the four departments that carry a light, tightBaseFor for MKT/DES, and static for SAL', () => {
    for (const department of ['ENG', 'ITO', 'BOD', 'FIN']) {
      expect(yearPlanOf(ctx, budget(department)).base).toBe(String(baseFor(F, department, '2026-11-17')!.base));
    }
    for (const department of ['MKT', 'DES']) {
      expect(yearPlanOf(ctx, budget(department))).toEqual({
        base: String(tightBaseFor(F, department, '2026-11-17')),
        label: '',
      });
    }
    expect(yearPlanOf(ctx, budget('SAL'))).toEqual({ base: budget('SAL').base, label: '' });
  });

  it('keeps ENG at the 185 million of its BM-10 lines and names the light in the label; a day too early says the light is not reached', () => {
    expect(yearPlanOf(ctx, budget('ENG'))).toEqual({ base: '185000000', label: ' (đèn UNDER)' });
    const early = yearPlanOf({ fixture: F, today: '2026-05-10' } as unknown as DemoRunContext, budget('ENG'));

    expect(early.label).toContain('chưa đạt được');
  });
});

describe('budget.year and budget.next-year (T9b)', () => {
  const yearStep = budgetSteps().find((candidate) => candidate.key === 'budget.year')!;
  const nextYearStep = budgetSteps().find((candidate) => candidate.key === 'budget.next-year')!;

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
      accounts: { lockBudgetCycle: jest.fn(() => Promise.resolve()) },
      ids: { costCenters: new Map([[department, `cc-${department}`]]) },
      demoPassword: 'x',
    } as unknown as DemoRunContext;
    await yearStep.run(ctx);

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

  it('submits all proposals and drafts across departments while OPEN, locks the cycle once and for good before the drafts are sent, then decides in the cycle that stays locked', async () => {
    const events: string[] = [];
    const lockedCalls: { year: number; deadline: string }[] = [];
    const versions = new Map<string, string>([
      ['cc-ENG', 'DRAFT'],
      ['cc-MKT', 'DRAFT'],
    ]);
    let cycleLocked = false;
    const only = { ...F, budgets: [budget('ENG'), budget('MKT')] };
    const call = jest.fn((...[, method, path]: [string, string, string, unknown?]): Promise<unknown> => {
      if (path.startsWith('/budget-proposals?')) {
        return Promise.resolve({
          items: [
            { id: 'prop-ENG', state: 'SUBMITTED', costCenter: { id: 'cc-ENG' } },
            { id: 'prop-MKT', state: 'SUBMITTED', costCenter: { id: 'cc-MKT' } },
          ],
          pagination: { totalPages: 1 },
        });
      }
      if (path.startsWith('/budget-versions?') && path.includes('year=2026')) {
        return Promise.resolve({
          items: [
            { id: 'ver-ENG', state: versions.get('cc-ENG'), number: 1, costCenter: { id: 'cc-ENG' } },
            { id: 'ver-MKT', state: versions.get('cc-MKT'), number: 1, costCenter: { id: 'cc-MKT' } },
          ],
          pagination: { totalPages: 1 },
        });
      }
      if (path.includes('/attachments'))
        return Promise.resolve({ items: [{ id: 'file-1' }], pagination: { totalPages: 1 } });
      if (path === '/budget-cycles/2026') {
        return Promise.resolve({ year: 2026, status: cycleLocked ? 'LOCKED' : 'OPEN' });
      }
      if (method === 'POST' && path.endsWith('/submission')) {
        events.push(`submit:${path}:${cycleLocked ? 'LOCKED' : 'OPEN'}`);
        const id = path.split('/')[2];
        const cc = id === 'ver-ENG' ? 'cc-ENG' : 'cc-MKT';
        versions.set(cc, 'SENT');
      }
      if (method === 'POST' && path.endsWith('/decision')) {
        events.push(`decide:${path}:${cycleLocked ? 'LOCKED' : 'OPEN'}`);
        const id = path.split('/')[2];
        const cc = id === 'ver-ENG' ? 'cc-ENG' : 'cc-MKT';
        versions.set(cc, 'APPROVED');
      }

      return Promise.resolve({});
    });
    const lockBudgetCycle = jest.fn((year: number, deadline: string) => {
      lockedCalls.push({ year, deadline });
      cycleLocked = true;
      events.push(`lock:${year}:${deadline}`);

      return Promise.resolve();
    });
    const ctx = {
      fixture: only,
      today: '2026-11-17',
      mode: 'apply',
      api: { call, signIn: () => Promise.resolve() },
      accounts: { lockBudgetCycle },
      ids: {
        costCenters: new Map([
          ['ENG', 'cc-ENG'],
          ['MKT', 'cc-MKT'],
        ]),
      },
      demoPassword: 'x',
    } as unknown as DemoRunContext;

    const outcome = await yearStep.run(ctx);

    expect(outcome.status).toBe('done');
    expect(lockedCalls).toEqual([{ year: 2026, deadline: '2026-11-16' }]);
    expect(events).toEqual([
      'lock:2026:2026-11-16',
      'submit:/budget-versions/ver-ENG/submission:LOCKED',
      'submit:/budget-versions/ver-MKT/submission:LOCKED',
      'decide:/budget-versions/ver-ENG/decision:LOCKED',
      'decide:/budget-versions/ver-MKT/decision:LOCKED',
    ]);
  });

  it('does not lock the cycle in plan mode, when already LOCKED, or when versions are already settled', async () => {
    const lockBudgetCycle = jest.fn(() => Promise.resolve());
    const callFor = (cycleStatus: 'OPEN' | 'LOCKED', initialVersionState: string) => {
      let currentState = initialVersionState;
      return jest.fn((...[, method, path]: [string, string, string, unknown?]): Promise<unknown> => {
        if (path.startsWith('/budget-versions?')) {
          return Promise.resolve({
            items: [{ id: 'ver-ENG', state: currentState, number: 1, costCenter: { id: 'cc-ENG' } }],
            pagination: { totalPages: 1 },
          });
        }
        if (path.includes('/attachments'))
          return Promise.resolve({ items: [{ id: 'file-1' }], pagination: { totalPages: 1 } });
        if (path === '/budget-cycles/2026') return Promise.resolve({ year: 2026, status: cycleStatus });
        if (method === 'POST' && path.endsWith('/submission')) currentState = 'SENT';
        if (method === 'POST' && path.endsWith('/decision')) currentState = 'APPROVED';

        return Promise.resolve({});
      });
    };

    const planOutcome = await yearStep.run({
      fixture: { ...F, budgets: [budget('ENG')] },
      today: '2026-11-17',
      mode: 'plan',
      api: { call: callFor('OPEN', 'DRAFT'), signIn: () => Promise.resolve() },
      accounts: { lockBudgetCycle },
      ids: { costCenters: new Map([['ENG', 'cc-ENG']]) },
      demoPassword: 'x',
    } as unknown as DemoRunContext);
    expect(planOutcome.status).toBe('planned');
    expect(lockBudgetCycle).not.toHaveBeenCalled();

    const lockedApply = await yearStep.run({
      fixture: { ...F, budgets: [budget('ENG')] },
      today: '2026-11-17',
      mode: 'apply',
      api: { call: callFor('LOCKED', 'DRAFT'), signIn: () => Promise.resolve() },
      accounts: { lockBudgetCycle },
      ids: { costCenters: new Map([['ENG', 'cc-ENG']]) },
      demoPassword: 'x',
    } as unknown as DemoRunContext);
    expect(lockedApply.status).toBe('done');
    expect(lockBudgetCycle).not.toHaveBeenCalled();

    const rerunOutcome = await yearStep.run({
      fixture: { ...F, budgets: [budget('ENG')] },
      today: '2026-11-17',
      mode: 'apply',
      api: { call: callFor('OPEN', 'APPROVED'), signIn: () => Promise.resolve() },
      accounts: { lockBudgetCycle },
      ids: { costCenters: new Map([['ENG', 'cc-ENG']]) },
      demoPassword: 'x',
    } as unknown as DemoRunContext);
    expect(rerunOutcome.status).toBe('present');
    expect(lockBudgetCycle).not.toHaveBeenCalled();
  });

  it('locks the cycle of the next year once and for good for its draft versions, and leaves the BM-10 that waits for Finance in the open cycle of the year after', async () => {
    const proposals: { cc: string; year: number }[] = [];
    const submissions: string[] = [];
    const versions = new Map<string, string>();
    const lockBudgetCycle = jest.fn(() => Promise.resolve());
    // The heads send in the order of the fixture: the three of the next year, then the one of the year after.
    const heads = ['cc-ENG', 'cc-MKT', 'cc-SAL', 'cc-ITO'];
    const yearOfPath = (path: string) => Number(/year=(\d+)/.exec(path)?.[1]);
    const call = jest.fn((...[, method, path, body]: [string, string, string, unknown?]): Promise<unknown> => {
      if (path.startsWith('/budget-proposals?')) {
        return Promise.resolve({
          items: proposals
            .filter((proposal) => proposal.year === yearOfPath(path))
            .map((proposal) => ({ id: `prop-${proposal.cc}`, state: 'SUBMITTED', costCenter: { id: proposal.cc } })),
          pagination: { totalPages: 1 },
        });
      }
      if (method === 'POST' && path === '/budget-proposals/attachments') return Promise.resolve({ id: 'prop-file' });
      if (method === 'POST' && path === '/budget-proposals') {
        const year = (body as { year: number }).year;
        proposals.push({ cc: heads[proposals.length], year });
        return Promise.resolve({ id: `prop-${heads[proposals.length - 1]}` });
      }
      if (path.startsWith('/budget-versions?')) {
        return Promise.resolve({
          items:
            yearOfPath(path) === 2027
              ? [...versions.entries()].map(([cc, state]) => ({
                  id: `ver-${cc}`,
                  state,
                  number: 1,
                  costCenter: { id: cc },
                }))
              : [],
          pagination: { totalPages: 1 },
        });
      }
      if (method === 'POST' && path === '/budget-versions') {
        const nextCc = ['cc-ENG', 'cc-MKT', 'cc-SAL'].find((cc) => !versions.has(cc))!;
        versions.set(nextCc, 'DRAFT');
        return Promise.resolve({ id: `ver-${nextCc}` });
      }
      if (path.includes('/attachments'))
        return Promise.resolve({ items: [{ id: 'file-1' }], pagination: { totalPages: 1 } });
      if (path === '/budget-cycles/2027') return Promise.resolve({ year: 2027, status: 'OPEN' });
      if (method === 'POST' && path.endsWith('/submission')) {
        submissions.push(path);
        const cc = path.split('/')[2].replace('ver-', '');
        versions.set(cc, 'SENT');
      }
      if (method === 'POST' && path.endsWith('/decision')) {
        const cc = path.split('/')[2].replace('ver-', '');
        versions.set(cc, cc === 'cc-ENG' ? 'APPROVED' : 'CHANGES_REQUESTED');
      }
      return Promise.resolve({});
    });
    const ctx = {
      fixture: F,
      today: '2026-11-17',
      mode: 'apply',
      api: { call, signIn: () => Promise.resolve() },
      accounts: { lockBudgetCycle },
      ids: {
        costCenters: new Map([
          ['ENG', 'cc-ENG'],
          ['ITO', 'cc-ITO'],
          ['MKT', 'cc-MKT'],
          ['SAL', 'cc-SAL'],
        ]),
      },
      demoPassword: 'x',
    } as unknown as DemoRunContext;

    const outcome = await nextYearStep.run(ctx);

    expect(outcome.status).toBe('done');
    expect(lockBudgetCycle).toHaveBeenCalledTimes(1);
    expect(lockBudgetCycle).toHaveBeenCalledWith(2027, '2026-11-16');
    expect(proposals).toEqual([
      { cc: 'cc-ENG', year: 2027 },
      { cc: 'cc-MKT', year: 2027 },
      { cc: 'cc-SAL', year: 2027 },
      { cc: 'cc-ITO', year: 2028 },
    ]);
    expect(submissions).toEqual([
      '/budget-versions/ver-cc-ENG/submission',
      '/budget-versions/ver-cc-MKT/submission',
      '/budget-versions/ver-cc-SAL/submission',
    ]);
  });
});
