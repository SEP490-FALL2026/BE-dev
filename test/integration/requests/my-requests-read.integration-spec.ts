import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import { PgRelay } from '../../support/pg-relay';
import type { Person } from '../../support/request-harness';
import { dataStatements, QueryCounter, tablesOf } from '../../support/query-count';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const PATH = '/api/v1/me/access-requests';

interface RowWire {
  id: string;
  type: string;
  state: string;
  submittedAt: string;
  spend: { stage: string } | null;
}
interface PageWire {
  items: RowWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/** The tables and columns of money, budget, the check of a budget and a standard set: none is read to answer a row of the list. */
const FINANCE_TABLES = [
  'request_budget_check_years',
  'budget_commitments',
  'budget_commitment_releases',
  'budget_versions',
  'budget_version_lines',
  'budget_proposals',
  'request_supplements',
  'spend_batches',
  'spend_batch_items',
  'budget_information_requests',
  'exchange_rates',
  'vendor_tax_profiles',
  'subscriptions',
  'cost_centers',
];
const FINANCE_COLUMNS =
  /amount_minor|amount_currency|payment_schedule|unit_price_minor|binding_total_minor|override_reason|business_reason|off_plan|cost_center_id|plan_line_|opinion/;

/**
 * "My requests" over real PostgreSQL: the order, the pages, the narrowing, the number of statements that does not grow with the rows,
 * and that nothing of money or a budget is read or answered. Whose they are, and what a row says in each state, is in
 * `my-requests.integration-spec.ts`.
 */
describe('my requests: order, pages, narrowing, statements and finance data (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let paid: string;
  let design: Unit;
  let small: Person;
  let large: Person;
  /** The requests of `large`, in the order they were sent. */
  const sentIds: string[] = [];
  let seq = 0;

  const list = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(h.server()).get(PATH).query(query).set(h.as(account));
  const page = async (account: ApiAccount, query: Record<string, string | number> = {}) =>
    h.dataOf<PageWire>(await list(account, query).expect(200));
  const idsOf = async (query: Record<string, string | number>, account = large.account) =>
    (await page(account, { pageSize: 100, ...query })).items.map((item) => item.id);

  /**
   * One block of six requests of every shape the list reads facts for: waiting for the head, refused by the head, withdrawn, approved
   * and waiting in the queue of the head to be sent on, software that is not in the catalog waiting, and the same refused by the IT Admin.
   * Every block has the same shape, so a person with more blocks has more rows and the same kinds of row.
   */
  const block = async (person: Person): Promise<string[]> => {
    const made: string[] = [];
    seq += 1;
    const waiting = await h.sent(person, paid, { termMonths: 1 });
    const refused = await h.sent(person, paid, { termMonths: 1 });
    await h.decide(refused.id, { decision: 'REJECT', reason: `Not now ${seq}` }, design.head.account).expect(200);
    const withdrawn = await h.sent(person, await h.plan('K5'));
    await h.withdrawRequest(withdrawn.id, {}, person.account).expect(200);
    const queued = await h.sent(person, paid, { termMonths: 1 });
    await h.decide(queued.id, { decision: 'APPROVE' }, design.head.account).expect(200);
    const proposal = await h.proposed(person, { softwareName: `Tool ${seq}` });
    const rejected = await h.proposed(person, { softwareName: `Other tool ${seq}` });
    await h.decide(rejected.id, { decision: 'APPROVE' }, design.head.account).expect(200);
    await h.rejectAssessment(rejected.id, { kind: 'NOT_ELIGIBLE', reason: `Duplicate ${seq}` }, h.it1).expect(200);
    made.push(waiting.id, refused.id, withdrawn.id, queued.id, proposal.id, rejected.id);

    return made;
  };

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
    paid = await h.planOf(await h.subscription(100));
    design = await h.departmentWithHead('P-MRR');
    await h.setItAdminInCharge(design.department, { employeeId: h.it1.employeeId, account: h.it1 });
    small = await h.staff(design.department, 'MRR-S', ['EMPLOYEE']);
    large = await h.staff(design.department, 'MRR-L', ['EMPLOYEE']);
    await block(small);
    for (let index = 0; index < 3; index += 1) sentIds.push(...(await block(large)));
  }, 600000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  describe('order and pages', () => {
    it('lists the newest sent first, and by id when two were sent at the same moment', async () => {
      const all = await page(large.account, { pageSize: 100 });
      expect(all.items.map((item) => item.id)).toEqual([...sentIds].reverse());

      // Two requests sent at the same moment are told apart by their id, the larger first.
      const [a, b] = sentIds.slice(0, 2);
      await h.ctx.sql.query(
        `UPDATE access_requests SET submitted_at = (SELECT submitted_at FROM access_requests WHERE id = $1) WHERE id = $2`,
        [a, b],
      );
      const tied = (await page(large.account, { pageSize: 100 })).items.filter((item) => [a, b].includes(item.id));
      expect(tied.map((item) => item.id)).toEqual([a, b].sort().reverse());
      expect(new Set(tied.map((item) => item.submittedAt)).size).toBe(1);
    });

    it('cuts the list into pages that follow one another with no row twice and none missed, and says how many there are', async () => {
      const seen: string[] = [];
      for (let number = 1; number <= 4; number += 1) {
        const answer = await page(large.account, { page: number, pageSize: 5 });
        expect(answer.pagination).toEqual({ page: number, pageSize: 5, totalItems: 18, totalPages: 4 });
        expect(answer.items).toHaveLength(number === 4 ? 3 : 5);
        seen.push(...answer.items.map((item) => item.id));
      }
      const whole = await idsOf({});

      expect(seen).toEqual(whole);
      expect(new Set(seen).size).toBe(18);
      const past = await page(large.account, { page: 9, pageSize: 5 });
      expect(past.items).toEqual([]);
      expect(past.pagination).toEqual({ page: 9, pageSize: 5, totalItems: 18, totalPages: 4 });
    });

    it('answers a page of 20 by default, never more than 100, and an empty list is a page with no rows, not a 404', async () => {
      const answer = await page(large.account);
      const nobody = await page(h.employee);

      expect(answer.pagination).toMatchObject({ page: 1, pageSize: 20, totalItems: 18 });
      expect(answer.items).toHaveLength(18);
      expect(nobody).toEqual({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
      expect(h.codeOf(await list(large.account, { pageSize: 101 }).expect(422))).toBe('VALIDATION_ERROR');
    });
  });

  describe('narrowing', () => {
    it('keeps what is open and what is over apart, a withdrawal that waits for the IT Admin among the open', async () => {
      const open = await page(large.account, { pageSize: 100, view: 'open' });
      const ended = await page(large.account, { pageSize: 100, view: 'ended' });

      expect(open.pagination.totalItems + ended.pagination.totalItems).toBe(18);
      expect(new Set(open.items.map((item) => item.state))).toEqual(new Set(['PENDING', 'AWAITING_SPEND_SUBMISSION']));
      expect(new Set(ended.items.map((item) => item.state))).toEqual(new Set(['REJECTED', 'WITHDRAWN', 'IT_REJECTED']));
    });

    it('narrows by several states at once, by type, and by the two together within the view', async () => {
      const two = await page(large.account, { pageSize: 100, state: 'REJECTED,WITHDRAWN' });
      const none = await page(large.account, { pageSize: 100, state: 'REJECTED', view: 'open' });
      const groups = await page(large.account, { pageSize: 100, type: 'GROUP_GRANT' });
      const grants = await page(large.account, { pageSize: 100, type: 'GRANT', state: 'PENDING' });

      expect(two.items.every((item) => ['REJECTED', 'WITHDRAWN'].includes(item.state))).toBe(true);
      expect(two.pagination.totalItems).toBe(6);
      expect(none.items).toEqual([]);
      expect(groups.items).toEqual([]);
      expect(grants.items.every((item) => item.type === 'GRANT' && item.state === 'PENDING')).toBe(true);
      expect(grants.pagination.totalItems).toBe(6);
    });

    it('narrows by the moment sent: the window includes its start and excludes its end', async () => {
      const rows = (await page(large.account, { pageSize: 100 })).items;
      const [newest, , third, , fifth] = rows;

      const fromThird = await idsOf({ to: newest.submittedAt, from: third.submittedAt });
      const upToFifth = await idsOf({ from: fifth.submittedAt });
      const before = await idsOf({ to: fifth.submittedAt });

      expect(fromThird).toEqual(rows.slice(1, 3).map((row) => row.id));
      expect(upToFifth).toEqual(rows.slice(0, 5).map((row) => row.id));
      expect(before).toEqual(rows.slice(5).map((row) => row.id));
      expect(
        h.codeOf(await list(large.account, { from: newest.submittedAt, to: newest.submittedAt }).expect(422)),
      ).toBe('VALIDATION_ERROR');
    });
  });

  describe('statements and finance data', () => {
    const statementsOf = async (account: ApiAccount, query: Record<string, string | number> = {}) => {
      const run = await counter.run(() => list(account, { pageSize: 100, ...query }).expect(200));

      return dataStatements(run.statements);
    };

    it('reads a page in the same statements for six rows and for eighteen, and for a page of three of them', async () => {
      const few = await statementsOf(small.account);
      const many = await statementsOf(large.account);
      const cut = await statementsOf(large.account, { pageSize: 3 });

      expect(many.length).toBe(few.length);
      expect(cut.length).toBeLessThanOrEqual(many.length);
      expect(few.length).toBeLessThan(40);
    });

    it('reads no table of money or a budget, and none of the columns of a price, an amount or a figure of a check', async () => {
      const statements = await statementsOf(large.account);
      const tables = new Set(statements.flatMap(tablesOf));

      for (const table of FINANCE_TABLES) expect(tables.has(table)).toBe(false);
      expect(tables.has('access_requests')).toBe(true);
      const own = statements.filter((statement) =>
        tablesOf(statement).some((table) => table.startsWith('access_request')),
      );
      for (const statement of own) expect(statement).not.toMatch(FINANCE_COLUMNS);
    });

    it('answers no figure of money, budget, a check or a standard set, for a person whose request is waiting for the approver', async () => {
      const unit = await h.departmentWithHead('P-MRR-F');
      await h.budgetFor(unit, { total: 100_000_000, held: 20_000_000, spent: 40_000_000 });
      const id = await h.waitingForApprover(unit, paid, { amount: 15_000_000 });

      const answer = await list(unit.member.account).expect(200);
      const row = (answer.body as { data: PageWire }).data.items.find((item) => item.id === id);

      expect(row).toMatchObject({ state: 'AWAITING_SPEND_DECISION', spend: { stage: 'WAITING_SPEND_DECISION' } });
      expect(Object.keys(row?.spend ?? {})).toEqual(['stage']);
      expect(JSON.stringify(answer.body)).not.toMatch(
        /amount|price|cost|currency|budget|remaining|left|commitment|override|check|standard|toolset|tax|preTax|payable/i,
      );
    });
  });
});
