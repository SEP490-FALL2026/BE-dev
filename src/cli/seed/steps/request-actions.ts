import { as, listAll, tag } from '../demo-step-kit';
import type { DemoRunContext } from '../demo-run.types';
import type { DemoRequestScenario } from '../fixture/demo-fixture.types';
import { yesChecklist, type ChecklistBody } from './checklist-kit';
import type { ScenarioAction } from './scenario-path';

export interface RequestWire {
  id: string;
  state: string;
  businessReason?: string | null;
  proposal?: { purpose: string } | null;
  plan?: { planId: string } | null;
  department: { code: string };
  routing: { mode: 'VIA_HEAD' | 'ONE_STEP' };
  spend?: { stage: string } | null;
  needStep: { assignee: { employeeCode: string } | null } | null;
}

type Decision = 'APPROVE' | 'REJECT' | 'RETURN';

/** The reason of a refusal or a return: it carries the tag of the scenario, so the screens that show it say where it came from. */
const REASONS = {
  NEED_REJECT: 'Chưa cần trong quý này.',
  NEED_RETURN: 'Cần bổ sung lý do sử dụng và số người dùng trước khi duyệt.',
  ASSESSMENT_REJECT: 'Phần mềm chưa đủ điều kiện dùng trong công ty; xem gói thay thế.',
  ASSESSMENT_RETURN: 'Cần bổ sung mô tả dữ liệu sẽ nhập vào phần mềm.',
  SPEND_REJECT: 'Chưa ưu tiên trong ngân sách kỳ này.',
  SPEND_RETURN: 'Cần bổ sung số tháng sử dụng trước khi duyệt chi.',
  LINE_REJECT: 'Người này chưa cần dùng phần mềm trong kỳ này.',
  RESERVE: 'Cần cho chiến dịch tháng này.',
  WITHDRAW: 'Không còn cần.',
  SPEND_PURCHASE: 'Kho hết, cần mua thêm.',
  TASK_FAILED: 'Nhà cung cấp chưa tạo được tài khoản: chưa thể cấp quyền.',
  TASK_CLOSED: 'Đã trao đổi với nhà cung cấp, không cấp được; đóng tác vụ.',
} as const;

const reasonOf = (ctx: DemoRunContext, scenario: DemoRequestScenario, key: keyof typeof REASONS): string =>
  `${tag(ctx, scenario.key)} ${REASONS[key]}`;

/** The body of a decision of the need step: an approval carries the checklist only, a refusal or a return its reason too. */
export function needBody(
  ctx: DemoRunContext,
  scenario: DemoRequestScenario,
  decision: Decision,
  checklist: ChecklistBody,
): { decision: Decision; reason?: string; checklist: ChecklistBody } {
  if (decision === 'APPROVE') return { decision, checklist };

  return {
    decision,
    reason: reasonOf(ctx, scenario, decision === 'REJECT' ? 'NEED_REJECT' : 'NEED_RETURN'),
    checklist,
  };
}

/** IT refuses a proposal as not eligible and points at a plan of the catalog instead (`kind: NOT_ELIGIBLE`). */
export function assessmentRejectBody(
  ctx: DemoRunContext,
  scenario: DemoRequestScenario,
  checklist: ChecklistBody,
  alternativePlanId: string | undefined,
) {
  return {
    decision: 'REJECT' as const,
    kind: 'NOT_ELIGIBLE' as const,
    reason: reasonOf(ctx, scenario, 'ASSESSMENT_REJECT'),
    ...(alternativePlanId ? { alternativePlanId } : {}),
    checklist,
  };
}

/** The plan IT points at instead: a scenario that names one must find it, never be refused silently without it (R43). */
function alternativePlanIdOf(ctx: DemoRunContext, scenario: DemoRequestScenario): string | undefined {
  if (!scenario.alternativePlan) return undefined;
  const id = ctx.ids.plans.get(scenario.alternativePlan);
  if (!id)
    throw new Error(`The plan ${scenario.alternativePlan} that IT suggests for ${scenario.key} is not in the catalog`);

  return id;
}

/** IT sends a proposal back to the person who made it: no kind of refusal goes with a return. */
export function assessmentReturnBody(ctx: DemoRunContext, scenario: DemoRequestScenario, checklist: ChecklistBody) {
  return { decision: 'RETURN' as const, reason: reasonOf(ctx, scenario, 'ASSESSMENT_RETURN'), checklist };
}

