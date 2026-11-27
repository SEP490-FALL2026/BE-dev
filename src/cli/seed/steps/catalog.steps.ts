import { addMonths, dayOffset } from '../demo-dates';
import { as, listAll, summarize, yearOf } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoApplication, DemoPlan, DemoSubscription, DemoSubscriptionLine } from '../fixture/demo-fixture.types';

type Result = { status: StepOutcome['status']; label: string };

/** Whether a fixture subscription covers `planKey` (either single-line `plan` or inside `lines[]`). */
export function subscriptionHasPlan(subscription: DemoSubscription, planKey: string): boolean {
  return subscription.plan === planKey || Boolean(subscription.lines?.some((line) => line.plan === planKey));
}

/** Primary plan key of a fixture subscription (its single plan, or its first line). */
export function subscriptionPrimaryPlan(subscription: DemoSubscription): string {
  return subscription.plan ?? subscription.lines?.[0]?.plan ?? '';
}

/** Monthly unit price in dong for `planKey` on `subscription` (`lines[]` first, else `unitPrice` divided by 12 half-away for annual). */
export function subscriptionMonthlyPriceOf(subscription: DemoSubscription, planKey?: string): number {
  const line = planKey ? subscription.lines?.find((candidate) => candidate.plan === planKey) : subscription.lines?.[0];
  if (line) return Number(line.monthlyUnitPrice.amount);
  const amount = Number(subscription.unitPrice?.amount ?? 0);

  return subscription.billingCycle === 'ANNUAL' ? Math.floor((amount + 6) / 12) : amount;
}

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
  // QĐ-111f: one command makes the application with its first plan (the kind of the application follows the plan, the pricing model follows the
  // kind of provisioning); the other plans of the fixture are made by the next step. The group is one of the seven of the installation (C-O5).
  const [first] = application.plans;
  const groups = await listAll<{ id: string; name: string }>(ctx, admin, '/functional-groups');
  const functionalGroupId = groups.find((group) => group.name === application.functionalGroup)?.id;
  if (!functionalGroupId)
    return { status: 'conflict', label: `${label}: không có nhóm ${application.functionalGroup}` };
  const created = await ctx.api.call<ApplicationRow>(admin, 'POST', '/applications', {
    name: application.name,
    functionalGroupId,
    ...(application.vendorName ? { vendorName: application.vendorName } : {}),
    dataSensitivity: application.dataSensitivity,
    plan: firstPlanBody(first, commitmentMonthsForPlan(ctx, first)),
  });
  ctx.ids.applications.set(application.key, created.id);
  if (created.vendor) ctx.ids.vendors.set(application.key, created.vendor.id);

  return { status: 'done', label };
}

function commitmentMonthsForPlan(ctx: DemoRunContext, plan: DemoPlan): 1 | 12 | undefined {
  if (plan.referenceCommitmentMonths !== undefined) return plan.referenceCommitmentMonths;
  if (plan.provisioningType === 'K1') return 1;
  if (plan.provisioningType === 'K2') {
    return ctx.fixture.subscriptions.find((subscription) => subscriptionHasPlan(subscription, plan.key))?.termMonths;
  }

  return undefined;
}

/** The plan of the one command: the body of a plan without its application, which the command is making. */
function firstPlanBody(plan: DemoPlan, referenceCommitmentMonths?: 1 | 12): Record<string, unknown> {
  const body = planBody('', plan, referenceCommitmentMonths);
  delete body.applicationId;

  return body;
}

export function planBody(
  applicationId: string,
  plan: DemoPlan,
  referenceCommitmentMonths?: 1 | 12,
): Record<string, unknown> {
  const commitment = referenceCommitmentMonths ?? (plan.provisioningType === 'K1' ? 1 : undefined);

  return {
    applicationId,
    name: plan.name,
    provisioningType: plan.provisioningType,
    dataLossOnRemoval: plan.dataLossOnRemoval,
    ...(plan.controlLevel ? { controlLevel: plan.controlLevel } : {}),
    ...(plan.revocationNote ? { revocationNote: plan.revocationNote } : {}),
    ...(plan.sharingPolicy ? { sharingPolicy: plan.sharingPolicy } : {}),
    ...(plan.hasAdminConsole !== undefined ? { hasAdminConsole: plan.hasAdminConsole } : {}),
    ...(plan.keyBinding ? { keyBinding: plan.keyBinding } : {}),
    // QĐ-113a: the price before tax in dong of a paid plan, the one a request falls back to when no subscription of the plan has a price.
    ...(plan.referencePrice ? { referencePrice: { amount: plan.referencePrice, currency: 'VND' } } : {}),
    ...(commitment !== undefined ? { referenceCommitmentMonths: commitment } : {}),
  };
}

