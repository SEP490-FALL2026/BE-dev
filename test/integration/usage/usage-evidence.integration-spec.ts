import { UsageEvidenceApi } from '../../../src/modules/usage/public/usage-evidence.api';
import { pretendBusinessToday } from '../../support/pretend-today';
import { EVENT_SOURCE, UsageHarness } from '../../support/vendor-usage-harness';

const h = new UsageHarness();
const TODAY = '2026-09-02';

describe('the evidence of the usage of an application, vendors and collector through one door (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
  }, 180000);

  beforeEach(() => {
    pretendBusinessToday(h.ctx.app, TODAY);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await h.stop();
  });

  const aggregate = (lines: string[][]) => h.report(['email', 'last_active'], lines);
  const events = (lines: string[][]) => h.report(['email', 'day', 'event'], lines);
  const evidenceFor = (applicationId: string, employeeIds: string[], asOf: string) =>
    h.ctx.app.get(UsageEvidenceApi).evidenceFor({ applicationId, employeeIds, asOf });
  const vendorOf = (evidence: Awaited<ReturnType<typeof evidenceFor>>) =>
    evidence.sources.filter((source) => source.kind === 'VENDOR');
  const collectorOf = (evidence: Awaited<ReturnType<typeof evidenceFor>>) =>
    evidence.sources.find((source) => source.kind === 'COLLECTOR');

  describe('DA6-09: how fresh each kind of source must be', () => {
    it('a vendor whose report ends on 01/09 is stale on 09/09 (8 days, over 7); a collector last seen on 01/09 is fresh on 12/09 and stale on 16/09', async () => {
      const { applicationId } = await h.usageApp();
      const person = await h.person('FRESH1');
      const source = await h.source(applicationId);
      await h.confirmed(source.id, aggregate([['fresh1@acme.vn', '2026-08-20']]), {
        coverageFrom: '2026-06-02',
        coverageTo: '2026-09-01',
      });
      await h.collectorUsage(await h.registrationOf(person), applicationId, [{ date: '2026-09-01', responses: 4 }]);

      const nineth = await evidenceFor(applicationId, [person], '2026-09-09');
      const twelfth = await evidenceFor(applicationId, [person], '2026-09-12');
      const sixteenth = await evidenceFor(applicationId, [person], '2026-09-16');

      expect(vendorOf(nineth)[0]).toMatchObject({
        ageDays: 8,
        stale: true,
        coverage: { from: '2026-06-02', to: '2026-09-01' },
      });
      expect(collectorOf(twelfth)).toMatchObject({ ageDays: 11, stale: false, canConcludeAbsence: false });
      expect(collectorOf(sixteenth)).toMatchObject({ ageDays: 15, stale: true, canConcludeAbsence: false });
    });

    it('the activity of a stale collector is still returned: a positive fact does not expire', async () => {
      const { applicationId } = await h.usageApp();
      const person = await h.person('POS1');
      await h.collectorUsage(await h.registrationOf(person), applicationId, [
        { date: '2026-08-30', responses: 2 },
        { date: '2026-08-31', responses: 0 },
        { date: '2026-08-29', responses: 5, coverage: 'NOT_OBSERVABLE' },
      ]);

      const evidence = await evidenceFor(applicationId, [person], '2026-09-20');

      expect(collectorOf(evidence)).toMatchObject({ stale: true });
      expect(collectorOf(evidence)?.employees).toEqual([
        {
          employeeId: person,
          activeDates: ['2026-08-30'],
          appeared: true,
          lastAuthOnlyDate: null,
          weakestMethod: null,
          mappingChangedOn: null,
        },
      ]);
    });
  });

  describe('DA6-14, FR-4.4: what a source can conclude', () => {
    it('a source that only lists members, even one that confirmed a report, detects G1 and G2 and never concludes an absence', async () => {
      const { applicationId } = await h.usageApp();
      const person = await h.person('ROSTER1');
      const source = await h.source(applicationId, {
        template: { columns: { identifier: 'email' }, eventClasses: {} },
        capabilities: { memberList: true, lastActivity: false, eventDetail: false },
        evidenceDirection: 'POSITIVE_AND_NEGATIVE',
      });
      await h.confirmed(source.id, h.report(['email'], [['roster1@acme.vn']]), {
        coverageFrom: '2026-08-01',
        coverageTo: '2026-08-31',
      });

      const [vendor] = vendorOf(await evidenceFor(applicationId, [person], TODAY));

      expect(vendor).toMatchObject({ canConcludeAbsence: false, detectableGroups: ['G1', 'G2'] });
      expect(vendor.employees).toMatchObject([
        { employeeId: person, activeDates: [], appeared: true, lastAuthOnlyDate: '2026-08-31' },
      ]);
    });

    it('a vendor that tells the last activity and both directions can conclude an absence, with its definition and strictness', async () => {
      const { applicationId } = await h.usageApp();
      const person = await h.person('FULL1');
      const source = await h.source(applicationId, {
        evidenceDirection: 'POSITIVE_AND_NEGATIVE',
        definitionStrictness: 'LOOSE',
      });
      await h.confirmed(source.id, aggregate([['full1@acme.vn', '2026-08-20']]), {
        coverageFrom: '2026-06-01',
        coverageTo: '2026-08-31',
      });

      const [vendor] = vendorOf(await evidenceFor(applicationId, [person], TODAY));

      expect(vendor).toMatchObject({
        canConcludeAbsence: true,
        strictness: 'LOOSE',
        activityDefinition: 'mở hoặc chỉnh sửa một tệp trong ứng dụng',
        detectableGroups: ['G1', 'G2', 'G3', 'G4'],
      });
    });
  });

  describe('INV-12, FR-4.11: only what is tied to a person is theirs', () => {
    it('a login alone is appearing, not activity; the days a later report took over are not counted; an identifier nobody is tied to gives no day to anyone, and its day that a later report took over is gone', async () => {
      const { applicationId } = await h.usageApp();
      const person = await h.person('EVT1');
      const source = await h.source(applicationId, EVENT_SOURCE);
      await h.confirmed(
        source.id,
        events([
          ['evt1@acme.vn', '2026-06-10', 'open'],
          ['evt1@acme.vn', '2026-07-20', 'login'],
          ['evt1@acme.vn', '2026-07-22', 'view'],
          ['nobody@vendor.example', '2026-07-23', 'open'],
        ]),
        { coverageFrom: '2026-06-01', coverageTo: '2026-07-31' },
      );
      await h.confirmed(source.id, events([['evt1@acme.vn', '2026-08-02', 'open']]), {
        coverageFrom: '2026-07-21',
        coverageTo: '2026-08-31',
      });

      const evidence = await evidenceFor(applicationId, [person], TODAY);

      const [vendor] = vendorOf(evidence);
      expect(vendor.employees).toMatchObject([
        {
          employeeId: person,
          activeDates: ['2026-06-10', '2026-08-02'],
          appeared: true,
          lastAuthOnlyDate: '2026-07-20',
          weakestMethod: 'EXACT_EMAIL',
        },
      ]);
      expect(evidence.unmatchedIdentities).toEqual([
        { status: 'OPEN', lastActivityDate: null, candidateEmployeeIds: [] },
      ]);
    });
  });

  describe('privacy: days and the metadata of a source only', () => {
    it('never carries a volume, a token or an event: the keys of the answer are the ones the contract names', async () => {
      const { applicationId } = await h.usageApp();
      const person = await h.person('PRIV1');
      const source = await h.source(applicationId);
      await h.confirmed(source.id, aggregate([['priv1@acme.vn', '2026-08-20']]), {
        coverageFrom: '2026-06-01',
        coverageTo: '2026-08-31',
      });
      await h.collectorUsage(await h.registrationOf(person), applicationId, [{ date: '2026-08-30', responses: 12 }]);

      const evidence = await evidenceFor(applicationId, [person], TODAY);

      const text = JSON.stringify(evidence);
      for (const word of ['responses', 'totalTokens', 'token', 'eventType', 'identifier', '@']) {
        expect(text.toLowerCase()).not.toContain(word.toLowerCase());
      }
      expect(Object.keys(evidence).sort()).toEqual(['applicationId', 'asOf', 'sources', 'unmatchedIdentities']);
      for (const source of evidence.sources) {
        expect(Object.keys(source).sort()).toEqual(
          [
            'activityDefinition',
            'ageDays',
            'canConcludeAbsence',
            'coverage',
            'detectableGroups',
            'employees',
            'kind',
            'name',
            'sourceId',
            'stale',
            'strictness',
            'windows',
          ].sort(),
        );
      }
    });
  });
});
