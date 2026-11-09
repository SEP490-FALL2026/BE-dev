import type { DemoStep } from './demo-run.types';
import type { DemoFixture } from './fixture/demo-fixture.types';
import { SHARED_DEMO_V3 } from './fixture/shared-demo-v3';
import { CATALOG_STEPS } from './steps/catalog.steps';
import { extraSteps } from './steps/extras.steps';
import { FINANCE_STEPS, invoiceSteps } from './steps/finance.steps';
import { ORGANIZATION_STEPS } from './steps/organization.steps';
import { requestSteps } from './steps/request.steps';

/** The fixtures the command knows, by id. A new version of the data is a new entry, never an edit of an applied one. */
export const DEMO_FIXTURES: Readonly<Record<string, DemoFixture>> = { [SHARED_DEMO_V3.id]: SHARED_DEMO_V3 };

const step = (steps: readonly DemoStep[], key: string): DemoStep => {
  const found = steps.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`Unknown step ${key}`);

  return found;
};

/** The steps of a fixture in an order where every step comes after the steps it needs. */
export function demoSteps(fixture: DemoFixture): DemoStep[] {
  return [
    ...ORGANIZATION_STEPS,
    step(FINANCE_STEPS, 'finance.cost-centers'),
    ...CATALOG_STEPS,
    step(FINANCE_STEPS, 'finance.tax-profile'),
    step(FINANCE_STEPS, 'budget.year'),
    step(FINANCE_STEPS, 'budget.next-year'),
    ...requestSteps(fixture.requests),
    ...invoiceSteps(fixture),
    ...extraSteps(fixture.saasIssue.request),
  ];
}
