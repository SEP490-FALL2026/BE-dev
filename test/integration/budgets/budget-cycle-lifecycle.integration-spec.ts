import request from 'supertest';
import { BudgetHarness } from '../../support/budget-harness';
import { addDays } from '../../support/department-harness';
import type { ApiAccount } from '../../support/api-accounts';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

interface CycleWire {
  year: number;
  status: 'DRAFT' | 'OPEN' | 'LOCKED';
  submissionDeadline: string;
  decisionDeadline: string;
  annualCeiling: { amount: string; currency: string };
  sharedPoolReserve: { amount: string } | null;
  available: { amount: string };
  priorities: string | null;
  openedAt: string | null;
}

/**
 * `QĐ-111z`, `QĐ-111aa`, `BR-MF4-01`, `US-06-15`, over HTTP on real PostgreSQL: Finance makes the cycle of a year as a draft, opens it, may
 * move its submission deadline and change its two amounts while it is open, and from the day after the deadline it is locked for good.
 * The head proposes once it is open. There is no division of the ceiling among the departments.
 */
describe('the budget cycle: draft, open, locked (integration, real PostgreSQL)', () => {
  let boss: Person;
  let counter = 0;

  const nextYear = () => h.year + 5 + (counter += 1);
  const money = (amount: number | string) => ({ amount: String(amount) });
  const asToken = (token: string) => ({ Authorization: `Bearer ${token}` });
  const day = (offset: number): string => {
    const date = new Date(`${h.today()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);

    return date.toISOString().slice(0, 10);
  };
  const create = (body: object, headers: Record<string, string> = h.as(h.finance)) =>
    request(h.server()).post('/api/v1/budget-cycles').set(headers).send(body);
  const body = (year: number, over: object = {}) => ({
    year,
    submissionDeadline: `${year - 1}-12-01`,
    decisionDeadline: `${year - 1}-12-15`,
    annualCeiling: money(1000),
    sharedPoolReserve: money(100),
    ...over,
  });
  const patch = (year: number, payload: object, headers: Record<string, string> = h.as(h.finance)) =>
    request(h.server()).patch(`/api/v1/budget-cycles/${year}`).set(headers).send(payload);
  const remove = (year: number, headers: Record<string, string> = h.as(h.finance)) =>
    request(h.server()).delete(`/api/v1/budget-cycles/${year}`).set(headers);
  const open = (year: number, headers: Record<string, string> = h.as(h.finance)) =>
    request(h.server()).post(`/api/v1/budget-cycles/${year}/opening`).set(headers);
  const get = (year: number, headers: Record<string, string> = h.as(h.finance)) =>
    request(h.server()).get(`/api/v1/budget-cycles/${year}`).set(headers);
  const cycleOf = (response: request.Response) => h.dataOf<CycleWire>(response);
  const idOf = async (year: number): Promise<string> =>
    (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM budget_cycles WHERE year = $1`, [year])).rows[0].id;
  const auditOf = async (year: number, action: string) =>
    (
      await h.ctx.sql.query<{ before: Record<string, unknown> | null; after: Record<string, unknown> }>(
        `SELECT e.before, e.after FROM audit_events e JOIN budget_cycles c ON c.id::text = e.resource_id
          WHERE c.year = $1 AND e.action = $2 ORDER BY e.occurred_at, e.id`,
        [year, action],
      )
    ).rows;
  /** A cycle written as a fixture, already open, with the submission deadline on the given day. */
  const openedWith = async (year: number, submissionDeadline: string) => {
    await h.ctx.sql.query(
      `INSERT INTO budget_cycles (id, organization_id, year, submission_deadline, decision_deadline, annual_ceiling_minor,
         shared_pool_reserve_minor, currency, opened_by_employee_id, opened_at, updated_at)
       SELECT gen_random_uuid(), o.id, $1, $2::date, $2::date + 14, 1000, 100, $3, $4, now(), now() FROM organizations o`,
      [year, submissionDeadline, h.reporting, h.finance.employeeId],
    );
  };

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1'));
    await h.setRole('SPENDING_APPROVER', boss);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('making a draft (QĐ-111z)', () => {
    it('makes a year once, as a draft in the reporting currency; a second one, a year gone by and out-of-order deadlines are refused', async () => {
      const year = nextYear();

      const made = cycleOf(await create(body(year)).expect(201));

      expect(made).toMatchObject({
        year,
        status: 'DRAFT',
        annualCeiling: { amount: '1000', currency: h.reporting },
        sharedPoolReserve: { amount: '100' },
        available: { amount: '900' },
        openedAt: null,
      });
      expect(h.codeOf(await create(body(year)).expect(409))).toBe('BUDGET.CYCLE_EXISTS');
      expect(h.codeOf(await create(body(h.year - 1)).expect(422))).toBe('BUDGET.CYCLE_YEAR_PAST');
      const out = await create(
        body(nextYear(), { submissionDeadline: '2030-12-15', decisionDeadline: '2030-12-01' }),
      ).expect(422);
      expect(h.codeOf(out)).toBe('BUDGET.CYCLE_DEADLINES_INVALID');
      expect(await auditOf(year, 'BUDGET_CYCLE.CREATED')).toHaveLength(1);
    });

    it('tells nobody and writes no ceiling of a department: a draft is Finance’s own', async () => {
      await h.departmentWithHead(`P-DRAFT${(counter += 1)}`);
      const year = nextYear();

      await create(body(year)).expect(201);

      expect(await h.budgetNoticesOf('BUDGET_CYCLE_OPENED', await idOf(year))).toHaveLength(0);
      expect(
        Number(
          (await h.ctx.sql.query<{ n: string }>(`SELECT count(*) AS n FROM budget_department_ceilings`)).rows[0].n,
        ),
      ).toBe(0);
    });

    it('is edited freely, with no reason and with a deadline in the past, and deleted; the year can be made again', async () => {
      const year = nextYear();
      await create(body(year)).expect(201);

      const edited = cycleOf(
        await patch(year, {
          submissionDeadline: day(-3),
          decisionDeadline: day(10),
          annualCeiling: money(2000),
          sharedPoolReserve: money(0),
          priorities: 'Security first',
        }).expect(200),
      );

      expect(edited).toMatchObject({
        status: 'DRAFT',
        submissionDeadline: day(-3),
        annualCeiling: { amount: '2000' },
        sharedPoolReserve: { amount: '0' },
        available: { amount: '2000' },
        priorities: 'Security first',
      });
      expect(await auditOf(year, 'BUDGET_CYCLE.UPDATED')).toHaveLength(1);
      expect(h.dataOf<{ year: number }>(await remove(year).expect(200))).toEqual({ year });
      expect(h.codeOf(await get(year).expect(404))).toBe('BUDGET.CYCLE_NOT_FOUND');
      await create(body(year)).expect(201);
    });
  });

  describe('opening (QĐ-111z, QT 4.1)', () => {
    it('opens a draft: the head of every department hears the deadline and which form to fill in, and the spending approver does not', async () => {
      const u = await h.departmentWithHead(`P-OPEN${(counter += 1)}`);
      const year = nextYear();
      await create(body(year)).expect(201);

      const opened = cycleOf(await open(year).expect(201));

      expect(opened.status).toBe('OPEN');
      expect(opened.openedAt).not.toBeNull();
      const notices = await h.budgetNoticesOf('BUDGET_CYCLE_OPENED', await idOf(year));
      expect(notices.map((notice) => notice.recipient_employee_id)).toContain(u.head.employeeId);
      expect(notices.map((notice) => notice.recipient_employee_id)).not.toContain(boss.employeeId);
      expect(notices[0].params).toMatchObject({ year, templateKind: 'budget-proposal' });
      expect(await auditOf(year, 'BUDGET_CYCLE.OPENED')).toHaveLength(1);
    });

    it('refuses to open it twice (409), a draft whose submission deadline has passed (422) and a year nobody made (404)', async () => {
      const year = nextYear();
      await create(body(year)).expect(201);
      await open(year).expect(201);
      expect(h.codeOf(await open(year).expect(409))).toBe('BUDGET_CYCLE.ALREADY_OPEN');
      const late = nextYear();
      await create(body(late, { submissionDeadline: day(-1), decisionDeadline: day(5) })).expect(201);

      expect(h.codeOf(await open(late).expect(422))).toBe('BUDGET_CYCLE.DEADLINE_PASSED');
      expect(h.codeOf(await open(h.year + 60).expect(404))).toBe('BUDGET.CYCLE_NOT_FOUND');
    });

    it('deletes only a draft: an open cycle answers 409', async () => {
      const year = nextYear();
      await create(body(year)).expect(201);
      await open(year).expect(201);

      expect(h.codeOf(await remove(year).expect(409))).toBe('BUDGET_CYCLE.NOT_DRAFT');
      expect(cycleOf(await get(year).expect(200)).status).toBe('OPEN');
    });
  });

  describe('changing an open cycle (US-06-15 AC-21)', () => {
    it('moves the submission deadline with a reason, keeps it before and after, tells the heads once, and writes nothing the second time', async () => {
      const u = await h.departmentWithHead(`P-MOVE${(counter += 1)}`);
      const year = nextYear();
      await create(body(year, { submissionDeadline: day(20), decisionDeadline: day(40) })).expect(201);
      await open(year).expect(201);

      expect(h.codeOf(await patch(year, { submissionDeadline: day(25) }).expect(422))).toBe(
        'BUDGET.CYCLE_REASON_REQUIRED',
      );
      expect(h.codeOf(await patch(year, { submissionDeadline: day(-1), reason: 'Too late' }).expect(422))).toBe(
        'BUDGET_CYCLE.DEADLINE_PASSED',
      );
      const moved = cycleOf(
        await patch(year, { submissionDeadline: day(25), reason: 'The board met late' }).expect(200),
      );
      await patch(year, { submissionDeadline: day(25), reason: 'The board met late' }).expect(200);

      expect(moved).toMatchObject({ status: 'OPEN', submissionDeadline: day(25) });
      const audit = await auditOf(year, 'BUDGET_CYCLE.UPDATED');
      expect(audit).toHaveLength(1);
      expect(audit[0].before).toMatchObject({ submissionDeadline: day(20) });
      expect(audit[0].after).toMatchObject({ submissionDeadline: day(25), reason: 'The board met late' });
      const told = await h.budgetNoticesOf('BUDGET_CYCLE_DEADLINE_MOVED', await idOf(year));
      expect(told.filter((notice) => notice.recipient_employee_id === u.head.employeeId)).toHaveLength(1);
      expect(told[0].params).toMatchObject({ submissionDeadline: day(25), previousSubmissionDeadline: day(20) });
    });

    it('asks a reason for a new annual ceiling or reserve, keeps both figures, and lets the decision deadline and the priorities move freely', async () => {
      const year = nextYear();
      await create(body(year, { submissionDeadline: day(20), decisionDeadline: day(40) })).expect(201);
      await open(year).expect(201);

      expect(h.codeOf(await patch(year, { annualCeiling: money(900) }).expect(422))).toBe(
        'BUDGET.CYCLE_REASON_REQUIRED',
      );
      expect(h.codeOf(await patch(year, { sharedPoolReserve: money(50) }).expect(422))).toBe(
        'BUDGET.CYCLE_REASON_REQUIRED',
      );
      const changed = cycleOf(
        await patch(year, {
          annualCeiling: money(900),
          sharedPoolReserve: money(50),
          reason: 'Cut by the leaders',
        }).expect(200),
      );
      await patch(year, { decisionDeadline: day(45), priorities: 'Cloud costs' }).expect(200);
      expect(h.codeOf(await patch(year, { decisionDeadline: day(10) }).expect(422))).toBe(
        'BUDGET.CYCLE_DEADLINES_INVALID',
      );

      expect(changed).toMatchObject({ annualCeiling: { amount: '900' }, sharedPoolReserve: { amount: '50' } });
      const audit = await auditOf(year, 'BUDGET_CYCLE.UPDATED');
      expect(audit[0].before).toMatchObject({ annualCeilingMinor: '1000', sharedPoolReserveMinor: '100' });
      expect(audit[0].after).toMatchObject({
        annualCeilingMinor: '900',
        sharedPoolReserveMinor: '50',
        reason: 'Cut by the leaders',
      });
    });
  });

  describe('the lock (QĐ-111z, R-14)', () => {
    it('is still open on the day of the submission deadline and locked the day after it', async () => {
      const onTheDay = nextYear();
      const dayAfter = nextYear();
      await openedWith(onTheDay, day(0));
      await openedWith(dayAfter, day(-1));

      expect(cycleOf(await get(onTheDay).expect(200)).status).toBe('OPEN');
      expect(cycleOf(await get(dayAfter).expect(200)).status).toBe('LOCKED');
      await patch(onTheDay, { sharedPoolReserve: money(60), reason: 'Last day' }).expect(200);
    });

    it('takes no change once locked, the reserve of the shared pool with the annual ceiling and the deadlines: 409 BUDGET_CYCLE.LOCKED, and never opens again', async () => {
      const year = nextYear();
      await openedWith(year, day(-1));

      for (const change of [
        { submissionDeadline: day(10), reason: 'A little more time' },
        { annualCeiling: money(5000), reason: 'More money' },
        { sharedPoolReserve: money(1), reason: 'A reserve' },
        { priorities: 'Late' },
      ]) {
        expect(h.codeOf(await patch(year, change).expect(409))).toBe('BUDGET_CYCLE.LOCKED');
      }
      expect(h.codeOf(await open(year).expect(409))).toBe('BUDGET_CYCLE.LOCKED');
      expect(h.codeOf(await remove(year).expect(409))).toBe('BUDGET_CYCLE.NOT_DRAFT');
      expect(cycleOf(await get(year).expect(200))).toMatchObject({
        status: 'LOCKED',
        annualCeiling: { amount: '1000' },
        sharedPoolReserve: { amount: '100' },
      });
      expect(await auditOf(year, 'BUDGET_CYCLE.UPDATED')).toHaveLength(0);
    });

    it('only reads the cycle of a year that has gone by (B7)', async () => {
      await h.ctx.sql.query(
        `INSERT INTO budget_cycles (id, organization_id, year, submission_deadline, decision_deadline, annual_ceiling_minor,
           shared_pool_reserve_minor, currency, opened_by_employee_id, opened_at, updated_at)
         SELECT gen_random_uuid(), o.id, $1, make_date($1, 12, 1), make_date($1, 12, 15), 1000, 0, $2, $3, now(), now()
           FROM organizations o ON CONFLICT (organization_id, year) DO NOTHING`,
        [h.year - 1, h.reporting, h.finance.employeeId],
      );

      await get(h.year - 1).expect(200);
      expect(h.codeOf(await patch(h.year - 1, { priorities: 'x' }).expect(422))).toBe('BUDGET.CYCLE_YEAR_PAST');
      expect(h.codeOf(await open(h.year - 1).expect(422))).toBe('BUDGET.CYCLE_YEAR_PAST');
    });
  });

  describe('who writes and who reads (AC-10)', () => {
    it('lets only Finance write: the Super Admin, the IT Admin, the spending approver and a head are refused', async () => {
      const year = nextYear();
      await create(body(year)).expect(201);
      const head = (await h.departmentWithHead(`P-ROLE${(counter += 1)}`)).head;
      const outsiders: Record<string, string>[] = [
        asToken(h.admin),
        h.as(h.it1),
        h.as(boss.account),
        h.as(head.account),
      ];

      for (const headers of outsiders) {
        await create(body(nextYear()), headers).expect(403);
        await patch(year, { priorities: 'x' }, headers).expect(403);
        await open(year, headers).expect(403);
        await remove(year, headers).expect(403);
      }
    });

    it('lets Finance and the spending approver read, and nobody else', async () => {
      const year = nextYear();
      await create(body(year)).expect(201);
      const head = (await h.departmentWithHead(`P-READ${(counter += 1)}`)).head;

      expect((await get(year, h.as(boss.account)).expect(200)).body).toBeDefined();
      await request(h.server()).get('/api/v1/budget-cycles').set(h.as(boss.account)).expect(200);
      await get(year, h.as(head.account)).expect(403);
      await request(h.server()).get('/api/v1/budget-cycles').set(h.as(h.it1)).expect(403);
      expect(h.codeOf(await get(h.year + 40).expect(404))).toBe('BUDGET.CYCLE_NOT_FOUND');
    });

    it('pages the list: the page and the count come from the database, each row says its state', async () => {
      const first = nextYear();
      await create(body(first)).expect(201);
      await create(body(nextYear())).expect(201);

      const page = h.dataOf<{ items: CycleWire[]; pagination: { totalItems: number; pageSize: number } }>(
        await request(h.server()).get('/api/v1/budget-cycles?page=1&pageSize=1').set(h.as(h.finance)).expect(200),
      );

      expect(page.items).toHaveLength(1);
      expect(page.pagination.pageSize).toBe(1);
      expect(page.pagination.totalItems).toBeGreaterThanOrEqual(2);
      expect(['DRAFT', 'OPEN', 'LOCKED']).toContain(page.items[0].status);
    });
  });

  describe('the head proposes once Finance opened the cycle (QĐ-111z)', () => {
    it('refuses with no cycle and with a draft (409 BUDGET_CYCLE.NOT_OPEN), and accepts once it is open', async () => {
      const u = await h.departmentWithHead(`P-Q02${(counter += 1)}`);
      const year = nextYear();
      const send = () => h.submitProposal(h.proposalBody(u.department.unitId, undefined, year), u.head.account);

      expect(h.codeOf(await send().expect(409))).toBe('BUDGET_CYCLE.NOT_OPEN');
      await create(body(year, { annualCeiling: money(1_000_000) })).expect(201);
      expect(h.codeOf(await send().expect(409))).toBe('BUDGET_CYCLE.NOT_OPEN');
      await open(year).expect(201);

      await send().expect(201);
    });
  });

  describe('BM-10 after the submission deadline (QĐ-111z, QĐ-111ab, T-BG2)', () => {
    it('refuses to send, send again or take back a proposal, and Finance to give one back: 409 BUDGET_CYCLE.LOCKED, nothing is written', async () => {
      const u = await h.departmentWithHead(`P-LCK${(counter += 1)}`);
      const other = await h.departmentWithHead(`P-LCO${(counter += 1)}`);
      const waits = await h.budgetProposed(u.head, u.department.unitId);
      const returned = await h.budgetProposed(other.head, other.department.unitId);
      await h.giveBack(returned.id, { reason: 'Add the quotes' }, h.finance).expect(200);
      const fresh = await h.departmentWithHead(`P-LCF${(counter += 1)}`);
      const { rows } = await h.ctx.sql.query<{ deadline: string }>(
        `SELECT submission_deadline::text AS deadline FROM budget_cycles WHERE year = $1`,
        [h.next],
      );
      await h.ctx.sql.query(`UPDATE budget_cycles SET submission_deadline = $2 WHERE year = $1`, [
        h.next,
        addDays(h.today(), -1),
      ]);

      try {
        const before = await h.budgetRows('budget_proposals');
        const refused = [
          await h.submitProposal(h.proposalBody(fresh.department.unitId), fresh.head.account),
          await h.resubmit(returned.id, h.bm10(), other.head.account),
          await h.withdraw(waits.id, u.head.account),
          await h.giveBack(waits.id, { reason: 'Too late' }, h.finance),
        ];

        expect(refused.map((response) => [response.status, h.codeOf(response)])).toEqual(
          Array.from({ length: 4 }, () => [409, 'BUDGET_CYCLE.LOCKED']),
        );
        expect(await h.budgetRows('budget_proposals')).toBe(before);
        expect(
          (await h.ctx.sql.query(`SELECT state::text FROM budget_proposals WHERE id = $1`, [waits.id])).rows[0],
        ).toEqual({ state: 'SUBMITTED' });
      } finally {
        await h.ctx.sql.query(`UPDATE budget_cycles SET submission_deadline = $2 WHERE year = $1`, [
          h.next,
          rows[0].deadline,
        ]);
      }
    });
  });

  describe('sending a proposal again needs the cycle open too (Q-02, QĐ-111z)', () => {
    it('refuses a resubmission while the cycle of its year is not open, and accepts it again once it is', async () => {
      const u = await h.departmentWithHead(`P-RES${(counter += 1)}`);
      const proposal = await h.budgetProposed(u.head, u.department.unitId);
      await h.giveBack(proposal.id, { reason: 'Add the seats' }, h.finance).expect(200);
      await h.ctx.sql.query('UPDATE budget_cycles SET opened_at = NULL, opened_by_employee_id = NULL WHERE year = $1', [
        h.next,
      ]);

      try {
        const refused = await h.resubmit(proposal.id, h.bm10(), u.head.account).expect(409);

        expect(h.codeOf(refused)).toBe('BUDGET_CYCLE.NOT_OPEN');
      } finally {
        await h.ctx.sql.query(
          'UPDATE budget_cycles SET opened_at = now(), opened_by_employee_id = $2 WHERE year = $1',
          [h.next, h.finance.employeeId],
        );
      }
      await h.resubmit(proposal.id, h.bm10(), u.head.account).expect(201);
    });
  });

  describe('the parameters Finance sets (L1-19)', () => {
    const set = (key: string, value: number, account: string | ApiAccount) =>
      request(h.server())
        .put(`/api/v1/operating-parameters/${key}`)
        .set(typeof account === 'string' ? asToken(account) : h.as(account))
        .send({ value });

    it('lets Finance set the default reserve and the Super Admin set the others, and neither the other way round', async () => {
      await set('BUDGET_RESERVE_DEFAULT_PERCENT', 12, h.finance).expect(200);
      await set('BUDGET_RESERVE_DEFAULT_PERCENT', 13, h.admin).expect(403);
      await set('BUDGET_RESERVE_DEFAULT_PERCENT', 13, boss.account).expect(403);
      await set('BUDGET_RESERVE_DEFAULT_PERCENT', 13, h.it1).expect(403);
      await set('FORECAST_ERROR_THRESHOLD_PERCENT', 20, h.admin).expect(200);
      await set('FORECAST_ERROR_THRESHOLD_PERCENT', 20, h.finance).expect(403);
    });

    it('shows Finance only the parameters Finance sets, and the Super Admin all of them', async () => {
      const keysOf = async (headers: Record<string, string>) =>
        h
          .dataOf<{ items: { key: string }[] }>(
            await request(h.server()).get('/api/v1/operating-parameters').set(headers).expect(200),
          )
          .items.map((item) => item.key);

      // The two thresholds of the zero-based-budget explanation of BM-10 belong to Finance too (QĐ-94l, L1-19).
      expect(await keysOf(h.as(h.finance))).toEqual([
        'BUDGET_RESERVE_DEFAULT_PERCENT',
        'BUDGET_ZBB_KPI3_BELOW_PERCENT',
        'BUDGET_ZBB_PRICE_INCREASE_PERCENT',
      ]);
      expect(await keysOf(asToken(h.admin))).toEqual(
        expect.arrayContaining(['BUDGET_RESERVE_DEFAULT_PERCENT', 'FORECAST_ERROR_THRESHOLD_PERCENT']),
      );
      await request(h.server())
        .get('/api/v1/operating-parameters/FORECAST_ERROR_THRESHOLD_PERCENT/history')
        .set(h.as(h.finance))
        .expect(403);
    });
  });
});
