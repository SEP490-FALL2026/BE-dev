import type { DbTx } from '../../../src/infrastructure/database/transaction-runner';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import { RevocationListeners } from '../../../src/modules/licensing/public/licensing.extension-points';
import type {
  RevocationContext,
  RevocationReasonFacts,
  RevocationTaskFacts,
} from '../../../src/modules/licensing/public/licensing.types';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';
import { RevocationHarness, type RevocationTaskWire } from '../../support/revocation-harness';

const h = new RevocationHarness();

/** The stand-in for a module that extends a revocation: what it is told at each moment. */
interface RecordingHook {
  onOpened(
    tx: DbTx,
    task: RevocationTaskFacts,
    reasons: readonly RevocationReasonFacts[],
    context: RevocationContext,
  ): Promise<void>;
  beforeWork(tx: DbTx, task: RevocationTaskFacts): Promise<void>;
  afterWork(tx: DbTx, task: RevocationTaskFacts): Promise<void>;
}

const SUMMARY_REVOCATION_KEYS = [
  'completion',
  'accessState',
  'paidThroughOn',
  'reasonCount',
  'source',
  'terminating',
  'terminatingUntil',
].sort();

describe('the reads and the hook of a revocation (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let seats = 0;
  const code = () => `E-RD-${(seats += 1)}`;
  const facade = () => h.ctx.app.get(LicensingApi);
  const today = () => h.today();

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
  }, 240000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  /** Seats of one person on `count` new plans of each of the three kinds that have a revocation. */
  const seatsOf = async (employeeCode: string, count: number) => {
    await h.person(employeeCode);
    const assignments: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const kind = (['K1', 'K2', 'K5'] as const)[index % 3];
      const filter: Record<string, string> =
        kind === 'K5' ? { planId: await h.plan('K5') } : { subscriptionId: await h.subscription(3, kind) };
      await h.written(filter, [
        {
          employee_code: employeeCode,
          account_identifier: `${employeeCode.toLowerCase()}-${index}@acme.vn`,
          granted_on: '2026-01-05',
        },
      ]);
      const found = await h.assignmentsOf(filter);
      assignments.push(found[0].id);
    }

    return assignments;
  };

  describe('the personal seats of a person and the revocation under way (US-07-05 AC-11, g6-offboarding-record)', () => {
    it('lists the open personal seats with how each is taken away and the live revocation of each', async () => {
      const person = code();
      const employeeId = await h.person(person);
      const [k1, k2, k5] = await seatsOf(person, 3);
      const planOfK2 = (await h.assignmentsOf({ employeeId })).find((assignment) => assignment.id === k2)?.planId;
      await h.ctx.sql.query(
        `UPDATE plans SET revocation_note = 'Chats are lost with the account', data_loss_on_removal = true WHERE id = $1`,
        [planOfK2],
      );
      const { taskId } = await h.open(k2, 'ABRUPT_DEPARTURE');
      const ended = await h.open(k5, 'ABRUPT_DEPARTURE');
      await h.claim(ended.taskId).expect(200);
      await h.revoked(ended.taskId, { completion: 'OFF_SYSTEM_REVOKED', evidence: 'xong' }).expect(200);

      const list = await facade().listPersonalSeatsOf(employeeId, today());

      expect(list.map((seat) => seat.assignmentId).sort()).toEqual([k1, k2].sort());
      expect(list.find((seat) => seat.assignmentId === k1)).toMatchObject({
        provisioningType: 'K1',
        revocationNote: null,
        dataLossOnRemoval: false,
        revocation: null,
        employeeId,
      });
      expect(list.find((seat) => seat.assignmentId === k2)).toMatchObject({
        provisioningType: 'K2',
        revocationNote: 'Chats are lost with the account',
        dataLossOnRemoval: true,
        validUntil: null,
        revocation: { taskId, status: 'QUEUED', source: 'ABRUPT_DEPARTURE' },
      });
    });

    it('leaves out a seat that ended, a seat of someone else and a service account', async () => {
      const person = code();
      const employeeId = await h.person(person);
      const [kept, ended] = await seatsOf(person, 2);
      await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = '2026-09-01' WHERE id = $1`, [ended]);
      const [other] = await seatsOf(code(), 1);
      const unit = await h.ownUnit();
      const subscriptionId = await h.subscription(3, 'K2');
      await h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
           account_identifier, normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from,
           valid_from_basis, created_by_app_user_id)
         VALUES (gen_random_uuid(), $1, 'SERVICE', 'REQUEST', $2, $3, $4, 'ci-rd', 'ci-rd', 'CI', $5, $6, '2026-01-05', 'ACTUAL', gen_random_uuid())`,
        [h.seed.organizationId, await h.planOf(subscriptionId), subscriptionId, employeeId, unit.id, unit.departmentId],
      );

      const list = await facade().listPersonalSeatsOf(employeeId, today());

      expect(list.map((seat) => seat.assignmentId)).toEqual([kept]);
      expect(list.map((seat) => seat.assignmentId)).not.toContain(other);
    });

    it('takes the same number of statements for 2 seats as for 6', async () => {
      const few = code();
      const many = code();
      const fewId = await h.person(few);
      const manyId = await h.person(many);
      await seatsOf(few, 2);
      await seatsOf(many, 6);

      const small = await counter.run(() => facade().listPersonalSeatsOf(fewId, today()));
      const large = await counter.run(() => facade().listPersonalSeatsOf(manyId, today()));

      expect(small.result).toHaveLength(2);
      expect(large.result).toHaveLength(6);
      expect(dataStatements(large.statements)).toHaveLength(dataStatements(small.statements).length);
    }, 300000);
  });

  describe('the seats whose access runs on to the end of a paid period (US-07-05 AC-19, BM-08)', () => {
    const terminating = async (days: number) => {
      const person = code();
      const employeeId = await h.person(person);
      const subscriptionId = await h.subscription(3, 'K1');
      const assignmentId = await h.seat({ subscriptionId }, person);
      const { taskId } = await h.open(assignmentId, 'ABRUPT_DEPARTURE');
      await h.claim(taskId).expect(200);
      await h
        .revoked(taskId, {
          completion: 'RENEWAL_CANCELLED',
          evidence: 'đã hủy',
          paidThroughOn: h.inDays(days),
          accessState: 'UNTIL_PAID_END',
        })
        .expect(200);

      return { employeeId, assignmentId, taskId, subscriptionId };
    };

    it('names the person, the seat and the day the access ends, and only for those whose access still runs on', async () => {
      const running = await terminating(36);
      const over = await terminating(0);
      const cutEarly = await terminating(20);
      await h.accessCut(cutEarly.taskId, { accessCutOn: today(), evidence: 'đã khóa' }).expect(200);
      const noRevocation = await h.person(code());

      const warned = await facade().listTerminatingAccess([
        running.employeeId,
        over.employeeId,
        cutEarly.employeeId,
        noRevocation,
      ]);

      expect(warned).toEqual([
        {
          assignmentId: running.assignmentId,
          employeeId: running.employeeId,
          planId: await h.planOf(running.subscriptionId),
          subscriptionId: running.subscriptionId,
          taskId: running.taskId,
          accessUntil: h.inDays(36),
        },
      ]);
      expect(await facade().listTerminatingAccess([])).toEqual([]);
    });

    it('takes the same number of statements for 2 people as for 8', async () => {
      const few = [(await terminating(40)).employeeId, (await terminating(41)).employeeId];
      const many = [...few];
      for (let index = 0; index < 6; index += 1) many.push((await terminating(42 + index)).employeeId);

      const small = await counter.run(() => facade().listTerminatingAccess(few));
      const large = await counter.run(() => facade().listTerminatingAccess(many));

      expect(small.result).toHaveLength(2);
      expect(large.result).toHaveLength(8);
      expect(dataStatements(large.statements)).toHaveLength(dataStatements(small.statements).length);
    }, 300000);
  });

  describe('the card of a revocation in the list and the detail (LD-08)', () => {
    const makeTasks = async (count: number): Promise<string[]> => {
      const ids: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const assignmentId = await h.seat({ subscriptionId: await h.subscription(2, 'K2') }, code());
        const first = await h.open(assignmentId, 'RETURN', { decision: { note: 'ghi chú dài của người quyết' } });
        await h.open(assignmentId, 'MANAGER_NOT_NEEDED');
        ids.push(first.taskId);
      }

      return ids;
    };
    const listAll = () => counter.run(() => h.list({ pageSize: 100 }).expect(200));

    it('says in a row why it was opened and how many reasons it has, and keeps the notes and the evidence for the detail', async () => {
      const [id] = await makeTasks(1);

      const { result } = await listAll();
      const row = h.dataOf<{ items: RevocationTaskWire[] }>(result).items.find((item) => item.id === id);
      const detail = await h.revocationOf(id);

      expect(Object.keys(row?.revocation ?? {}).sort()).toEqual(SUMMARY_REVOCATION_KEYS);
      expect(row?.revocation).toMatchObject({ source: 'RETURN', reasonCount: 2, completion: null, terminating: false });
      expect(detail.revocation).toMatchObject({
        source: 'RETURN',
        reasonCount: 2,
        completionNote: null,
        accessCutOn: null,
        accessEvidence: null,
        firstReason: { decidedRole: 'MANAGER', note: 'ghi chú dài của người quyết' },
      });
      expect(detail.steps.map((step) => step.code)).toEqual(['REMOVE_FROM_WORKSPACE', 'CONFIRM_WITH_EVIDENCE']);
    }, 120_000);

    it('shows a task of a grant with no revocation block, and a revocation with no request', async () => {
      const subscriptionId = await h.subscription(2, 'K2');
      const grant = await h.granted(await h.person(code()), await h.planOf(subscriptionId), { subscriptionId });

      const { result } = await listAll();
      const items = h.dataOf<{ items: RevocationTaskWire[] }>(result).items;

      expect(items.find((item) => item.id === grant.id)).toMatchObject({ kind: 'GRANT', revocation: null });
      expect(items.filter((item) => item.kind === 'REVOKE').every((item) => item.requestId === null)).toBe(true);
    });

    it('reads no long text of any task and takes the same number of statements for 3 revocations as for 12', async () => {
      await makeTasks(2);
      const few = await listAll();
      await makeTasks(9);
      const many = await listAll();

      expect(h.dataOf<{ items: unknown[] }>(many.result).items.length).toBeGreaterThanOrEqual(12);
      expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
      for (const statement of dataStatements(many.statements)) {
        expect(statement).not.toMatch(
          /"evidence"|"last_error"|"failure_reason"|"hand_off_evidence"|"close_reason"|"completion_note"|"access_evidence"|"note"/,
        );
      }
    }, 600_000);
  });

  describe('the hook the handover confirmation registers (US-07-05 AC-11, g6-handover-confirmation)', () => {
    const calls: string[] = [];
    const opened: {
      task: RevocationTaskFacts;
      reasons: readonly RevocationReasonFacts[];
      context: RevocationContext;
    }[] = [];
    let refuse = false;
    /** The hook the listener the test adds tells; none once this block is over. */
    let listening: RecordingHook | null = null;
    const listen = (hook: RecordingHook): void => {
      listening = hook;
      h.ctx.app.get(RevocationListeners).add('test.recording-hook', async (tx, event) => {
        if (!listening) return;
        if (event.moment === 'OPENED') await listening.onOpened(tx, event.task, event.reasons, event.context);
        if (event.moment === 'BEFORE_WORK') await listening.beforeWork(tx, event.task);
        if (event.moment === 'AFTER_WORK') await listening.afterWork(tx, event.task);
      });
    };
    const hook: RecordingHook = {
      onOpened: (_tx, task, reasons, context) => {
        calls.push('opened');
        opened.push({ task, reasons, context });

        return Promise.resolve();
      },
      beforeWork: (_tx, task) => {
        calls.push(`before:${task.status}`);

        return refuse ? Promise.reject(new Error('the handover is not confirmed')) : Promise.resolve();
      },
      afterWork: (_tx, task) => {
        calls.push(`after:${task.status}`);

        return Promise.resolve();
      },
    };

    afterAll(() => {
      listening = null;
    });

    it('tells the handover confirmation before the return of a seat, so the first to refuse is the handover (the order the modules start in)', () => {
      expect(h.ctx.app.get(RevocationListeners).names()).toEqual([
        'licensing.handover-confirmation',
        // G9-02 (RV-07): the money held for the seat goes back by the day when the revocation is completed.
        'requests.seat-release',
        'requests.return-request',
        'optimization.ghost-seat',
      ]);
    });

    it('is told when a revocation opens and when a reason is added, with the context the source gave and every reason', async () => {
      listen(hook);
      const assignmentId = await h.seat({ subscriptionId: await h.subscription(2, 'K2') }, code());
      const context = { departmentId: h.seed.departmentId, dueOn: h.inDays(5), noticeText: 'Chuyển dữ liệu trước hạn' };

      const first = await h.open(assignmentId, 'ABRUPT_DEPARTURE', { context });
      await h.open(assignmentId, 'GHOST_SEAT');
      await h.open(assignmentId, 'GHOST_SEAT');

      expect(calls).toEqual(['opened', 'opened']);
      expect(opened[0]).toMatchObject({
        task: { id: first.taskId, assignmentId, status: 'QUEUED' },
        reasons: [{ source: 'ABRUPT_DEPARTURE', decidedRole: 'MANAGER' }],
        context,
      });
      expect(opened[1].reasons.map((reason) => reason.source)).toEqual(['ABRUPT_DEPARTURE', 'GHOST_SEAT']);
      expect(opened[1].context).toEqual({});
    });

    it('is asked before the task is taken and before it is completed, and told after each', async () => {
      calls.length = 0;
      const assignmentId = await h.seat({ subscriptionId: await h.subscription(2, 'K2') }, code());
      const { taskId } = await h.open(assignmentId, 'ABRUPT_DEPARTURE');
      calls.length = 0;

      await h.claim(taskId).expect(200);
      await h.claim(taskId).expect(200);
      await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(200);

      // Taking it again is a no-op and is not asked.
      expect(calls).toEqual(['before:QUEUED', 'after:IN_PROGRESS', 'before:IN_PROGRESS', 'after:COMPLETED']);
    });

    it('can refuse to let the work start or end, and nothing changes', async () => {
      const assignmentId = await h.seat({ subscriptionId: await h.subscription(2, 'K2') }, code());
      const { taskId } = await h.open(assignmentId, 'ABRUPT_DEPARTURE');
      refuse = true;

      await h.claim(taskId).expect(500);
      expect(await h.revocationOf(taskId)).toMatchObject({ status: 'QUEUED', claimedBy: null });
      refuse = false;
      await h.claim(taskId).expect(200);
      refuse = true;
      await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'x' }).expect(500);

      refuse = false;
      expect(await h.revocationOf(taskId)).toMatchObject({ status: 'IN_PROGRESS', revocation: { completion: null } });
      expect(await h.assignmentRow(assignmentId)).toMatchObject({ valid_until: null });
    });

    it('does not take part in the task of a grant', async () => {
      calls.length = 0;
      const subscriptionId = await h.subscription(2, 'K2');
      const grant = await h.granted(await h.person(code()), await h.planOf(subscriptionId), { subscriptionId });

      await h.claim(grant.id).expect(200);
      await h.complete(grant.id, { evidence: 'x' }).expect(200);

      expect(calls).toEqual([]);
    });
  });
});
