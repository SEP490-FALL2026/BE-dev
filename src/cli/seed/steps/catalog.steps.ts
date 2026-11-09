import { addMonths, dayOffset } from '../demo-dates';
import { as, listAll, summarize, yearOf } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoApplication, DemoPlan, DemoSubscription } from '../fixture/demo-fixture.types';

type Result = { status: StepOutcome['status']; label: string };

interface ApplicationRow {
  id: string;
  name: string;
  vendor: { id: string; name: string } | null;
}

/** The IT Admin the dataset writes the catalog as: the one in charge of the IT department. */
export function catalogAdmin(ctx: DemoRunContext): string {
  const it = ctx.fixture.departments.find((department) => department.code === 'ITO');

  return it?.itAdmin ?? ctx.fixture.people.find((person) => person.account === 'IT_ADMIN')?.code ?? '';
}

async function applications(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, catalogAdmin(ctx));
  const results: Result[] = [];
  for (const application of ctx.fixture.applications) {
    const rows = await listAll<ApplicationRow>(
      ctx,
      admin,
      `/applications?search=${encodeURIComponent(application.name)}`,
    );
    results.push(await oneApplication(ctx, admin, application, rows));
  }

  return summarize(results);
}

async function oneApplication(
  ctx: DemoRunContext,
  admin: string,
  application: DemoApplication,
  rows: ApplicationRow[],
): Promise<Result> {
  const label = application.name;
  const found = rows.find(
    (row) => row.name === application.name && (row.vendor?.name ?? null) === (application.vendorName ?? null),
  );
  if (found) {
    ctx.ids.applications.set(application.key, found.id);
    if (found.vendor) ctx.ids.vendors.set(application.key, found.vendor.id);
    return { status: 'present', label };
  }
  if (ctx.mode === 'plan') return { status: 'planned', label };
  const created = await ctx.api.call<ApplicationRow>(admin, 'POST', '/applications', {
    name: application.name,
    kind: application.kind,
    ...(application.vendorName ? { vendorName: application.vendorName } : {}),
    dataSensitivity: application.dataSensitivity,
    communication: { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false },
  });
  ctx.ids.applications.set(application.key, created.id);
  if (created.vendor) ctx.ids.vendors.set(application.key, created.vendor.id);

  return { status: 'done', label };
}

function planBody(applicationId: string, plan: DemoPlan): Record<string, unknown> {
  return {
    applicationId,
    name: plan.name,
    provisioningType: plan.provisioningType,
    dataLossOnRemoval: plan.dataLossOnRemoval,
    ...(plan.pricingModel ? { pricingModel: plan.pricingModel } : {}),
    ...(plan.controlLevel ? { controlLevel: plan.controlLevel } : {}),
    ...(plan.revocationNote ? { revocationNote: plan.revocationNote } : {}),
    ...(plan.sharingPolicy ? { sharingPolicy: plan.sharingPolicy } : {}),
  };
}

type PlanRow = { id: string; name: string } & Partial<Record<keyof DemoPlan, unknown>>;

/** The fields of the fixture's plan that the existing one does not have (only those the fixture sets). */
function planDifferences(plan: DemoPlan, row: PlanRow): string[] {
  const keys = ['provisioningType', 'pricingModel', 'controlLevel', 'dataLossOnRemoval', 'sharingPolicy'] as const;

  return keys.filter((key) => plan[key] !== undefined && row[key] !== plan[key]);
}

async function plans(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, catalogAdmin(ctx));
  const results: Result[] = [];
  for (const application of ctx.fixture.applications) {
    const applicationId = ctx.ids.applications.get(application.key) ?? '';
    const rows = await listAll<PlanRow>(ctx, admin, `/plans?applicationId=${applicationId}`);
    for (const plan of application.plans) {
      const found = rows.find((row) => row.name === plan.name);
      const differences = found ? planDifferences(plan, found) : [];
      if (found) {
        ctx.ids.plans.set(plan.key, found.id);
        results.push(
          differences.length
            ? { status: 'conflict', label: `${plan.name} đã có với ${differences.join(', ')} khác fixture` }
            : { status: 'present', label: plan.name },
        );
      } else if (ctx.mode === 'plan') results.push({ status: 'planned', label: plan.name });
      else {
        const created = await ctx.api.call<{ id: string }>(admin, 'POST', '/plans', planBody(applicationId, plan));
        ctx.ids.plans.set(plan.key, created.id);
        results.push({ status: 'done', label: plan.name });
      }
    }
  }

  return summarize(results);
}

interface SubscriptionRow {
  id: string;
  status: string;
}

