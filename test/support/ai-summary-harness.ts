import request from 'supertest';
import { QueueSummaryRunService } from '../../src/modules/ai-assist/queue-summary/queue-summary-run.service';
import type { ApiAccount } from './api-accounts';
import { declareSubscription } from './builders/catalog.builder';
import { FakeAiService } from './fake-ai-service';
import { GroupHarness } from './group-harness';
import type { Unit } from './spend-harness';

/** A line of a summary as `GET /ai/access-request-summaries/{id}` gives it. */
export interface SummaryLineWire {
  requestId: string;
  stepId: string;
  stepKind: 'NEED_APPROVAL' | 'SPEND_APPROVAL';
  summary: string;
}

export interface SummaryWire {
  invocationId: string;
  status: string;
  createdAt: string;
  sourceStale: boolean;
  simulated: boolean;
  omittedCount: number;
  lines: SummaryLineWire[];
  errorCode: string | null;
}

export interface SourceWire {
  queueRevision: string;
  stepCount: number;
  omittedCount: number;
}

/** A step of a request as the database keeps it: everything a summary must never change. */
export interface FullStepRow {
  id: string;
  request_id: string;
  kind: string;
  sequence: number;
  state: string;
  assignee_employee_id: string | null;
  routing_row: number;
  waiting_reason: string | null;
  sla_working_days: number;
  created_at: Date;
  assigned_at: Date | null;
  decided_at: Date | null;
  waiting_since: Date | null;
}

const BASE = '/api/v1/ai/access-request-summaries';
export const AI_SWITCHES = ['AI_ENABLED', 'AI_ACCESS_REQUEST_SUMMARY_ENABLED'] as const;

/**
 * The group harness with the AI summary of the approval queue (`US-15-05`) wired to a local stand-in of the AI service
 * (`fake-ai-service.ts`) over real HTTP: the two switches, the three routes, the content route of the Super Admin, and the reads of
 * what the database keeps. `settled` waits for every run the API started in its background. No assertion lives here.
 */
export class AiSummaryHarness extends GroupHarness {
  readonly ai = new FakeAiService();
  private unitNumber = 0;

  /** `timeoutMs`: the deadline of one call to the AI service, its retry included. */
  constructor(private readonly timeoutMs = 10_000) {
    super();
  }

  /**
   * Starts the application pointed at the stand-in (`env` may override, `AI_SERVICE_BASE_URL: ''` for no AI service) with
   * `AI_PROVIDER_MODE` = MODEL, so a summary goes to the stand-in; a spec of the simulation sets SIMULATED with `setMode`.
   */
  override async start(options: Parameters<GroupHarness['start']>[0] = {}): Promise<void> {
    await this.ai.start();
    await super.start({ ...options, env: { ...this.ai.environment(this.timeoutMs), ...(options.env ?? {}) } });
    const response = await this.setMode('MODEL');
    if (response.status !== 200)
      throw new Error(`AI_PROVIDER_MODE: ${response.status} ${JSON.stringify(response.body)}`);
  }

  override async stop(): Promise<void> {
    this.ai.release();
    try {
      await super.stop();
    } finally {
      // Never left listening, even when the application failed to start or to close.
      await this.ai.stop();
    }
  }

  /** A department of its own with a head and a member, named `<prefix><n>`. */
  async unit(prefix = 'P-AI'): Promise<Unit> {
    this.unitNumber += 1;

    return this.departmentWithHead(`${prefix}${this.unitNumber}`);
  }

