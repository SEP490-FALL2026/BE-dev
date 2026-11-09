import request from 'supertest';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';
import { SlaHarness } from '../../support/sla-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new SlaHarness();
const M = 1_000_000;
const THRESHOLD = 3;

/** Days are counted from a Friday three weeks ahead, so that the data of the organization (written today) is in force. */
const BASE = ((): string => {
  const date = new Date(`${h.today()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 21);
  while (date.getUTCDay() !== 5) date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
})();
const day = (offset: number): string => {
  const date = new Date(`${BASE}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);

  return date.toISOString().slice(0, 10);
};
const at = (offset: number, localTime: string): Date => new Date(`${day(offset)}T${localTime}:00.000+07:00`);
const FRIDAY_16 = at(0, '16:00');

interface RowWire {
  holder: { employeeId: string; employeeCode: string; fullName: string } | null;
  openSteps: number;
  remindedSteps: number;
  oldestAgeWorkingDays: number;
  totalReminders: number;
  lastRemindedOn: string | null;
  overThreshold: boolean;
}
interface StepWire {
  requestId: string;
  stepId: string;
  stepKind: string;
  state: string;
  createdAt: string;
  dueAt: string;
  ageWorkingDays: number;
  reminders: number;
  lastRemindedOn: string | null;
}
interface IncidentWire {
  id: string;
  holder: { employeeId: string } | null;
  description: string;
  openSteps: number;
  oldestAgeWorkingDays: number;
  recordedAt: string;
}

describe('the backlog alert and the board of the Super Admin, over PostgreSQL (US-05-10)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let internal: string;
  let paid: string;
  let superAdmin: string;
  let n = 0;

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
    await h.withApprover();
    internal = await h.plan('K5');
    paid = await h.planOf(await h.subscription(40));
    await h
      .declareTaxProfile((await h.vendorOf(paid)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    await request(h.server())
      .put('/api/v1/operating-parameters/BACKLOG_ALERT_THRESHOLD')
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({ value: THRESHOLD })
      .expect(200);
    superAdmin = (
      await h.ctx.sql.query<{ employee_id: string }>(
        `SELECT u.employee_id FROM app_users u JOIN role_grants g ON g.app_user_id = u.id
          WHERE g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL`,
      )
    ).rows[0].employee_id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const scene = async (): Promise<Unit> => {
    n += 1;

    return h.departmentWithHead(`P-C${n}`);
  };
  /** `count` need steps waiting for the head of the unit, all begun on the Friday. */
  const needSteps = async (unit: Unit, count: number): Promise<string[]> => {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const person = await h.staff(unit.department, `C-E${(n += 1)}`);
      const sent = await h.sent(person, internal);
      await h.beganAt(sent.id, 'NEED', FRIDAY_16);
      ids.push(sent.id);
    }

    return ids;
  };
  const alertsFor = async (holder: Person) =>
    (await h.noticesOf(superAdmin, 'STEP_BACKLOG_ALERT')).filter(
      (notice) => notice.params.holderEmployeeId === holder.employeeId,
    );
  const board = async (query: Record<string, string | number> = {}, token = h.admin) =>
    h.dataOf<{ items: RowWire[]; pagination: { totalItems: number } }>(await h.board(query, token).expect(200));

  describe('the alert to the Super Admin (AC-1)', () => {
    it('tells the Super Admin of a holder with more steps than the threshold, not of one with exactly that many, and once a working day', async () => {
      const over = await scene();
      const exact = await scene();
      await needSteps(over, THRESHOLD + 1);
      await needSteps(exact, THRESHOLD);

      const first = await h.sweepAt(at(5, '10:00'));
      await h.sweepAt(at(5, '15:00'));

      expect(first.backlogAlerts).toBeGreaterThanOrEqual(1);
      const alerts = await alertsFor(over.head);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        subject_type: null,
        event_key: `BACKLOG:${over.head.employeeId}:${day(5)}`,
        params: { openCount: THRESHOLD + 1, threshold: THRESHOLD, oldestAgeWorkingDays: 3 },
      });
      expect(await alertsFor(exact.head)).toEqual([]);
      const events = await h.audit('STEP_CONGESTION.BACKLOG_ALERTED', over.head.employeeId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actor_kind: 'SYSTEM',
        after: { businessDate: day(5), openSteps: THRESHOLD + 1, threshold: THRESHOLD },
      });

      await h.sweepAt(at(6, '10:00'));
      expect(await alertsFor(over.head)).toHaveLength(2);
      expect(await h.audit('STEP_CONGESTION.BACKLOG_ALERTED', over.head.employeeId)).toHaveLength(2);
      // A Saturday has no alert.
      await h.sweepAt(at(1, '10:00'));
      expect(await alertsFor(over.head)).toHaveLength(2);
    });

    it('counts the spending approver like anybody else', async () => {
      const unit = await scene();
      await h.budgetFor(unit, { total: 100 * M });
      const missing = THRESHOLD + 1 - (await openStepsOf(h.boss));
      for (let index = 0; index < missing; index += 1) {
        await h.waitingForApprover(unit, paid, { amount: 5 * M });
      }
      expect(await openStepsOf(h.boss)).toBe(THRESHOLD + 1);

      await h.sweepAt(at(7 + 5, '10:00'));

      const alerts = await alertsFor(h.boss);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].params).toMatchObject({ openCount: THRESHOLD + 1 });
    });

    const openStepsOf = async (person: Person): Promise<number> =>
      Number(
        (
          await h.ctx.sql.query<{ count: string }>(
            `SELECT count(*) FROM access_request_steps WHERE assignee_employee_id = $1 AND state = 'PENDING'`,
            [person.employeeId],
          )
        ).rows[0].count,
      );
  });

  describe('the board (AC-2)', () => {
    it('shows each holder with the steps, how many were reminded, how old the oldest is and whether it is over the threshold, and one row for the steps nobody holds', async () => {
      const unit = await scene();
      await needSteps(unit, THRESHOLD + 2);
      await h.budgetFor(unit, { total: 100 * M });
      const waiting = await h.paidRequest(unit, paid, { amount: 5 * M });
      await h.clearRole('SPENDING_APPROVER');
      try {
        await h.route(waiting, unit.head.account);
        await h.sweepAt(at(5, '11:00'));

        const rows = (await board({ pageSize: 100 })).items;

        const mine = rows.find((row) => row.holder?.employeeId === unit.head.employeeId);
        expect(mine).toMatchObject({
          openSteps: THRESHOLD + 2,
          remindedSteps: THRESHOLD + 2,
          overThreshold: true,
        });
        expect(mine?.oldestAgeWorkingDays).toBeGreaterThanOrEqual(0);
        expect(mine?.lastRemindedOn).not.toBeNull();
        const nobody = rows.filter((row) => row.holder === null);
        expect(nobody).toHaveLength(1);
        expect(nobody[0].openSteps).toBeGreaterThanOrEqual(1);
        expect(nobody[0].overThreshold).toBe(false);
        // The most steps first, the id breaking a tie.
        const counts = rows.map((row) => row.openSteps);
        expect([...counts].sort((a, b) => b - a)).toEqual(counts);
        expect(JSON.stringify(rows)).not.toMatch(/amount|budget/i);
      } finally {
        await h.setRole('SPENDING_APPROVER', h.boss);
      }
    });

    it('lists the steps of one holder, the oldest first, and the steps nobody holds when no holder is named', async () => {
      const unit = await scene();
      const ids = await needSteps(unit, 2);
      // The board reads the clock of today: one step began in September, the other is still ahead of today.
      await h.beganAt(ids[0], 'NEED', new Date('2026-09-14T09:00:00.000+07:00'));
      await h.sweepAt(at(5, '12:00'));

      const mine = h.dataOf<{ items: StepWire[] }>(
        await h.boardSteps({ holderEmployeeId: unit.head.employeeId, pageSize: 50 }).expect(200),
      ).items;

      expect(mine.map((step) => step.requestId).sort()).toEqual([...ids].sort());
      expect(mine[0]).toMatchObject({ requestId: ids[0], stepKind: 'NEED', state: 'PENDING', reminders: 1 });
      expect(mine[0].ageWorkingDays).toBeGreaterThan(20);
      expect(new Date(mine[0].dueAt)).toEqual(new Date('2026-09-16T09:00:00.000+07:00'));
      expect(new Date(mine[1].dueAt)).toEqual(at(4, '16:00'));
      const unheld = h.dataOf<{ items: StepWire[] }>(await h.boardSteps({ pageSize: 50 }).expect(200)).items;
      expect(unheld.every((step) => step.state === 'WAITING')).toBe(true);
    });

    it('is for the Super Admin only', async () => {
      for (const account of [h.it1, h.finance, h.employee]) {
        for (const response of [
          await request(h.server()).get('/api/v1/step-congestion').set(h.as(account)),
          await request(h.server()).get('/api/v1/step-congestion/steps').set(h.as(account)),
          await request(h.server()).get('/api/v1/step-congestion/incidents').set(h.as(account)),
          await request(h.server())
            .post('/api/v1/step-congestion/incidents')
            .set(h.as(account))
            .send({ holderEmployeeId: null, description: 'x' }),
        ]) {
          expect(response.status).toBe(403);
          expect(h.codeOf(response)).toBe('AUTHORIZATION.FORBIDDEN');
        }
      }
      await request(h.server()).get('/api/v1/step-congestion').expect(401);
    });

    it('answers a page with the same number of statements however many holders and steps it has', async () => {
      const read = () => counter.run(() => h.board({ pageSize: 100 }).expect(200));
      const readSteps = (holder: string) =>
        counter.run(() => h.boardSteps({ holderEmployeeId: holder, pageSize: 100 }).expect(200));
      const small = await scene();
      await needSteps(small, 1);
      const few = await read();
      const fewSteps = await readSteps(small.head.employeeId);
      for (let index = 0; index < 3; index += 1) await needSteps(await scene(), 2);
      await needSteps(small, 3);
      const many = await read();
      const manySteps = await readSteps(small.head.employeeId);

      expect(h.dataOf<{ items: unknown[] }>(many.result).items.length).toBeGreaterThan(
        h.dataOf<{ items: unknown[] }>(few.result).items.length,
      );
      expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
      expect(h.dataOf<{ items: unknown[] }>(manySteps.result).items.length).toBeGreaterThan(
        h.dataOf<{ items: unknown[] }>(fewSteps.result).items.length,
      );
      expect(dataStatements(manySteps.statements)).toHaveLength(dataStatements(fewSteps.statements).length);
      // The page is cut by the database, not by reading everything.
      const paged = await board({ pageSize: 2, page: 2 });
      expect(paged.items).toHaveLength(2);
      expect(paged.pagination.totalItems).toBeGreaterThan(4);
    });
  });

  describe('the Super Admin does not decide (AC-3, AC-4)', () => {
    it('is refused by every route that decides a step, and nothing changes', async () => {
      const unit = await scene();
      await h.budgetFor(unit, { total: 100 * M });
      const need = (await needSteps(unit, 1))[0];
      const spend = await h.waitingForApprover(unit, paid, { amount: 5 * M });
      const batchId = (
        await h.ctx.sql.query<{ batch_id: string }>(
          `SELECT batch_id FROM spend_batch_items WHERE request_id = $1 LIMIT 1`,
          [spend],
        )
      ).rows[0]?.batch_id;
      expect(batchId).toBeDefined();
      const before = await h.decisionState();

      const answers = [
        ...(await Promise.all(h.decisionCalls(need, batchId, h.admin))),
        ...(await Promise.all(h.decisionCalls(spend, batchId, h.admin))),
      ];

      // The Super Admin is not the holder of the step, and does not see the request to decide it; no route takes the decision (the Finance route that was a fourth call is gone with the Finance review, QĐ-97c).
      expect(answers.map((answer) => [answer.status, h.codeOf(answer)])).toEqual([
        [404, 'ACCESS_REQUEST.NOT_FOUND'],
        [409, 'SPEND.NO_SPEND_STEP'],
        [404, 'SPEND.BATCH_NOT_FOUND'],
        [404, 'ACCESS_REQUEST.NOT_FOUND'],
        [403, 'SPEND.NOT_THE_ASSIGNEE'],
        [404, 'SPEND.BATCH_NOT_FOUND'],
      ]);
      expect(await h.decisionState()).toEqual(before);
    });

    it('records an incident about a holder with the number of steps and the age of the oldest, and changes no step', async () => {
      const unit = await scene();
      await needSteps(unit, THRESHOLD + 1);
      const before = await h.decisionState();

      const response = await h
        .recordIncident({
          holderEmployeeId: unit.head.employeeId,
          description: '  Steps wait on this head since Friday  ',
        })
        .expect(201);

      const incident = h.dataOf<{ incident: IncidentWire }>(response).incident;
      expect(incident).toMatchObject({
        holder: { employeeId: unit.head.employeeId },
        description: 'Steps wait on this head since Friday',
        openSteps: THRESHOLD + 1,
      });
      expect(incident.oldestAgeWorkingDays).toBeGreaterThanOrEqual(0);
      const [event] = await h.audit('STEP_CONGESTION.INCIDENT_RECORDED', incident.id);
      expect(event).toMatchObject({
        actor_kind: 'USER',
        after: { holderEmployeeId: unit.head.employeeId, openSteps: THRESHOLD + 1 },
      });
      expect(JSON.stringify(event.after)).not.toContain('Steps wait');
      expect(await h.decisionState()).toEqual(before);
      const listed = h.dataOf<{ items: IncidentWire[] }>(await h.incidents({ pageSize: 100 }).expect(200)).items;
      expect(listed.find((item) => item.id === incident.id)).toMatchObject({ openSteps: THRESHOLD + 1 });
    });

    it('records an incident about the steps nobody holds, with a null holder', async () => {
      const response = await h
        .recordIncident({ holderEmployeeId: null, description: 'Nobody holds these' })
        .expect(201);

      expect(h.dataOf<{ incident: IncidentWire }>(response).incident).toMatchObject({
        holder: null,
        description: 'Nobody holds these',
      });
    });

    it('refuses an empty description, one of 1001 characters, a field it does not know and a person who does not exist, and writes nothing', async () => {
      const unit = await scene();
      const rows = await h.count('congestion_incidents');
      const bodies: [object, number, string][] = [
        [{ holderEmployeeId: unit.head.employeeId, description: '   ' }, 422, 'VALIDATION_ERROR'],
        [{ holderEmployeeId: unit.head.employeeId, description: 'x'.repeat(1001) }, 422, 'VALIDATION_ERROR'],
        [{ holderEmployeeId: unit.head.employeeId, description: 'ok', severity: 'HIGH' }, 422, 'VALIDATION_ERROR'],
        [{ holderEmployeeId: 'not-an-id', description: 'ok' }, 422, 'VALIDATION_ERROR'],
        [{ description: 'ok' }, 422, 'VALIDATION_ERROR'],
        [
          { holderEmployeeId: '0198f1f0-0000-7000-8000-000000000000', description: 'ok' },
          404,
          'STEP_CONGESTION.HOLDER_NOT_FOUND',
        ],
      ];

      for (const [body, status, code] of bodies) {
        const response = await h.recordIncident(body);
        expect({ status: response.status, code: h.codeOf(response) }).toEqual({ status, code });
      }
      expect(await h.count('congestion_incidents')).toBe(rows);
      await h.recordIncident({ holderEmployeeId: unit.head.employeeId, description: 'x'.repeat(1000) }).expect(201);
    });
  });

  describe('the list of incidents', () => {
    it('is cut by the database, newest first, and answers with a fixed number of statements', async () => {
      const unit = await scene();
      for (let index = 0; index < 3; index += 1) {
        await h
          .recordIncident({ holderEmployeeId: unit.head.employeeId, description: `Incident ${index}` })
          .expect(201);
      }
      const read = () => counter.run(() => h.incidents({ pageSize: 2 }).expect(200));
      const first = await read();
      for (let index = 0; index < 3; index += 1) {
        await h.recordIncident({ holderEmployeeId: unit.head.employeeId, description: `Later ${index}` }).expect(201);
      }
      const second = await read();

      const items = h.dataOf<{ items: IncidentWire[]; pagination: { totalItems: number } }>(second.result);
      expect(items.items).toHaveLength(2);
      expect(items.items[0].description).toBe('Later 2');
      expect(items.pagination.totalItems).toBeGreaterThanOrEqual(6);
      expect(dataStatements(second.statements)).toHaveLength(dataStatements(first.statements).length);
    });
  });
});
