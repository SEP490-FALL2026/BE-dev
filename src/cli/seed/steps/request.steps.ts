import { calendarFor } from '../seed-calendar';
import { as, listAll, tag } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoRequestScenario } from '../fixture/demo-fixture.types';
import { nextScenarioAction, ScenarioAction } from './scenario-path';

export interface RequestWire {
  id: string;
  state: string;
  businessReason?: string | null;
  proposal?: { purpose: string } | null;
  plan?: { planId: string } | null;
  department: { code: string };
  policy: { hasSpendStep: boolean };
  needStep: { assignee: { employeeCode: string } | null } | null;
}

const MAX_TURNS = 8;

function isPaid(ctx: DemoRunContext, planKey: string): boolean {
  const plan = ctx.fixture.applications
    .flatMap((application) => application.plans)
    .find((candidate) => candidate.key === planKey);

  return plan !== undefined && plan.provisioningType !== 'K5';
}

function departmentOf(ctx: DemoRunContext, code: string) {
  const department = ctx.fixture.departments.find((candidate) => candidate.code === code);
  if (!department) throw new Error(`The request belongs to a department the fixture does not declare: ${code}`);

  return department;
}

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
    `/audit-events?actorAppUserId=${appUserId}&action=ACCESS_REQUEST.SUBMITTED&resourceType=ACCESS_REQUEST`,
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
  const created = scenario.proposal
    ? await ctx.api.call<{ request: RequestWire }>(requester, 'POST', '/access-requests/proposals', {
        ...scenario.proposal,
        purpose: text,
        termMonths: scenario.termMonths,
      })
    : await ctx.api.call<{ request: RequestWire }>(requester, 'POST', '/access-requests', {
        planId: ctx.ids.plans.get(scenario.plan ?? ''),
        businessReason: text,
        termMonths: scenario.termMonths,
        ...(isPaid(ctx, scenario.plan ?? '') ? { expectedSpendOn: spendDay(ctx) } : {}),
      });
  ctx.ids.requests.set(scenario.key, created.request.id);

  return created.request;
}

function spendDay(ctx: DemoRunContext): string {
  return calendarFor(ctx).spendDay;
}

async function scenarioStep(ctx: DemoRunContext, scenario: DemoRequestScenario): Promise<StepOutcome> {
  let request = await findScenarioRequest(ctx, scenario);
  let moved = false;
  if (!request) {
    if (ctx.mode === 'plan') return { status: 'planned', detail: `gửi yêu cầu, rồi tới ${scenario.target}` };
    request = await submit(ctx, scenario);
    moved = true;
  }
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (scenario.plan && request.plan && request.plan.planId !== ctx.ids.plans.get(scenario.plan))
      return { status: 'conflict', detail: `Request ${scenario.key} đã có nhưng cho gói khác fixture` };
    if (request.state === scenario.target) return { status: moved ? 'done' : 'present', detail: `${request.state}` };
    const action = nextScenarioAction(request.state, scenario.target);
    if (!action) return { status: 'conflict', detail: `đang ở ${request.state}, không tới được ${scenario.target}` };
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
      return withdraw(ctx, scenario, request);
    case 'SUBMIT_BATCH':
      return post(ctx, department.head, '/spend-batches', { requestIds: [request.id] });
    case 'APPROVE_SPEND':
      return post(ctx, ctx.fixture.approvalRoles.SPENDING_APPROVER, `/access-requests/${request.id}/spend-approval`, {
        decision: 'APPROVE',
      });
    case 'GRANT':
      return post(ctx, department.itAdmin, '/provisioning-tasks', {
        requestId: request.id,
        subscriptionId: ctx.ids.subscriptions.get(scenario.grantFrom ?? ''),
      });
    case 'COMPLETE_TASK':
      return completeGrant(ctx, department.itAdmin, request.id, scenario);
  }
}

async function post(ctx: DemoRunContext, code: string | null, path: string, body: unknown): Promise<void> {
  if (!code) throw new Error(`No demo person acts at ${path}: the fixture leaves that role empty`);
  await ctx.api.call(await as(ctx, code), 'POST', path, body);
}

async function decideNeed(ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire, approve: boolean) {
  const assignee = request.needStep?.assignee?.employeeCode ?? null;
  if (!assignee || !ctx.fixture.people.some((person) => person.code === assignee)) {
    throw new Error(
      `The need step of ${scenario.key} is held by somebody outside the dataset (${assignee ?? 'nobody'})`,
    );
  }
  const spend = scenario.planLine ? { planLine: { position: scenario.planLine } } : { offPlan: true };
  const body = approve
    ? { decision: 'APPROVE', ...(request.policy.hasSpendStep ? { spend } : {}) }
    : { decision: 'REJECT', reason: `${tag(ctx, scenario.key)} Chưa cần trong quý này (dữ liệu demo).` };
  await post(ctx, assignee, `/access-requests/${request.id}/need-decision`, body);
}

async function withdraw(ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire): Promise<void> {
  await post(ctx, scenario.requester, `/access-requests/${request.id}/withdraw`, {
    reason: `${tag(ctx, scenario.key)} Không còn cần (dữ liệu demo).`,
  });
}

interface TaskRow {
  id: string;
  kind: string;
  status: string;
  requestId: string | null;
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
  const task = tasks.find(
    (row) => row.requestId === requestId && row.kind === 'GRANT' && ['QUEUED', 'IN_PROGRESS'].includes(row.status),
  );
  if (!task) throw new Error(`The grant task of ${scenario.key} is neither queued nor in progress`);
  if (task.status === 'QUEUED') await ctx.api.call(email, 'POST', `/provisioning-tasks/${task.id}/claim`);
  await ctx.api.call(email, 'POST', `/provisioning-tasks/${task.id}/complete`, {
    evidence: `${tag(ctx, scenario.key)} Đã thêm email công ty vào workspace (dữ liệu demo).`,
  });
}

const BASE_NEEDS = ['catalog.subscriptions', 'org.heads', 'org.approval-roles', 'org.it-admins'];

export function requestSteps(scenarios: readonly DemoRequestScenario[]): DemoStep[] {
  return scenarios.map((scenario) => ({
    key: `requests.${scenario.key}`,
    title: `Request ${scenario.key} → ${scenario.target}: ${scenario.summary}`,
    // A request that is checked against the budget of the year waits for that budget; the others do not.
    needs:
      scenario.planLine || scenario.target === 'COMPLETED' || scenario.target === 'AWAITING_SPEND_DECISION'
        ? [...BASE_NEEDS, 'budget.year']
        : BASE_NEEDS,
    run: (ctx) => scenarioStep(ctx, scenario),
  }));
}
