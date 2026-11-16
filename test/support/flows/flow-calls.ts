import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { bodyOf } from '../api-body';
import type { FlowActors } from './flow-actors';
import type { FlowClock } from './flow-clock';
import type { FlowFacts } from './flow-facts';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** The decision step whose checklist a POST to `path` answers, or null (`DECISION_STEP_CODES`; a batch only when it confirms the reserve). */
export function decisionStepOf(path: string, body: object): string | null {
  const route = path.split('?')[0];
  if (/\/(need-decision|line-need-decisions)$/.test(route)) return '1.2';
  if (/\/assessment\/(completion|rejection)$/.test(route)) return '1.3';
  if (/\/reserve-confirmation$/.test(route)) return '1.6';
  if (route === '/spend-batches') {
    const confirmations = (body as { reserveConfirmations?: unknown[] }).reserveConfirmations;
    return confirmations && confirmations.length > 0 ? '1.6' : null;
  }
  if (/\/(spend-approval|line-spend-decisions)$/.test(route) || /^\/spend-batches\/[^/]+\/decisions$/.test(route))
    return '1.7';
  if (/^\/budget-versions\/[^/]+\/decision$/.test(route)) return '4.7';
  if (route === '/ghost-seat-recommendations/escalations') return '5.3';
  if (route === '/ghost-seat-decisions') return '5.4';

  return null;
}

/**
 * The calls of the scenarios, in one place: a request as a signed-in person of the dataset, and the bodies of the contract after the
 * Wave 1 changes, so that a change of a body is one edit here and not one in every scenario. No assertion lives here.
 */
export class FlowCalls {
  constructor(
    private readonly app: INestApplication<App>,
    private readonly actors: FlowActors,
    readonly facts: FlowFacts,
    private readonly clock: FlowClock,
  ) {}

  /** A request as `code` (signed in on first use). `path` is without the `/api/v1` prefix. */
  async as(code: string, method: Method, path: string, body?: object): Promise<request.Response> {
    await this.actors.ensure(code);
    const call = request(this.app.getHttpServer())[method](`/api/v1${path}`).set(this.actors.as(code));

    return body === undefined ? call : call.send(body);
  }

  get(code: string, path: string): Promise<request.Response> {
    return this.as(code, 'get', path);
  }

  /**
   * A POST as `code`. A decision route of a step with a checklist (`QĐ-111ap`, PL-2) gets the checklist of the policy in force at that step
   * with every question of the person answered Yes, as the screen sends it, unless the body brings its own (`checklist`, or `checklist:
   * undefined` to leave it out on purpose).
   */
  async post(code: string, path: string, body: object = {}): Promise<request.Response> {
    const step = decisionStepOf(path, body);
    const withChecklist = step && !('checklist' in body) ? { ...body, checklist: await this.yesChecklist(step) } : body;

    return this.as(code, 'post', path, withChecklist);
  }

  /** The checklist of a step all Yes, read from the version of its policy in force now. */
  async yesChecklist(
    step: string,
  ): Promise<{ policyVersionId: string; answers: { itemCode: string; answer: 'YES' }[] }> {
    const rows = await this.facts.rows<{
      id: string;
      content: { steps: { code: string; checklist: { code: string; check: string }[] }[] };
    }>(
      `SELECT DISTINCT ON (v.policy_id) v.id, v.content
         FROM policy_versions v WHERE v.version_number IS NOT NULL ORDER BY v.policy_id, v.version_number DESC`,
    );
    for (const row of rows) {
      const found = row.content.steps.find((candidate) => candidate.code === step);
      if (found) {
        return {
          policyVersionId: row.id,
          answers: found.checklist
            .filter((item) => item.check === 'PERSON')
            .map((item) => ({ itemCode: item.code, answer: 'YES' as const })),
        };
      }
    }
    throw new Error(`No policy in force has the step ${step}.`);
  }

  put(code: string, path: string, body: object = {}): Promise<request.Response> {
    return this.as(code, 'put', path, body);
  }

  /** A request with no sign-in at all. */
  anonymous(method: Method, path: string, body?: object): request.Test {
    const call = request(this.app.getHttpServer())[method](`/api/v1${path}`);

    return body === undefined ? call : call.send(body);
  }

  /** `data` of the envelope of an answer. */
  data<T>(response: request.Response): T {
    return bodyOf(response).data as T;
  }

  /** `error.code` of the envelope of a refusal. */
  codeOf(response: request.Response): string {
    return bodyOf(response).error.code;
  }

  /** `error.details` of the envelope of a refusal. */
  detailsOf(response: request.Response): Record<string, unknown> {
    return bodyOf(response).error.details ?? {};
  }

  /** The id of a plan of the catalog by the name it is requested under (`Figma Professional`…), as an employee sees it. */
  async planId(name: string): Promise<string> {
    const page = this.data<{ items: { id: string; name: string }[] }>(
      await this.get('NV-DEV3', '/requestable-plans?pageSize=100'),
    );
    const found = page.items.find((plan) => plan.name === name);
    if (!found) throw new Error(`The catalog has no requestable plan ${name}.`);

    return found.id;
  }

  /**
   * The subscription of a plan: the one stock of the whole company (`QĐ-103d`) — the dataset holds exactly one subscription per plan, so a
   * second one is a failure of the dataset, not a choice. Read from the database: the subscription list is for the IT Admin.
   */
  async subscriptionOf(planName: string): Promise<string> {
    return (
      await this.facts.one<{ id: string }>(
        `SELECT s.id FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE p.name = $1`,
        [planName],
      )
    ).id;
  }

  /** An employee sends a Request for a plan and the id of it is returned, failing on anything but 201. */
  async submitRequest(code: string, planId: string, extra: Record<string, unknown> = {}): Promise<string> {
    // A flow says how long in months, as the API takes it (`QĐ-111i`): `termMonths` goes in the body as it is.
    const response = await this.post(code, '/access-requests', {
      planId,
      businessReason: 'Cần cho công việc của nhóm',
      ...extra,
    });
    if (response.status !== 201)
      throw new Error(`submit answered ${response.status}: ${JSON.stringify(response.body)}`);

    return this.data<{ request: { id: string } }>(response).request.id;
  }

  /** The head approves the need of a Request and the answer is returned. */
  approveNeed(headCode: string, requestId: string): Promise<request.Response> {
    return this.post(headCode, `/access-requests/${requestId}/need-decision`, { decision: 'APPROVE' });
  }

  /** The head sends Requests on to the spending approver as one batch. */
  submitBatch(headCode: string, requestIds: string[]): Promise<request.Response> {
    return this.post(headCode, '/spend-batches', { requestIds });
  }

  /** The day the clock stands on. */
  today(): string {
    return this.clock.today();
  }

  /** The day `days` from the day the clock stands on. */
  inDays(days: number): string {
    return this.clock.inDays(days);
  }
}
