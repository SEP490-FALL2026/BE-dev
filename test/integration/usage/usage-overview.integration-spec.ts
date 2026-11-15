import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { PgRelay } from '../../support/pg-relay';
import { pretendBusinessToday } from '../../support/pretend-today';
import { QueryCounter, dataStatements, tablesOf } from '../../support/query-count';
import { personalLeaksIn } from '../../support/usage-privacy';
import { UsageOverviewHarness } from '../../support/usage-overview-harness';

const h = new UsageOverviewHarness();
const TODAY = '2026-11-15';
const NOVEMBER = { from: '2026-11-01', to: '2026-11-15' };

interface PointWire {
  period: { start: string; end: string; days: number };
  department: { id: string; code: string; name: string } | null;
  application: { id: string; name: string; logoUrl: string | null } | null;
  source: { kind: string; id: string | null; name: string; application: { id: string } } | null;
  activeDays: number;
  coveredDays: number;
  status: string;
  updatedAt: string | null;
}
interface PageWire {
  items: PointWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * The series of the usage (`QĐ-111aw`, `QĐ-111ax`, `US-14-05`): days of activity and days of data, a day once however many sources told of it,
 * only the people of the departments the IT Admin works, and nothing that names a person. The world: a software `X` with a vendor source (a
 * report of 01–10/11 saying `E-A` was last active on 05/11 and `E-C` on 08/11) and a collector on the machine of `E-A` (active 05, 06 and 12/11,
 * observed without activity on 13/11); `E-A` and `E-B` are of the department of `it1`, `E-C` of the one of `it2`; a software `Y` has seats and no data.
 */
describe('the series of the usage over HTTP (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let x: { applicationId: string; subscriptionId: string | null };
  let y: { applicationId: string; subscriptionId: string | null };
  let vendorSourceId: string;
  let vendorSourceName: string;
  let employeeA: string;
  let employeeB: string;
  let employeeC: string;
  const FULL_NAMES = ['Person E-A', 'Person E-B', 'Person E-C', 'Person E-IT1', 'Person E-IT2'];

  beforeAll(async () => {
    await h.startTwoDepartments({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    pretendBusinessToday(h.ctx.app, TODAY);

    x = await h.usageApp();
    y = await h.usageApp();
    employeeA = await h.person('E-A');
    employeeB = await h.person('E-B');
    employeeC = await h.personOfOtherDepartment('E-C');
    await h.seatsOn(x.subscriptionId as string, [
      { code: 'E-A', grantedOn: '2026-01-05' },
      { code: 'E-B', grantedOn: '2026-01-05' },
    ]);
    await h.seatsOn(y.subscriptionId as string, [{ code: 'E-A', grantedOn: '2026-01-05' }]);

    const source = await h.source(x.applicationId);
    vendorSourceId = source.id;
    vendorSourceName = source.name;
    await h.confirmed(
      source.id,
      h.report(
        ['email', 'last_active'],
        [
          ['e-a@acme.vn', '2026-11-05'],
          ['e-c@acme.vn', '2026-11-08'],
        ],
      ),
      { coverageFrom: '2026-11-01', coverageTo: '2026-11-10' },
    );
    const machine = await h.registrationOf(employeeA, TODAY);
    await h.collectorUsage(machine, x.applicationId, [
      { date: '2026-11-05', responses: 3 },
      { date: '2026-11-06', responses: 2 },
      { date: '2026-11-12', responses: 1 },
      { date: '2026-11-13', responses: 0, coverage: 'COVERED' },
    ]);
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const get = (query: Record<string, string | number>, account: ApiAccount = h.it1) =>
    request(h.server()).get('/api/v1/usage-overview').query(query).set(h.as(account));
  const pageOf = async (query: Record<string, string | number>, account: ApiAccount = h.it1): Promise<PageWire> => {
    const response = await get(query, account).expect(200);
    expect(personalLeaksIn(response.body, FULL_NAMES)).toEqual([]);

    return h.dataOf<PageWire>(response);
  };
  const pointOf = (items: PointWire[], applicationId: string): PointWire => {
    const point = items.find((item) => item.application?.id === applicationId);
    if (!point) throw new Error(`no point for ${applicationId}`);

    return point;
  };

  it('counts the days of a month of a software once however many sources told of them, and says the data is partial while some days are not covered', async () => {
    const { items } = await pageOf({ ...NOVEMBER, granularity: 'MONTH', groupBy: 'APPLICATION' });

    const point = pointOf(items, x.applicationId);
    // Active: the vendor's 05/11 and the collector's 05, 06 and 12/11 are three days, not four. `E-C` (the other department) is not counted.
    expect(point.activeDays).toBe(3);
    // Covered: the report of 01–10/11 and the machine's days 12 and 13/11: twelve of the fifteen days of the period.
    expect(point.coveredDays).toBe(12);
    expect(point.period).toEqual({ start: '2026-11-01', end: '2026-11-15', days: 15 });
    expect(point.status).toBe('PARTIAL');
    expect(point.updatedAt).not.toBeNull();
    expect(point.department).toBeNull();
    expect(point.source).toBeNull();
    expect(point.application?.logoUrl).toBeNull();
    expect(point.application?.name).toBeTruthy();
  });

  it('shows a software that has seats and no data as NO_DATA with nothing counted, not as a zero of activity', async () => {
    const { items } = await pageOf({ ...NOVEMBER, granularity: 'MONTH', groupBy: 'APPLICATION' });

    expect(pointOf(items, y.applicationId)).toMatchObject({
      activeDays: 0,
      coveredDays: 0,
      status: 'NO_DATA',
      updatedAt: null,
    });
  });

  it('says for each day what the sources told: HAS_DATA where a day is covered, NO_DATA where nothing covers it', async () => {
    const { items } = await pageOf({
      ...NOVEMBER,
      granularity: 'DAY',
      groupBy: 'APPLICATION',
      applicationId: x.applicationId,
      pageSize: 100,
    });
    const byDay = new Map(items.map((item) => [item.period.start, item]));

    expect(items).toHaveLength(15);
    // 05/11: the vendor and the collector both say it, a day once.
    expect(byDay.get('2026-11-05')).toMatchObject({ activeDays: 1, coveredDays: 1, status: 'HAS_DATA' });
    // 07/11: inside the report, nobody active: the silence is covered.
    expect(byDay.get('2026-11-07')).toMatchObject({ activeDays: 0, coveredDays: 1, status: 'HAS_DATA' });
    // 11/11: no report and no observation: nothing is known.
    expect(byDay.get('2026-11-11')).toMatchObject({ activeDays: 0, coveredDays: 0, status: 'NO_DATA' });
    // 13/11: observed by the collector with no answer: covered, not active.
    expect(byDay.get('2026-11-13')).toMatchObject({ activeDays: 0, coveredDays: 1, status: 'HAS_DATA' });
    expect(byDay.get('2026-11-12')).toMatchObject({ activeDays: 1, coveredDays: 1 });
  });

  it('cuts weeks Monday to Sunday and counts the days of the range in each, the first and the last shorter', async () => {
    const { items } = await pageOf({
      from: '2026-11-04',
      to: '2026-11-15',
      granularity: 'WEEK',
      groupBy: 'APPLICATION',
      applicationId: x.applicationId,
    });

    // Wed 04/11 – Sun 08/11 (five days), Mon 09/11 – Sun 15/11 (seven days).
    expect(items.map((item) => item.period)).toEqual([
      { start: '2026-11-04', end: '2026-11-08', days: 5 },
      { start: '2026-11-09', end: '2026-11-15', days: 7 },
    ]);
    expect(items[0]).toMatchObject({ activeDays: 2, coveredDays: 5, status: 'HAS_DATA' });
    expect(items[1]).toMatchObject({ activeDays: 1, coveredDays: 4, status: 'PARTIAL' });
  });

  it('cuts by source: the vendor source and the collector of the tool are two groups, each with its own days', async () => {
    const { items } = await pageOf({
      ...NOVEMBER,
      granularity: 'MONTH',
      groupBy: 'SOURCE',
      applicationId: x.applicationId,
    });

    const vendor = items.find((item) => item.source?.kind === 'VENDOR');
    const collector = items.find((item) => item.source?.kind === 'COLLECTOR');
    expect(items).toHaveLength(2);
    expect(vendor?.source).toMatchObject({
      id: vendorSourceId,
      name: vendorSourceName,
      application: { id: x.applicationId },
    });
    expect(vendor).toMatchObject({ activeDays: 1, coveredDays: 10 });
    expect(collector?.source).toMatchObject({ id: null, name: 'CODEX' });
    expect(collector).toMatchObject({ activeDays: 3, coveredDays: 4 });
  });

  it('cuts by department: the department of the IT Admin, with the days of the people placed in it', async () => {
    const { items } = await pageOf({ ...NOVEMBER, granularity: 'MONTH', groupBy: 'DEPARTMENT' });

    expect(items).toHaveLength(1);
    expect(items[0].department).toMatchObject({ id: h.seed.departmentId });
    expect(items[0].application).toBeNull();
    // Both software of the department count: `Y` has no data, `X` has the days above; Y adds no day.
    expect(items[0]).toMatchObject({ activeDays: 3, coveredDays: 12 });
  });

  it('keeps to one kind of source when asked: only the collector, or only the vendor', async () => {
    const collectorOnly = await pageOf({
      ...NOVEMBER,
      granularity: 'MONTH',
      applicationId: x.applicationId,
      sourceKind: 'COLLECTOR',
    });
    const vendorOnly = await pageOf({
      ...NOVEMBER,
      granularity: 'MONTH',
      applicationId: x.applicationId,
      sourceKind: 'VENDOR',
    });
    const oneSource = await pageOf({
      ...NOVEMBER,
      granularity: 'MONTH',
      applicationId: x.applicationId,
      sourceId: vendorSourceId,
    });

    expect(collectorOnly.items[0]).toMatchObject({ activeDays: 3, coveredDays: 4 });
    expect(vendorOnly.items[0]).toMatchObject({ activeDays: 1, coveredDays: 10 });
    expect(oneSource.items[0]).toMatchObject({ activeDays: 1, coveredDays: 10 });
  });

  it('reads one person when asked: the days of that person alone', async () => {
    const a = await pageOf({
      ...NOVEMBER,
      granularity: 'MONTH',
      applicationId: x.applicationId,
      employeeId: employeeA,
    });
    const b = await pageOf({
      ...NOVEMBER,
      granularity: 'MONTH',
      applicationId: x.applicationId,
      employeeId: employeeB,
    });

    expect(a.items[0]).toMatchObject({ activeDays: 3, coveredDays: 12 });
    // `E-B` holds a seat and has no machine: the report covers 01–10/11 and says nothing of them.
    expect(b.items[0]).toMatchObject({ activeDays: 0, coveredDays: 10, status: 'PARTIAL' });
  });

  describe('the scope of the IT Admin (QĐ-111ax, D8)', () => {
    it('counts only the people of the departments of the IT Admin: the other IT Admin reads the days of E-C and not of E-A', async () => {
      const { items } = await pageOf({ ...NOVEMBER, granularity: 'MONTH', groupBy: 'APPLICATION' }, h.it2);

      expect(items).toHaveLength(1);
      expect(items[0].application?.id).toBe(x.applicationId);
      expect(items[0]).toMatchObject({ activeDays: 1, coveredDays: 10 });
    });

    it('answers an empty page, not an error, for a department or a person outside the scope', async () => {
      const otherDepartment = await pageOf({ ...NOVEMBER, departmentId: h.otherDepartment.id });
      const seedDepartmentOfIt2 = await pageOf({ ...NOVEMBER, departmentId: h.seed.departmentId }, h.it2);
      const personOutside = await pageOf({ ...NOVEMBER, employeeId: employeeC });
      const personOfIt1ToIt2 = await pageOf({ ...NOVEMBER, employeeId: employeeA }, h.it2);

      for (const page of [otherDepartment, seedDepartmentOfIt2, personOutside, personOfIt1ToIt2]) {
        expect(page.items).toEqual([]);
        expect(page.pagination).toEqual({ page: 1, pageSize: 50, totalItems: 0, totalPages: 0 });
      }
    });

    it('reads a department of the scope when it is named, and the same as without the filter when it is the only one', async () => {
      const named = await pageOf({ ...NOVEMBER, granularity: 'MONTH', departmentId: h.seed.departmentId });
      const all = await pageOf({ ...NOVEMBER, granularity: 'MONTH' });

      expect(named.items).toEqual(all.items);
    });
  });

  describe('the page and the range', () => {
    it('pages the series in a fixed order: no point twice and none missed across the pages', async () => {
      const everything = await pageOf({ ...NOVEMBER, granularity: 'DAY', groupBy: 'APPLICATION', pageSize: 100 });
      const seen: string[] = [];
      for (let page = 1; page <= 5; page += 1) {
        const part = await pageOf({ ...NOVEMBER, granularity: 'DAY', groupBy: 'APPLICATION', pageSize: 7, page });
        expect(part.pagination).toMatchObject({ page, pageSize: 7, totalItems: 30, totalPages: 5 });
        seen.push(...part.items.map((item) => `${item.period.start}|${item.application?.id}`));
      }

      // Fifteen days of two software, oldest day first.
      expect(everything.items).toHaveLength(30);
      expect(seen).toEqual(everything.items.map((item) => `${item.period.start}|${item.application?.id}`));
      expect(new Set(seen).size).toBe(30);
      expect(seen.map((key) => key.slice(0, 10))).toEqual([...seen.map((key) => key.slice(0, 10))].sort());
    });

    it('answers a range of 30 days ending today when none is asked for, and counts no day to come', async () => {
      const { items } = await pageOf({ granularity: 'MONTH', applicationId: x.applicationId });

      // 17/10 – 15/11, cut at the month: October's 15 days and November's 15, none of 16/11 or later.
      expect(items.map((item) => item.period)).toEqual([
        { start: '2026-10-17', end: '2026-10-31', days: 15 },
        { start: '2026-11-01', end: '2026-11-15', days: 15 },
      ]);
      const later = await pageOf({
        from: '2026-11-10',
        to: '2026-12-31',
        granularity: 'MONTH',
        applicationId: x.applicationId,
      });
      expect(later.items.map((item) => item.period)).toEqual([{ start: '2026-11-10', end: '2026-11-15', days: 6 }]);
    });

    it('refuses a range that ends before it starts or is longer than 366 days with 422 and says which', async () => {
      const inverted = await get({ from: '2026-11-10', to: '2026-11-09' }).expect(422);
      const tooLong = await get({ from: '2025-11-14', to: '2026-11-15' }).expect(422);

      expect(h.codeOf(inverted)).toBe('USAGE_OVERVIEW.RANGE_INVALID');
      expect(h.detailsOf(inverted)).toEqual({ reason: 'RANGE_INVERTED' });
      expect(h.codeOf(tooLong)).toBe('USAGE_OVERVIEW.RANGE_INVALID');
      expect(h.detailsOf(tooLong)).toEqual({ reason: 'RANGE_TOO_LONG' });
      await get({ from: '2025-11-15', to: '2026-11-15' }).expect(200);
    });

    it('refuses a query that is not valid with 422 (a date that does not exist, an unknown way of cutting, a page too large)', async () => {
      const invalid: Array<Record<string, string | number>> = [
        { from: '2026-02-30' },
        { granularity: 'YEAR' },
        { groupBy: 'EMPLOYEE' },
        { pageSize: 101 },
      ];
      for (const query of invalid) {
        expect(h.codeOf(await get(query).expect(422))).toBe('VALIDATION_ERROR');
      }
    });
  });

  it('is for the IT Admin alone: everyone else is refused with 403, and no token with 401', async () => {
    for (const account of [h.employee, h.finance]) await get(NOVEMBER, account).expect(403);
    await request(h.server()).get('/api/v1/usage-overview').expect(401);
  });

  describe('the statements (API-LIST-DETAIL.1)', () => {
    const statementsOf = (counted: { statements: string[] }) => dataStatements(counted.statements);

    it('reads the same number of statements whatever the number of software and of days, and never the lines of a report', async () => {
      const query = { ...NOVEMBER, granularity: 'DAY', groupBy: 'APPLICATION', pageSize: 100 };
      const few = await counter.run(() => get(query).expect(200));
      for (let index = 0; index < 3; index += 1) {
        const more = await h.usageApp();
        await h.seatsOn(more.subscriptionId as string, [{ code: 'E-B', grantedOn: '2026-01-05' }]);
      }
      const many = await counter.run(() => get(query).expect(200));

      expect(h.dataOf<PageWire>(many.result).items.length).toBeGreaterThan(h.dataOf<PageWire>(few.result).items.length);
      expect(statementsOf(many)).toHaveLength(statementsOf(few).length);
      const tables = new Set(statementsOf(many).flatMap(tablesOf));
      expect(tables.has('usage_import_rows')).toBe(false);
      // The days are counted in one statement for the whole page: one statement reads the days of activity.
      expect(
        statementsOf(many).filter((statement) => tablesOf(statement).includes('usage_activity_days')),
      ).toHaveLength(1);
    });
  });
});
