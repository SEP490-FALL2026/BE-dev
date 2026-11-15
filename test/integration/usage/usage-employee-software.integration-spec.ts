import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';
import { personalLeaksIn } from '../../support/usage-privacy';
import { UsageOverviewHarness, type UsageWorld } from '../../support/usage-overview-harness';

const h = new UsageOverviewHarness();
const NOVEMBER = { from: '2026-11-01', to: '2026-11-15' };
const UNKNOWN = '0b7a1f5e-0000-4000-8000-0000000000cc';

interface LineWire {
  application: { id: string; name: string; logoUrl: string | null };
  hasSeat: boolean;
  status: string;
  activeDays: number;
  coveredDays: number;
  updatedAt: string | null;
}
interface ListWire {
  employee: { id: string; employeeCode: string };
  range: { from: string; to: string; days: number };
  items: LineWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
interface DetailWire extends Omit<LineWire, 'application'> {
  employee: { id: string; employeeCode: string };
  application: LineWire['application'];
  range: { from: string; to: string; days: number };
  vendorSources: Array<{
    sourceId: string;
    name: string;
    status: string;
    activeDays: number;
    coveredDays: number;
    activeDates: string[];
  }>;
  sourcesTruncated: boolean;
  collector: null | {
    tool: string;
    status: string;
    activeDays: number;
    coveredDays: number;
    days: Array<{ date: string; coverage: string; active: boolean; responses: number; totalTokens: number }>;
  };
}

/**
 * What an IT Admin reads of one person (`QĐ-111aw`, `QĐ-111ax`, `US-14-05`): the software they hold a seat of or used, the two kinds of source told apart
 * for one software, the person by their code alone, a person outside the departments as a 404, and tokens only in the detail. The world is the one of
 * `UsageOverviewHarness.world`.
 */
describe('the usage of one person over HTTP (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let world: UsageWorld;
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
    world = await h.world();
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const listPath = (employeeId: string) => `/api/v1/employees/${employeeId}/usage-software`;
  const detailPath = (employeeId: string, applicationId: string) => `${listPath(employeeId)}/${applicationId}`;
  const list = (employeeId: string, query: Record<string, string | number> = NOVEMBER, account: ApiAccount = h.it1) =>
    request(h.server()).get(listPath(employeeId)).query(query).set(h.as(account));
  const detail = (
    employeeId: string,
    applicationId: string,
    query: Record<string, string | number> = NOVEMBER,
    account: ApiAccount = h.it1,
  ) => request(h.server()).get(detailPath(employeeId, applicationId)).query(query).set(h.as(account));
  const listOf = async (employeeId: string, account: ApiAccount = h.it1): Promise<ListWire> => {
    const response = await list(employeeId, NOVEMBER, account).expect(200);
    expect(personalLeaksIn(response.body, FULL_NAMES)).toEqual([]);

    return h.dataOf<ListWire>(response);
  };
  const detailOf = async (employeeId: string, applicationId: string, account: ApiAccount = h.it1) => {
    const response = await detail(employeeId, applicationId, NOVEMBER, account).expect(200);
    expect(personalLeaksIn(response.body, FULL_NAMES)).toEqual([]);

    return h.dataOf<DetailWire>(response);
  };
  const lineOf = (page: ListWire, applicationId: string): LineWire => {
    const line = page.items.find((item) => item.application.id === applicationId);
    if (!line) throw new Error(`no line for ${applicationId}`);

    return line;
  };

  describe('the list of software (usageEmployeeSoftwareList)', () => {
    it('lists the software a person holds a seat of or used with the days of activity and of data, and the person by their code alone', async () => {
      const page = await listOf(world.employeeA);

      expect(page.employee).toEqual({ id: world.employeeA, employeeCode: 'E-A' });
      expect(page.range).toEqual({ ...NOVEMBER, days: 15 });
      expect(page.pagination).toMatchObject({ totalItems: 2, totalPages: 1 });
      expect(lineOf(page, world.x.applicationId)).toMatchObject({
        hasSeat: true,
        activeDays: 3,
        coveredDays: 12,
        status: 'PARTIAL',
      });
      // `Y`: a seat and no data at all: nothing is known of whether it is used.
      expect(lineOf(page, world.y.applicationId)).toMatchObject({
        hasSeat: true,
        activeDays: 0,
        coveredDays: 0,
        status: 'NO_DATA',
        updatedAt: null,
      });
    });

    it('lists only the software of that person: a seat of one, nothing of another', async () => {
      const page = await listOf(world.employeeB);

      expect(page.items.map((item) => item.application.id)).toEqual([world.x.applicationId]);
      expect(page.items[0]).toMatchObject({ hasSeat: true, activeDays: 0, coveredDays: 10, status: 'PARTIAL' });
    });

    it('lists software the person used without a seat, with hasSeat false', async () => {
      const page = await listOf(world.employeeC, h.it2);

      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({ hasSeat: false, activeDays: 1, coveredDays: 10 });
    });

    it('carries no count of answers or of tokens: they are in the detail of one software only', async () => {
      const response = await list(world.employeeA).expect(200);
      const text = JSON.stringify(response.body);

      expect(text).not.toMatch(/totalTokens|responses|tokens/i);
    });

    it('pages the software in a fixed order with the total of the same snapshot', async () => {
      const first = h.dataOf<ListWire>(await list(world.employeeA, { ...NOVEMBER, pageSize: 1, page: 1 }).expect(200));
      const second = h.dataOf<ListWire>(await list(world.employeeA, { ...NOVEMBER, pageSize: 1, page: 2 }).expect(200));

      expect(first.pagination).toEqual({ page: 1, pageSize: 1, totalItems: 2, totalPages: 2 });
      expect(new Set([first.items[0].application.id, second.items[0].application.id]).size).toBe(2);
    });
  });

  describe('the scope of the IT Admin (QĐ-111ax, D8)', () => {
    it('answers 404 for a person outside the departments of the IT Admin, as for one who does not exist', async () => {
      for (const [employeeId, account] of [
        [world.employeeC, h.it1],
        [world.employeeA, h.it2],
        [UNKNOWN, h.it1],
      ] as const) {
        const listed = await list(employeeId, NOVEMBER, account).expect(404);
        const shown = await detail(employeeId, world.x.applicationId, NOVEMBER, account).expect(404);

        expect(h.codeOf(listed)).toBe('USAGE_OVERVIEW.EMPLOYEE_NOT_FOUND');
        expect(h.codeOf(shown)).toBe('USAGE_OVERVIEW.EMPLOYEE_NOT_FOUND');
        expect(personalLeaksIn(listed.body, FULL_NAMES)).toEqual([]);
      }
    });

    it('reads a person of its own department: the other IT Admin reads E-C and E-A reads E-A', async () => {
      await list(world.employeeC, NOVEMBER, h.it2).expect(200);
      await list(world.employeeA, NOVEMBER, h.it1).expect(200);
    });
  });

  describe('the detail of one software (usageEmployeeSoftwareGet)', () => {
    it('tells the vendor source and the collector apart, each with its own days', async () => {
      const shown = await detailOf(world.employeeA, world.x.applicationId);

      expect(shown).toMatchObject({
        employee: { id: world.employeeA, employeeCode: 'E-A' },
        application: { id: world.x.applicationId },
        range: { ...NOVEMBER, days: 15 },
        hasSeat: true,
        status: 'PARTIAL',
        activeDays: 3,
        coveredDays: 12,
        sourcesTruncated: false,
      });
      expect(shown.vendorSources).toHaveLength(1);
      expect(shown.vendorSources[0]).toMatchObject({
        sourceId: world.vendorSourceId,
        name: world.vendorSourceName,
        status: 'PARTIAL',
        activeDays: 1,
        coveredDays: 10,
        activeDates: ['2026-11-05'],
      });
      expect(shown.collector).toMatchObject({ tool: 'CODEX', status: 'PARTIAL', activeDays: 3, coveredDays: 4 });
      expect(shown.collector?.days).toEqual([
        { date: '2026-11-05', coverage: 'PARTIAL', active: true, responses: 3, totalTokens: 900 },
        { date: '2026-11-06', coverage: 'PARTIAL', active: true, responses: 2, totalTokens: 900 },
        { date: '2026-11-12', coverage: 'PARTIAL', active: true, responses: 1, totalTokens: 900 },
        { date: '2026-11-13', coverage: 'COVERED', active: false, responses: 0, totalTokens: 900 },
      ]);
    });

    it('says NO_DATA with no source and no collector for a software that has a seat and no data', async () => {
      const shown = await detailOf(world.employeeA, world.y.applicationId);

      expect(shown).toMatchObject({ hasSeat: true, status: 'NO_DATA', activeDays: 0, coveredDays: 0, updatedAt: null });
      expect(shown.vendorSources).toEqual([]);
      expect(shown.collector).toBeNull();
    });

    it('has no collector for a person with no machine, and shows only the days of that person in the vendor source', async () => {
      const b = await detailOf(world.employeeB, world.x.applicationId);
      const c = await detailOf(world.employeeC, world.x.applicationId, h.it2);

      expect(b.collector).toBeNull();
      expect(b.vendorSources[0]).toMatchObject({ activeDays: 0, coveredDays: 10, activeDates: [] });
      expect(c.collector).toBeNull();
      expect(c.hasSeat).toBe(false);
      expect(c.vendorSources[0]).toMatchObject({ activeDays: 1, activeDates: ['2026-11-08'] });
    });

    it('answers 404 for an application that does not exist, and 422 for a range that is not valid', async () => {
      const missing = await detail(world.employeeA, UNKNOWN).expect(404);
      const inverted = await detail(world.employeeA, world.x.applicationId, {
        from: '2026-11-10',
        to: '2026-11-09',
      }).expect(422);

      expect(h.codeOf(missing)).toBe('USAGE_OVERVIEW.APPLICATION_NOT_FOUND');
      expect(h.codeOf(inverted)).toBe('USAGE_OVERVIEW.RANGE_INVALID');
      await detail(world.employeeA, world.x.applicationId, { from: '2026-02-30' }).expect(422);
    });
  });

  describe('the lines of an import (US-08-04 AC-9, usageImportRowList)', () => {
    const linesOf = async (account: ApiAccount) => {
      const response = await request(h.server())
        .get(`/api/v1/usage-imports/${world.importId}/rows`)
        .query({ pageSize: 100 })
        .set(h.as(account))
        .expect(200);
      expect(personalLeaksIn(response.body, FULL_NAMES)).toEqual([]);

      return h.dataOf<{ items: Array<{ identifier: string; outcome: string }>; pagination: { totalItems: number } }>(
        response,
      );
    };

    it('shows a line tied to a person only to the IT Admin who works the department of that person, and the line nobody was tied to to both', async () => {
      const ofIt1 = await linesOf(h.it1);
      const ofIt2 = await linesOf(h.it2);

      expect(ofIt1.items.map((line) => line.identifier).sort()).toEqual(['e-a@acme.vn', 'nobody-world@acme.vn']);
      expect(ofIt2.items.map((line) => line.identifier).sort()).toEqual(['e-c@acme.vn', 'nobody-world@acme.vn']);
      expect(ofIt1.pagination.totalItems).toBe(2);
      expect(ofIt2.pagination.totalItems).toBe(2);
    });

    it('keeps the totals of the preview as they were: the counts are of the report, not of what the reader may see', async () => {
      const shown = await request(h.server())
        .get(`/api/v1/usage-imports/${world.importId}`)
        .set(h.as(h.it2))
        .expect(200);

      expect(h.dataOf<{ summary: { matched: number; unmatched: number } }>(shown).summary).toMatchObject({
        matched: 2,
        unmatched: 1,
      });
    });
  });

  it('is for the IT Admin alone: everyone else is refused with 403, and no token with 401', async () => {
    for (const account of [h.employee, h.finance]) {
      await list(world.employeeA, NOVEMBER, account).expect(403);
      await detail(world.employeeA, world.x.applicationId, NOVEMBER, account).expect(403);
    }
    await request(h.server()).get(listPath(world.employeeA)).expect(401);
  });

  describe('the statements (API-LIST-DETAIL.1)', () => {
    it('reads the same number of statements whatever the number of software and of sources', async () => {
      const readList = () => counter.run(() => list(world.employeeA).expect(200));
      const readDetail = () => counter.run(() => detail(world.employeeA, world.x.applicationId).expect(200));
      const listFew = await readList();
      const detailFew = await readDetail();
      for (let index = 0; index < 3; index += 1) {
        const more = await h.usageApp();
        await h.seatsOn(more.subscriptionId as string, [{ code: 'E-A', grantedOn: '2026-01-05' }]);
        await h.source(world.x.applicationId);
      }
      const listMany = await readList();
      const detailMany = await readDetail();

      expect(h.dataOf<ListWire>(listMany.result).items.length).toBeGreaterThan(
        h.dataOf<ListWire>(listFew.result).items.length,
      );
      expect(h.dataOf<DetailWire>(detailMany.result).vendorSources.length).toBeGreaterThan(
        h.dataOf<DetailWire>(detailFew.result).vendorSources.length,
      );
      expect(dataStatements(listMany.statements)).toHaveLength(dataStatements(listFew.statements).length);
      expect(dataStatements(detailMany.statements)).toHaveLength(dataStatements(detailFew.statements).length);
    });
  });
});