/** The decision of the spending approver on a request as a whole. */
export function spendBody(
  ctx: DemoRunContext,
  scenario: DemoRequestScenario,
  decision: Decision,
  checklist: ChecklistBody,
): { decision: Decision; reason?: string; checklist: ChecklistBody } {
  if (decision === 'APPROVE') return { decision, checklist };

  return {
    decision,
    reason: reasonOf(ctx, scenario, decision === 'REJECT' ? 'SPEND_REJECT' : 'SPEND_RETURN'),
    checklist,
  };
}

/** The decision on a group line by line: every person of it, the ones the scenario refuses with a reason and the others approved. */
export function lineSpendBody(ctx: DemoRunContext, scenario: DemoRequestScenario, checklist: ChecklistBody) {
  const refused = new Set(scenario.rejectedLines ?? []);

  return {
    lines: (scenario.beneficiaries ?? []).map((code) => ({
      employeeId: ctx.ids.employees.get(code),
      ...(refused.has(code)
        ? { decision: 'REJECT' as const, reason: reasonOf(ctx, scenario, 'LINE_REJECT') }
        : { decision: 'APPROVE' as const }),
    })),
    checklist,
  };
}

/** The people of a group request the IT Admin opens a task of grant for: the ones the spending approver did not refuse. */
export const grantedBeneficiaries = (scenario: DemoRequestScenario): (string | null)[] =>
  scenario.beneficiaries ? scenario.beneficiaries.filter((code) => !scenario.rejectedLines?.includes(code)) : [null];

export function departmentOf(ctx: DemoRunContext, code: string) {
  const department = ctx.fixture.departments.find((candidate) => candidate.code === code);
  if (!department) throw new Error(`The request belongs to a department the fixture does not declare: ${code}`);

  return department;
}

/** The checklist of a decision step all Yes, as the person of `code` reads it. */
async function checklistOf(ctx: DemoRunContext, code: string | null, step: string) {
  if (!code) throw new Error(`No demo person decides step ${step}: the fixture leaves that role empty`);

  return yesChecklist(ctx, await as(ctx, code), step);
}

async function post(ctx: DemoRunContext, code: string | null, path: string, body?: unknown): Promise<unknown> {
  if (!code) throw new Error(`No demo person acts at ${path}: the fixture leaves that role empty`);

  return ctx.api.call(await as(ctx, code), 'POST', path, body);
}

type Handler = (ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire) => Promise<void>;

async function decideNeed(
  ctx: DemoRunContext,
  scenario: DemoRequestScenario,
  request: RequestWire,
  decision: Decision,
): Promise<void> {
  const assignee = request.needStep?.assignee?.employeeCode ?? null;
  if (!assignee || !ctx.fixture.people.some((person) => person.code === assignee)) {
    throw new Error(
      `The need step of ${scenario.key} is held by somebody outside the dataset (${assignee ?? 'nobody'})`,
    );
  }
  const checklist = await checklistOf(ctx, assignee, '1.2');
  await post(
    ctx,
    assignee,
    `/access-requests/${request.id}/need-decision`,
    needBody(ctx, scenario, decision, checklist),
  );
}

/** The spending approver decides with the checklist of step 1.7: a group line by line (every person it names), a request as a whole. */
async function decideSpend(
  ctx: DemoRunContext,
  scenario: DemoRequestScenario,
  request: RequestWire,
  decision: Decision,
): Promise<void> {
  const approver = ctx.fixture.approvalRoles.SPENDING_APPROVER;
  const checklist = await checklistOf(ctx, approver, '1.7');
  if (scenario.beneficiaries && decision === 'APPROVE') {
    await post(
      ctx,
      approver,
      `/access-requests/${request.id}/line-spend-decisions`,
      lineSpendBody(ctx, scenario, checklist),
    );
    return;
  }
  await post(
    ctx,
    approver,
    `/access-requests/${request.id}/spend-approval`,
    spendBody(ctx, scenario, decision, checklist),
  );
}

