import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { personalLeaksIn } from '../../support/usage-privacy';
import { UsageHarness, type UsageImportWire } from '../../support/vendor-usage-harness';

const h = new UsageHarness();
const OCTOBER = { coverageFrom: '2026-10-01', coverageTo: '2026-10-31' };
const HEADER = ['email', 'last_active'];

interface ImportListWire {
  items: Array<{
    id: string;
    source: { id: string; name: string };
    application: { id: string; name: string; logoUrl: string | null };
    status: string;
    format: string;
    coverage: { from: string; to: string };
    totalRows: number;
    matched: number;
    unmatched: number;
    ambiguous: number;
    createdAt: string;
    confirmedAt: string | null;
    duplicateOfImportId: string | null;
  }>;
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
interface UnmatchedWire {
  id: string;
  identifier: string;
  status: string;
  firstImportId: string;
  lastImportId: string;
  candidates: Array<Record<string, unknown>>;
}
type PreviewWire = UsageImportWire & { summary: UsageImportWire['summary'] & { duplicateOfImportId?: string } };

/**
 * The history of the imports and the same file twice (`US-08-02`, `QĐ-111ax`) and the identifiers of the result of one import (`US-08-04` AC-8): the list
 * of the imports with the name and the logo of the application, a warning (never a refusal) on a file a confirmed import of the same source already
 * holds, and the unmatched identifiers asked for by import so they are tied where the result is read.
 */
describe('the usage imports: history, the same file twice and the identifiers of one import (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const report = (...lines: string[][]) => h.report(HEADER, lines);
  const previewOf = async (sourceId: string, bytes: Buffer): Promise<PreviewWire> =>
    h.dataOf<PreviewWire>(await h.uploadReport(sourceId, bytes, OCTOBER).expect(201));
  const confirm = async (preview: UsageImportWire) =>
    h.confirmReport(preview.id, preview.previewVersion, { notice: 'SYSTEM_SENT' }).expect(200);
  const listOf = async (
    query: Record<string, string | number> = {},
    account: ApiAccount = h.it1,
  ): Promise<ImportListWire> => {
    const response = await request(h.server()).get('/api/v1/usage-imports').query(query).set(h.as(account)).expect(200);
    expect(personalLeaksIn(response.body, ['Person'])).toEqual([]);

    return h.dataOf<ImportListWire>(response);
  };
  const unmatchedOf = async (query: Record<string, string | number>): Promise<UnmatchedWire[]> =>
    h.dataOf<{ items: UnmatchedWire[] }>(
      await request(h.server())
        .get('/api/v1/usage-unmatched-identities')
        .query({ pageSize: 100, ...query })
        .set(h.as(h.it1))
        .expect(200),
    ).items;

  describe('the same file twice (DUPLICATE_FILE)', () => {
    it('warns, and does not refuse, when a file a confirmed import of the same source already holds is uploaded again', async () => {
      const app = await h.usageApp();
      const source = await h.source(app.applicationId);
      await h.person('E-DUP');
      const bytes = report(['e-dup@acme.vn', '2026-10-05']);
      const first = await previewOf(source.id, bytes);
      expect(first.summary.warnings).not.toContain('DUPLICATE_FILE');
      await confirm(first);

      const again = await previewOf(source.id, bytes);

      expect(again.summary.warnings).toContain('DUPLICATE_FILE');
      expect(again.summary.duplicateOfImportId).toBe(first.id);
      // A warning: the same report can still be confirmed, and no day is written twice (a day is binary).
      await confirm(again);
    });

    it('does not warn for a file that changed, for a preview not confirmed, or for the same bytes in another source', async () => {
      const app = await h.usageApp();
      const source = await h.source(app.applicationId);
      const other = await h.source(app.applicationId);
      await h.person('E-NODUP');
      const bytes = report(['e-nodup@acme.vn', '2026-10-06']);
      const preview = await previewOf(source.id, bytes);
      // Only a preview exists: it is not a confirmed import.
      expect((await previewOf(source.id, bytes)).summary.warnings).not.toContain('DUPLICATE_FILE');
      await confirm(preview);

      const corrected = await previewOf(source.id, report(['e-nodup@acme.vn', '2026-10-07']));
      const elsewhere = await previewOf(other.id, bytes);

      expect(corrected.summary.warnings).not.toContain('DUPLICATE_FILE');
      expect(corrected.summary.duplicateOfImportId).toBeUndefined();
      expect(elsewhere.summary.warnings).not.toContain('DUPLICATE_FILE');
    });
  });

  describe('the history of the imports (usageImportList)', () => {
    it('lists the imports newest first with the application, the window, the counts and the file they repeat', async () => {
      const app = await h.usageApp();
      const source = await h.source(app.applicationId);
      await h.person('E-HIST');
      const bytes = report(['e-hist@acme.vn', '2026-10-05'], ['nobody-hist@acme.vn', '2026-10-06']);
      const first = await previewOf(source.id, bytes);
      await confirm(first);
      const second = await previewOf(source.id, bytes);

      const { items, pagination } = await listOf({ sourceId: source.id });

      expect(pagination).toMatchObject({ totalItems: 2, totalPages: 1 });
      expect(items.map((item) => item.id)).toEqual([second.id, first.id]);
      expect(items[1]).toMatchObject({
        source: { id: source.id, name: source.name },
        application: { id: app.applicationId, logoUrl: null },
        status: 'COMPLETED',
        format: 'CSV',
        coverage: { from: '2026-10-01', to: '2026-10-31' },
        totalRows: 2,
        matched: 1,
        unmatched: 1,
        ambiguous: 0,
        duplicateOfImportId: null,
      });
      expect(items[1].confirmedAt).not.toBeNull();
      expect(items[0]).toMatchObject({ status: 'PREVIEW', confirmedAt: null, duplicateOfImportId: first.id });
      expect(items[1].application.name).toBeTruthy();
    });

    it('filters by status and by application, and pages in a fixed order', async () => {
      const app = await h.usageApp();
      const source = await h.source(app.applicationId);
      const previews: PreviewWire[] = [];
      for (let index = 0; index < 3; index += 1) {
        previews.push(await previewOf(source.id, report([`nobody-page-${index}@acme.vn`, '2026-10-05'])));
      }
      await confirm(previews[0]);
      const made = previews.map((preview) => preview.id);

      const completed = await listOf({ applicationId: app.applicationId, status: 'COMPLETED' });
      const first = await listOf({ applicationId: app.applicationId, pageSize: 2, page: 1 });
      const second = await listOf({ applicationId: app.applicationId, pageSize: 2, page: 2 });

      expect(completed.items.map((item) => item.id)).toEqual([made[0]]);
      expect(first.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
      expect([...first.items, ...second.items].map((item) => item.id)).toEqual([made[2], made[1], made[0]]);
    });

    it('is for the IT Admin alone, and refuses a query that is not valid with 422', async () => {
      for (const account of [h.employee, h.finance]) {
        await request(h.server()).get('/api/v1/usage-imports').set(h.as(account)).expect(403);
      }
      await request(h.server()).get('/api/v1/usage-imports').expect(401);
      for (const query of [{ pageSize: 101 }, { status: 'DONE' }, { sourceId: 'not-a-uuid' }]) {
        await request(h.server()).get('/api/v1/usage-imports').query(query).set(h.as(h.it1)).expect(422);
      }
    });
  });

  describe('the identifiers of the result of one import (usageUnmatchedIdentityList?importId)', () => {
    it('lists the identifiers the lines of that import could not be tied to, the ones of an earlier or later import apart', async () => {
      const app = await h.usageApp();
      const source = await h.source(app.applicationId);
      const common = 'common-id@acme.vn';
      const one = await previewOf(source.id, report([common, '2026-10-05'], ['only-first@acme.vn', '2026-10-05']));
      await confirm(one);
      const two = await previewOf(source.id, report([common, '2026-10-06']));
      await confirm(two);
      const three = await previewOf(source.id, report([common, '2026-10-07'], ['only-third@acme.vn', '2026-10-07']));
      await confirm(three);

      const ofOne = await unmatchedOf({ importId: one.id });
      const ofTwo = await unmatchedOf({ importId: two.id });
      const ofThree = await unmatchedOf({ importId: three.id });

      expect(ofOne.map((item) => item.identifier).sort()).toEqual([common, 'only-first@acme.vn'].sort());
      // The middle import met only the common identifier: it is neither the first nor the last import that met it.
      expect(ofTwo.map((item) => item.identifier)).toEqual([common]);
      expect(ofThree.map((item) => item.identifier).sort()).toEqual([common, 'only-third@acme.vn'].sort());
      expect(await unmatchedOf({ importId: '0b7a1f5e-0000-4000-8000-0000000000dd' })).toEqual([]);
      for (const item of [...ofOne, ...ofTwo, ...ofThree]) {
        expect(personalLeaksIn(item, ['Person'])).toEqual([]);
        expect(Object.keys(item.candidates[0] ?? {}).filter((key) => key === 'fullName')).toEqual([]);
      }
    });

    it('lists an identifier of the import to tie it there, and stops listing it once it is tied (the same route handles it by its own id)', async () => {
      const app = await h.usageApp();
      const source = await h.source(app.applicationId);
      const who = await h.person('E-TIE');
      const one = await previewOf(
        source.id,
        report(['alias-tie@acme.vn', '2026-10-05'], ['other-tie@acme.vn', '2026-10-05']),
      );
      await confirm(one);
      const [alias] = (await unmatchedOf({ importId: one.id })).filter(
        (item) => item.identifier === 'alias-tie@acme.vn',
      );

      await request(h.server())
        .post(`/api/v1/usage-unmatched-identities/${alias.id}/resolve`)
        .set(h.as(h.it1))
        .send({ employeeId: who })
        .expect(200);

      expect((await unmatchedOf({ importId: one.id })).map((item) => item.identifier)).toEqual(['other-tie@acme.vn']);
      expect((await unmatchedOf({ importId: one.id, status: 'RESOLVED' })).map((item) => item.identifier)).toEqual([
        'alias-tie@acme.vn',
      ]);
    });
  });
});