type PlanRow = { id: string; name: string } & Partial<Record<keyof DemoPlan, unknown>>;

/** The fields of the fixture's plan that the existing one does not have (only those the fixture sets). */
function planDifferences(plan: DemoPlan, row: PlanRow): string[] {
  // The pricing model is not compared: the system works it out from the kind of provisioning (B-5), whatever the fixture still says.
  const keys = [
    'provisioningType',
    'controlLevel',
    'dataLossOnRemoval',
    'sharingPolicy',
    'hasAdminConsole',
    'keyBinding',
  ] as const;

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
        const created = await ctx.api.call<{ id: string }>(
          admin,
          'POST',
          '/plans',
          planBody(applicationId, plan, commitmentMonthsForPlan(ctx, plan)),
        );
        ctx.ids.plans.set(plan.key, created.id);
        results.push({ status: 'done', label: plan.name });
      }
    }
  }

  return summarize(results);
}

/**
 * Whether the company administers the plan at the vendor, the rule of the API (`QĐ-110k`, R-53): every K2 plan, and a K4 plan with an
 * admin console. Such a plan needs a workspace profile of two IT Admins before its subscription is made.
 */
export function needsVendorAdmins(plan: DemoPlan): boolean {
  return plan.provisioningType === 'K2' || (plan.provisioningType === 'K4' && plan.hasAdminConsole === true);
}

/**
 * The workspace profile of a plan the company administers at the vendor, or null for a plan that has none: the IT Admin who answers for the
 * plan's subscription owns it and another IT Admin (the plan's `vendorAdmin`, or the first other one of the fixture) administers it, so two
 * different ones are recorded before the subscription is made. The email is the company account that owns the workspace at the vendor (never a
 * password); a plan the fixture leaves without one shows the flag `ownerAccountEmailMissing` (`QĐ-110u`).
 */
export function workspaceProfileBody(
  ctx: DemoRunContext,
  plan: DemoPlan,
): {
  primaryOwnerEmployeeId: string;
  members: Array<{ employeeId: string; role: 'OWNER' | 'ADMIN' }>;
  ownerAccountEmail?: string;
} | null {
  if (!needsVendorAdmins(plan)) return null;
  // A K4 plan is held in lots, not in a subscription: the IT Admin who made its first lot answers for it.
  const owner =
    ctx.fixture.subscriptions.find((subscription) => subscriptionHasPlan(subscription, plan.key))?.responsible ??
    ctx.fixture.lots.find((lot) => lot.plan === plan.key)?.responsible;
  const other =
    plan.vendorAdmin ??
    ctx.fixture.people.find((person) => person.account === 'IT_ADMIN' && person.code !== owner)?.code;
  if (!owner || !other) return null;
  const ownerId = ctx.ids.employees.get(owner) ?? '';
  const adminId = ctx.ids.employees.get(other) ?? '';

  return {
    primaryOwnerEmployeeId: ownerId,
    members: [
      { employeeId: ownerId, role: 'OWNER' },
      { employeeId: adminId, role: 'ADMIN' },
    ],
    ...(plan.withoutOwnerAccountEmail ? {} : { ownerAccountEmail: `it-${plan.key}@${ctx.fixture.emailDomain}` }),
  };
}

