import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
import { RequestsAiSourceApi } from '../../../src/modules/requests/public/requests-ai-source.api';
import type { AiSourceStep } from '../../../src/modules/requests/public/requests.types';
import type { ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const ALL = 1000;

interface QueuePage {
  items: Array<{ stepId: string; requestId: string; amount?: { amount: string; currency: string } | null }>;
  pagination: { totalItems: number };
}

/**
 * The source of the summary of the steps a person has to decide (US-15-05), read through the facade of the requests context on real
 * PostgreSQL: the need steps and the spend steps given to the person now, by the same rules as the two queues they read by hand (a step
 * of somebody else, a request decided or withdrawn, a step handed over is never in it), the whole reason cut to what the summary may
 * read, the order, the limit, and the check that the steps of a summary are still the person's.
 */
describe('RequestsAiSourceApi: the open steps a person holds (integration, real PostgreSQL)', () => {
  let api: RequestsAiSourceApi;
  let plan: string;
  let internal: string;
  let applicationName: string;
  let internalApplicationName: string;
  let design: Unit;
  let engineering: Unit;
  let number = 0;

  const unit = async (): Promise<Unit> => {
    number += 1;

    return h.departmentWithHead(`P-AIS${number}`);
  };
  const fullNameOf = async (person: Person): Promise<string> =>
    (await h.ctx.sql.query<{ full_name: string }>(`SELECT full_name FROM employees WHERE id = $1`, [person.employeeId]))
      .rows[0].full_name;
  const open = (person: Person, limit = ALL) => api.openStepsHeldBy(person.employeeId, limit);
  const stepIdsOf = async (person: Person): Promise<string[]> => (await open(person)).steps.map((step) => step.stepId);
  const queuePage = async (path: string, account: ApiAccount): Promise<QueuePage> =>
    h.dataOf<QueuePage>(await request(h.server()).get(path).query({ pageSize: 100 }).set(h.as(account)).expect(200));
  const pendingSpendStepOf = async (requestId: string): Promise<{ id: string; assigned_at: Date }> =>
    (
      await h.ctx.sql.query<{ id: string; assigned_at: Date }>(
        `SELECT id, assigned_at FROM access_request_steps
          WHERE request_id = $1 AND kind = 'SPEND_APPROVAL' AND state = 'PENDING'`,
        [requestId],
      )
    ).rows[0];

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    api = h.ctx.app.get(RequestsAiSourceApi);
    plan = await h.planOf(await h.subscription(100));
    internal = await h.plan('K5');
    const catalog = h.ctx.app.get(CatalogApi, { strict: false });
    [{ applicationName }] = await catalog.getPlanSummaries([plan]);
    [{ applicationName: internalApplicationName }] = await catalog.getPlanSummaries([internal]);
    design = await unit();
    engineering = await unit();
    await h.budgetFor(design, { total: 100_000_000 });
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('what the head reads', () => {
    it('gives the head the need step of a request of the department with what the summary may read of it', async () => {
      const sent = await h.sent(design.member, plan, { termMonths: 6, businessReason: 'The project needs a wiki' });

      const { steps, total } = await open(design.head);
      const step = steps.find((one) => one.requestId === sent.id);

      expect(step).toEqual<AiSourceStep>({
        stepId: sent.needStep.id,
        requestId: sent.id,
        stepKind: 'NEED_APPROVAL',
        assignedAt: new Date(sent.needStep.assignedAt as string),
        softwareName: applicationName,
        beneficiaryDisplayName: await fullNameOf(design.member),
        reason: 'The project needs a wiki',
        termMonths: 6,
        estimatedCost: null,
      });
      expect(total).toBe(steps.length);
    });

    it('agrees with the queue of the need steps of the head, step for step', async () => {
      await h.sent(design.member, internal, { termMonths: 1 });
      const queue = await queuePage('/api/v1/need-decisions', design.head.account);

      const { steps, total } = await open(design.head);

      expect(new Set(steps.map((step) => step.stepId))).toEqual(new Set(queue.items.map((item) => item.stepId)));
      expect(total).toBe(queue.pagination.totalItems);
      expect(steps.every((step) => step.stepKind === 'NEED_APPROVAL')).toBe(true);
    });

    it('names a request for a group by the number of people on the step, not one person', async () => {
      const u = await unit();
      const people = await h.colleagues(u, 3);
      const sent = h.dataOf<{ request: { id: string } }>(
        await h.submitGroup(h.groupBody(plan, people), people[0].account).expect(201),
      ).request;

      const step = (await open(u.head)).steps.find((one) => one.requestId === sent.id);

      expect(step).toMatchObject({ stepKind: 'NEED_APPROVAL', beneficiaryDisplayName: 'Nhóm 3 người' });
    });
  });

  describe('what the spending approver reads', () => {
    it('gives the approver their spend step with its cost and the need step of the request a head sent for themselves', async () => {
      const spendRequest = await h.waitingForApprover(design, plan, { amount: 1_234_567 });
      const own = await h.sent(design.head, internal, { termMonths: 2, businessReason: 'The head needs the tool' });
      const spendStep = await pendingSpendStepOf(spendRequest);
      const spendQueueItem = (await queuePage('/api/v1/spend-approvals', h.boss.account)).items.find(
        (item) => item.requestId === spendRequest,
      );

      const { steps } = await open(h.boss);

      expect(steps.find((one) => one.requestId === spendRequest)).toEqual<AiSourceStep>({
        stepId: spendStep.id,
        requestId: spendRequest,
        stepKind: 'SPEND_APPROVAL',
        assignedAt: spendStep.assigned_at,
        softwareName: applicationName,
        beneficiaryDisplayName: await fullNameOf(design.member),
        reason: expect.any(String) as string,
        termMonths: 1,
        estimatedCost: spendQueueItem?.amount ?? null,
      });
      expect(spendQueueItem?.amount).toEqual({
        amount: expect.any(String) as string,
        currency: expect.any(String) as string,
      });
      expect(steps.find((one) => one.requestId === own.id)).toEqual<AiSourceStep>({
        stepId: own.needStep.id,
        requestId: own.id,
        stepKind: 'NEED_APPROVAL',
        assignedAt: new Date(own.needStep.assignedAt as string),
        softwareName: internalApplicationName,
        beneficiaryDisplayName: await fullNameOf(design.head),
        reason: 'The head needs the tool',
        termMonths: 2,
        estimatedCost: null,
      });
    });

    it('is the union of the two queues of the approver, and nothing else', async () => {
      const needQueue = await queuePage('/api/v1/need-decisions', h.boss.account);
      const spendQueue = await queuePage('/api/v1/spend-approvals', h.boss.account);

      const { steps, total } = await open(h.boss);

      expect(new Set(steps.map((step) => step.stepId))).toEqual(
        new Set([...needQueue.items, ...spendQueue.items].map((item) => item.stepId)),
      );
      expect(total).toBe(needQueue.pagination.totalItems + spendQueue.pagination.totalItems);
      expect(spendQueue.items.length).toBeGreaterThan(0);
      expect(needQueue.items.length).toBeGreaterThan(0);
    });
  });

  describe('what nobody reads', () => {
    it('never gives a step to a person it is not given to: the other head, the member, Finance, the approver', async () => {
      const sent = await h.sent(design.member, internal, { termMonths: 1 });

      expect(await stepIdsOf(design.head)).toContain(sent.needStep.id);
      for (const person of [engineering.head, design.member, engineering.member, h.boss]) {
        expect(await stepIdsOf(person)).not.toContain(sent.needStep.id);
      }
      expect((await api.openStepsHeldBy(h.finance.employeeId, ALL)).steps.map((step) => step.stepId)).not.toContain(
        sent.needStep.id,
      );
    });

    it('drops a request once it is decided or withdrawn, and keeps the one still waiting', async () => {
      const u = await unit();
      const approved = await h.sent(u.member, internal, { termMonths: 1 });
      const refused = await h.sent(u.member, internal, { termMonths: 1 });
      const withdrawn = await h.sent(u.member, internal, { termMonths: 1 });
      const kept = await h.sent(u.member, internal, { termMonths: 1 });
      expect((await open(u.head)).total).toBe(4);

      await h.decide(approved.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      await h.decide(refused.id, { decision: 'REJECT', reason: 'Notion already does it' }, u.head.account).expect(200);
      await h.withdrawRequest(withdrawn.id, { reason: 'No longer needed' }, u.member.account).expect(200);

      expect(await open(u.head)).toMatchObject({ total: 1, steps: [{ stepId: kept.needStep.id }] });
    });

    it('reads nothing for a person who holds no step', async () => {
      expect(await open(engineering.member)).toEqual({ steps: [], total: 0 });
    });
  });

  describe('the order, the limit and the reason', () => {
    it('gives at most the limit, the earliest given first with the step id breaking a tie, and counts every open step', async () => {
      const u = await unit();
      const sent = [];
      for (let index = 0; index < 4; index += 1) sent.push(await h.sent(u.member, internal, { termMonths: 1 }));
      // Two steps given at the same instant, before the others: the step id orders them.
      const tied = [sent[2].needStep.id, sent[3].needStep.id].sort();
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET assigned_at = '2020-01-05T02:00:00Z' WHERE id = ANY($1::uuid[])`,
        [tied],
      );

      const all = await open(u.head);
      const two = await open(u.head, 2);
      const none = await open(u.head, 0);

      expect(all.steps.map((step) => step.stepId)).toEqual([...tied, sent[0].needStep.id, sent[1].needStep.id]);
      expect(two).toMatchObject({ total: 4, steps: [{ stepId: tied[0] }, { stepId: tied[1] }] });
      expect(two.steps).toHaveLength(2);
      expect(none).toEqual({ steps: [], total: 4 });
    });

    it('orders the need steps and the spend steps of one person together by when each was given', async () => {
      const spendRequest = await h.waitingForApprover(design, plan, { amount: 2_000_000 });
      const spendStep = await pendingSpendStepOf(spendRequest);
      const own = await h.sent(design.head, internal, { termMonths: 1 });
      // The newer need step is given first, then the spend step a moment later: the kinds interleave.
      await h.ctx.sql.query(`UPDATE access_request_steps SET assigned_at = '2020-01-01T00:00:00Z' WHERE id = $1`, [
        own.needStep.id,
      ]);
      await h.ctx.sql.query(`UPDATE access_request_steps SET assigned_at = '2020-01-01T00:00:01Z' WHERE id = $1`, [
        spendStep.id,
      ]);

      const { steps } = await open(h.boss);

      expect(steps.slice(0, 2).map((step) => [step.stepId, step.stepKind])).toEqual([
        [own.needStep.id, 'NEED_APPROVAL'],
        [spendStep.id, 'SPEND_APPROVAL'],
      ]);
      const keys = steps.map((step) => `${step.assignedAt.toISOString()} ${step.stepId}`);
      expect(keys).toEqual([...keys].sort());
    });

    it('cuts a long reason to its first 1000 characters, never inside a character', async () => {
      const u = await unit();
      const sent = await h.sent(u.member, internal, { termMonths: 1 });
      const long = `${'😀'.repeat(600)}${'x'.repeat(600)}`;
      await h.ctx.sql.query(`UPDATE access_requests SET business_reason = $2 WHERE id = $1`, [sent.id, long]);

      const [step] = (await open(u.head)).steps;

      expect([...step.reason]).toHaveLength(1000);
      expect(step.reason).toBe([...long].slice(0, 1000).join(''));
    });

    it('reads the same inside a transaction of the caller', async () => {
      const runner = h.ctx.app.get(TransactionRunner, { strict: false });

      const inside = await runner.run((tx) => api.openStepsHeldBy(h.boss.employeeId, ALL, tx));

      expect(inside).toEqual(await open(h.boss));
    });
  });

  describe('stillHeldBy', () => {
    it('keeps exactly the steps that are still open and given to the person', async () => {
      const u = await unit();
      const decided = await h.sent(u.member, internal, { termMonths: 1 });
      const kept = await h.sent(u.member, internal, { termMonths: 1 });
      const withdrawn = await h.sent(u.member, internal, { termMonths: 1 });
      const elsewhere = await h.sent(engineering.member, internal, { termMonths: 1 });
      const ids = [decided, kept, withdrawn, elsewhere].map((one) => one.needStep.id);
      expect(await api.stillHeldBy(u.head.employeeId, ids)).toEqual(new Set(ids.slice(0, 3)));

      await h.decide(decided.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      await h.withdrawRequest(withdrawn.id, { reason: 'No longer needed' }, u.member.account).expect(200);

      expect(await api.stillHeldBy(u.head.employeeId, ids)).toEqual(new Set([kept.needStep.id]));
      expect(await api.stillHeldBy(engineering.head.employeeId, ids)).toEqual(new Set([elsewhere.needStep.id]));
      expect(await api.stillHeldBy(u.head.employeeId, [])).toEqual(new Set());
    });

    it('keeps a spend step of the approver, and drops it once it is decided', async () => {
      const spendRequest = await h.waitingForApprover(design, plan, { amount: 1_000_000 });
      const spendStep = await pendingSpendStepOf(spendRequest);
      expect(await api.stillHeldBy(h.boss.employeeId, [spendStep.id])).toEqual(new Set([spendStep.id]));
      expect(await api.stillHeldBy(design.head.employeeId, [spendStep.id])).toEqual(new Set());

      await h.decideSpend(spendRequest, { decision: 'APPROVE' }, h.boss.account).expect(200);

      expect(await api.stillHeldBy(h.boss.employeeId, [spendStep.id])).toEqual(new Set());
    });

    it('drops a step handed over to the next head, which the next head now holds', async () => {
      const u = await unit();
      const sent = await h.sent(u.member, internal, { termMonths: 1 });
      expect(await api.stillHeldBy(u.head.employeeId, [sent.needStep.id])).toEqual(new Set([sent.needStep.id]));
      number += 1;
      const successor = await h.staff(u.department, `${u.department.code}-S${number}`);

      await h.vacateHead(u.department.id).expect(200);
      await h.makeHead(u.department, successor);
      await h.sweep();

      expect(await api.stillHeldBy(u.head.employeeId, [sent.needStep.id])).toEqual(new Set());
      expect(await stepIdsOf(u.head)).not.toContain(sent.needStep.id);
      expect(await api.stillHeldBy(successor.employeeId, [sent.needStep.id])).toEqual(new Set([sent.needStep.id]));
      expect(await stepIdsOf(successor)).toEqual([sent.needStep.id]);
    });
  });
});
