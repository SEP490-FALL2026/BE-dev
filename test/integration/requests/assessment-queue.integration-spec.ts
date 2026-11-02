import request from 'supertest';
import type { AssessmentQueueItemWire } from '../../../src/modules/requests/assessment-queue/assessment-queue.dto';
import type { ApiAccount } from '../../support/api-accounts';
import { PgRelay } from '../../support/pg-relay';
import { dataStatements, QueryCounter, tablesOf } from '../../support/query-count';
import { AccessRequestWire, Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

interface QueueWire {
  items: AssessmentQueueItemWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * The list of the proposals that wait for IT assessment (`B-04`, scope of the default in the spec) over HTTP on real PostgreSQL: an
 * IT Admin finds the proposals of the departments they work, with who holds them and how far the assessment has come, and goes on
 * with the routes of the request, which keep their rules. Nobody else reads it.
 */
describe('the proposals waiting for IT assessment (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let design: Department;
  let ops: Department;
  let noItInCharge: Department; // has a head, and nobody who works is in charge of it for IT
  let head: Person; // head of design
  let designer: Person;
  let opsHead: Person;
  let opsStaff: Person;
  let boss: Person; // the spending approver
  let noItHead: Person; // decides the need of the department nobody is in charge of for IT
  let itDesign: Person; // the IT Admin in charge of design
  let itOps: Person; // the IT Admin in charge of ops, who is also placed there
  let itOps2: Person; // another IT Admin of ops, in charge later
  let noItStaff: Person;
  let counted = 0;

  const read = (account: ApiAccount | null, query: Record<string, string | number> = {}) => {
    const call = request(h.server()).get('/api/v1/assessment-queue').query(query);

    return account ? call.set(h.as(account)) : call;
  };
  const listOf = async (account: ApiAccount, query: Record<string, string | number> = { pageSize: 100 }) =>
    h.dataOf<QueueWire>(await read(account, query).expect(200));
  const itemOf = async (account: ApiAccount, id: string) =>
    (await listOf(account)).items.find((item) => item.requestId === id);
  const idsOf = async (account: ApiAccount) => (await listOf(account)).items.map((item) => item.requestId);

  /** A proposal of the person whose need the head has approved: it waits for the assessment. */
  const awaiting = async (who: Person, decider: Person): Promise<AccessRequestWire> => {
    counted += 1;
    const proposed = await h.proposed(who, { softwareName: `Tool ${counted}` });
    await h.decide(proposed.id, { decision: 'APPROVE' }, decider.account).expect(200);

    return proposed;
  };
  const inDesign = () => awaiting(designer, head);
  const save = (id: string, body: object, account: ApiAccount = itDesign.account) =>
    h.saveAssessment(id, body, account);
  const complete = (id: string, account: ApiAccount = itDesign.account) => h.completeAssessment(id, account);

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
    design = await h.departmentWithUnit('Q-DES');
    ops = await h.departmentWithUnit('Q-OPS');
    noItInCharge = await h.departmentWithUnit('Q-HR');
    const executive = await h.departmentWithUnit('Q-EXE');
    head = await h.staff(design, 'QD-H1');
    designer = await h.staff(design, 'QD-E1');
    opsHead = await h.staff(ops, 'QO-H1');
    opsStaff = await h.staff(ops, 'QO-E1');
    boss = await h.staff(executive, 'QE-C1');
    noItHead = await h.staff(noItInCharge, 'QH-H1');
    noItStaff = await h.staff(noItInCharge, 'QH-E1');
    itDesign = { employeeId: h.it1.employeeId, account: h.it1 };
    itOps = await h.staff(ops, 'QO-IT1', ['IT_ADMIN']);
    itOps2 = await h.staff(ops, 'QO-IT2', ['IT_ADMIN']);
    await h.makeHead(design, head);
    await h.makeHead(ops, opsHead);
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1')); // the Spending Approver does not head a department (QĐ-93b)
    await h.setRole('SPENDING_APPROVER', boss);
    await h.makeHead(noItInCharge, noItHead);
    await h.setItAdminInCharge(design, itDesign);
    await h.setItAdminInCharge(ops, itOps);
    // Every other department that exists has somebody usable in charge, so that only `noItInCharge` is open to every IT Admin.
    await h.setItAdminInCharge(executive, itDesign);
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
      h.seed.departmentId,
      itDesign.employeeId,
    ]);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('who reads it', () => {
    it('needs a token', async () => {
      expect(h.codeOf(await read(null).expect(401))).toBe('AUTHENTICATION_REQUIRED');
    });

    it.each([
      ['an Employee', () => designer],
      ['a head of department', () => head],
      ['the spending approver', () => boss],
    ])('is refused to %s', async (_name, who) => {
      await inDesign();

      expect(h.codeOf(await read(who().account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    });

    it('is refused to Finance and to the Super Admin', async () => {
      await read(h.finance).expect(403);
      await request(h.server())
        .get('/api/v1/assessment-queue')
        .set({ Authorization: `Bearer ${h.admin}` })
        .expect(403);
    });
  });

  describe('which proposals it holds', () => {
    it('shows the IT Admin in charge the proposals of the department, and not another IT Admin', async () => {
      const mine = await inDesign();
      const theirs = await awaiting(opsStaff, opsHead);

      const ofDesign = await idsOf(itDesign.account);
      const ofOps = await idsOf(itOps.account);

      expect(ofDesign).toContain(mine.id);
      expect(ofDesign).not.toContain(theirs.id);
      expect(ofOps).toContain(theirs.id);
      expect(ofOps).not.toContain(mine.id);
      expect(await idsOf(itOps2.account)).not.toContain(theirs.id);
    });

    it('shows who holds the step, the department, the software and the people', async () => {
      const proposed = await inDesign();

      const item = await itemOf(itDesign.account, proposed.id);

      expect(item).toMatchObject({
        requestId: proposed.id,
        software: { name: proposed.proposal?.softwareName, expectedUsers: 5 },
        requester: { employeeId: designer.employeeId },
        department: { id: design.id },
        holder: 'YOU',
        assignee: { employeeId: itDesign.employeeId },
        waitingReason: null,
        canAct: true,
        slaWorkingDays: 2,
      });
      expect(Date.parse(item?.waitingSince ?? '')).not.toBeNaN();
    });

    it('opens a department nobody who works is in charge of to every IT Admin, as held by nobody', async () => {
      const proposed = await awaiting(noItStaff, noItHead);

      for (const account of [itDesign.account, itOps.account]) {
        expect(await itemOf(account, proposed.id)).toMatchObject({
          holder: 'NOBODY',
          assignee: null,
          waitingReason: 'NO_IT_ADMIN_IN_CHARGE',
          canAct: true,
        });
      }
    });

    it('has no proposal whose need is not decided yet, or whose need was refused', async () => {
      const undecided = await h.proposed(designer);
      const refused = await h.proposed(designer);
      await h.decide(refused.id, { decision: 'REJECT', reason: 'Not needed' }, head.account).expect(200);

      const ids = await idsOf(itDesign.account);

      expect(ids).not.toContain(undecided.id);
      expect(ids).not.toContain(refused.id);
    });

    it('drops a proposal that is completed, refused at the gate or withdrawn', async () => {
      const done = await inDesign();
      const refused = await inDesign();
      const withdrawn = await inDesign();
      await save(done.id, h.assessmentBody()).expect(200);
      await complete(done.id).expect(200);
      await h
        .rejectAssessment(refused.id, { kind: 'NOT_ELIGIBLE', reason: 'Not fit for the catalog' }, itDesign.account)
        .expect(200);
      await request(h.server())
        .post(`/api/v1/access-requests/${withdrawn.id}/withdraw`)
        .set(h.as(designer.account))
        .send({})
        .expect(200);

      const ids = await idsOf(itDesign.account);

      expect(ids).not.toContain(done.id);
      expect(ids).not.toContain(refused.id);
      expect(ids).not.toContain(withdrawn.id);
    });
  });

  describe('how far the assessment has come', () => {
    it('says a new assessment is not started, lacks its classification and has no quote', async () => {
      const proposed = await inDesign();

      expect(await itemOf(itDesign.account, proposed.id)).toMatchObject({
        started: false,
        classification: null,
        readiness: 'INCOMPLETE',
        missingCount: 1,
        quote: 'MISSING',
      });
    });

    it('counts what the completion would name, and the count is the one the completion gives', async () => {
      const proposed = await inDesign();
      await save(proposed.id, { classification: 'PAID_LICENSED' }).expect(200);

      const item = await itemOf(itDesign.account, proposed.id);
      const refused = await complete(proposed.id).expect(422);

      expect(item).toMatchObject({ started: true, classification: 'PAID_LICENSED', readiness: 'INCOMPLETE' });
      expect(item?.missingCount).toBe((h.detailsOf(refused).missing as string[]).length);
      expect(item?.missingCount).toBeGreaterThan(1);
    });

    it('says the price is missing while only the quote is lacking, and can be completed once it is recorded', async () => {
      const proposed = await inDesign();
      await save(proposed.id, h.assessmentBody({ quote: null })).expect(200);

      expect(await itemOf(itDesign.account, proposed.id)).toMatchObject({
        quote: 'MISSING',
        readiness: 'INCOMPLETE',
        missingCount: 1,
      });
      expect(h.detailsOf(await complete(proposed.id).expect(422)).missing).toEqual(['quote']);

      await save(proposed.id, h.assessmentBody()).expect(200);
      expect(await itemOf(itDesign.account, proposed.id)).toMatchObject({
        quote: 'RECORDED',
        readiness: 'COMPLETABLE',
        missingCount: 0,
      });
      await complete(proposed.id).expect(200);
      expect(await itemOf(itDesign.account, proposed.id)).toBeUndefined();
    });

    it('says internal software is registered and a tool that cannot be controlled is refused, as the completion does', async () => {
      const internal = await inDesign();
      const uncontrollable = await inDesign();
      await save(internal.id, { classification: 'INTERNAL' }).expect(200);
      await save(uncontrollable.id, h.assessmentBody({ controlLevel: 'UNCONTROLLABLE' })).expect(200);

      expect(await itemOf(itDesign.account, internal.id)).toMatchObject({ readiness: 'INTERNAL_BY_REGISTRATION' });
      expect(await itemOf(itDesign.account, uncontrollable.id)).toMatchObject({ readiness: 'UNCONTROLLABLE' });
      expect(h.codeOf(await complete(internal.id).expect(409))).toBe('ASSESSMENT.INTERNAL_COMPLETES_BY_REGISTRATION');
      expect(h.codeOf(await complete(uncontrollable.id).expect(409))).toBe('ASSESSMENT.CONTROL_LEVEL_UNCONTROLLABLE');
    });
  });

  describe('going on from the list', () => {
    it('is the same request the detail and the routes of the assessment read, and a stale row answers 409 on the route', async () => {
      const proposed = await inDesign();
      await save(proposed.id, h.assessmentBody()).expect(200);
      const listed = await itemOf(itDesign.account, proposed.id);
      expect((await h.assessmentWire(proposed.id, itDesign.account)).requestId).toBe(listed?.requestId);

      // Another IT Admin of the department completes it between the list and the action.
      await complete(proposed.id, itOps.account).expect(200);

      expect(h.codeOf(await save(proposed.id, h.assessmentBody()).expect(409))).toBe(
        'ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT',
      );
      expect(h.codeOf(await complete(proposed.id).expect(409))).toBe('ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT');
      expect(await itemOf(itDesign.account, proposed.id)).toBeUndefined();
    });

    it('shows a proposal of the IT Admin themself as one they cannot act on, and the route refuses it', async () => {
      const own = await awaiting(itOps, opsHead);

      const item = await itemOf(itOps.account, own.id);

      expect(item).toMatchObject({ holder: 'YOU', canAct: false });
      expect(h.codeOf(await save(own.id, h.assessmentBody(), itOps.account).expect(403))).toBe(
        'ACCESS_REQUEST.OWN_REQUEST',
      );
    });
  });

  describe('order and pages', () => {
    it('keeps the oldest first with the id as the tie-break, and pages join into the whole list', async () => {
      const made = [await inDesign(), await inDesign(), await inDesign(), await inDesign(), await inDesign()];
      // Three steps came at the same instant: only the id can order them.
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET created_at = '2026-01-02T03:04:05.000Z' WHERE kind = 'IT_ASSESSMENT' AND request_id = ANY($1::uuid[])`,
        [made.slice(0, 3).map((request) => request.id)],
      );

      const whole = await listOf(itDesign.account);
      const pages: string[] = [];
      let page = 1;
      for (;;) {
        const part = await listOf(itDesign.account, { page, pageSize: 2 });
        expect(part.pagination).toMatchObject({ page, pageSize: 2, totalItems: whole.pagination.totalItems });
        pages.push(...part.items.map((item) => item.requestId));
        if (page >= part.pagination.totalPages) break;
        page += 1;
      }

      expect(pages).toEqual(whole.items.map((item) => item.requestId));
      expect(new Set(pages).size).toBe(pages.length);
      expect(pages.length).toBe(whole.pagination.totalItems);
      const times = whole.items.map((item) => Date.parse(item.waitingSince));
      expect(times).toEqual([...times].sort((a, b) => a - b));
      const tied = whole.items.filter((item) => item.waitingSince === '2026-01-02T03:04:05.000Z');
      // The tie-break is the id of the step: the request ids follow the order PostgreSQL gives the step ids.
      const byStepId = await h.ctx.sql.query<{ request_id: string }>(
        `SELECT request_id FROM access_request_steps WHERE kind = 'IT_ASSESSMENT' AND request_id = ANY($1::uuid[]) ORDER BY id`,
        [made.slice(0, 3).map((request) => request.id)],
      );
      expect(tied.map((item) => item.requestId)).toEqual(byStepId.rows.map((row) => row.request_id));
      expect((await listOf(itDesign.account, { page: 999, pageSize: 2 })).items).toEqual([]);
    });

    it('reads a number of statements that does not depend on the number of rows', async () => {
      await inDesign();
      await inDesign();

      const statementsOf = async (query: Record<string, number>) => {
        const run = await counter.run(() => read(itDesign.account, query).expect(200));

        return dataStatements(run.statements);
      };
      const one = await statementsOf({ pageSize: 1 });
      const many = await statementsOf({ pageSize: 100 });

      expect(one.length).toBe(many.length);
      expect(one.length).toBeGreaterThan(2);
      expect(many.flatMap((statement) => tablesOf(statement))).toContain('access_request_steps');
      const tables = new Set(many.flatMap((statement) => tablesOf(statement)));
      for (const table of ['spend_decisions', 'budget_checks', 'access_request_lines', 'audit_events']) {
        expect(tables.has(table)).toBe(false);
      }
    });
  });

  describe('standing in for another IT Admin', () => {
    it('lists a proposal held by the IT Admin who was in charge to the one in charge now, who may fill it', async () => {
      const proposed = await awaiting(opsStaff, opsHead);
      expect(await itemOf(itOps.account, proposed.id)).toMatchObject({ holder: 'YOU' });
      await h.setItAdminInCharge(ops, itOps2);

      expect(await itemOf(itOps2.account, proposed.id)).toMatchObject({
        holder: 'ANOTHER_IT_ADMIN',
        assignee: { employeeId: itOps.employeeId },
        canAct: true,
      });
      expect(await itemOf(itOps.account, proposed.id)).toBeUndefined();
      await save(proposed.id, h.assessmentBody(), itOps2.account).expect(200);
    });
  });
});
