import type { DemoStep } from './demo-run.types';
import type { DemoFixture } from './fixture/demo-fixture.types';
import { SHARED_DEMO_V4 } from './fixture/shared-demo-v4';
import { ASSET_STEPS } from './steps/assets.steps';
import { BASELINE_STEPS } from './steps/baseline.steps';
import { budgetSteps } from './steps/budget.steps';
import { CATALOG_EXTRA_STEPS } from './steps/catalog-extra.steps';
import { CATALOG_STEPS } from './steps/catalog.steps';
import { DEMO_STEPS } from './steps/demo.steps';
import { DEMO_DOCUMENT_STEPS } from './steps/demo-documents.steps';
import { DEVICE_STEPS } from './steps/devices.steps';
import { COLLECTOR_STEPS } from './steps/collector.steps';
import { STOP_REQUEST_STEPS } from './steps/device-stops.steps';
import { aiSteps } from './steps/ai.steps';
import { extraSteps } from './steps/extras.steps';
import { FINANCE_STEPS } from './steps/finance.steps';
import { ORGANIZATION_STEPS } from './steps/organization.steps';
import { PEOPLE_ADMIN_STEPS } from './steps/people-admin.steps';
import { NOTICE_STEPS } from './steps/notices.steps';
import { ABRUPT_DEPARTURE_STEPS, PERSONNEL_STEPS } from './steps/personnel.steps';
import { requestSteps } from './steps/request.steps';
import { SAAS_ISSUE_STEPS } from './steps/saas-issues.steps';
import { RETURN_STEPS } from './steps/returns.steps';
import { RENEWAL_STEPS } from './steps/renewals.steps';
import { SOFTWARE_LIST_STEPS } from './steps/software-list.steps';
import { USAGE_STEPS } from './steps/usage.steps';

/** The fixtures the command knows, by id. A new version of the data is a new entry, never an edit of an applied one. */
export const DEMO_FIXTURES: Readonly<Record<string, DemoFixture>> = { [SHARED_DEMO_V4.id]: SHARED_DEMO_V4 };

const pick = (key: string): DemoStep => {
  const found = FINANCE_STEPS.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`Unknown step ${key}`);

  return found;
};

/**
 * Steps that freeze what they read once written (the target of SBF-20, the snapshots of the monthly closes): they also need every request of the
 * fixture, so a request left in conflict blocks them instead of being frozen into a figure a later `--continue` can no longer correct.
 */
const AFTER_EVERY_REQUEST: ReadonlySet<string> = new Set(['renewals.adjustments', 'demo.budget-reviews']);

function afterRequests(steps: readonly DemoStep[], fixture: DemoFixture): DemoStep[] {
  return steps.map((step) =>
    AFTER_EVERY_REQUEST.has(step.key)
      ? { ...step, needs: [...step.needs, ...fixture.requests.map(({ key }) => `requests.${key}`)] }
      : step,
  );
}

/** The steps of a fixture in an order where every step comes after the steps it needs. */
export function demoSteps(fixture: DemoFixture): DemoStep[] {
  return [
    ...ORGANIZATION_STEPS,
    ...PEOPLE_ADMIN_STEPS,
    pick('finance.cost-centers'),
    ...CATALOG_STEPS,
    ...CATALOG_EXTRA_STEPS,
    pick('finance.tax-profile'),
    ...BASELINE_STEPS,
    ...ASSET_STEPS,
    ...SOFTWARE_LIST_STEPS,
    pick('budget.cycles'),
    ...budgetSteps(),
    ...requestSteps(fixture.requests),
    ...RETURN_STEPS,
    ...SAAS_ISSUE_STEPS,
    ...extraSteps(),
    ...PERSONNEL_STEPS,
    ...NOTICE_STEPS,
    ...ABRUPT_DEPARTURE_STEPS,
    ...USAGE_STEPS,
    ...afterRequests(RENEWAL_STEPS, fixture),
    ...DEVICE_STEPS,
    ...COLLECTOR_STEPS,
    ...STOP_REQUEST_STEPS,
    ...aiSteps(fixture),
    // Last: the invoices, the closes of the months and the adjustments read what the requests and seats above hold; the policy published
    // again changes the version every checklist answers, so it comes after every decision of the dataset.
    ...DEMO_DOCUMENT_STEPS,
    ...afterRequests(DEMO_STEPS, fixture),
  ];
}
