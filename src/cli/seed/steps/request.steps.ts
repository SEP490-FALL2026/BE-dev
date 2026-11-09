import { dayOffset, endOfMonth } from '../demo-dates';
import { as, listAll, tag } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoRequestEnd, DemoRequestScenario } from '../fixture/demo-fixture.types';
import { nextScenarioAction, reachedTarget, ScenarioAction } from './scenario-path';

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

const MAX_TURNS = 10;

function departmentOf(ctx: DemoRunContext, code: string) {
  const department = ctx.fixture.departments.find((candidate) => candidate.code === code);
  if (!department) throw new Error(`The request belongs to a department the fixture does not declare: ${code}`);

  return department;
}

/** The end date a scenario names, relative to today (`undefined`: the request names none). */
export function endDateOf(ctx: DemoRunContext, end: DemoRequestEnd): string | undefined {
  if (end === 'NONE') return undefined;
  if (end === 'EOM') return endOfMonth(ctx.today);

  return dayOffset(ctx.today, end.inDays);
}

const withEnd = (ctx: DemoRunContext, end: DemoRequestEnd) => {
  const expectedEndDate = endDateOf(ctx, end);

  return expectedEndDate === undefined ? {} : { expectedEndDate };
};

/**
 * The request of a scenario, found from what the API itself recorded: every request its requester sent is an Audit Trail
 * event (written in the transaction that sent it), and the request carries the scenario's tag at the start of its text.
 */
export async function findScenarioRequest(
  ctx: DemoRunContext,
  scenario: DemoRequestScenario,
): Promise<RequestWire | null> {
  const appUserId = ctx.ids.appUsers.get(scenario.requester);
  if (!appUserId) return null;
  const events = await listAll<{ resourceId: string }>(
    ctx,
    ctx.superAdminEmail,
    `/audit-events?actorAppUserId=${appUserId}&resourceType=ACCESS_REQUEST&action=ACCESS_REQUEST.SUBMITTED`,
  );
  const requester = await as(ctx, scenario.requester);
  const marker = tag(ctx, scenario.key);
  for (const id of new Set(events.map((event) => event.resourceId))) {
    const data = await ctx.api.call<{ request?: RequestWire }>(requester, 'GET', `/access-requests/${id}`);
    const texts = [data.request?.businessReason, data.request?.proposal?.purpose];
    if (data.request && texts.some((text) => text?.startsWith(marker))) {
      ctx.ids.requests.set(scenario.key, id);
      return data.request;
    }
  }

  return null;
}

async function submit(ctx: DemoRunContext, scenario: DemoRequestScenario): Promise<RequestWire> {
  const requester = await as(ctx, scenario.requester);
  const text = `${tag(ctx, scenario.key)} ${scenario.summary}`;
  const planId = ctx.ids.plans.get(scenario.plan ?? '');
  let created: { request: RequestWire };
  if (scenario.proposal) {
    created = await ctx.api.call(requester, 'POST', '/access-requests/proposals', {
      ...scenario.proposal,
      purpose: text,
      ...withEnd(ctx, scenario.end),
    });
  } else if (scenario.beneficiaries) {
    created = await ctx.api.call(requester, 'POST', '/group-requests', {
      planId,
      lines: scenario.beneficiaries.map((code) => ({ employeeId: ctx.ids.employees.get(code) })),
      businessReason: text,
      ...withEnd(ctx, scenario.end),
    });
  } else {
    created = await ctx.api.call(requester, 'POST', '/access-requests', {
      planId,
      businessReason: text,
      ...withEnd(ctx, scenario.end),
    });
  }
  ctx.ids.requests.set(scenario.key, created.request.id);

  return created.request;
}

const positionOf = (request: RequestWire) => ({ state: request.state, stage: request.spend?.stage ?? null });

/** Why the request cannot go on towards its scenario, or null when it can. */
function obstacleOf(ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire): string | null {
  if (scenario.plan && request.plan && request.plan.planId !== ctx.ids.plans.get(scenario.plan))
    return `Request ${scenario.key} đã có nhưng cho gói khác fixture`;

  return null;
}

const describePosition = (request: RequestWire): string =>
  `${request.state}${request.spend ? `/${request.spend.stage}` : ''}`;