/** IT checks a proposal at the gate (step 1.3): the IT Admin in charge of the department of the request. */
async function assess(
  ctx: DemoRunContext,
  scenario: DemoRequestScenario,
  request: RequestWire,
  decision: 'REJECT' | 'RETURN',
): Promise<void> {
  const admin = departmentOf(ctx, request.department.code).itAdmin;
  const checklist = await checklistOf(ctx, admin, '1.3');
  const body =
    decision === 'RETURN'
      ? assessmentReturnBody(ctx, scenario, checklist)
      : assessmentRejectBody(ctx, scenario, checklist, alternativePlanIdOf(ctx, scenario));
  await post(ctx, admin, `/access-requests/${request.id}/assessment/rejection`, body);
}

async function submitBatch(ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire): Promise<void> {
  const head = departmentOf(ctx, request.department.code).head;
  // A batch that confirms the reserve answers the checklist of step 1.6 once for the batch (FIX-PL2-O4).
  await post(ctx, head, '/spend-batches', {
    requestIds: [request.id],
    ...(scenario.confirmReserve
      ? {
          reserveConfirmations: [{ requestId: request.id, reason: reasonOf(ctx, scenario, 'RESERVE') }],
          checklist: await checklistOf(ctx, head, '1.6'),
        }
      : {}),
  });
}

async function confirmReserve(ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire): Promise<void> {
  const head = departmentOf(ctx, request.department.code).head;
  await post(ctx, head, `/access-requests/${request.id}/reserve-confirmation`, {
    reason: reasonOf(ctx, scenario, 'RESERVE'),
    checklist: await checklistOf(ctx, head, '1.6'),
  });
}

const withdraw: Handler = async (ctx, scenario, request) => {
  await post(ctx, scenario.requester, `/access-requests/${request.id}/withdraw`, {
    reason: reasonOf(ctx, scenario, 'WITHDRAW'),
  });
};

function planEntryOf(ctx: DemoRunContext, planKey: string | undefined) {
  return ctx.fixture.applications
    .flatMap((application) => application.plans)
    .find((candidate) => candidate.key === planKey);
}

function planTypeOf(ctx: DemoRunContext, scenario: DemoRequestScenario): string | null {
  return planEntryOf(ctx, scenario.plan)?.provisioningType ?? null;
}

/** IT Admin opens the grant task: from the pool, with a purchase when the pool is out (K2) or the store has no key (K4). */
async function grant(ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire): Promise<void> {
  const admin = grantAdminOf(ctx, scenario, request);
  const type = planTypeOf(ctx, scenario);
  const buys = scenario.grant === 'PURCHASE' && (type === 'K2' || type === 'K4');
  for (const code of grantedBeneficiaries(scenario)) {
    await post(ctx, admin, '/provisioning-tasks', {
      requestId: request.id,
      ...(code ? { beneficiaryEmployeeId: ctx.ids.employees.get(code) } : {}),
      ...(buys ? { purchase: { reason: reasonOf(ctx, scenario, 'SPEND_PURCHASE') } } : {}),
    });
  }
}

/** The IT Admin who works the grant: the one the scenario names, else the one in charge of the department of the request. */
const grantAdminOf = (ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire): string | null =>
  scenario.grantedBy ?? departmentOf(ctx, request.department.code).itAdmin;

interface TaskRow {
  id: string;
  kind: string;
  status: string;
  requestId: string | null;
  createdAt?: string;
}

async function tasksOf(ctx: DemoRunContext, email: string, requestId: string, kind = 'GRANT'): Promise<TaskRow[]> {
  const rows = await listAll<TaskRow>(ctx, email, '/provisioning-tasks?scope=ALL');

  return rows.filter((row) => row.requestId === requestId && row.kind === kind);
}

/** What the task of the grant of a request is doing, for the position of an `EXECUTING` request: the state of the latest task, null when it has none. */
export async function grantTaskStatus(
  ctx: DemoRunContext,
  scenario: DemoRequestScenario,
  request: RequestWire,
): Promise<string | null> {
  const admin = grantAdminOf(ctx, scenario, request);
  if (!admin) return null;
  const tasks = await tasksOf(ctx, await as(ctx, admin), request.id);
  // The latest task by creation, whatever order the list comes in.
  const latest = [...tasks].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')).at(-1);

  return latest?.status ?? null;
}

