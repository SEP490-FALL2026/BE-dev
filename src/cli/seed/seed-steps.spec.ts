import { demoSteps } from './seed-steps';
import { SHARED_DEMO_V4 } from './fixture/shared-demo-v4';

describe('the steps of the shared dataset', () => {
  const steps = demoSteps(SHARED_DEMO_V4);
  const keys = steps.map((step) => step.key);

  it('has each key once, and every step after the steps it needs', () => {
    expect(new Set(keys).size).toBe(steps.length);
    steps.forEach((step, index) => {
      const before = steps.slice(0, index).map((candidate) => candidate.key);
      for (const needed of step.needs) expect(before).toContain(needed);
    });
  });

  it('has a step for every scenario request, after the baseline and the approved budgets they stand on', () => {
    for (const request of SHARED_DEMO_V4.requests) {
      expect(keys).toContain(`requests.${request.key}`);
      expect(keys.indexOf(`requests.${request.key}`)).toBeGreaterThan(keys.indexOf('budget.year'));
      expect(keys.indexOf(`requests.${request.key}`)).toBeGreaterThan(keys.indexOf('catalog.baseline-close'));
    }
  });

  it('runs the rules of MF-5 after the usage is imported and the people moved, and the head decides after the rules', () => {
    expect(keys.indexOf('rules.first-run')).toBeGreaterThan(keys.indexOf('usage.imports'));
    expect(keys.indexOf('rules.first-run')).toBeGreaterThan(keys.indexOf('personnel.events'));
    expect(keys.indexOf('ghost.decisions')).toBeGreaterThan(keys.indexOf('rules.first-run'));
    expect(keys.indexOf('budget.next-year')).toBeGreaterThan(keys.indexOf('budget.year'));
  });
});