async function workspaceProfiles(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, catalogAdmin(ctx));
  const results: Result[] = [];
  for (const plan of ctx.fixture.applications.flatMap((application) => application.plans)) {
    if (workspaceProfileBody(ctx, plan) === null) continue;
    const label = `${plan.name} (hồ sơ admin ở nhà cung cấp)`;
    const planId = ctx.ids.plans.get(plan.key);
    if (!planId) {
      results.push({ status: 'planned', label });
      continue;
    }
    // A profile an earlier run (or the IT Admin by hand) made is left as it is.
    const detail = await ctx.api.call<{ workspaceProfile: unknown }>(admin, 'GET', `/plans/${planId}`);
    if (detail.workspaceProfile) {
      results.push({ status: 'present', label });
      continue;
    }
    if (ctx.mode === 'plan') {
      results.push({ status: 'planned', label });
      continue;
    }
    await ctx.api.call(admin, 'PUT', `/plans/${planId}/workspace-profile`, workspaceProfileBody(ctx, plan));
    results.push({ status: 'done', label });
  }

  return summarize(results);
}

interface SubscriptionRow {
  id: string;
  status: string;
  updatedAt: string;
}

/** Seats the baseline files put in the subscription, counted from the fixture. */
export function baselineSeatsOf(ctx: DemoRunContext, subscriptionKey: string): number {
  return ctx.fixture.seats.filter((seat) => seat.subscription === subscriptionKey).length;
}

function lineQuantityOf(
  ctx: DemoRunContext,
  subscriptionKey: string,
  line: DemoSubscriptionLine,
  index: number,
): number {
  if (line.quantity !== undefined) return line.quantity;

  return (index === 0 ? baselineSeatsOf(ctx, subscriptionKey) : 0) + (line.freeAfterBaseline ?? 0);
}

/** What is bought: the baseline seats and the free ones, the sum of `lines[]`, or the number the fixture names for a plan with no baseline file. */
export function purchasedQuantityOf(ctx: DemoRunContext, subscription: DemoSubscription): number {
  if (subscription.lines) {
    return subscription.lines.reduce(
      (total, line, index) => total + lineQuantityOf(ctx, subscription.key, line, index),
      0,
    );
  }

  return subscription.quantity ?? baselineSeatsOf(ctx, subscription.key) + subscription.freeAfterBaseline;
}

/** What the dates of a subscription are counted from: the day of the seed. */
type DatedContext = Pick<DemoRunContext, 'today'>;

/** The date fields of a subscription, by the name the API takes. */
type Dates = Record<string, string>;

/** The days of a monthly plan: the calendar year, and a payment day `renewalInDays` from today that stretches the year when it falls in the next one. */
function monthlyDates(ctx: DatedContext, subscription: DemoSubscription): Dates {
  const { year, lastDay } = yearOf(ctx);
  const dates = { startDate: `${year}-01-01`, endDate: lastDay };
  if (subscription.renewalInDays === undefined) return dates;
  const renewalDate = dayOffset(ctx.today, subscription.renewalInDays);

  return {
    ...dates,
    renewalDate,
    ...(renewalDate > `${year + 1}-01-01` ? { endDate: dayOffset(renewalDate, -1) } : {}),
  };
}

/** The days of an annual plan: the 12 months before the renewal day, and the deadline to cancel when the fixture declares one. */
function annualDates(ctx: DatedContext, subscription: DemoSubscription): Dates {
  const { year } = yearOf(ctx);
  if (subscription.renewalInDays === undefined) return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  const renewalDate = dayOffset(ctx.today, subscription.renewalInDays);

  return {
    startDate: addMonths(renewalDate, -12),
    endDate: dayOffset(renewalDate, -1),
    renewalDate,
    ...(subscription.noticeDeadlineInDays === undefined
      ? {}
      : { noticeDeadline: dayOffset(ctx.today, subscription.noticeDeadlineInDays) }),
  };
}

/** The day a subscription starts: the first day the seats of the pool exist, so no seat of it is granted before. */
export function subscriptionStartDate(ctx: DatedContext, subscription: DemoSubscription): string {
  if (subscription.withoutDates) return dayOffset(ctx.today, -200);

  return (subscription.billingCycle === 'ANNUAL' ? annualDates(ctx, subscription) : monthlyDates(ctx, subscription))
    .startDate;
}