async function existingStoreKeyId(
  ctx: DemoRunContext,
  email: string,
  planKey: string | undefined,
): Promise<string | undefined> {
  for (const lot of ctx.fixture.lots.filter((candidate) => candidate.plan === planKey)) {
    const lotId = ctx.ids.lots.get(lot.key);
    if (!lotId) continue;
    const keys = await listAll<{ id: string }>(ctx, email, `/license-keys?licenseLotId=${lotId}&status=IN_STORE`);
    if (keys[0]) return keys[0].id;
  }

  return undefined;
}

async function ensureRequestLotId(
  ctx: DemoRunContext,
  email: string,
  scenario: DemoRequestScenario,
  request: RequestWire,
  plan: NonNullable<ReturnType<typeof planEntryOf>>,
): Promise<string> {
  const cacheKey = `request:${scenario.key}`;
  const cached = ctx.ids.lots.get(cacheKey);
  if (cached) return cached;
  const planId = ctx.ids.plans.get(plan.key);
  if (!planId) throw new Error(`The fixture has no plan id for ${plan.key}`);
  const lots = await listAll<{ id: string; purpose: string; requestId: string | null }>(
    ctx,
    email,
    `/license-lots?planId=${planId}`,
  );
  const found = lots.find((row) => row.purpose === 'REQUEST' && row.requestId === request.id);
  const lotId =
    found?.id ??
    (
      await ctx.api.call<{ id: string }>(email, 'POST', '/license-lots', {
        planId,
        purchasedOn: ctx.today,
        licenseCount: grantedBeneficiaries(scenario).length,
        unitPrice: { amount: plan.referencePrice ?? '3000000', currency: 'VND' },
        purpose: 'REQUEST',
        requestId: request.id,
      })
    ).id;
  ctx.ids.lots.set(cacheKey, lotId);

  return lotId;
}

/**
 * Resolves the license key id to complete a K4 grant task: takes an existing `IN_STORE` key when `grant === 'KEY'`,
 * or creates a `REQUEST` lot (`POST /license-lots`) and imports a key (`POST /license-lots/{id}/keys`) when `grant === 'PURCHASE'`.
 */
async function k4LicenseKeyId(
  ctx: DemoRunContext,
  email: string,
  scenario: DemoRequestScenario,
  request: RequestWire,
): Promise<string | undefined> {
  if (scenario.grant === 'KEY') return existingStoreKeyId(ctx, email, scenario.plan);
  const plan = planEntryOf(ctx, scenario.plan);
  const isAccountK4 =
    plan?.provisioningType === 'K4' && plan.keyBinding !== 'DEVICE_KEY' && plan.keyBinding !== 'DEVICE_BUNDLED';
  if (scenario.grant !== 'PURCHASE' || !isAccountK4) return undefined;
  const lotId = await ensureRequestLotId(ctx, email, scenario, request, plan);
  let keys = await listAll<{ id: string }>(ctx, email, `/license-keys?licenseLotId=${lotId}&status=IN_STORE`);
  if (!keys[0]) {
    await ctx.api.call(email, 'POST', `/license-lots/${lotId}/keys`, {
      keys: [`REQ-${scenario.key.toUpperCase()}-7Q2K-X9M4-0001`],
    });
    keys = await listAll<{ id: string }>(ctx, email, `/license-keys?licenseLotId=${lotId}&status=IN_STORE`);
  }

  return keys[0]?.id;
}

/**
 * What the grant of a K1 seat is completed with besides the evidence (`QĐ-111az`, K1-GR): the two steps of its checklist, the company email first,
 * ticked a moment ago and in that order. The grant of any other kind takes none. No evidence goes in the checklist: it is sent beside it.
 */
export function grantChecklistBody(
  type: string | null,
  now: number,
): { k1Checklist?: { items: { code: string; done: boolean; doneAt: string }[] } } {
  if (type !== 'K1') return {};
  const steps = ['COMPANY_EMAIL_REGISTERED', 'NO_PERSONAL_DEVICE_MFA'];

  return {
    k1Checklist: {
      items: steps.map((code, index) => ({
        code,
        done: true,
        doneAt: new Date(now - 1000 * (steps.length - index)).toISOString(),
      })),
    },
  };
}

