import { as, listAll, tag } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoRequestScenario } from '../fixture/demo-fixture.types';
import { grantTaskStatus, perform, type RequestWire } from './request-actions';
import { nextScenarioAction, reachedTarget, type ScenarioPosition } from './scenario-path';

export type { RequestWire } from './request-actions';

const MAX_TURNS = 10;

/**
 * The time of use of a request as the body carries it (`QĐ-111i`, RQ-2): the months it asks for, never a date (`expectedEndDate` is a 422).
 * No months: the field is left out, which is a right with no end for a plan of seats or internal software of a staff member, and nothing for a
 * plan bought once.
 */
export const termBody = (termMonths: number | null): { termMonths?: number } =>
  termMonths === null ? {} : { termMonths };

/** Who reads the request: its requester, unless the scenario names another because the requester can no longer sign in (C-2). */
const readerOf = (scenario: DemoRequestScenario): string => scenario.readAs ?? scenario.requester;

/**
 * The request of a scenario, found from what the API itself recorded: every request its requester sent is an Audit Trail
 * event (written in the transaction that sent it), and the request carries the scenario's tag at the start of its text. It is read by
 * `readAs` when the scenario names one, so a requester whose access is blocked is never signed in for it (C-2).
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
  if (events.length === 0) return null;
  const reader = await as(ctx, readerOf(scenario));
  const marker = tag(ctx, scenario.key);
  for (const id of new Set(events.map((event) => event.resourceId))) {
    const data = await ctx.api.call<{ request?: RequestWire }>(reader, 'GET', `/access-requests/${id}`);
    const texts = [data.request?.businessReason, data.request?.proposal?.purpose];
    if (data.request && texts.some((text) => text?.startsWith(marker))) {
      ctx.ids.requests.set(scenario.key, id);
      return data.request;
    }
  }

  return null;
}

/** The free text a scenario sends as its reason or purpose: the tag that finds it again, then the business reason (never the developer's `summary`). */
export const requestTextOf = (ctx: DemoRunContext, scenario: DemoRequestScenario): string =>
  `${tag(ctx, scenario.key)} ${scenario.reason}`;

async function submit(ctx: DemoRunContext, scenario: DemoRequestScenario): Promise<RequestWire> {
  const requester = await as(ctx, scenario.requester);
  const text = requestTextOf(ctx, scenario);
  const planId = ctx.ids.plans.get(scenario.plan ?? '');
  let created: { request: RequestWire };
  if (scenario.proposal) {
    const { existingApplication, ...proposal } = scenario.proposal;
    created = await ctx.api.call(requester, 'POST', '/access-requests/proposals', {
      ...proposal,
      ...(existingApplication ? { existingApplicationId: ctx.ids.applications.get(existingApplication) } : {}),
      purpose: text,
      ...termBody(scenario.termMonths),
    });
  } else if (scenario.beneficiaries) {
    created = await ctx.api.call(requester, 'POST', '/group-requests', {
      planId,
      lines: scenario.beneficiaries.map((code) => ({ employeeId: ctx.ids.employees.get(code) })),
      businessReason: text,
      ...termBody(scenario.termMonths),
    });
  } else {
    created = await ctx.api.call(requester, 'POST', '/access-requests', {
      planId,
      businessReason: text,
      ...termBody(scenario.termMonths),
    });
  }
  ctx.ids.requests.set(scenario.key, created.request.id);

  return created.request;
}

/**
 * Where the request stands on its path: its state and, besides it, the stage of its spend step, or for a request being granted the status of
 * its grant task (read only when the scenario goes on from there, which is a call to the task list).
 */
async function positionOf(
  ctx: DemoRunContext,
  scenario: DemoRequestScenario,
  request: RequestWire,
): Promise<ScenarioPosition> {
  const needsTask = request.state === 'EXECUTING' && scenario.target === 'FAILED';

  return {
    state: request.state,
    stage: needsTask ? await grantTaskStatus(ctx, scenario, request) : (request.spend?.stage ?? null),
  };
}

/** Why the request cannot go on towards its scenario, or null when it can. */
function obstacleOf(ctx: DemoRunContext, scenario: DemoRequestScenario, request: RequestWire): string | null {
  if (scenario.plan && request.plan && request.plan.planId !== ctx.ids.plans.get(scenario.plan))
    return `Request ${scenario.key} đã có nhưng cho gói khác fixture`;

  return null;
}

const describePosition = (request: RequestWire): string =>
  `${request.state}${request.spend ? `/${request.spend.stage}` : ''}`;

async function reload(ctx: DemoRunContext, scenario: DemoRequestScenario, id: string): Promise<RequestWire> {
  const reader = await as(ctx, readerOf(scenario));

  return (await ctx.api.call<{ request: RequestWire }>(reader, 'GET', `/access-requests/${id}`)).request;
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
    const obstacle = obstacleOf(ctx, scenario, request);
    if (obstacle) return { status: 'conflict', detail: obstacle };
    const position = await positionOf(ctx, scenario, request);
    if (reachedTarget(position, scenario))
      return { status: moved ? 'done' : 'present', detail: describePosition(request) };
    const action = nextScenarioAction(position, scenario);
    if (!action)
      return { status: 'conflict', detail: `đang ở ${describePosition(request)}, không tới được ${scenario.target}` };
    if (ctx.mode === 'plan') return { status: 'planned', detail: `${request.state} → ${action}` };
    await perform(ctx, scenario, request, action);
    moved = true;
    request = await reload(ctx, scenario, request.id);
  }

  return { status: 'conflict', detail: `không tới được ${scenario.target} sau ${MAX_TURNS} bước` };
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