function subscriptionSharedTerms(ctx: DemoRunContext, subscription: DemoSubscription): Record<string, unknown> {
  const base = {
    ...(subscription.originalPrice ? { originalPrice: subscription.originalPrice } : {}),
    ...(subscription.seatCounting ? { seatCounting: subscription.seatCounting } : {}),
    ...(subscription.invoicedLater !== undefined ? { invoicedLater: subscription.invoicedLater } : {}),
    ...(subscription.minimumSeatsTotal !== undefined ? { minimumSeatsTotal: subscription.minimumSeatsTotal } : {}),
    ...(subscription.minimumSeats !== undefined ? { vendorMinimumSeats: subscription.minimumSeats } : {}),
  };
  const cycle = { billingCycle: subscription.billingCycle, commitmentTermMonths: subscription.termMonths };
  // A plan with no date to alert from: no end, no renewal, no notice (the warning `NO_ALERT_ANCHOR`, the refusal `CONTRACT_DATA_INCOMPLETE`).
  if (subscription.withoutDates) {
    return {
      ...base,
      ...cycle,
      startDate: dayOffset(ctx.today, -200),
      autoRenew: false,
      allowsMidTermReduction: false,
    };
  }
  const dates =
    subscription.billingCycle === 'ANNUAL' ? annualDates(ctx, subscription) : monthlyDates(ctx, subscription);

  return {
    ...base,
    ...cycle,
    ...dates,
    noticePeriodDays: subscription.noticePeriodDays ?? 30,
    autoRenew: subscription.autoRenew ?? true,
    allowsMidTermReduction: false,
  };
}

/** Terms accepted by `PATCH /subscriptions/:id` on an unfinished draft (never sends `purchasedQuantity` or `lines[]`). */
export function subscriptionPatchTerms(ctx: DemoRunContext, subscription: DemoSubscription): Record<string, unknown> {
  return {
    ...(!subscription.lines && subscription.unitPrice ? termOrPerpetualPriceFields(subscription) : {}),
    ...subscriptionSharedTerms(ctx, subscription),
  };
}

/** The terms of a subscription (everything but top-level `planId` and `kind`), as `POST /subscriptions` takes them. */
export function subscriptionTerms(ctx: DemoRunContext, subscription: DemoSubscription): Record<string, unknown> {
  if (subscription.lines) {
    return {
      lines: subscription.lines.map((line, index) => ({
        planId: ctx.ids.plans.get(line.plan) ?? '',
        monthlyUnitPrice: line.monthlyUnitPrice,
        quantity: lineQuantityOf(ctx, subscription.key, line, index),
        ...(line.minimumSeats !== undefined ? { minimumSeats: line.minimumSeats } : {}),
      })),
      ...subscriptionSharedTerms(ctx, subscription),
    };
  }

  return {
    purchasedQuantity: purchasedQuantityOf(ctx, subscription),
    ...termOrPerpetualPriceFields(subscription),
    ...subscriptionSharedTerms(ctx, subscription),
  };
}

export function subscriptionBody(
  ctx: DemoRunContext,
  subscription: DemoSubscription,
  planId: string,
): Record<string, unknown> {
  return {
    ...(subscription.lines ? {} : { planId }),
    kind: subscription.kind,
    ...subscriptionTerms(ctx, subscription),
  };
}