async function completeTask(ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire): Promise<void> {
  const admin = grantAdminOf(ctx, scenario, request);
  if (!admin) throw new Error(`No IT Admin of the dataset carries out ${scenario.key}`);
  const email = await as(ctx, admin);
  const type = planTypeOf(ctx, scenario);
  const open = (await tasksOf(ctx, email, request.id)).filter((row) => ['QUEUED', 'IN_PROGRESS'].includes(row.status));
  if (open.length === 0) throw new Error(`The grant task of ${scenario.key} is neither queued nor in progress`);
  for (const task of open) {
    if (task.status === 'QUEUED') await ctx.api.call(email, 'POST', `/provisioning-tasks/${task.id}/claim`);
    const licenseKeyId = await k4LicenseKeyId(ctx, email, scenario, request);
    await ctx.api.call(email, 'POST', `/provisioning-tasks/${task.id}/complete`, {
      evidence: `${tag(ctx, scenario.key)} Đã cấp quyền cho người dùng.`,
      ...(licenseKeyId ? { licenseKeyId } : {}),
      ...grantChecklistBody(type, Date.now()),
    });
  }
}

/** The IT Admin takes the task of the grant and reports it failed: the task fails, the request stays `EXECUTING`; one that failed already is left. */
async function failTaskOpen(ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire): Promise<void> {
  const admin = grantAdminOf(ctx, scenario, request);
  if (!admin) throw new Error(`No IT Admin of the dataset carries out ${scenario.key}`);
  const email = await as(ctx, admin);
  // Only a task still running can fail: a completed, cancelled or closed task of an earlier attempt is history and the API refuses it.
  const running = (await tasksOf(ctx, email, request.id)).filter((row) =>
    ['QUEUED', 'IN_PROGRESS'].includes(row.status),
  );
  for (const task of running) {
    if (task.status === 'QUEUED') await ctx.api.call(email, 'POST', `/provisioning-tasks/${task.id}/claim`);
    await ctx.api.call(email, 'POST', `/provisioning-tasks/${task.id}/report-failure`, {
      reason: reasonOf(ctx, scenario, 'TASK_FAILED'),
    });
  }
}

/** The IT Admin closes the failed task for good: the request fails with it. */
async function failTaskClose(ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire): Promise<void> {
  const admin = grantAdminOf(ctx, scenario, request);
  if (!admin) throw new Error(`No IT Admin of the dataset carries out ${scenario.key}`);
  const email = await as(ctx, admin);
  for (const task of (await tasksOf(ctx, email, request.id)).filter((row) => row.status === 'FAILED')) {
    await ctx.api.call(email, 'POST', `/provisioning-tasks/${task.id}/close-failed`, {
      reason: reasonOf(ctx, scenario, 'TASK_CLOSED'),
    });
  }
}

const HANDLERS: Readonly<Record<ScenarioAction, Handler>> = {
  NEED_APPROVE: (ctx, scenario, request) => decideNeed(ctx, scenario, request, 'APPROVE'),
  NEED_REJECT: (ctx, scenario, request) => decideNeed(ctx, scenario, request, 'REJECT'),
  NEED_RETURN: (ctx, scenario, request) => decideNeed(ctx, scenario, request, 'RETURN'),
  WITHDRAW: withdraw,
  SUBMIT_BATCH: submitBatch,
  CONFIRM_RESERVE: confirmReserve,
  APPROVE_SPEND: (ctx, scenario, request) => decideSpend(ctx, scenario, request, 'APPROVE'),
  REJECT_SPEND: (ctx, scenario, request) => decideSpend(ctx, scenario, request, 'REJECT'),
  RETURN_SPEND: (ctx, scenario, request) => decideSpend(ctx, scenario, request, 'RETURN'),
  ASSESSMENT_REJECT: (ctx, scenario, request) => assess(ctx, scenario, request, 'REJECT'),
  ASSESSMENT_RETURN: (ctx, scenario, request) => assess(ctx, scenario, request, 'RETURN'),
  GRANT: grant,
  FAIL_TASK_OPEN: failTaskOpen,
  FAIL_TASK_CLOSE: failTaskClose,
  COMPLETE_TASK: completeTask,
};

/** Carries out one action of the path of a scenario, as the person the routing names for it. */
export function perform(
  ctx: DemoRunContext,
  scenario: DemoRequestScenario,
  request: RequestWire,
  action: ScenarioAction,
): Promise<void> {
  return HANDLERS[action](ctx, scenario, request);
}
