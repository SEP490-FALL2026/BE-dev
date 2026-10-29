import { as, listAll, summarize, yearOf } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoApplication, DemoPlan, DemoSubscription } from '../fixture/demo-fixture.types';

type Result = { status: StepOutcome['status']; label: string };

interface ApplicationRow {
  id: string;
  name: string;
  vendor: { id: string; name: string } | null;
  businessOwner: { employeeCode: string } | null;
}

/** The IT Admin the dataset writes the catalog as: the one in charge of the IT department. */
function catalogAdmin(ctx: DemoRunContext): string {
  const it = ctx.fixture.departments.find((department) => department.code.endsWith('-ITO'));

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
    // An application of that name whose Business Owner is not the demo person is somebody's real one: never reused.
    return found.businessOwner?.employeeCode === application.businessOwner
      ? { status: 'present', label }
      : { status: 'conflict', label: `${label} đã có, không thuộc dataset` };
  }
  if (ctx.mode === 'plan') return { status: 'planned', label };
  const created = await ctx.api.call<ApplicationRow>(admin, 'POST', '/applications', {
    name: application.name,
    kind: application.kind,
    ...(application.vendorName ? { vendorName: application.vendorName } : {}),
    dataSensitivity: application.dataSensitivity,
    businessOwnerEmployeeId: ctx.ids.employees.get(application.businessOwner),
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

async function subscriptions(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, catalogAdmin(ctx));
  const results: Result[] = [];
  for (const subscription of ctx.fixture.subscriptions) {
    results.push(await oneSubscription(ctx, admin, subscription));
  }

  return summarize(results);
}

interface SubscriptionRow {
  id: string;
  ownerDepartmentId: string;
  status: string;
  purchasedQuantity?: number | null;
  unitPrice?: { amount: string; currency: string } | null;
  billingCycle?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  noticePeriodDays?: number | null;
}

/** What of the fixture's subscription the existing one of the same plan and department does not match. */
function subscriptionDifferences(ctx: DemoRunContext, subscription: DemoSubscription, row: SubscriptionRow): string[] {
  const { year } = yearOf(ctx);
  const wanted: [string, unknown, unknown][] = [
    ['purchasedQuantity', row.purchasedQuantity, subscription.quantity],
    ['unitPrice', row.unitPrice?.amount, subscription.unitPrice],
    ['currency', row.unitPrice?.currency, ctx.fixture.currency],
    ['billingCycle', row.billingCycle, subscription.billingCycle],
    ['startDate', row.startDate, `${year}-01-01`],
    ['endDate', row.endDate, `${year}-12-31`],
    ['noticePeriodDays', row.noticePeriodDays, subscription.noticePeriodDays],
  ];

  return wanted.filter(([, actual, expected]) => actual !== expected).map(([name]) => name);
}

async function oneSubscription(ctx: DemoRunContext, admin: string, subscription: DemoSubscription): Promise<Result> {
  const label = subscription.key;
  const planId = ctx.ids.plans.get(subscription.plan) ?? '';
  const departmentId = ctx.ids.departments.get(subscription.ownerDepartment) ?? '';
  const rows = await listAll<SubscriptionRow>(ctx, admin, `/subscriptions?planId=${planId}`);
  let found = rows.find((row) => row.ownerDepartmentId === departmentId);
  const differences = found ? subscriptionDifferences(ctx, subscription, found) : [];
  if (found && differences.length) {
    ctx.ids.subscriptions.set(subscription.key, found.id);
    return { status: 'conflict', label: `${label} đã có với ${differences.join(', ')} khác fixture` };
  }
  if (!found && ctx.mode === 'plan') return { status: 'planned', label };
  if (!found)
    found = await ctx.api.call<SubscriptionRow>(
      admin,
      'POST',
      '/subscriptions',
      subscriptionBody(ctx, subscription, planId, departmentId),
    );
  ctx.ids.subscriptions.set(subscription.key, found.id);
  const created = !rows.some((row) => row.id === found.id);
  if (found.status === 'ACTIVE') return { status: created ? 'done' : 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label: `${label} (hoàn tất bản nháp)` };
  await ctx.api.call(admin, 'POST', `/subscriptions/${found.id}/completions`);

  return { status: 'done', label };
}

function subscriptionBody(
  ctx: DemoRunContext,
  subscription: DemoSubscription,
  planId: string,
  ownerDepartmentId: string,
): Record<string, unknown> {
  const { year } = yearOf(ctx);

  return {
    planId,
    ownerDepartmentId,
    kind: 'TERM',
    purchasedQuantity: subscription.quantity,
    unitPrice: { amount: subscription.unitPrice, currency: ctx.fixture.currency },
    billingCycle: subscription.billingCycle,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    noticePeriodDays: subscription.noticePeriodDays,
    autoRenew: true,
    allowsMidTermReduction: false,
  };
}

export const CATALOG_STEPS: readonly DemoStep[] = [
  { key: 'catalog.applications', title: 'Ứng dụng (IT Admin)', needs: ['org.accounts'], run: applications },
  { key: 'catalog.plans', title: 'Gói (IT Admin)', needs: ['catalog.applications'], run: plans },
  {
    key: 'catalog.subscriptions',
    title: 'Thuê bao theo phòng (IT Admin)',
    needs: ['catalog.plans', 'finance.cost-centers'],
    run: subscriptions,
  },
];