async function scenarioStep(ctx: DemoRunContext, scenario: DemoRequestScenario): Promise<StepOutcome> {
  let request = await findScenarioRequest(ctx, scenario);
  let moved = false;
  if (!request) {
    if (ctx.mode === 'plan') return { status: 'planned', detail: `gửi yêu cầu, rồi tới ${scenario.target}` };
    request = await submit(ctx, scenario);
    moved = true;
  }
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const obstacle = obstacleOf(ctx, scenario, request);
    if (obstacle) return { status: 'conflict', detail: obstacle };
    if (reachedTarget(positionOf(request), scenario))
      return { status: moved ? 'done' : 'present', detail: describePosition(request) };
    const action = nextScenarioAction(positionOf(request), scenario);
    if (!action)
      return { status: 'conflict', detail: `đang ở ${describePosition(request)}, không tới được ${scenario.target}` };
    if (ctx.mode === 'plan') return { status: 'planned', detail: `${request.state} → ${action}` };
    await perform(ctx, scenario, request, action);
    moved = true;
    request = await reload(ctx, scenario, request.id);
  }

  return { status: 'conflict', detail: `không tới được ${scenario.target} sau ${MAX_TURNS} bước` };
}

async function reload(ctx: DemoRunContext, scenario: DemoRequestScenario, id: string): Promise<RequestWire> {
  const requester = await as(ctx, scenario.requester);

  return (await ctx.api.call<{ request: RequestWire }>(requester, 'GET', `/access-requests/${id}`)).request;
}

async function post(ctx: DemoRunContext, code: string | null, path: string, body?: unknown): Promise<unknown> {
  if (!code) throw new Error(`No demo person acts at ${path}: the fixture leaves that role empty`);

  return ctx.api.call(await as(ctx, code), 'POST', path, body);
}

async function perform(
  ctx: DemoRunContext,
  scenario: DemoRequestScenario,
  request: RequestWire,
  action: ScenarioAction,
): Promise<void> {
  const department = departmentOf(ctx, request.department.code);
  switch (action) {
    case 'NEED_APPROVE':
    case 'NEED_REJECT':
      return decideNeed(ctx, scenario, request, action === 'NEED_APPROVE');
    case 'WITHDRAW':
      await post(ctx, scenario.requester, `/access-requests/${request.id}/withdraw`, {
        reason: `${tag(ctx, scenario.key)} Không còn cần.`,
      });
      return;
    case 'SUBMIT_BATCH':
      await post(ctx, department.head, '/spend-batches', {
        requestIds: [request.id],
        ...(scenario.confirmReserve
          ? {
              reserveConfirmations: [
                { requestId: request.id, reason: `${tag(ctx, scenario.key)} Cần cho chiến dịch tháng này.` },
              ],
            }
          : {}),
      });
      return;
    case 'CONFIRM_RESERVE':
      await post(ctx, department.head, `/access-requests/${request.id}/reserve-confirmation`, {
        reason: `${tag(ctx, scenario.key)} Cần cho chiến dịch tháng này.`,
      });
      return;
    case 'APPROVE_SPEND':
      if (scenario.beneficiaries) {
        // A request for a group is decided line by line (the whole group here: every person it names).
        await post(
          ctx,
          ctx.fixture.approvalRoles.SPENDING_APPROVER,
          `/access-requests/${request.id}/line-spend-decisions`,
          {
            lines: scenario.beneficiaries.map((code) => ({
              employeeId: ctx.ids.employees.get(code),
              decision: 'APPROVE',
            })),
          },
        );
        return;
      }
      await post(ctx, ctx.fixture.approvalRoles.SPENDING_APPROVER, `/access-requests/${request.id}/spend-approval`, {
        decision: 'APPROVE',
      });
      return;
    case 'GRANT':
      return grant(ctx, scenario, request, department.itAdmin);
    case 'COMPLETE_TASK':
      return completeGrant(ctx, department.itAdmin, request.id, scenario);
  }
}

