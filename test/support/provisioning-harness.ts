import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DbTx } from '../../src/infrastructure/database/transaction-runner';
import { LicensingService } from '../../src/modules/licensing/licensing.service';
import {
  GRANT_REQUEST_GATE,
  type GrantOutcome,
  type GrantRequestAnswer,
  type GrantRequestGate,
  type ProvisioningFailureKind,
} from '../../src/modules/licensing/licensing.types';
import { ApiAccount, createActivatedAccount } from './api-accounts';
import { SeatHarness } from './seat-baseline-harness';
import { HR_BASIS } from './hr-basis';

/** What the module of requests will answer, as the test decides: the request by id, and what it may be granted for. */
export class FakeGrantGate implements GrantRequestGate {
  private readonly answers = new Map<string, GrantRequestAnswer>();

  /** The department a request is of unless the test names one: the department of the seeded installation (set when the harness starts). */
  defaultDepartmentId = '';

  /** The requests that share one lock, as the persons of one request for a group do: the lock the real gate takes on the request row. */
  private readonly lockKeys = new Map<string, string>();

  /** Makes these requests one request for the locks: whoever touches one of them waits for whoever holds the lock of any of them. */
  shareLock(key: string, ...requestIds: string[]): void {
    for (const requestId of requestIds) this.lockKeys.set(requestId, key);
  }

  private async lock(tx: DbTx, requestId: string): Promise<void> {
    const key = this.lockKeys.get(requestId);
    if (key !== undefined) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  check(requestId: string): Promise<GrantRequestAnswer> {
    return Promise.resolve(this.answers.get(requestId) ?? { status: 'NOT_FOUND' });
  }

  /** What licensing told this gate about how a request ended, in order. */
  readonly outcomes: { requestId: string; outcome: GrantOutcome }[] = [];

  async claimForGrant(tx: DbTx, requestId: string): Promise<GrantRequestAnswer> {
    await this.lock(tx, requestId);

    return this.check(requestId);
  }

  isWithdrawing(): Promise<boolean> {
    return Promise.resolve(false);
  }

  reportCancelled(): Promise<boolean> {
    return Promise.resolve(false);
  }

  async reportOutcome(tx: DbTx, requestId: string, outcome: GrantOutcome): Promise<void> {
    await this.lock(tx, requestId);
    this.outcomes.push({ requestId, outcome });
  }

  /** A request that is approved enough and not ended, for this person and plan, of this department (the seed one by default). */
  grantable(employeeId: string, planId: string, departmentId: string = this.defaultDepartmentId): string {
    return this.answer({
      status: 'GRANTABLE',
      seat: 'PERSONAL',
      employeeId,
      planId,
      departmentId,
      expectedEndDate: null,
    });
  }

  answer(answer: GrantRequestAnswer): string {
    const id = randomUUID();
    this.answers.set(id, answer);

    return id;
  }
}

export interface TaskWire {
  id: string;
  kind: string;
  channel: string;
  status: string;
  requestId: string;
  assignmentId: string;
  beneficiary: { employeeId: string; employeeCode: string; fullName: string } | null;
  plan: { planId: string; planName: string; provisioningType: string } | null;
  subscriptionId: string | null;
  accountIdentifier: string;
  steps: { code: string; accountIdentifier?: string; adminIdentity?: string }[];
  doneWhen: string | null;
  defaultResponsibleEmployeeId: string | null;
  inGeneralQueue: boolean;
  createdAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  completedBy: string | null;
  completedAt: string | null;
  evidence: string | null;
  failedBy: string | null;
  failedAt: string | null;
  failureReason: string | null;
  failureKind: string | null;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastError: string | null;
  availableDecisions: string[];
  handedOffBy: string | null;
  handedOffAt: string | null;
  handOffEvidence: string | null;
  closedBy: string | null;
  closedAt: string | null;
  closeReason: string | null;
  elapsedSeconds: number;
}

/** The seat harness with a gate for requests that the test controls, and the people and departments a queue needs. */
export class ProvisioningHarness extends SeatHarness {
  readonly gate = new FakeGrantGate();

  override async start(options: Parameters<SeatHarness['start']>[0] = {}): Promise<void> {
    await super.start({
      ...options,
      providerOverrides: [{ token: GRANT_REQUEST_GATE, useValue: this.gate }, ...(options.providerOverrides ?? [])],
    });
    this.gate.defaultDepartmentId = this.seed.departmentId;
  }

  /** Today in the calendar of the organization (the seeded one is Asia/Ho_Chi_Minh). */
  today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

  private created = (response: request.Response): request.Response => {
    if (response.status !== 201) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);

    return response;
  };

  /** A job title is free text on the person (`QĐ-87e`): there is nothing to create, so the name is the title. */
  jobTitle(name: string): Promise<string> {
    return Promise.resolve(name);
  }

