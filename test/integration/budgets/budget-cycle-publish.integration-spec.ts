import request from 'supertest';
import { BudgetHarness } from '../../support/budget-harness';
import type { ApiAccount } from '../../support/api-accounts';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

interface CycleWire {
  year: number;
  status: 'NOT_PUBLISHED' | 'PUBLISHED' | 'CHANGED_AFTER_PUBLISH';
  annualCeiling: { amount: string; currency: string };
  sharedPoolReserve: { amount: string } | null;
  ceilings: Record<string, { total: { amount: string } }>;
  allocated: { amount: string };
  unallocated: { amount: string };
  publishedAt: string | null;
  firstPublishedAt: string | null;
}

/**
 * `QĐ-103i`, `BR-MF4-01`, `BR-MF4-02`, `US-06-15`, over HTTP on real PostgreSQL: Finance opens the cycle of a year, divides the annual
 * ceiling among the departments and the shared-pool reserve, and publishes it; the head proposes once it was published (`Q-02`).
 */
describe('the budget cycle: open, divide, publish (integration, real PostgreSQL)', () => {
  let boss: Person;
  let counter = 0;

  const nextYear = () => h.year + 5 + (counter += 1);
  const money = (amount: number | string) => ({ amount: String(amount) });
  const asToken = (token: string) => ({ Authorization: `Bearer ${token}` });
  const open = (body: object, headers: Record<string, string> = h.as(h.finance)) =>
    request(h.server()).post('/api/v1/budget-cycles').set(headers).send(body);
  const openBody = (year: number, over: object = {}) => ({
    year,
    submissionDeadline: `${year - 1}-12-01`,
    decisionDeadline: `${year - 1}-12-15`,
    annualCeiling: money(1000),
    ...over,
  });
  const patch = (year: number, body: object, headers: Record<string, string> = h.as(h.finance)) =>
    request(h.server()).patch(`/api/v1/budget-cycles/${year}`).set(headers).send(body);
  const put = (year: number, body: object, headers: Record<string, string> = h.as(h.finance)) =>
    request(h.server()).put(`/api/v1/budget-cycles/${year}/department-ceilings`).set(headers).send(body);
  const publish = (year: number, headers: Record<string, string> = h.as(h.finance)) =>
    request(h.server()).post(`/api/v1/budget-cycles/${year}/publish`).set(headers);
  const get = (year: number, headers: Record<string, string> = h.as(h.finance)) =>
    request(h.server()).get(`/api/v1/budget-cycles/${year}`).set(headers);
  const departments = async (): Promise<string[]> =>
    (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM departments WHERE status = 'ACTIVE' ORDER BY id`)).rows.map(
      (row) => row.id,
    );
  /** A division that gives each department `each` and the reserve `reserve`. */
  const division = async (each: number, reserve: number, only?: string[]) => ({
    sharedPoolReserve: money(reserve),
    departments: (only ?? (await departments())).map((departmentId) => ({
      departmentId,
      signedCommitments: money(each),
      plannedSeats: money(0),
      priority: money(0),
      explanation: 'Basis of the ceiling',
    })),
  });
  const cycleOf = (response: request.Response) => h.dataOf<CycleWire>(response);
  const auditOf = async (year: number, action: string) =>
    (
      await h.ctx.sql.query<{ before: unknown; after: Record<string, unknown> }>(
        `SELECT e.before, e.after FROM audit_events e JOIN budget_cycles c ON c.id::text = e.resource_id
          WHERE c.year = $1 AND e.action = $2 ORDER BY e.occurred_at, e.id`,
        [year, action],
      )
    ).rows;

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

  describe('opening a cycle (R-I03)', () => {
    it('opens a year once, with the figures in the reporting currency; a second opening, a year gone by and out-of-order deadlines are refused', async () => {
      const year = nextYear();

      const opened = cycleOf(await open(openBody(year)).expect(201));
      expect(opened).toMatchObject({
        year,
        status: 'NOT_PUBLISHED',
        annualCeiling: { amount: '1000', currency: h.reporting },
        sharedPoolReserve: null,
        ceilings: {},
        publishedAt: null,
        firstPublishedAt: null,
      });
      expect(h.codeOf(await open(openBody(year)).expect(409))).toBe('BUDGET.CYCLE_EXISTS');
      expect(h.codeOf(await open(openBody(h.year - 1)).expect(422))).toBe('BUDGET.CYCLE_YEAR_PAST');
      const out = await open(
        openBody(nextYear(), { submissionDeadline: '2030-12-15', decisionDeadline: '2030-12-01' }),
      ).expect(422);
      expect(h.codeOf(out)).toBe('BUDGET.CYCLE_DEADLINES_INVALID');
      expect(await auditOf(year, 'BUDGET_CYCLE.OPENED')).toHaveLength(1);
    });

    it('lets the head of every department hear it, and not the spending approver (QT 4.1)', async () => {
      const u = await h.departmentWithHead(`P-OPEN${(counter += 1)}`);
      const year = nextYear();

      const cycle = cycleOf(await open(openBody(year)).expect(201));

      const id = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM budget_cycles WHERE year = $1`, [year])).rows[0]
        .id;
      const recipients = (await h.budgetNoticesOf('BUDGET_CYCLE_OPENED', id)).map(
        (notice) => notice.recipient_employee_id,
      );
      expect(cycle.year).toBe(year);
      expect(recipients).toContain(u.head.employeeId);
      expect(recipients).not.toContain(boss.employeeId);
    });
  });

  describe('who writes and who reads (AC-10)', () => {
    it('lets only Finance write: the Super Admin, the IT Admin, the spending approver and a head are refused', async () => {
      const year = nextYear();
      await open(openBody(year)).expect(201);
      const head = (await h.departmentWithHead(`P-ROLE${(counter += 1)}`)).head;
      const outsiders: Record<string, string>[] = [
        asToken(h.admin),
        h.as(h.it1),
        h.as(boss.account),
        h.as(head.account),
      ];

      for (const headers of outsiders) {
        await open(openBody(nextYear()), headers).expect(403);
        await patch(year, { priorities: 'x' }, headers).expect(403);
        await put(year, await division(1, 0), headers).expect(403);
        await publish(year, headers).expect(403);
      }
    });

    it('lets Finance and the spending approver read, and nobody else', async () => {
      const year = nextYear();
      await open(openBody(year)).expect(201);
      const head = (await h.departmentWithHead(`P-READ${(counter += 1)}`)).head;

      expect((await get(year, h.as(boss.account)).expect(200)).body).toBeDefined();
      await request(h.server()).get('/api/v1/budget-cycles').set(h.as(boss.account)).expect(200);
      await get(year, h.as(head.account)).expect(403);
      await request(h.server()).get('/api/v1/budget-cycles').set(h.as(h.it1)).expect(403);
      expect(h.codeOf(await get(h.year + 40).expect(404))).toBe('BUDGET.CYCLE_NOT_FOUND');
    });
  });

  describe('publishing the division (R-I04, QT 4.3)', () => {
    it('publishes a division that adds up to the annual ceiling exactly, and refuses one that is one unit over (BUDGET.CEILINGS_OVER_ANNUAL)', async () => {
      const year = nextYear();
      const ids = await departments();
      await open(openBody(year, { annualCeiling: money(ids.length + 10) })).expect(201);
      await put(year, await division(1, 10)).expect(200);

      const published = cycleOf(await publish(year).expect(201));
      expect(published).toMatchObject({ status: 'PUBLISHED', allocated: { amount: String(ids.length + 10) } });
      expect(published.unallocated.amount).toBe('0');

      await patch(year, { annualCeiling: money(ids.length + 9), reason: 'Leaders cut the budget' }).expect(200);
      expect(cycleOf(await get(year).expect(200)).status).toBe('CHANGED_AFTER_PUBLISH');
      const over = await publish(year).expect(409);
      expect(h.codeOf(over)).toBe('BUDGET.CEILINGS_OVER_ANNUAL');
      expect(h.detailsOf(over)).toEqual({ gapMinor: '1' });
      expect(await auditOf(year, 'BUDGET_CYCLE.PUBLISH_REFUSED')).toHaveLength(1);
    });

    it('refuses a division with a department missing, and a cycle whose reserve was never entered; a reserve of zero counts', async () => {
      const year = nextYear();
      const ids = await departments();
      await open(openBody(year, { annualCeiling: money(1_000_000) })).expect(201);

      const noReserve = await publish(year).expect(422);
      expect(h.codeOf(noReserve)).toBe('BUDGET.CEILINGS_INCOMPLETE');
      expect(h.detailsOf(noReserve)).toMatchObject({
        reserveMissing: true,
        missingDepartmentIds: ids,
        staleDepartmentIds: [],
      });
      await put(year, await division(1, 0, ids.slice(1))).expect(200);
      const missing = await publish(year).expect(422);
      expect(h.detailsOf(missing)).toMatchObject({ reserveMissing: false, missingDepartmentIds: [ids[0]] });
      await put(year, await division(1, 0)).expect(200);
      await publish(year).expect(201);
    });

    it('refuses a ceiling for a department that is not among the departments of the year', async () => {
      const year = nextYear();
      await open(openBody(year)).expect(201);
      const stranger = '11111111-1111-4111-8111-111111111111';

      const refused = await put(year, await division(1, 0, [stranger])).expect(422);

      expect(h.codeOf(refused)).toBe('BUDGET.CEILING_DEPARTMENT_INVALID');
      expect(h.detailsOf(refused)).toEqual({ departmentIds: [stranger] });
    });
  });

  describe('changing a cycle after it was published (AC-8, AC-15)', () => {
    it('asks the reason for a new annual ceiling and records the figures before and after; the cycle must be published again', async () => {
      const year = nextYear();
      const ids = await departments();
      await open(openBody(year, { annualCeiling: money(ids.length * 10) })).expect(201);
      await put(year, await division(1, 0)).expect(200);
      await publish(year).expect(201);

      expect(h.codeOf(await patch(year, { annualCeiling: money(ids.length * 20) }).expect(422))).toBe(
        'BUDGET.CYCLE_REASON_REQUIRED',
      );
      const changed = cycleOf(
        await patch(year, { annualCeiling: money(ids.length * 20), reason: 'The board raised it' }).expect(200),
      );

      expect(changed).toMatchObject({ status: 'CHANGED_AFTER_PUBLISH', publishedAt: null });
      expect(changed.firstPublishedAt).not.toBeNull();
      const [event] = await auditOf(year, 'BUDGET_CYCLE.UPDATED');
      expect(event.before).toMatchObject({ annualCeilingMinor: String(ids.length * 10) });
      expect(event.after).toMatchObject({ annualCeilingMinor: String(ids.length * 20), reason: 'The board raised it' });
    });

    it('records each ceiling that changed, and tells only the head whose ceiling changed when it is published again', async () => {
      const year = nextYear();
      const first = await h.departmentWithHead(`P-CH${(counter += 1)}`);
      const second = await h.departmentWithHead(`P-CH${(counter += 1)}`);
      const ids = await departments();
      await open(openBody(year, { annualCeiling: money(1_000_000) })).expect(201);
      await put(year, await division(1, 0)).expect(200);
      await publish(year).expect(201);
      const cycleId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM budget_cycles WHERE year = $1`, [year]))
        .rows[0].id;
      const told = async (departmentId: string) =>
        (await h.budgetNoticesOf('BUDGET_DEPARTMENT_CEILING_PUBLISHED', cycleId)).filter(
          (notice) => (notice.params as { departmentId: string }).departmentId === departmentId,
        ).length;
      expect(await told(first.department.id)).toBe(1);
      expect(await told(second.department.id)).toBe(1);

      const again = await division(1, 5);
      again.departments = again.departments.map((row) =>
        row.departmentId === first.department.id ? { ...row, priority: money(7) } : row,
      );
      await put(year, again).expect(200);
      await publish(year).expect(201);

      expect(await told(first.department.id)).toBe(2);
      expect(await told(second.department.id)).toBe(1);
      expect(ids).toContain(first.department.id);
      const [, second1] = await auditOf(year, 'BUDGET_CYCLE.CEILINGS_SET');
      expect(second1.after).toMatchObject({ sharedPoolReserveMinor: '5' });
      expect(second1.before).toEqual({ sharedPoolReserveMinor: '0' });
      const changes = second1.after.changes as {
        departmentId: string;
        before: { totalMinor: string };
        after: { totalMinor: string };
      }[];
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        departmentId: first.department.id,
        before: { totalMinor: '1' },
        after: { totalMinor: '8', priorityMinor: '7' },
      });
    });

    it('only reads the cycle of a year that has gone by (B7)', async () => {
      const year = h.year - 1;
      await h.ctx.sql.query(
        `INSERT INTO budget_cycles (id, organization_id, year, submission_deadline, decision_deadline, annual_ceiling_minor, currency,
           opened_by_employee_id, opened_at, updated_at)
         SELECT gen_random_uuid(), id, $1, make_date($1, 11, 1), make_date($1, 11, 2), 1000, $2, $3, now(), now() FROM organizations`,
        [year, h.reporting, h.finance.employeeId],
      );

      expect(cycleOf(await get(year).expect(200)).year).toBe(year);
      expect(h.codeOf(await patch(year, { priorities: 'x' }).expect(422))).toBe('BUDGET.CYCLE_YEAR_PAST');
      expect(h.codeOf(await put(year, await division(1, 0)).expect(422))).toBe('BUDGET.CYCLE_YEAR_PAST');
      expect(h.codeOf(await publish(year).expect(422))).toBe('BUDGET.CYCLE_YEAR_PAST');
    });
  });

  describe('the head proposes once the cycle was published (Q-02)', () => {
    it('refuses with no cycle, with a cycle never published, and accepts once published even while it is changed afterwards', async () => {
      const u = await h.departmentWithHead(`P-Q02${(counter += 1)}`);
      const year = nextYear();
      const send = () => h.submitProposal(h.proposalBody(u.department.unitId, h.twoLines(), year), u.head.account);

      expect(h.codeOf(await send().expect(409))).toBe('BUDGET.CYCLE_NOT_PUBLISHED');
      await open(openBody(year, { annualCeiling: money(1_000_000) })).expect(201);
      expect(h.codeOf(await send().expect(409))).toBe('BUDGET.CYCLE_NOT_PUBLISHED');
      await put(year, await division(1, 0)).expect(200);
      await publish(year).expect(201);

      const proposal = await send().expect(201);
      await patch(year, { annualCeiling: money(2_000_000), reason: 'Raised' }).expect(200);
      await h.withdraw(h.dataOf<{ proposal: { id: string } }>(proposal).proposal.id, u.head.account).expect(200);
      await send().expect(201);
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

      expect(await keysOf(h.as(h.finance))).toEqual(['BUDGET_RESERVE_DEFAULT_PERCENT']);
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