async function decideNeed(ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire, approve: boolean) {
  const assignee = request.needStep?.assignee?.employeeCode ?? null;
  if (!assignee || !ctx.fixture.people.some((person) => person.code === assignee)) {
    throw new Error(
      `The need step of ${scenario.key} is held by somebody outside the dataset (${assignee ?? 'nobody'})`,
    );
  }
  const body = approve
    ? { decision: 'APPROVE' }
    : { decision: 'REJECT', reason: `${tag(ctx, scenario.key)} Chưa cần trong quý này.` };
  await post(ctx, assignee, `/access-requests/${request.id}/need-decision`, body);
}

function planTypeOf(ctx: DemoRunContext, scenario: DemoRequestScenario): string | null {
  for (const application of ctx.fixture.applications) {
    const plan = application.plans.find((candidate) => candidate.key === scenario.plan);
    if (plan) return plan.provisioningType;
  }

  return null;
}

/** IT Admin opens the grant task: from the pool, with a purchase when the pool is out (K2) or the store has no key (K4). */
async function grant(ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire, admin: string | null) {
  const type = planTypeOf(ctx, scenario);
  const buys = scenario.grant === 'PURCHASE' && (type === 'K2' || type === 'K4');
  const beneficiaries = scenario.beneficiaries ?? [null];
  for (const code of beneficiaries) {
    await post(ctx, admin, '/provisioning-tasks', {
      requestId: request.id,
      ...(code ? { beneficiaryEmployeeId: ctx.ids.employees.get(code) } : {}),
      ...(buys ? { purchase: { reason: `${tag(ctx, scenario.key)} Kho hết, cần mua thêm.` } } : {}),
    });
  }
}

interface TaskRow {
  id: string;
  kind: string;
  status: string;
  requestId: string | null;
}

/** The free key of the K4 subscription the scenario's plan has, for the IT Admin to hand over. */
async function freeKeyId(
  ctx: DemoRunContext,
  email: string,
  scenario: DemoRequestScenario,
): Promise<string | undefined> {
  if (scenario.grant !== 'KEY') return undefined;
  const subscription = ctx.fixture.subscriptions.find((candidate) => candidate.plan === scenario.plan);
  const subscriptionId = ctx.ids.subscriptions.get(subscription?.key ?? '');
  const keys = await listAll<{ id: string; status: string }>(
    ctx,
    email,
    `/license-keys?subscriptionId=${subscriptionId}&status=IN_STORE`,
  );

  return keys[0]?.id;
}

async function completeGrant(
  ctx: DemoRunContext,
  admin: string | null,
  requestId: string,
  scenario: DemoRequestScenario,
) {
  if (!admin) throw new Error(`No IT Admin of the dataset carries out ${scenario.key}`);
  const email = await as(ctx, admin);
  const tasks = await listAll<TaskRow>(ctx, email, '/provisioning-tasks?scope=ALL');
  const open = tasks.filter(
    (row) => row.requestId === requestId && row.kind === 'GRANT' && ['QUEUED', 'IN_PROGRESS'].includes(row.status),
  );
  if (open.length === 0) throw new Error(`The grant task of ${scenario.key} is neither queued nor in progress`);
  for (const task of open) {
    if (task.status === 'QUEUED') await ctx.api.call(email, 'POST', `/provisioning-tasks/${task.id}/claim`);
    const licenseKeyId = await freeKeyId(ctx, email, scenario);
    await ctx.api.call(email, 'POST', `/provisioning-tasks/${task.id}/complete`, {
      evidence: `${tag(ctx, scenario.key)} Đã cấp quyền cho người dùng.`,
      ...(licenseKeyId ? { licenseKeyId } : {}),
    });
  }
}

const BASE_NEEDS = ['catalog.baseline-close', 'org.heads', 'org.approval-roles', 'org.it-admins', 'assets.keys'];

export function requestSteps(scenarios: readonly DemoRequestScenario[]): DemoStep[] {
  return scenarios.map((scenario) => ({
    key: `requests.${scenario.key}`,
    title: `Request ${scenario.key} → ${scenario.target}: ${scenario.summary}`,
    // A request checked against the budget waits for the budget of the year; the others do not.
    needs: ['budget.year', ...BASE_NEEDS],
    run: (ctx) => scenarioStep(ctx, scenario),
  }));
}
