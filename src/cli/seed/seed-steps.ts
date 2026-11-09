import type { DemoStep } from './demo-run.types';
import type { DemoFixture } from './fixture/demo-fixture.types';
import { SHARED_DEMO_V4 } from './fixture/shared-demo-v4';
import { ASSET_STEPS } from './steps/assets.steps';
import { BASELINE_STEPS } from './steps/baseline.steps';
import { budgetSteps } from './steps/budget.steps';
import { CATALOG_STEPS } from './steps/catalog.steps';
import { extraSteps } from './steps/extras.steps';
import { FINANCE_STEPS } from './steps/finance.steps';
import { ORGANIZATION_STEPS } from './steps/organization.steps';
import { PERSONNEL_STEPS } from './steps/personnel.steps';
import { requestSteps } from './steps/request.steps';
import { USAGE_STEPS } from './steps/usage.steps';

/** The fixtures the command knows, by id. A new version of the data is a new entry, never an edit of an applied one. */
export const DEMO_FIXTURES: Readonly<Record<string, DemoFixture>> = { [SHARED_DEMO_V4.id]: SHARED_DEMO_V4 };

const pick = (key: string): DemoStep => {
  const found = FINANCE_STEPS.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`Unknown step ${key}`);

  return found;
};

/** The steps of a fixture in an order where every step comes after the steps it needs. */
export function demoSteps(fixture: DemoFixture): DemoStep[] {
  return [
    ...ORGANIZATION_STEPS,
    pick('finance.cost-centers'),
    pick('finance.exchange-rates'),
    ...CATALOG_STEPS,
    pick('finance.tax-profile'),
    ...BASELINE_STEPS,
    ...ASSET_STEPS,
    pick('budget.cycles'),
    ...budgetSteps(),
    ...requestSteps(fixture.requests),
    ...extraSteps(fixture.saasIssue.request),
    ...PERSONNEL_STEPS,
    ...USAGE_STEPS,
  ];
}
