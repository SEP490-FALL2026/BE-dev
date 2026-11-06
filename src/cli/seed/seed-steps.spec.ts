import { demoSteps } from './seed-steps';
import { SHARED_DEMO_V3 } from './fixture/shared-demo-v3';

describe('the steps of the shared dataset', () => {
  const steps = demoSteps(SHARED_DEMO_V3);

  it('has each key once, and every step after the steps it needs', () => {
    expect(new Set(steps.map((step) => step.key)).size).toBe(steps.length);
    steps.forEach((step, index) => {
      const before = steps.slice(0, index).map((candidate) => candidate.key);
      for (const needed of step.needs) expect(before).toContain(needed);
    });
  });

  it('records the invoices after the requests whose commitments they are recorded against, and the next-year proposal before the requests', () => {
    const keys = steps.map((step) => step.key);
    const invoices = steps.find((step) => step.key === 'finance.invoices');

    expect(invoices?.needs).toEqual(expect.arrayContaining(['requests.R1', 'requests.R10', 'requests.R11']));
    expect(keys.indexOf('finance.invoices')).toBeGreaterThan(keys.indexOf('requests.R11'));
    expect(keys.indexOf('budget.next-year')).toBeGreaterThan(keys.indexOf('budget.year'));
  });
});
