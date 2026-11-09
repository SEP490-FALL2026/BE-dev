import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { bodyOf } from '../api-body';
import type { FlowActors } from './flow-actors';
import type { FlowClock } from './flow-clock';
import type { FlowFacts } from './flow-facts';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

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

  post(code: string, path: string, body: object = {}): Promise<request.Response> {
    return this.as(code, 'post', path, body);
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

  /** The subscription a department owns of a plan (read from the database: the subscription list is for the IT Admin). */
  async subscriptionOf(planName: string, departmentCode: string): Promise<string> {
    return (
      await this.facts.one<{ id: string }>(
        `SELECT s.id FROM subscriptions s JOIN plans p ON p.id = s.plan_id JOIN departments d ON d.id = s.owner_department_id
          WHERE p.name = $1 AND d.code = $2`,
        [planName, departmentCode],
      )
    ).id;
  }

  /** An employee sends a Request for a plan and the id of it is returned, failing on anything but 201. */
  async submitRequest(code: string, planId: string, extra: Record<string, unknown> = {}): Promise<string> {
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