  /**
   * A renewal of a term subscription of the department, proposed by the IT Admin, that waits for the decision of the spending
   * approver (`US-11-02`, state `PROPOSED`): what `RenewalHarness.proposedRenewal` makes, on this branch of the harnesses. The notice
   * deadline is 20 days from today. Returns the case and its subscription.
   */
  async proposedRenewal(
    ownerDepartmentId: string,
    opinion: string,
  ): Promise<{ renewalId: string; subscriptionId: string }> {
    const inDays = (days: number) =>
      new Date(Date.parse(`${this.today()}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    const subscriptionId = await declareSubscription(this.ctx, this.it1.accessToken, {
      ownerDepartmentId,
      planId: await this.plan('K2', 'PER_SEAT'),
      kind: 'TERM',
      purchasedQuantity: 10,
      unitPrice: { amount: '1000000', currency: 'VND' },
      billingCycle: 'ANNUAL',
      startDate: '2026-01-01',
      endDate: inDays(50),
      noticeDeadline: inDays(20),
      autoRenew: false,
      allowsMidTermReduction: false,
    });
    const response = await request(this.server())
      .post('/api/v1/subscription-renewals')
      .set(this.as(this.it1))
      .send({ subscriptionId, choice: 'RENEW', businessOwnerOpinion: opinion });
    if (response.status !== 201) throw new Error(`propose: ${response.status} ${JSON.stringify(response.body)}`);

    return { renewalId: this.dataOf<{ renewal: { id: string } }>(response).renewal.id, subscriptionId };
  }

  /** The renewals waiting for a decision that `account` reads in its own queue. */
  renewalQueue = (account: ApiAccount) =>
    request(this.server()).get('/api/v1/subscription-renewals?state=PROPOSED').set(this.as(account));

  /** The Super Admin sets one AI switch. */
  setSwitch = (key: (typeof AI_SWITCHES)[number], value: 'ON' | 'OFF') =>
    request(this.server())
      .put(`/api/v1/operating-parameters/${key}`)
      .set({ Authorization: `Bearer ${this.admin}` })
      .send({ value });

  /** The Super Admin sets where the answers of the next calls come from. */
  setMode = (mode: 'MODEL' | 'SIMULATED') =>
    request(this.server())
      .put('/api/v1/operating-parameters/AI_PROVIDER_MODE')
      .set({ Authorization: `Bearer ${this.admin}` })
      .send({ value: mode });

  async switchAll(value: 'ON' | 'OFF'): Promise<void> {
    for (const key of AI_SWITCHES) await this.setSwitch(key, value).expect(200);
  }

  source = (account: ApiAccount) => request(this.server()).get(`${BASE}/source`).set(this.as(account));
  ask = (account: ApiAccount, queueRevision: string) =>
    request(this.server()).post(BASE).set(this.as(account)).send({ queueRevision });
  read = (account: ApiAccount, invocationId: string) =>
    request(this.server()).get(`${BASE}/${invocationId}`).set(this.as(account));
  /** The raw content of a call, as the Super Admin reads it (or `token` when given). */
  content = (invocationId: string, token: string = this.admin) =>
    request(this.server())
      .get(`/api/v1/ai/invocations/${invocationId}/content`)
      .set({ Authorization: `Bearer ${token}` });

  /** Resolves when every run of the AI the API started has ended. */
  async settled(): Promise<void> {
    await this.ctx.app.get(QueueSummaryRunService, { strict: false }).idle();
  }

  async revisionOf(account: ApiAccount): Promise<string> {
    return this.dataOf<SourceWire>(await this.source(account).expect(200)).queueRevision;
  }

  /** Reads the revision, asks for the summary (202), waits for its run and reads it (200). */
  async summarize(account: ApiAccount): Promise<SummaryWire> {
    const revision = await this.revisionOf(account);
    const { invocationId } = this.dataOf<{ invocationId: string }>(await this.ask(account, revision).expect(202));
    await this.settled();

    return this.dataOf<SummaryWire>(await this.read(account, invocationId).expect(200));
  }

  /** Every step of the requests, as the database keeps them, in a stable order. */
  async stepRows(requestIds: readonly string[]): Promise<FullStepRow[]> {
    return (
      await this.ctx.sql.query<FullStepRow>(
        `SELECT id, request_id, kind, sequence, state, assignee_employee_id, routing_row, waiting_reason, sla_working_days,
                created_at, assigned_at, decided_at, waiting_since
           FROM access_request_steps WHERE request_id = ANY($1::uuid[]) ORDER BY request_id, sequence`,
        [requestIds],
      )
    ).rows;
  }

  /** The state of each request, by id. */
  async requestStates(requestIds: readonly string[]): Promise<Record<string, string>> {
    const { rows } = await this.ctx.sql.query<{ id: string; state: string }>(
      `SELECT id, state FROM access_requests WHERE id = ANY($1::uuid[])`,
      [requestIds],
    );

    return Object.fromEntries(rows.map((row) => [row.id, row.state]));
  }

  async invocationRow(invocationId: string): Promise<Record<string, unknown> | undefined> {
    return (
      await this.ctx.sql.query<Record<string, unknown>>(`SELECT * FROM ai_invocations WHERE id = $1`, [invocationId])
    ).rows[0];
  }

  async invocationCount(appUserId?: string): Promise<number> {
    const { rows } = await this.ctx.sql.query<{ n: string }>(
      `SELECT count(*) AS n FROM ai_invocations WHERE $1::uuid IS NULL OR actor_app_user_id = $1::uuid`,
      [appUserId ?? null],
    );

    return Number(rows[0].n);
  }

  async contentRow(invocationId: string): Promise<Record<string, unknown> | undefined> {
    return (
      await this.ctx.sql.query<Record<string, unknown>>(
        `SELECT * FROM ai_invocation_contents WHERE invocation_id = $1`,
        [invocationId],
      )
    ).rows[0];
  }

  /** The audit events about a call, oldest first. */
  async aiEvents(
    invocationId: string,
  ): Promise<Array<{ action: string; actor_app_user_id: string | null; after: Record<string, unknown> }>> {
    return (
      await this.ctx.sql.query<{ action: string; actor_app_user_id: string | null; after: Record<string, unknown> }>(
        `SELECT action, actor_app_user_id, after FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id`,
        [invocationId],
      )
    ).rows;
  }

  async fullNameOf(employeeId: string): Promise<string> {
    return (
      await this.ctx.sql.query<{ full_name: string }>(`SELECT full_name FROM employees WHERE id = $1`, [employeeId])
    ).rows[0].full_name;
  }
}
