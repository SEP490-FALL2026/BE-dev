import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { RequestLimitsService } from '../../../src/modules/requests/request-limits/request-limits.service';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

interface Refused {
  status: number;
  body: { error?: { code: string; details?: Record<string, unknown> } };
}

const codeOf = (response: Refused) => response.body.error?.code;
const detailsOf = (response: Refused) => response.body.error?.details ?? {};

/**
 * The limits of a request for new access, per beneficiary, over PostgreSQL (`BR-MF1-01` GH-1/GH-2, `QĐ-103c`, `QĐ-111h`, `QĐ-106g`,
 * `QĐ-108c`): an open request of the same plan refuses, and so do as many requests sent in the calendar week of the organization as the
 * parameter allows, whatever became of them; there is no GH-3; a request for a group is
 * refused whole with every line that breaks a limit. The harness raises GH-2 for the other suites; this one sets it to three to keep the
 * cases short, and judges the week of T-RQ1 with ten.
 */
describe('the limits of a request for new access (integration, real PostgreSQL, BR-MF1-01)', () => {
  let design: Department;
  let head: Person;
  let plans: string[];

  const person = async (code: string): Promise<Person> => h.staff(design, code);
  const open = (who: Person, planId: string, extra: Record<string, unknown> = {}) =>
    h.submit(h.form(planId, extra), who.account);
  const reject = (id: string) => h.decide(id, { decision: 'REJECT', reason: 'Not needed' }, head.account).expect(200);
  const withdraw = (id: string, who: Person) =>
    request(h.server()).post(`/api/v1/access-requests/${id}/withdraw`).set(h.as(who.account)).send({}).expect(200);
  const idOf = (response: { body: unknown }): string =>
    (response.body as { data: { request: { id: string } } }).data.request.id;

  beforeAll(async () => {
    await h.start();
    await h.enforceRequestLimits();
    await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 3).expect(200);
    design = await h.departmentWithUnit('P-GH');
    head = await h.staff(design, 'GH-H1');
    await h.makeHead(design, head);
    plans = [];
    for (let index = 0; index < 5; index += 1) plans.push(await h.planOf(await h.subscription(20)));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('BR-MF1-01e GH-1: a request of the same plan open', () => {
    it('refuses the second request of the plan while the first is open, naming it, and lets it through once refused', async () => {
      const e1 = await person('GH-E1');
      const first = (await open(e1, plans[0]).expect(201)).body as { data: { request: { id: string } } };

      const again = await open(e1, plans[0]).expect(409);

      expect(codeOf(again)).toBe('ACCESS_REQUEST.OPEN_REQUEST_EXISTS');
      expect(detailsOf(again)).toEqual({ requestId: first.data.request.id });

      await reject(first.data.request.id);
      await open(e1, plans[0]).expect(201);
    });
  });

  describe('QĐ-111h GH-2: requests for new access sent in the calendar week', () => {
    // The oracle is PostgreSQL, not the code under test: the Monday that starts the next week on the clock of the organization.
    const nextMonday = async (): Promise<string> =>
      (
        await h.ctx.sql.query<{ monday: string }>(
          `SELECT (date_trunc('week', now() AT TIME ZONE o.time_zone) + interval '7 days')::date::text AS monday FROM organizations o`,
        )
      ).rows[0].monday;
    /** Moves the moment the requests were sent to the instant this week began on the clock of the organization, plus `shift`. */
    const sentAtWeekStart = (ids: string[], shift: string) =>
      h.ctx.sql.query(
        `UPDATE access_requests
            SET submitted_at = (SELECT date_trunc('week', now() AT TIME ZONE o.time_zone) AT TIME ZONE o.time_zone FROM organizations o) + $2::interval
          WHERE id = ANY($1::uuid[])`,
        [ids, shift],
      );
    const sendThree = async (who: Person): Promise<string[]> => {
      const sent: string[] = [];
      for (const planId of plans.slice(0, 3)) sent.push(idOf(await open(who, planId).expect(201)));

      return sent;
    };

    it('refuses the fourth request of the week with the limit and the Monday the count starts again', async () => {
      const e2 = await person('GH-E2');
      await sendThree(e2);

      const fourth = await open(e2, plans[3]).expect(422);

      expect(codeOf(fourth)).toBe('ACCESS_REQUEST.OPEN_LIMIT_REACHED');
      expect(detailsOf(fourth)).toEqual({ limit: 3, resetsOn: await nextMonday() });
    });

    it('a request refused or withdrawn still counts: it does not give the slot back', async () => {
      const e9 = await person('GH-E9');
      const sent = await sendThree(e9);
      await reject(sent[0]);
      await withdraw(sent[1], e9);

      const fourth = await open(e9, plans[3]).expect(422);

      expect(codeOf(fourth)).toBe('ACCESS_REQUEST.OPEN_LIMIT_REACHED');
    });

    it('QĐ-104b: counts a proposal of new software and not a draft', async () => {
      const e3 = await person('GH-E3');
      await h.propose(h.proposeBody(), e3.account).expect(201);
      await open(e3, plans[0]).expect(201);
      await open(e3, plans[1]).expect(201);
      await request(h.server())
        .post('/api/v1/access-requests/drafts')
        .set(h.as(e3.account))
        .send({ kind: 'INDIVIDUAL', planId: plans[2], businessReason: 'Later' });

      const fourth = await open(e3, plans[2]).expect(422);

      expect(codeOf(fourth)).toBe('ACCESS_REQUEST.OPEN_LIMIT_REACHED');
    });

    it('RV-12 QĐ-108c: a request exempt from the limits (ROLE_ENDED, TRANSFER_OVERLAP) is not counted', async () => {
      const e4 = await person('GH-E4');
      const sent = await sendThree(e4);
      await h.ctx.sql.query(`UPDATE access_requests SET limit_exemption = 'ROLE_ENDED' WHERE id = $1`, [sent[0]]);

      await open(e4, plans[3]).expect(201);
    });

    it('the database refuses an exemption it does not know', async () => {
      const e5 = await person('GH-E5');
      const sent = ((await open(e5, plans[4]).expect(201)).body as { data: { request: { id: string } } }).data.request;

      await expect(
        h.ctx.sql.query(`UPDATE access_requests SET limit_exemption = 'ANY' WHERE id = $1`, [sent.id]),
      ).rejects.toThrow(/access_requests_limit_exemption_known/);
    });

    it('a request sent in an earlier week is not counted: the count starts again on Monday', async () => {
      const e10 = await person('GH-E10');
      await sentAtWeekStart(await sendThree(e10), '-1 minute');

      await open(e10, plans[3]).expect(201);
    });

    it('T-RQ1: a request sent at 00:30 on Monday of the organization (still Sunday in UTC) belongs to the new week', async () => {
      const e11 = await person('GH-E11');
      await sentAtWeekStart(await sendThree(e11), '30 minutes');

      const fourth = await open(e11, plans[3]).expect(422);

      expect(codeOf(fourth)).toBe('ACCESS_REQUEST.OPEN_LIMIT_REACHED');
    });

    it('the preview tells how many the person sent this week, the most they may and the Monday the count starts again', async () => {
      const e12 = await person('GH-E12');
      await open(e12, plans[0]).expect(201);
      await open(e12, plans[1]).expect(201);

      const preview = await h.previewed(e12, plans[2]);

      expect((preview as unknown as { limits: Record<string, unknown> }).limits).toMatchObject({
        openNewCount: 2,
        openNewMax: 3,
        resetsOn: await nextMonday(),
        refusal: null,
      });
    });

    it('two requests sent at once by a person with one slot left: one is sent and the other refused, the lock of the person puts them in a line', async () => {
      const e13 = await person('GH-E13');
      await open(e13, plans[0]).expect(201);
      await open(e13, plans[1]).expect(201);

      const [first, second] = await Promise.all([open(e13, plans[2]), open(e13, plans[3])]);

      expect([first.status, second.status].sort()).toEqual([201, 422]);
      expect(codeOf(first.status === 422 ? first : second)).toBe('ACCESS_REQUEST.OPEN_LIMIT_REACHED');
    });

    it('US-01-04 AC-7: the Super Admin raises GH-2 to four and the fourth request is sent', async () => {
      const e6 = await person('GH-E6');
      await sendThree(e6);
      await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 4).expect(200);
      try {
        await open(e6, plans[3]).expect(201);
      } finally {
        await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 3).expect(200);
      }
    });
  });

  describe('T-RQ1: the week of the organization is judged on its clock, with sent, withdrawn and refused requests counted', () => {
    // Ten requests of the week of Monday 09/11/2026 on the clock of Ho Chi Minh, from Monday 00:30 to Sunday 23:00.
    const SENT_AT = [
      '2026-11-08T17:30:00.000Z', // Monday 09/11 00:30, which is still Sunday 17:30 in UTC
      '2026-11-09T02:00:00.000Z',
      '2026-11-10T09:15:00.000Z',
      '2026-11-11T03:00:00.000Z',
      '2026-11-12T11:45:00.000Z',
      '2026-11-13T05:20:00.000Z',
      '2026-11-14T08:00:00.000Z',
      '2026-11-14T16:59:00.000Z',
      '2026-11-15T10:00:00.000Z',
      '2026-11-15T16:00:00.000Z', // Sunday 15/11 23:00
    ];
    let limits: RequestLimitsService;
    let runner: TransactionRunner;
    let who: Person;
    let edge: Person;
    let probePlan: string;

    const judgedAt = (now: Date, employeeId: string = who.employeeId) =>
      runner.run((tx) =>
        limits.judgeOne(tx, {
          employeeId,
          planId: probePlan,
          now,
          settings: { weeklyLimit: 10 },
        }),
      );

    /**
     * The request becomes the renewal of a seat the person holds (the table wants the detail of a renewal with it, checked at commit): what
     * a request to go on using is, and the one kind of request the count of GH-2 never reads.
     */
    const asRenewal = async (id: string, sentAt: string): Promise<void> => {
      const assignment = await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
           normalized_account_identifier, valid_from, valid_until, valid_from_basis, owning_department_id, created_by_app_user_id)
         SELECT gen_random_uuid(), s.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, e.id, e.work_email, e.work_email,
                '2026-01-05', '2026-12-01', 'RECORDED', s.owner_department_id, gen_random_uuid()
           FROM subscriptions s JOIN employees e ON e.id = $2 WHERE s.plan_id = $1 LIMIT 1
         RETURNING id`,
        [plans[0], who.employeeId],
      );
      await h.ctx.sql.query('BEGIN');
      try {
        await h.ctx.sql.query(
          `INSERT INTO access_request_renewals (request_id, assignment_id, previous_expected_end_date, new_expected_end_date, consecutive_months)
           VALUES ($1, $2, '2026-12-01', '2027-02-01', 3)`,
          [id, assignment.rows[0].id],
        );
        await h.ctx.sql.query(`UPDATE access_requests SET type = 'RENEWAL', submitted_at = $2 WHERE id = $1`, [
          id,
          sentAt,
        ]);
        await h.ctx.sql.query('COMMIT');
      } catch (error) {
        await h.ctx.sql.query('ROLLBACK');
        throw error;
      }
    };

    beforeAll(async () => {
      limits = h.ctx.app.get(RequestLimitsService);
      runner = h.ctx.app.get(TransactionRunner);
      who = await person('GH-T1');
      await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 20).expect(200);
      const ids: string[] = [];
      // Thirteen are sent: ten of the week, one of the week before, one exempt (a grace of a transfer, a role ended) and one that is a request to go on using.
      for (let index = 0; index < 13; index += 1) {
        const planId = await h.planOf(await h.subscription(20));
        ids.push(idOf(await open(who, planId).expect(201)));
      }
      probePlan = await h.planOf(await h.subscription(20));
      // Two of the ten are withdrawn and one is refused: they still count.
      await withdraw(ids[0], who);
      await withdraw(ids[1], who);
      await reject(ids[2]);
      for (const [index, id] of ids.slice(0, 10).entries()) {
        await h.ctx.sql.query(`UPDATE access_requests SET submitted_at = $2 WHERE id = $1`, [id, SENT_AT[index]]);
      }
      await h.ctx.sql.query(`UPDATE access_requests SET submitted_at = '2026-11-08T16:00:00.000Z' WHERE id = $1`, [
        ids[10],
      ]);
      await h.ctx.sql.query(
        `UPDATE access_requests SET submitted_at = '2026-11-10T04:00:00.000Z', limit_exemption = 'ROLE_ENDED' WHERE id = $1`,
        [ids[11]],
      );
      await asRenewal(ids[12], '2026-11-11T04:00:00.000Z');

      // Another person, with a request sent on each edge of the week of Monday 09/11 on the clock of Ho Chi Minh (Monday 00:00 is Sunday 17:00 in UTC).
      edge = await person('GH-T2');
      const edges = [
        '2026-11-15T16:59:59.999Z', // the last millisecond of Sunday 15/11: the week of 09/11
        '2026-11-15T17:00:00.000Z', // Monday 16/11 00:00:00.000: the week of 16/11
        '2026-11-08T17:00:00.000Z', // Monday 09/11 00:00:00.000: the week of 09/11
      ];
      for (const sentAt of edges) {
        const planId = await h.planOf(await h.subscription(20));
        const id = idOf(await open(edge, planId).expect(201));
        await h.ctx.sql.query(`UPDATE access_requests SET submitted_at = $2 WHERE id = $1`, [id, sentAt]);
      }
    }, 240000);

    afterAll(async () => {
      await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 3).expect(200);
    });

    it('the eleventh at 23:30 on Sunday 15/11 is refused, and the count starts again on 2026-11-16', async () => {
      const verdict = await judgedAt(new Date('2026-11-15T16:30:00.000Z'));

      expect(verdict).toMatchObject({ refusal: 'OPEN_LIMIT_REACHED', sentThisWeek: 10, resetsOn: '2026-11-16' });
    });

    it('the same request at 00:30 on Monday 16/11 (17:30 on Sunday in UTC) is sent: a new week began half an hour before', async () => {
      const verdict = await judgedAt(new Date('2026-11-15T17:30:00.000Z'));

      expect(verdict).toMatchObject({ refusal: null, sentThisWeek: 0, resetsOn: '2026-11-23' });
    });

    it('the week begins at 00:00 on Monday on the clock of the organization, to the millisecond', async () => {
      expect((await judgedAt(new Date('2026-11-15T16:59:59.999Z'))).refusal).toBe('OPEN_LIMIT_REACHED');
      expect((await judgedAt(new Date('2026-11-15T17:00:00.000Z'))).refusal).toBeNull();
    });

    it('leaves out the request of the week before, the request exempt from the limits and the request to go on using', async () => {
      const verdict = await judgedAt(new Date('2026-11-12T03:00:00.000Z'));

      expect(verdict.sentThisWeek).toBe(10);
    });

    it('the week before holds the request sent at 23:00 on Sunday 08/11 and nothing else', async () => {
      const verdict = await judgedAt(new Date('2026-11-08T16:30:00.000Z'));

      expect(verdict).toMatchObject({ sentThisWeek: 1, resetsOn: '2026-11-09' });
    });

    it('a request sent on the first instant of the week and one on the last millisecond of it belong to it, one sent on the first instant of the next week does not', async () => {
      const weekOf0911 = await judgedAt(new Date('2026-11-12T03:00:00.000Z'), edge.employeeId);
      const weekOf1611 = await judgedAt(new Date('2026-11-15T17:30:00.000Z'), edge.employeeId);
      const weekOf0211 = await judgedAt(new Date('2026-11-08T16:30:00.000Z'), edge.employeeId);

      expect(weekOf0911.sentThisWeek).toBe(2);
      expect(weekOf1611.sentThisWeek).toBe(1);
      expect(weekOf0211.sentThisWeek).toBe(0);
    });
  });

  describe('QĐ-111h: there is no GH-3, a person who uses many paid applications asks as anyone', () => {
    let e7: Person;
    let fresh: string;

    beforeAll(async () => {
      e7 = await person('GH-E7');
      // Two paid seats the person holds today, on the subscriptions of two paid applications.
      for (const planId of [plans[0], plans[1]]) {
        await h.ctx.sql.query(
          `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
             normalized_account_identifier, valid_from, valid_from_basis, owning_department_id, created_by_app_user_id)
           SELECT gen_random_uuid(), s.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, e.id, e.work_email, e.work_email,
                  '2026-01-05', 'RECORDED', s.owner_department_id, gen_random_uuid()
             FROM subscriptions s JOIN employees e ON e.id = $2 WHERE s.plan_id = $1 LIMIT 1`,
          [planId, e7.employeeId],
        );
      }
      fresh = await h.planOf(await h.subscription(20));
    });

    it('the preview says nothing of paid applications: no count, no threshold, no reason asked', async () => {
      const preview = await h.previewed(e7, fresh);
      const { limits } = preview as unknown as { limits: Record<string, unknown> };

      expect(limits).toMatchObject({ refusal: null });
      for (const gone of ['paidSoftwareCount', 'paidSoftwareThreshold', 'reasonRequired'])
        expect(limits).not.toHaveProperty(gone);
    });

    it('sends the request with no reason, flags nothing and writes nothing of GH-3', async () => {
      const sent = (await open(e7, fresh).expect(201)).body as {
        data: { request: Record<string, unknown> & { id: string } };
      };

      expect(sent.data.request).not.toHaveProperty('flags');
      const { rows } = await h.ctx.sql.query<{ many_paid_software: boolean; many_paid_software_reason: string | null }>(
        `SELECT many_paid_software, many_paid_software_reason FROM access_requests WHERE id = $1`,
        [sent.data.request.id],
      );
      expect(rows[0]).toEqual({ many_paid_software: false, many_paid_software_reason: null });
    });

    it('refuses a body that still carries the reason of GH-3, as a field the form does not have', async () => {
      const e8 = await person('GH-E8');

      const refused = await open(e8, fresh, { manyPaidSoftwareReason: 'Just in case' }).expect(422);

      expect(codeOf(refused)).toBe('VALIDATION_ERROR');
    });
  });

  describe('QĐ-111h: the line of a person in a request for a group is a request named for them', () => {
    const sendGroup = async (planId: string, people: Person[]): Promise<string> =>
      idOf(
        await request(h.server())
          .post('/api/v1/group-requests')
          .set(h.as(head.account))
          .send({ planId, businessReason: 'The team', lines: people.map((who) => ({ employeeId: who.employeeId })) })
          .expect(201),
      );
    /** Three requests for a group, each naming the person and a colleague of theirs, on three plans. */
    const threeGroups = async (code: string): Promise<{ named: Person; groups: string[] }> => {
      const named = await person(code);
      const groups: string[] = [];
      for (const [index, planId] of plans.slice(0, 3).entries()) {
        groups.push(await sendGroup(planId, [named, await person(`${code}-P${index}`)]));
      }

      return { named, groups };
    };

    it('three lines sent this week are three of the three the person may be named in: their own request is refused', async () => {
      const { named } = await threeGroups('GH-L1');

      const fourth = await open(named, plans[3]).expect(422);

      expect(codeOf(fourth)).toBe('ACCESS_REQUEST.OPEN_LIMIT_REACHED');
      expect(detailsOf(fourth)).toMatchObject({ limit: 3 });
      expect(String(detailsOf(fourth).resetsOn)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('a line left out of the limits (a role ended) is not counted: the person still has a slot', async () => {
      const { named, groups } = await threeGroups('GH-L2');
      await h.ctx.sql.query(
        `UPDATE access_request_lines SET limit_exemption = 'ROLE_ENDED' WHERE request_id = $1 AND employee_id = $2`,
        [groups[0], named.employeeId],
      );

      await open(named, plans[3]).expect(201);
    });
  });

  describe('BR-MF1-01h QĐ-106g: a request for a group', () => {
    it('is refused whole with every line that breaks a limit, and nothing is written', async () => {
      const [ok, full, pending] = [await person('GH-G1'), await person('GH-G2'), await person('GH-G3')];
      for (const planId of plans.slice(0, 3)) await open(full, planId).expect(201);
      await open(pending, plans[4]).expect(201);
      const before = await h.requestRows();

      const refused = await request(h.server())
        .post('/api/v1/group-requests')
        .set(h.as(head.account))
        .send({
          planId: plans[4],
          businessReason: 'The team',
          lines: [{ employeeId: ok.employeeId }, { employeeId: full.employeeId }, { employeeId: pending.employeeId }],
        })
        .expect(422);

      expect(codeOf(refused)).toBe('GROUP_REQUEST.LINES_REFUSED');
      expect(JSON.stringify(refused.body)).toContain('OPEN_LIMIT_REACHED');
      expect(JSON.stringify(refused.body)).toContain('HAS_OPEN_REQUEST');
      expect(JSON.stringify(refused.body)).not.toContain(ok.employeeId);
      expect(await h.requestRows()).toBe(before);
    });
  });
});