function termOrPerpetualPriceFields(subscription: DemoSubscription): Record<string, unknown> {
  const cycleMonths = subscription.billingCycle === 'ANNUAL' ? 12n : 1n;
  const rawUnit = BigInt(subscription.unitPrice?.amount ?? '0');
  const monthlyMinor = (rawUnit * 2n + cycleMonths) / (2n * cycleMonths);

  return {
    monthlyUnitPrice: { amount: String(monthlyMinor), currency: 'VND' },
    ...(monthlyMinor * cycleMonths === rawUnit && subscription.unitPrice ? { unitPrice: subscription.unitPrice } : {}),
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
  const planId = ctx.ids.plans.get(subscriptionPrimaryPlan(subscription)) ?? '';
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
  await ctx.api.call(admin, 'PATCH', `/subscriptions/${found.id}`, {
    ...subscriptionPatchTerms(ctx, subscription),
    expectedUpdatedAt: found.updatedAt,
  });
  await ctx.api.call(admin, 'POST', `/subscriptions/${found.id}/completions`);

  return { status: 'done', label };
}

interface SeatChangeRow {
  reason: string;
  request: { id: string } | null;
  seatPurchase: { id: string; code: string } | null;
}

function resolveCanvaPurchaseTarget(ctx: DemoRunContext) {
  const scenario = ctx.fixture.requests.find((r) => r.key === 'R61');
  const subscriptionId = ctx.ids.subscriptions.get('canva');
  const requestId = ctx.ids.requests.get('R61');
  const beneficiaries = scenario?.beneficiaries ?? [];
  if (beneficiaries.length === 0 || !subscriptionId || !requestId) return null;
  const department = ctx.fixture.people.find((p) => p.code === beneficiaries[0])?.department;
  const adminCode = ctx.fixture.departments.find((d) => d.code === department)?.itAdmin ?? catalogAdmin(ctx);

  return { subscriptionId, requestId, beneficiaries, adminCode };
}

/**
 * Batch seat purchase (`MUA-…`): buys 2 extra seats for the two open GRANT tasks of R61 (`canva-teams`) in one request,
 * then records the purchase id in `ctx.ids.seatPurchases` for the `SEAT_PURCHASE` invoice step.
 */
async function seatPurchases(ctx: DemoRunContext): Promise<StepOutcome> {
  const target = resolveCanvaPurchaseTarget(ctx);
  if (!target) return { status: 'conflict', detail: 'canva hoặc R61 chưa có để mua thêm seat' };
  const admin = await as(ctx, target.adminCode);
  const detail = await ctx.api.call<{ lines?: Array<{ id: string }> }>(
    admin,
    'GET',
    `/subscriptions/${target.subscriptionId}`,
  );
  const lineId = detail.lines?.[0]?.id;
  if (!lineId) return { status: 'conflict', detail: 'thuê bao canva chưa có dòng' };
  const changes = await listAll<SeatChangeRow>(ctx, admin, `/subscription-lines/${lineId}/seat-changes`);
  const existing = changes.find((c) => c.reason === 'TOP_UP' && c.request?.id === target.requestId && c.seatPurchase);
  if (existing?.seatPurchase) {
    ctx.ids.seatPurchases.set('canva-topup', existing.seatPurchase.id);
    return { status: 'present', detail: `${existing.seatPurchase.code} (R61)` };
  }
  if (ctx.mode === 'plan') return { status: 'planned', detail: 'Mua thêm 2 seat Canva Teams (MUA-…)' };
  const created = await ctx.api.call<{ id: string; code: string }>(
    admin,
    'POST',
    `/subscription-lines/${lineId}/purchases`,
    {
      items: target.beneficiaries.map((code) => ({
        requestId: target.requestId,
        beneficiaryEmployeeId: ctx.ids.employees.get(code),
      })),
      purchasedOn: ctx.today,
    },
  );
  ctx.ids.seatPurchases.set('canva-topup', created.id);

  return { status: 'done', detail: `${created.code} (+${target.beneficiaries.length} seat)` };
}

export const SEAT_PURCHASE_STEPS: readonly DemoStep[] = [
  {
    key: 'catalog.seat-purchases',
    title: 'Mua thêm seat theo lô 2 mục (MUA-…, IT Admin)',
    needs: ['catalog.subscriptions', 'requests.R61'],
    run: seatPurchases,
  },
];

export const CATALOG_STEPS: readonly DemoStep[] = [
  { key: 'catalog.applications', title: 'Ứng dụng (IT Admin)', needs: ['org.accounts'], run: applications },
  { key: 'catalog.plans', title: 'Gói (IT Admin)', needs: ['catalog.applications'], run: plans },
  {
    key: 'catalog.workspace-profiles',
    title: 'Hồ sơ admin ở nhà cung cấp của gói K2 và K4 có trang quản trị: hai IT Admin (IT Admin)',
    needs: ['catalog.plans'],
    run: workspaceProfiles,
  },
  {
    key: 'catalog.subscriptions',
    title: 'Một thuê bao cho mỗi gói: kho dùng chung (IT Admin)',
    needs: ['catalog.plans', 'catalog.workspace-profiles'],
    run: subscriptions,
  },
];
