import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import { SeatHarness, ImportWire } from '../support/seat-baseline-harness';

const h = new SeatHarness();
const DAY = '2026-10-01';

describe('the seat baseline import over HTTP (integration, real PostgreSQL)', () => {
  let organization: OrganizationService;

  beforeAll(async () => {
    await h.start();
    organization = h.ctx.app.get(OrganizationService, { strict: false });
  }, 180000);

  beforeEach(() => {
    jest.spyOn(organization, 'businessToday').mockResolvedValue(DAY);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await h.stop();
  });

  const row = (code: string, extra: Record<string, string> = {}) => ({
    employee_code: code,
    account_identifier: `${code.toLowerCase()}@acme.vn`,
    ...extra,
  });
  const rowsOf = async (id: string, query: Record<string, string | number> = {}) =>
    h.dataOf<{
      items: Array<{
        lineNumber: number;
        cells: Record<string, string>;
        outcome: string;
        errors: Array<{ code: string }>;
      }>;
    }>(
      await request(h.server())
        .get(`/api/v1/seat-baseline-imports/${id}/rows`)
        .query({ pageSize: 100, ...query })
        .set(h.as(h.it1))
        .expect(200),
    ).items;
  const codesAt = (items: Awaited<ReturnType<typeof rowsOf>>, line: number) =>
    items.find((item) => item.lineNumber === line)?.errors.map((error) => error.code);

  describe('AC-1: a baseline of 70 people for a subscription of 100 seats', () => {
    it('previews 70 valid rows, writes 70 assignments marked as the baseline with no request, and leaves 30 seats free', async () => {
      const subscriptionId = await h.subscription(100);
      await h.crowd('FIG', 70);
      const rows = Array.from({ length: 70 }, (_, index) => row(`FIG${index}`));

      const preview = await h.preview({ subscriptionId }, rows);

      expect(preview.status).toBe('PREVIEW');
      expect(preview.summary).toMatchObject({
        totalRows: 70,
        valid: 70,
        errors: 0,
        seats: { purchased: 100, occupiedBefore: 0, freeBefore: 100, freeAfter: 30 },
        recordedOn: DAY,
      });
      expect(await h.assignmentsOf({ subscriptionId })).toEqual([]);

      const confirmed = h.dataOf<{ import: ImportWire; replayed: boolean }>(await h.confirm(preview.id, 1).expect(200));

      expect(confirmed.replayed).toBe(false);
      expect(confirmed.import).toMatchObject({
        status: 'COMPLETED',
        result: { created: 70, errors: 0, occupied: 70, free: 30 },
      });
      const kept = await h.assignmentsOf({ subscriptionId });
      expect(kept).toHaveLength(70);
      expect(new Set(kept.map((assignment) => assignment.source))).toEqual(new Set(['BASELINE']));
      expect(new Set(kept.map((assignment) => assignment.kind))).toEqual(new Set(['PERSONAL']));
      expect(
        h.dataOf<{ purchased: number; occupied: number; free: number }>(await h.seatUsage(subscriptionId).expect(200)),
      ).toMatchObject({
        purchased: 100,
        occupied: 70,
        free: 30,
        asOf: DAY,
      });

      const stored = await h.ctx.sql.query<{ source: string; baseline_import_id: string; n: number }>(
        `SELECT source, baseline_import_id, count(*)::int AS n FROM license_assignments WHERE subscription_id = $1 GROUP BY 1, 2`,
        [subscriptionId],
      );
      expect(stored.rows).toEqual([{ source: 'BASELINE', baseline_import_id: preview.id, n: 70 }]);
    });

    it('audits every assignment as created by the baseline, without the account identifier, and the import with counts only', async () => {
      const subscriptionId = await h.subscription(10);
      await h.crowd('AUD', 3);
      const { preview } = await h.written({ subscriptionId }, [row('AUD0'), row('AUD1'), row('AUD2')]);

      const created = await h.ctx.sql.query<{ after: Record<string, unknown>; actor_roles: string[] }>(
        `SELECT after, actor_roles FROM audit_events WHERE action = 'LICENSE_ASSIGNMENT.CREATED' AND after->>'importId' = $1`,
        [preview.id],
      );
      expect(created.rows).toHaveLength(3);
      expect(created.rows[0].after).toMatchObject({
        source: 'BASELINE',
        kind: 'PERSONAL',
        subscriptionId,
        importId: preview.id,
      });
      expect(created.rows[0].actor_roles).toEqual(['IT_ADMIN']);
      expect(JSON.stringify(created.rows.map((event) => event.after))).not.toContain('@acme.vn');

      const events = await h.auditOf('SeatBaselineImport', preview.id);
      expect(events.map((event) => event.action)).toEqual([
        'SEAT_BASELINE_IMPORT.UPLOADED',
        'SEAT_BASELINE_IMPORT.CONFIRMED',
      ]);
      expect(JSON.stringify(events)).not.toContain('@acme.vn');
      expect(events[1].after).toMatchObject({ source: 'BASELINE', created: 3, errors: 0 });
    });
  });

  describe('AC-2: more rows than seats', () => {
    it('reports the rows past the last free seat in the preview and writes no more than the seats bought', async () => {
      const subscriptionId = await h.subscription(10);
      await h.crowd('LIM', 12);

      const preview = await h.preview(
        { subscriptionId },
        Array.from({ length: 12 }, (_, index) => row(`LIM${index}`)),
      );

      expect(preview.summary).toMatchObject({
        totalRows: 12,
        valid: 10,
        errors: 2,
        byCode: { SEAT_LIMIT_EXCEEDED: 2 },
      });
      const wrong = await rowsOf(preview.id, { outcome: 'ERROR' });
      expect(wrong.map((item) => item.lineNumber)).toEqual([12, 13]);
      expect(wrong[0].errors).toEqual([{ code: 'SEAT_LIMIT_EXCEEDED' }]);

      const confirmed = h.dataOf<{ import: ImportWire }>(await h.confirm(preview.id, 1).expect(200)).import;
      expect(confirmed.result).toEqual({ created: 10, errors: 2, occupied: 10, free: 0 });
      expect(await h.assignmentsOf({ subscriptionId })).toHaveLength(10);
    });

    it('counts the seats already taken: 8 of 10 taken and 5 rows leave room for two', async () => {
      const subscriptionId = await h.subscription(10);
      await h.crowd('TAK', 8);
      await h.written(
        { subscriptionId },
        Array.from({ length: 8 }, (_, index) => row(`TAK${index}`)),
      );
      await h.crowd('NEW', 5);

      const preview = await h.preview(
        { subscriptionId },
        Array.from({ length: 5 }, (_, index) => row(`NEW${index}`)),
      );

      expect(preview.summary).toMatchObject({
        valid: 2,
        errors: 3,
        seats: { purchased: 10, occupiedBefore: 8, freeBefore: 2, freeAfter: 0 },
      });
    });
  });

  describe('AC-3, AC-4: overlap and time-limited staff', () => {
    it('refuses the second row of the same person on the same subscription, and keeps the first', async () => {
      const subscriptionId = await h.subscription(10);
      await h.person('OVL1');

      const preview = await h.preview({ subscriptionId }, [
        row('OVL1'),
        row('OVL1', { account_identifier: 'ovl1.second@acme.vn' }),
      ]);

      expect(preview.summary).toMatchObject({ valid: 1, errors: 1, byCode: { OVERLAP: 1 } });
      expect(codesAt(await rowsOf(preview.id), 3)).toEqual(['OVERLAP']);
    });

    it('refuses a person who already holds a seat in what is kept', async () => {
      const subscriptionId = await h.subscription(10);
      await h.person('OVL2');
      await h.written({ subscriptionId }, [row('OVL2')]);

      const preview = await h.preview({ subscriptionId }, [row('OVL2', { account_identifier: 'ovl2.again@acme.vn' })]);

      expect(preview.summary.byCode).toEqual({ OVERLAP: 1 });
    });

    it('asks an intern, a contractor and a freelancer for an expected end date, and takes it with one', async () => {
      const subscriptionId = await h.subscription(10);
      await h.person('INT1', 'INTERN');
      await h.person('CON1', 'CONTRACTOR');
      await h.person('FRE1', 'FREELANCER');

      const without = await h.preview({ subscriptionId }, [row('INT1'), row('CON1'), row('FRE1')]);
      expect(without.summary).toMatchObject({ valid: 0, errors: 3, byCode: { EXPECTED_END_REQUIRED: 3 } });

      const { import: written } = await h.written({ subscriptionId }, [
        row('INT1', { expected_end_date: '2027-03-31' }),
        row('CON1', { expected_end_date: '2027-03-31' }),
        row('FRE1', { expected_end_date: '2027-06-30' }),
      ]);
      expect(written.result?.created).toBe(3);
      expect(
        (await h.assignmentsOf({ subscriptionId })).map((assignment) => assignment.expectedEndDate).sort(),
      ).toEqual(['2027-03-31', '2027-03-31', '2027-06-30']);
    });
  });

  describe('AC-8: a grant date that is not known', () => {
    it('keeps a real grant date as it is and shows a recorded start as recorded, never as the day the seat was granted', async () => {
      const subscriptionId = await h.subscription(10);
      await h.person('GRA1');
      await h.person('GRA2');

      await h.written({ subscriptionId }, [row('GRA1'), row('GRA2', { granted_on: '2025-03-15' })]);

      const [real, recorded] = [
        ...(await h.assignmentsOf({ subscriptionId, employeeId: await h.person('GRA2') })),
        ...(await h.assignmentsOf({ subscriptionId, employeeId: await h.person('GRA1') })),
      ];
      expect(real).toMatchObject({
        effectiveFrom: '2025-03-15',
        effectiveFromBasis: 'ACTUAL',
        grantedOn: '2025-03-15',
        effectiveFromLabel: null,
      });
      expect(recorded).toMatchObject({
        effectiveFrom: DAY,
        effectiveFromBasis: 'RECORDED',
        grantedOn: null,
        effectiveFromLabel: 'ghi nhận từ 01/10/2026 — ngày cấp thật chưa biết',
      });
    });

    it('refuses a grant date in the future and one that is not a date', async () => {
      const subscriptionId = await h.subscription(10);
      await h.person('GRA3');
      await h.person('GRA4');

      const preview = await h.preview({ subscriptionId }, [
        row('GRA3', { granted_on: '2026-10-02' }),
        row('GRA4', { granted_on: '1/2/2025' }),
      ]);

      expect(preview.summary.byCode).toEqual({ GRANTED_ON_IN_FUTURE: 1, GRANTED_ON_INVALID: 1 });
    });
  });

  describe('AC-9, AC-13, AC-14: the account', () => {
    const bot = (code: string, identifier: string, extra: Record<string, string> = {}) => ({
      employee_code: code,
      account_identifier: identifier,
      kind: 'service',
      reason: 'CI pipeline',
      cost_center_code: '',
      ...extra,
    });

    it('takes a personal seat and two bots for one person, and refuses a repeated or missing identifier and a token', async () => {
      const subscriptionId = await h.subscription(10);
      const corp = await h.costCenter('COMPANY');
      await h.person('BOT1');

      const preview = await h.preview({ subscriptionId }, [
        row('BOT1'),
        bot('BOT1', 'ci-bot', { cost_center_code: corp.code }),
        bot('BOT1', 'release-bot', { cost_center_code: corp.code }),
        bot('BOT1', ' CI-Bot ', { cost_center_code: corp.code }),
        bot('BOT1', '', { cost_center_code: corp.code }),
        bot('BOT1', 'ghp_abc123', { cost_center_code: corp.code }),
      ]);

      expect(preview.summary).toMatchObject({ valid: 3, errors: 3 });
      const rows = await rowsOf(preview.id);
      expect(codesAt(rows, 5)).toEqual(['ACCOUNT_IDENTIFIER_IN_USE']);
      expect(codesAt(rows, 6)).toEqual(['ACCOUNT_IDENTIFIER_MISSING']);
      expect(codesAt(rows, 7)).toEqual(['ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET']);
    });

    it('never keeps a token: the row shows it masked, and the stored row and the audit trail do not hold it', async () => {
      const subscriptionId = await h.subscription(10);
      const corp = await h.costCenter('COMPANY');
      await h.person('SEC1');

      const preview = await h.preview({ subscriptionId }, [
        bot('SEC1', 'ghp_supersecret123', { cost_center_code: corp.code }),
      ]);

      expect((await rowsOf(preview.id))[0].cells.account_identifier).toBe('[masked]');
      const stored = await h.ctx.sql.query(`SELECT 1 FROM seat_baseline_import_rows WHERE cells::text LIKE '%ghp_%'`);
      expect(stored.rows).toEqual([]);
      const events = await h.ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE before::text LIKE '%ghp_%' OR after::text LIKE '%ghp_%'`,
      );
      expect(events.rows).toEqual([]);
    });

    it('refuses a personal account that is not on a company domain, and takes one that is (AC-13)', async () => {
      const subscriptionId = await h.subscription(10);
      await h.person('DOM1');
      await h.person('DOM2');

      const preview = await h.preview({ subscriptionId }, [
        row('DOM1', { account_identifier: 'dom1@gmail.com' }),
        row('DOM2', { account_identifier: 'dom2@acme.vn' }),
      ]);

      expect(preview.summary).toMatchObject({ valid: 1, errors: 1, byCode: { NOT_COMPANY_ACCOUNT: 1 } });
    });

    it('refuses a shared account with its own error and still confirms the valid rows, then takes the four people one by one (AC-14)', async () => {
      const subscriptionId = await h.subscription(10);
      for (const code of ['DES1', 'DES2', 'DES3', 'DES4']) await h.person(code);

      const preview = await h.preview({ subscriptionId }, [
        row('DES1', { account_identifier: 'design@acme.vn', kind: 'shared' }),
        row('DES2'),
      ]);
      expect(preview.summary).toMatchObject({ valid: 1, errors: 1, byCode: { SHARED_ACCOUNT_NOT_SUPPORTED: 1 } });
      const confirmed = h.dataOf<{ import: ImportWire }>(await h.confirm(preview.id, 1).expect(200)).import;
      expect(confirmed.result?.created).toBe(1);
      expect(await h.assignmentsOf({ subscriptionId })).toHaveLength(1);

      const again = await h.written({ subscriptionId }, [row('DES1'), row('DES3'), row('DES4')]);
      expect(again.import.result?.created).toBe(3);
      expect(await h.assignmentsOf({ subscriptionId })).toHaveLength(4);
    });
  });

  describe('AC-11, AC-12: which plans take a baseline and how', () => {
    it('writes K1 and K2 rows as ordinary assignments on company accounts', async () => {
      await h.person('KIN1');
      const k1 = await h.subscription(5, 'K1');
      const k2 = await h.subscription(5, 'K2');

      expect((await h.written({ subscriptionId: k1 }, [row('KIN1')])).import.result?.created).toBe(1);
      expect((await h.written({ subscriptionId: k2 }, [row('KIN1')])).import.result?.created).toBe(1);
    });

    it('turns away a K4 plan: its key and its company device are another item', async () => {
      const k4 = await h.subscription(5, 'K4');

      const response = await h.upload({ subscriptionId: k4 }, h.file([row('E-OWN')])).expect(422);

      expect(h.codeOf(response)).toBe('SEAT_BASELINE.PLAN_NOT_SUPPORTED');
      expect(h.detailsOf(response)).toEqual({ provisioningType: 'K4' });
    });

    it('takes an internal plan with no subscription, no seats bought and no limit on the rows (AC-12)', async () => {
      const planId = await h.plan('K5');
      await h.crowd('KFIVE', 30);

      const preview = await h.preview(
        { planId },
        Array.from({ length: 30 }, (_, index) => row(`KFIVE${index}`)),
      );

      expect(preview.summary).toMatchObject({ valid: 30, errors: 0, seats: null });
      expect(preview.target).toMatchObject({ kind: 'PLAN', subscriptionId: null, planId, provisioningType: 'K5' });
      const written = h.dataOf<{ import: ImportWire }>(await h.confirm(preview.id, 1).expect(200)).import;
      expect(written.result).toEqual({ created: 30, errors: 0, occupied: null, free: null });
      const kept = await h.assignmentsOf({ planId });
      expect(kept).toHaveLength(30);
      expect(kept.every((assignment) => assignment.subscriptionId === null)).toBe(true);
    });

    it('refuses a paid plan named by itself, a target that is neither or both, one that does not exist, and a subscription with no quantity', async () => {
      const subscriptionId = await h.subscription(5);
      const planOfSubscription = (
        await h.ctx.sql.query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [subscriptionId])
      ).rows[0].plan_id;
      const unknown = await h.subscription(null);
      const bytes = h.file([row('E-OWN')]);

      expect(h.detailsOf(await h.upload({ planId: planOfSubscription }, bytes).expect(422))).toEqual({
        problem: 'PLAN_NEEDS_SUBSCRIPTION',
      });
      expect(h.detailsOf(await h.upload({}, bytes).expect(422))).toEqual({ problem: 'NEITHER' });
      expect(h.detailsOf(await h.upload({ subscriptionId, planId: planOfSubscription }, bytes).expect(422))).toEqual({
        problem: 'BOTH',
      });
      expect(h.codeOf(await h.upload({ subscriptionId: randomUUID() }, bytes).expect(404))).toBe(
        'SUBSCRIPTION.NOT_FOUND',
      );
      expect(h.codeOf(await h.upload({ planId: randomUUID() }, bytes).expect(404))).toBe('PLAN.NOT_FOUND');
      expect(h.codeOf(await h.upload({ subscriptionId: unknown }, bytes).expect(409))).toBe(
        'SEAT_BASELINE.QUANTITY_UNKNOWN',
      );
    });
  });

  describe('the file as a whole', () => {
    it.each([
      ['no file', null, 'SEAT_BASELINE_IMPORT.FILE_REQUIRED'],
      ['an empty file', Buffer.alloc(0), 'SEAT_BASELINE_IMPORT.FILE_EMPTY'],
      ['a file that is not text', Buffer.from([0x50, 0x4b, 0x00, 0x03, 0x04]), 'SEAT_BASELINE_IMPORT.FILE_NOT_TEXT'],
      ['a header only', Buffer.from('employee_code,account_identifier\n'), 'SEAT_BASELINE_IMPORT.FILE_EMPTY'],
      [
        'a file without the identifier column',
        Buffer.from('employee_code,kind\nE1,personal\n'),
        'SEAT_BASELINE_IMPORT.FILE_MISSING_COLUMNS',
      ],
      [
        'a table that cannot be read',
        Buffer.from('employee_code,account_identifier\nE1,"x\n'),
        'SEAT_BASELINE_IMPORT.FILE_UNREADABLE',
      ],
    ])('turns away %s with %s', async (_name, bytes, code) => {
      const subscriptionId = await h.subscription(5);

      expect(h.codeOf(await h.upload({ subscriptionId }, bytes).expect(422))).toBe(code);
    });

    it('turns away more than a thousand rows, and lists the columns it does not use', async () => {
      const subscriptionId = await h.subscription(5);
      const many = Buffer.from(
        `employee_code,account_identifier\n${Array.from({ length: 1001 }, (_, index) => `X${index},x${index}@acme.vn`).join('\n')}`,
      );

      expect(h.codeOf(await h.upload({ subscriptionId }, many).expect(422))).toBe(
        'SEAT_BASELINE_IMPORT.FILE_TOO_MANY_ROWS',
      );
      const preview = h.dataOf<ImportWire>(
        await h
          .upload({ subscriptionId }, Buffer.from('employee_code,account_identifier,notes\nNOBODY,n@acme.vn,hello\n'))
          .expect(201),
      );
      expect(preview.ignoredColumns).toEqual(['notes']);
      expect(preview.summary.byCode).toEqual({ EMPLOYEE_NOT_FOUND: 1 });
    });

    it('refuses the people it cannot find, and one who has left, with the reason on the row', async () => {
      const subscriptionId = await h.subscription(5);
      const left = await h.person('LEFT1');
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left]);

      const preview = await h.preview({ subscriptionId }, [row('NOBODY9'), row('LEFT1')]);

      expect(preview.summary.byCode).toEqual({ EMPLOYEE_NOT_FOUND: 1, EMPLOYEE_NOT_ACTIVE: 1 });
    });
  });

  describe('confirming once', () => {
    it('answers the same key again with the same result and writes once, and another key is refused with the result', async () => {
      const subscriptionId = await h.subscription(10);
      await h.person('ONC1');
      const preview = await h.preview({ subscriptionId }, [row('ONC1')]);

      const first = await h.confirm(preview.id, 1, 'key-0000001').expect(200);
      const again = await h.confirm(preview.id, 1, 'key-0000001').expect(200);
      const other = await h.confirm(preview.id, 1, 'key-0000002').expect(409);

      expect(h.dataOf<{ replayed: boolean }>(first).replayed).toBe(false);
      expect(h.dataOf<{ replayed: boolean }>(again).replayed).toBe(true);
      expect(h.codeOf(other)).toBe('SEAT_BASELINE_IMPORT.ALREADY_CONFIRMED');
      expect(await h.assignmentsOf({ subscriptionId })).toHaveLength(1);
    });

    it('writes once when the same confirmation arrives twice at once', async () => {
      const subscriptionId = await h.subscription(10);
      await h.crowd('PAR', 2);
      const preview = await h.preview({ subscriptionId }, [row('PAR0'), row('PAR1')]);

      const [a, b] = await Promise.all([
        h.confirm(preview.id, 1, 'key-parallel'),
        h.confirm(preview.id, 1, 'key-parallel'),
      ]);

      expect([a.status, b.status]).toEqual([200, 200]);
      expect([h.dataOf<{ replayed: boolean }>(a).replayed, h.dataOf<{ replayed: boolean }>(b).replayed].sort()).toEqual(
        [false, true],
      );
      expect(await h.assignmentsOf({ subscriptionId })).toHaveLength(2);
    });

    it('refuses a preview version that is not the current one, a cancelled import, and an expired one', async () => {
      const subscriptionId = await h.subscription(10);
      await h.person('STA1');
      const outdated = await h.preview({ subscriptionId }, [row('STA1')]);
      expect(h.codeOf(await h.confirm(outdated.id, 7).expect(409))).toBe('SEAT_BASELINE_IMPORT.PREVIEW_OUTDATED');

      await request(h.server())
        .post(`/api/v1/seat-baseline-imports/${outdated.id}/cancel`)
        .set(h.as(h.it1))
        .expect(200);
      await request(h.server())
        .post(`/api/v1/seat-baseline-imports/${outdated.id}/cancel`)
        .set(h.as(h.it1))
        .expect(200);
      expect(h.codeOf(await h.confirm(outdated.id, 1).expect(409))).toBe('SEAT_BASELINE_IMPORT.CANCELLED');

      const expired = await h.preview({ subscriptionId }, [row('STA1')]);
      await h.ctx.sql.query(`UPDATE seat_baseline_imports SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
        expired.id,
      ]);
      expect(h.codeOf(await h.confirm(expired.id, 1).expect(409))).toBe('SEAT_BASELINE_IMPORT.EXPIRED');
      expect(await h.assignmentsOf({ subscriptionId })).toEqual([]);
    });

    it('refuses to cancel an import that was written', async () => {
      const subscriptionId = await h.subscription(10);
      await h.person('STA2');
      const { preview } = await h.written({ subscriptionId }, [row('STA2')]);

      const response = await request(h.server())
        .post(`/api/v1/seat-baseline-imports/${preview.id}/cancel`)
        .set(h.as(h.it1))
        .expect(409);

      expect(h.codeOf(response)).toBe('SEAT_BASELINE_IMPORT.NOT_PREVIEW');
    });

    it('writes nothing when the data changed since the preview, and names the rows that would now be judged differently', async () => {
      const subscriptionId = await h.subscription(10);
      const leaving = await h.person('CHG1');
      await h.person('CHG2');
      const preview = await h.preview({ subscriptionId }, [row('CHG1'), row('CHG2')]);
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [leaving]);

      const response = await h.confirm(preview.id, 1).expect(409);

      expect(h.codeOf(response)).toBe('SEAT_BASELINE_IMPORT.PREVIEW_STALE');
      expect(h.detailsOf(response)).toEqual({ changedLines: [2] });
      expect(await h.assignmentsOf({ subscriptionId })).toEqual([]);
      expect(
        h.dataOf<ImportWire>(
          await request(h.server()).get(`/api/v1/seat-baseline-imports/${preview.id}`).set(h.as(h.it1)).expect(200),
        ).status,
      ).toBe('PREVIEW');
    });

    it('lets only one of two previews that each fit alone be written: the seats bought are never exceeded', async () => {
      const subscriptionId = await h.subscription(3);
      await h.crowd('RAC', 4);
      const a = await h.preview({ subscriptionId }, [row('RAC0'), row('RAC1')]);
      const b = await h.preview({ subscriptionId }, [row('RAC2'), row('RAC3')]);

      const [first, second] = await Promise.all([h.confirm(a.id, 1), h.confirm(b.id, 1)]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
      const refused = first.status === 409 ? first : second;
      expect(h.codeOf(refused)).toBe('SEAT_BASELINE_IMPORT.PREVIEW_STALE');
      expect(await h.assignmentsOf({ subscriptionId })).toHaveLength(2);
    });
  });

  describe('who may import', () => {
    it('refuses Finance, an employee and the Super Admin, and reads and writes nothing for them', async () => {
      const subscriptionId = await h.subscription(10);
      const before = await h.count('seat_baseline_imports');
      const bytes = h.file([row('E-OWN')]);

      for (const account of [h.finance, h.employee]) {
        expect(h.codeOf(await h.upload({ subscriptionId }, bytes, account).expect(403))).toBe(
          'AUTHORIZATION.FORBIDDEN',
        );
      }
      expect(
        h.codeOf(
          await request(h.server())
            .post('/api/v1/seat-baseline-imports')
            .set({ Authorization: `Bearer ${h.admin}` })
            .field('subscriptionId', subscriptionId)
            .attach('file', bytes, 'seats.csv')
            .expect(403),
        ),
      ).toBe('AUTHORIZATION.FORBIDDEN');
      expect(await h.count('seat_baseline_imports')).toBe(before);
    });
  });
});