/** Seats the baseline files put in the subscription, counted from the fixture. */
export function baselineSeatsOf(ctx: DemoRunContext, subscriptionKey: string): number {
  return ctx.fixture.seats.filter((seat) => seat.subscription === subscriptionKey).length;
}

/** What is bought: the baseline seats and the free ones, or the number the fixture names for a plan with no baseline file. */
export function purchasedQuantityOf(ctx: DemoRunContext, subscription: DemoSubscription): number {
  return subscription.quantity ?? baselineSeatsOf(ctx, subscription.key) + subscription.freeAfterBaseline;
}

/** The terms of a subscription (everything but which plan and for whom), as the API takes them on creation and on update of a draft. */
export function subscriptionTerms(ctx: DemoRunContext, subscription: DemoSubscription): Record<string, unknown> {
  const base = {
    purchasedQuantity: purchasedQuantityOf(ctx, subscription),
    unitPrice: subscription.unitPrice,
    responsibleItAdminEmployeeId: ctx.ids.employees.get(subscription.responsible),
  };
  // A key is bought once, on a day in the past (the purchase date is the start date); it has no term and no end.
  if (subscription.kind === 'PERPETUAL') return { ...base, startDate: dayOffset(ctx.today, -200) };
  const { year } = yearOf(ctx);
  // The annual one renews on a day from today and runs the 12 months before it; the monthly ones run the calendar year, a month at a time.
  const renewal = subscription.renewalInDays === undefined ? null : dayOffset(ctx.today, subscription.renewalInDays);

  return {
    ...base,
    billingCycle: subscription.billingCycle,
    commitmentTermMonths: subscription.termMonths,
    startDate: renewal ? addMonths(renewal, -12) : `${year}-01-01`,
    endDate: renewal ? dayOffset(renewal, -1) : `${year}-12-31`,
    ...(renewal ? { renewalDate: renewal } : {}),
    noticePeriodDays: subscription.noticePeriodDays ?? 30,
    autoRenew: true,
    allowsMidTermReduction: false,
  };
}

export function subscriptionBody(
  ctx: DemoRunContext,
  subscription: DemoSubscription,
  planId: string,
): Record<string, unknown> {
  return {
    planId,
    kind: subscription.kind,
    ...(subscription.ownerDepartment
      ? { ownerDepartmentId: ctx.ids.departments.get(subscription.ownerDepartment) }
      : {}),
    ...subscriptionTerms(ctx, subscription),
  };
}

async function subscriptions(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, catalogAdmin(ctx));
  const results: Result[] = [];
  for (const subscription of ctx.fixture.subscriptions) {
    results.push(await oneSubscription(ctx, admin, subscription));
  }

  return summarize(results);
}

/**
 * One subscription for a (application, plan): found by its plan, whatever its period and quantity became since (the demo changes them),
 * so a rerun never makes a second one (the stock of the pool is one, `QĐ-103d`).
 */
async function oneSubscription(ctx: DemoRunContext, admin: string, subscription: DemoSubscription): Promise<Result> {
  const label = subscription.key;
  const planId = ctx.ids.plans.get(subscription.plan) ?? '';
  const rows = await listAll<SubscriptionRow>(ctx, admin, `/subscriptions?planId=${planId}`);
  let found = rows[0];
  if (!found && ctx.mode === 'plan') return { status: 'planned', label };
  if (!found)
    found = await ctx.api.call<SubscriptionRow>(
      admin,
      'POST',
      '/subscriptions',
      subscriptionBody(ctx, subscription, planId),
    );
  ctx.ids.subscriptions.set(subscription.key, found.id);
  const created = rows.length === 0;
  if (found.status === 'ACTIVE') return { status: created ? 'done' : 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label: `${label} (hoàn tất bản nháp)` };
  // A draft an earlier run left is brought to the fixture's terms before it is completed.
  await ctx.api.call(admin, 'PATCH', `/subscriptions/${found.id}`, subscriptionTerms(ctx, subscription));
  await ctx.api.call(admin, 'POST', `/subscriptions/${found.id}/completions`);

  return { status: 'done', label };
}

export const CATALOG_STEPS: readonly DemoStep[] = [
  { key: 'catalog.applications', title: 'Ứng dụng (IT Admin)', needs: ['org.accounts'], run: applications },
  { key: 'catalog.plans', title: 'Gói (IT Admin)', needs: ['catalog.applications'], run: plans },
  {
    key: 'catalog.subscriptions',
    title: 'Một thuê bao cho mỗi gói: kho dùng chung (IT Admin)',
    needs: ['catalog.plans', 'finance.exchange-rates'],
    run: subscriptions,
  },
];