  /**
   * A department the Super Admin creates (with no Cost Center) and the Cost Center Finance creates for it (`QĐ-87d(1)`).
   */
  async department(code: string, itAdminEmployeeId?: string): Promise<{ id: string; code: string }> {
    const department = this.dataOf<{ id: string; code: string }>(
      await request(this.server())
        .post('/api/v1/departments')
        .set({ Authorization: `Bearer ${this.admin}` })
        .send({
          code,
          name: `Department ${code}`,
          hrBasis: HR_BASIS,
          ...(itAdminEmployeeId ? { itAdminEmployeeId } : {}),
        })
        .then(this.created),
    );
    await this.costCenterFor(department.id);

    return department;
  }

  /** A person of the company in this department, with the work email `code@acme.vn`. */
  async member(departmentCode: string, code: string, jobTitle: string): Promise<string> {
    return this.dataOf<{ id: string }>(
      await request(this.server())
        .post('/api/v1/employees')
        .set({ Authorization: `Bearer ${this.admin}` })
        .send({
          hrBasis: HR_BASIS,
          employeeCode: code,
          fullName: `Person ${code}`,
          workEmail: `${code.toLowerCase()}@acme.vn`,
          employmentType: 'STAFF',
          hireDate: '2026-10-01',
          departmentCode,
          jobTitle,
        })
        .then(this.created),
    ).id;
  }

  account(code: string, employeeId: string, roles: string[]): Promise<ApiAccount> {
    return createActivatedAccount(this.ctx, this.seed, {
      code,
      email: `${code.toLowerCase()}@acme.vn`,
      roles,
      admin: this.admin,
      employeeId,
    });
  }

  grant = (body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post('/api/v1/provisioning-tasks').set(this.as(account)).send(body);
  claim = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/provisioning-tasks/${id}/claim`).set(this.as(account));
  complete = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/provisioning-tasks/${id}/complete`).set(this.as(account)).send(body);
  fail = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/provisioning-tasks/${id}/report-failure`).set(this.as(account)).send(body);
  getTask = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).get(`/api/v1/provisioning-tasks/${id}`).set(this.as(account));
  list = (query: Record<string, string | number> = {}, account: ApiAccount = this.it1) =>
    request(this.server()).get('/api/v1/provisioning-tasks').query(query).set(this.as(account));

  /**
   * Grants and returns the task; the request is made grantable for `employeeId` and the plan of the subscription, as a request of
   * `departmentId` (the seed department unless named: the seat goes only on a subscription of the department of the request).
   */
  async granted(
    employeeId: string,
    planId: string,
    extra: { subscriptionId?: string; accountIdentifier?: string; account?: ApiAccount; departmentId?: string } = {},
  ): Promise<TaskWire> {
    const { account, departmentId, ...body } = extra;
    const response = await this.grant(
      { requestId: this.gate.grantable(employeeId, planId, departmentId), ...body },
      account,
    );
    if (response.status !== 201) throw new Error(`grant: ${response.status} ${JSON.stringify(response.body)}`);

    return this.dataOf<{ task: TaskWire }>(response).task;
  }

  /** The plan a subscription belongs to. */
  async planOf(subscriptionId: string): Promise<string> {
    const { rows } = await this.ctx.sql.query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [
      subscriptionId,
    ]);

    return rows[0].plan_id;
  }

  /** Free seats of a subscription today. */
  async freeSeats(subscriptionId: string): Promise<number | null> {
    return this.dataOf<{ free: number | null }>(
      await request(this.server())
        .get(`/api/v1/subscriptions/${subscriptionId}/seat-usage`)
        .set(this.as(this.it1))
        .expect(200),
    ).free;
  }

  auditEvents = async (resourceType: string, resourceId: string) =>
    (
      await this.ctx.sql.query<{
        action: string;
        actor_app_user_id: string | null;
        before: Record<string, unknown> | null;
        after: Record<string, unknown> | null;
      }>(
        `SELECT action, actor_app_user_id, before, after FROM audit_events
          WHERE resource_type = $1 AND resource_id = $2 ORDER BY occurred_at, id`,
        [resourceType, resourceId],
      )
    ).rows;

  retry = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/provisioning-tasks/${id}/retry`).set(this.as(account));
  handOff = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/provisioning-tasks/${id}/hand-off`).set(this.as(account)).send(body);
  cancelTask = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/provisioning-tasks/${id}/cancel`).set(this.as(account));
  closeFailed = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/provisioning-tasks/${id}/close-failed`).set(this.as(account)).send(body);

  /** What the connector will call when a try fails (`US-07-03` does not exist yet): the facade of the module. */
  recordFailure = (taskId: string, kind: ProvisioningFailureKind, detail = `error of ${kind}`, now?: Date) =>
    this.ctx.app.get(LicensingService).recordProvisioningFailure({ taskId, kind, detail, ...(now ? { now } : {}) });

  /** A task of the connector: no connector exists, so a task by hand is moved to that channel the way G7 will make it. */
  async makeConnector(taskId: string): Promise<void> {
    await this.ctx.sql.query(`UPDATE provisioning_tasks SET channel = 'CONNECTOR' WHERE id = $1`, [taskId]);
  }

  /** The Super Admin sets an operating parameter. */
  setParameter = (key: string, value: number) =>
    request(this.server())
      .put(`/api/v1/operating-parameters/${key}`)
      .set({ Authorization: `Bearer ${this.admin}` })
      .send({ value });
}
