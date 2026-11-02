import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { SpendingApproverWaitListener } from '../../../src/modules/budgets/budget/spending-approver-wait.listener';
import { VersionHistoryViewService } from '../../../src/modules/budgets/version/version-history-view.service';
import { BudgetNotAHistoryReaderError } from '../../../src/modules/budgets/budget/budget.errors';
import { BudgetHarness, type HistoryEntryWire, type Pageable, type VersionWire } from '../../support/budget-harness';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.10 (F66, `QĐ-91d`, spec J.4): every edit of the figures, of a line, of the lines
 * added or imported and of the window of a line writes the Audit Trail with what it really was and is, and one entry of the history of
 * the version in the same transaction; the history is read by Finance and by whoever decides the version.
 */
describe('the history of the edits of a version (integration, real PostgreSQL)', () => {
  let boss: Person;
  let bystander: Person;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1')); // the Spending Approver does not head a department (QĐ-93b)
    await h.setRole('SPENDING_APPROVER', boss);
    bystander = await h.staff(await h.departmentWithUnit('P-SBS'), 'SBS-S1');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const waiting = async () => {
    counter += 1;
    const u = await h.departmentWithHead(`P-HI${counter}`);

    return { ...u, proposal: await h.budgetProposed(u.head, u.department.unitId) };
  };
  /** A version of a department that was sent back to Finance by the approver. */
  const sentBack = async () => {
    const w = await waiting();
    const version = await h.built(w.proposal.id);
    await h.sendVersion(version.id).expect(200);
    await h.decideVersion(version.id, { decision: 'REQUEST_CHANGES', reason: 'Look again' }, boss.account).expect(200);

    return { ...w, version };
  };
  const history = async (id: string, account = h.finance, query: Record<string, string | number> = {}) =>
    h.dataOf<Pageable<HistoryEntryWire>>(await h.versionHistory(id, account, query).expect(200));
  const auditOf = async (id: string, action: string) =>
    (await h.auditEvents('BUDGET_VERSION', id)).filter((event) => event.action === action);

  describe('what an edit writes', () => {
    it('writes one Audit Trail record with the real values before and after, and one entry of the history, for each edit', async () => {
      const s = await sentBack();
      const csv = [
        'cost_center_code,description,amount,window_from,window_to,service_period_months,repeat_cycle',
        `${s.version.costCenter.code},Imported one,1000,${h.next}-05-01,${h.next}-05-31,12,ANNUAL`,
        `${s.version.costCenter.code},Imported two,2000,${h.next}-06-01,${h.next}-06-30,12,ANNUAL`,
      ].join('\n');

      await h.updateVersion(s.version.id, { reserve: h.money(10_000_000) }).expect(200);
      await h
        .updateLine(s.version.id, 1, { amount: h.money(18_000_000), adjustmentReason: 'The price went down' })
        .expect(200);
      await h.addLines(s.version.id, [h.line({ description: 'Extra seats' })]).expect(201);
      await h.importLines(s.version.id, csv).expect(201);

      const [updated] = await auditOf(s.version.id, 'BUDGET_VERSION.UPDATED');
      expect(updated).toMatchObject({
        before: { reserve: '20000000', total: '80000000' },
        after: { reserve: '10000000', total: '70000000' },
      });
      const [changed] = await auditOf(s.version.id, 'BUDGET_VERSION.LINE_CHANGED');
      expect(changed).toMatchObject({
        before: { amount: '50000000', adjustmentReason: null },
        after: { position: 1, amount: '18000000', adjustmentReason: 'The price went down' },
      });
      expect((await auditOf(s.version.id, 'BUDGET_VERSION.LINES_ADDED'))[0].after).toMatchObject({
        fromPosition: 3,
        toPosition: 3,
      });
      expect((await auditOf(s.version.id, 'BUDGET_VERSION.LINES_IMPORTED'))[0].after).toMatchObject({
        added: 2,
        fromPosition: 4,
        toPosition: 5,
      });
      const entries = (await history(s.version.id)).items;
      expect(entries.map((entry) => [entry.seq, entry.kind])).toEqual([
        [4, 'LINES_IMPORTED'],
        [3, 'LINES_ADDED'],
        [2, 'LINE_UPDATED'],
        [1, 'FIGURES_UPDATED'],
      ]);
      expect(entries[3]).toMatchObject({
        versionState: 'CHANGES_REQUESTED',
        position: null,
        lines: null,
        currency: h.reporting,
        changes: [
          { field: 'reserve', before: '20000000', after: '10000000' },
          { field: 'total', before: '80000000', after: '70000000' },
        ],
      });
      expect(entries[2]).toMatchObject({
        position: 1,
        changes: [
          { field: 'amount', before: '50000000', after: '18000000' },
          { field: 'adjustmentReason', before: null, after: 'The price went down' },
        ],
      });
      expect(entries[1]).toMatchObject({
        position: null,
        lines: { fromPosition: 3, toPosition: 3, count: 1 },
        changes: [],
      });
      expect(entries[0]).toMatchObject({ lines: { fromPosition: 4, toPosition: 5, count: 2 } });
      // The values the entries keep are the ones the reader finds in the version after the edit.
      const lines = h.dataOf<Pageable<{ position: number; amount: { amount: string } }>>(
        await h.versionLines(s.version.id).expect(200),
      ).items;
      expect(lines.find((line) => line.position === 1)?.amount.amount).toBe('18000000');
      expect(lines.map((line) => line.position)).toEqual([1, 2, 3, 4, 5]);
    });

    it('keeps the record of the move of a window, and adds an entry for it', async () => {
      const w = await waiting();
      const current = await h.current(w.proposal.id);

      await h
        .moveWindow(current.id, 2, {
          windowFrom: `${h.next}-06-01`,
          windowTo: `${h.next}-08-31`,
          reason: 'The purchase slipped',
        })
        .expect(200);

      expect(await h.budgetRows(`budget_version_line_changes WHERE version_id = '${current.id}'`)).toBe(1);
      const [entry] = (await history(current.id)).items;
      expect(entry).toMatchObject({
        kind: 'WINDOW_MOVED',
        versionState: 'APPROVED',
        position: 2,
        changes: [
          { field: 'windowFrom', before: `${h.next}-04-01`, after: `${h.next}-06-01` },
          { field: 'windowTo', before: `${h.next}-06-30`, after: `${h.next}-08-31` },
        ],
      });
      const [moved] = await auditOf(current.id, 'BUDGET_VERSION.WINDOW_MOVED');
      expect(moved).toMatchObject({
        before: { windowFrom: `${h.next}-04-01`, windowTo: `${h.next}-06-30` },
        after: { position: 2, windowTo: `${h.next}-08-31`, reason: 'The purchase slipped' },
      });
    });

    it('writes neither an entry nor a number when the edit gave the values the version already had', async () => {
      const s = await sentBack();

      await h.updateVersion(s.version.id, { highValuePercent: s.version.highValuePercent }).expect(200);

      expect((await history(s.version.id)).items).toEqual([]);
    });

    it('leaves nothing when the transaction fails half way: no entry, and the version as it was', async () => {
      const s = await sentBack();
      const before = (
        await h.ctx.sql.query<Record<string, unknown>>(`SELECT * FROM budget_versions WHERE id = $1`, [s.version.id])
      ).rows[0];
      await h.ctx.sql.query(`
        CREATE FUNCTION budget_test_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.action = 'BUDGET_VERSION.UPDATED' THEN RAISE EXCEPTION 'the audit of this edit is refused by the test'; END IF;
          RETURN NEW;
        END $$`);
      await h.ctx.sql.query(
        `CREATE TRIGGER budget_test_refuse_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION budget_test_refuse_audit()`,
      );
      try {
        const failed = await h.updateVersion(s.version.id, { reserve: h.money(10_000_000) });

        expect(failed.status).toBeGreaterThanOrEqual(500);
      } finally {
        await h.ctx.sql.query(`DROP TRIGGER budget_test_refuse_audit ON audit_events`);
        await h.ctx.sql.query(`DROP FUNCTION budget_test_refuse_audit()`);
      }

      expect(await h.budgetRows(`budget_version_history WHERE version_id = '${s.version.id}'`)).toBe(0);
      expect((await h.ctx.sql.query(`SELECT * FROM budget_versions WHERE id = $1`, [s.version.id])).rows[0]).toEqual(
        before,
      );
      expect(
        (await h.ctx.sql.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'budget_test_refuse_audit'`)).rowCount,
      ).toBe(0);
    });

    it('is only ever appended to: the database refuses to change or remove an entry', async () => {
      const s = await sentBack();
      await h.updateVersion(s.version.id, { reserve: h.money(10_000_000) }).expect(200);

      await expect(
        h.ctx.sql.query(`UPDATE budget_version_history SET seq = 9 WHERE version_id = $1`, [s.version.id]),
      ).rejects.toThrow(/append-only/);
      await expect(
        h.ctx.sql.query(`DELETE FROM budget_version_history WHERE version_id = $1`, [s.version.id]),
      ).rejects.toThrow(/append-only/);
    });
  });

  /**
   * R4 D-6: the table refuses an `after` over 262 144 bytes of text. 200 lines with the longest description and note are about 320 000
   * bytes, so the entries are cut by bytes as well as by count; a legal import is kept whole in the history, never a 500.
   */
  describe('the size of an entry (R4 D-6)', () => {
    const HEADER = 'cost_center_code,description,amount,window_from,window_to,service_period_months,repeat_cycle,note';
    const row = (code: string, index: number, description: string, note: string) =>
      `${code},${description},${1000 + index},${h.next}-05-01,${h.next}-05-31,12,ANNUAL,${note}`;

    it('keeps 200 imported lines with the longest description and note as several entries that follow one another, and answers 201', async () => {
      const s = await sentBack();
      const csv = [
        HEADER,
        ...Array.from({ length: 200 }, (_, index) =>
          row(s.version.costCenter.code, index, 'd'.repeat(200), 'n'.repeat(1000)),
        ),
      ].join('\n');

      const imported = await h.importLines(s.version.id, csv);

      expect(imported.status).toBe(201);
      expect(h.dataOf<{ result: { added: number; rejected: number } }>(imported).result).toMatchObject({
        added: 200,
        rejected: 0,
      });
      const entries = (await history(s.version.id, h.finance, { pageSize: 100 })).items
        .filter((entry) => entry.kind === 'LINES_IMPORTED')
        .sort((a, b) => a.seq - b.seq);
      expect(entries.length).toBeGreaterThan(1);
      let next = 3;
      for (const entry of entries) {
        expect(entry.lines).toMatchObject({ fromPosition: next });
        expect(entry.lines?.count).toBeLessThanOrEqual(200);
        next = (entry.lines?.toPosition ?? 0) + 1;
      }
      expect(next).toBe(203);
      expect(entries.reduce((sum, entry) => sum + (entry.lines?.count ?? 0), 0)).toBe(200);
      // The Audit Trail says one import, as before: the cut is how the history keeps it, not what happened.
      expect((await auditOf(s.version.id, 'BUDGET_VERSION.LINES_IMPORTED'))[0].after).toMatchObject({
        added: 200,
        fromPosition: 3,
        toPosition: 202,
      });
    });

    it('refuses as a row a description or a note longer than the form takes, and adds and records the rows that are right', async () => {
      const s = await sentBack();
      const code = s.version.costCenter.code;
      const csv = [
        HEADER,
        row(code, 1, 'Right', 'A note'),
        row(code, 2, 'd'.repeat(201), 'A note'),
        row(code, 3, 'Right too', 'n'.repeat(1001)),
        // The file reader takes a cell of 2 000 characters at most (`parseCsv`): the longest description it can hand over.
        row(code, 4, 'x'.repeat(2000), ''),
      ].join('\n');
      const before = (await history(s.version.id)).items.length;

      const imported = await h.importLines(s.version.id, csv);

      expect(imported.status).toBe(201);
      expect(
        h.dataOf<{ result: { added: number; rejected: number; errors: { row: number; code: string }[] } }>(imported)
          .result,
      ).toEqual({
        added: 1,
        rejected: 3,
        errors: [
          { row: 3, code: 'DESCRIPTION_TOO_LONG' },
          { row: 4, code: 'NOTE_TOO_LONG' },
          { row: 5, code: 'DESCRIPTION_TOO_LONG' },
        ],
      });
      const entries = (await history(s.version.id)).items;
      expect(entries).toHaveLength(before + 1);
      expect(entries[0]).toMatchObject({ kind: 'LINES_IMPORTED', lines: { fromPosition: 3, toPosition: 3, count: 1 } });
    });
  });

  describe('who reads it (US-06-09 AC-20)', () => {
    it('is read by Finance and by the spending approver who decides the version, and by nobody else', async () => {
      const s = await sentBack();
      await h.updateVersion(s.version.id, { reserve: h.money(10_000_000) }).expect(200);

      const finance = await h.versionHistory(s.version.id, h.finance);
      const approver = await h.versionHistory(s.version.id, boss.account);
      const head = await h.versionHistory(s.version.id, s.head.account);
      const itAdmin = await h.versionHistory(s.version.id, h.it1);
      const other = await h.versionHistory(s.version.id, bystander.account);

      expect([finance.status, approver.status, head.status, itAdmin.status, other.status]).toEqual([
        200, 200, 403, 403, 403,
      ]);
      expect(h.codeOf(head)).toBe('AUTHORIZATION.FORBIDDEN');
    });

    it('answers 404 for a version that is not there, to Finance and to the approver; and refuses a caller that holds no role in the service itself', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      const service = h.ctx.app.get(VersionHistoryViewService, { strict: false });
      const s = await sentBack();

      const finance = await h.versionHistory(missing, h.finance);
      const approver = await h.versionHistory(missing, boss.account);
      const head = await h.versionHistory(missing, s.head.account);

      expect([finance.status, approver.status, head.status]).toEqual([404, 404, 403]);
      expect(h.codeOf(finance)).toBe('BUDGET.VERSION_NOT_FOUND');
      await expect(
        service.list(h.principalOf(s.head.account, ['MANAGER']), s.version.id, { page: 1, pageSize: 20 }),
      ).rejects.toBeInstanceOf(BudgetNotAHistoryReaderError);
    });
  });

  describe('how it is paged and shown', () => {
    it('is newest first, in pages of at most a hundred, with the total; a page past the end is empty', async () => {
      const s = await sentBack();
      for (let percent = 1; percent <= 25; percent += 1) {
        await h.updateVersion(s.version.id, { highValuePercent: percent }).expect(200);
      }

      const first = await history(s.version.id, h.finance, { pageSize: 10 });
      const third = await history(s.version.id, h.finance, { pageSize: 10, page: 3 });
      const all = await history(s.version.id, h.finance, { pageSize: 100 });
      const past = await history(s.version.id, h.finance, { page: 99 });

      expect(first.items.map((entry) => entry.seq)).toEqual([25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
      expect(third.items.map((entry) => entry.seq)).toEqual([5, 4, 3, 2, 1]);
      expect(all.items).toHaveLength(25);
      expect(all.pagination).toMatchObject({ page: 1, pageSize: 100, totalItems: 25, totalPages: 1 });
      expect(past).toMatchObject({ items: [], pagination: { totalItems: 25 } });
      expect(all.items.every((entry) => entry.changes.length <= 16)).toBe(true);
      for (const size of [101, 0]) {
        expect(h.codeOf(await h.versionHistory(s.version.id, h.finance, { pageSize: size }).expect(422))).toBe(
          'VALIDATION_ERROR',
        );
      }
    });

    it('shows nothing of who did it but their name, and nothing of the Audit Trail, the session or the role', async () => {
      const s = await sentBack();
      await h.updateVersion(s.version.id, { reserve: h.money(10_000_000) }).expect(200);

      const [entry] = (await history(s.version.id)).items;

      expect(Object.keys(entry).sort()).toEqual(
        ['at', 'by', 'changes', 'currency', 'kind', 'lines', 'position', 'seq', 'versionState'].sort(),
      );
      expect(entry.by.id).toBe(h.finance.employeeId);
      expect(typeof entry.by.name).toBe('string');
      expect(JSON.stringify(entry)).not.toMatch(/correlation|session|roles|FINANCE/i);
    });
  });

  describe('who decides a version (US-06-11 AC-12, QĐ-93d(1))', () => {
    const wireOf = async (id: string) =>
      h.dataOf<{ version: VersionWire }>(await h.versionOf(id, h.finance).expect(200)).version;

    it('a version waits for the spending approver and nobody else may decide', async () => {
      const w = await waiting();
      const version = await h.built(w.proposal.id);
      await h.clearRole('SPENDING_APPROVER');
      try {
        await h.sendVersion(version.id).expect(200);

        expect(await wireOf(version.id)).toMatchObject({ state: 'SENT', waitingReason: 'NO_SPENDING_APPROVER' });
        // Nobody takes the place of the approver: not Finance, the head, an IT Admin, nor the person who held the old role of the substitute.
        for (const account of [h.finance, w.head.account, h.it1, bystander.account]) {
          await h.decideVersion(version.id, { decision: 'APPROVE' }, account).expect(403);
        }
        expect(await wireOf(version.id)).toMatchObject({ state: 'SENT' });
      } finally {
        await h.setRole('SPENDING_APPROVER', boss);
      }

      expect(await wireOf(version.id)).toMatchObject({ state: 'SENT', waitingReason: null });
      await h.decideVersion(version.id, { decision: 'APPROVE' }, boss.account).expect(200);
      expect(await wireOf(version.id)).toMatchObject({ state: 'APPROVED', waitingReason: null });
    });

    it('is decided by the spending approver, and by nobody else, when somebody else proposed the budget', async () => {
      const w = await waiting();
      const version = await h.built(w.proposal.id);
      await h.sendVersion(version.id).expect(200);

      await h.decideVersion(version.id, { decision: 'APPROVE' }, bystander.account).expect(403);
      await h.decideVersion(version.id, { decision: 'APPROVE' }, boss.account).expect(200);
    });

    it('is decided by nobody when the approver sent the proposal behind it (data of before QĐ-93): the approver is refused as the party, no substitute decides', async () => {
      const w = await waiting();
      const version = await h.built(w.proposal.id);
      await h.sendVersion(version.id).expect(200);
      const submitter = (
        await h.ctx.sql.query<{ id: string }>(
          `SELECT submitted_by_employee_id AS id FROM budget_proposals WHERE id = $1`,
          [w.proposal.id],
        )
      ).rows[0].id;
      await h.ctx.sql.query(`UPDATE budget_proposals SET submitted_by_employee_id = $2 WHERE id = $1`, [
        w.proposal.id,
        boss.employeeId,
      ]);
      try {
        const own = await h.decideVersion(version.id, { decision: 'APPROVE' }, boss.account).expect(403);
        await h.decideVersion(version.id, { decision: 'APPROVE' }, bystander.account).expect(403);

        expect(h.codeOf(own)).toBe('BUDGET.CONFLICT_OF_INTEREST');
        expect(await wireOf(version.id)).toMatchObject({ state: 'SENT' });
      } finally {
        // An open proposal sent by the approver keeps them from being granted the role again (QD-93d(3)): give it back.
        await h.ctx.sql.query(`UPDATE budget_proposals SET submitted_by_employee_id = $2 WHERE id = $1`, [
          w.proposal.id,
          submitter,
        ]);
      }
    });

    it('writes only the spending approver as the role of a decision', async () => {
      const w = await waiting();
      const version = await h.built(w.proposal.id);
      await h.sendVersion(version.id).expect(200);

      await h.decideVersion(version.id, { decision: 'REJECT', reason: 'No' }, boss.account).expect(200);

      const { rows } = await h.ctx.sql.query<{ decider_role: string }>(
        `SELECT decider_role FROM budget_version_decisions WHERE version_id = $1`,
        [version.id],
      );
      expect(rows).toEqual([{ decider_role: 'SPENDING_APPROVER' }]);
    });
  });

  describe('the Super Admin is told when a sent version waits for a spending approver (D-S16, M7, US-06-11 AC-12)', () => {
    interface AlertRow {
      recipient_employee_id: string;
      params: Record<string, unknown>;
      event_key: string;
    }
    const superAdmin = async () =>
      (
        await h.ctx.sql.query<{ employee_id: string }>(
          `SELECT u.employee_id FROM role_grants g JOIN app_users u ON u.id = g.app_user_id
            WHERE g.role = 'SUPER_ADMIN' AND g.revoked_at IS NULL`,
        )
      ).rows[0].employee_id;
    const alertsOf = async (versionId: string) =>
      (
        await h.ctx.sql.query<AlertRow>(
          `SELECT recipient_employee_id, params, event_key FROM in_app_notifications
            WHERE code = 'CONTROLLED_WAIT_ALERT' AND subject_id = $1 ORDER BY created_at, id`,
          [versionId],
        )
      ).rows;
    const sentVersion = async () => {
      const w = await waiting();
      const version = await h.built(w.proposal.id);
      await h.sendVersion(version.id).expect(200);

      return version;
    };

    it('tells the Super Admin once when a sent version waits for a spending approver', async () => {
      const w = await waiting();
      const version = await h.built(w.proposal.id);
      await h.clearRole('SPENDING_APPROVER');
      try {
        await h.sendVersion(version.id).expect(200);

        const alerts = await alertsOf(version.id);
        expect(alerts).toHaveLength(1);
        expect(alerts[0].recipient_employee_id).toBe(await superAdmin());
        expect(alerts[0].params).toEqual({
          versionId: version.id,
          costCenterId: version.costCenter.id,
          year: version.year,
          waitingReason: 'NO_SPENDING_APPROVER',
          configurationHint: 'CONFIGURE_SPENDING_APPROVER',
        });
        expect(alerts[0].event_key).toMatch(
          new RegExp(`^CONTROLLED_WAIT_ALERT:BUDGET_VERSION:${version.id}:sent:\\d+$`),
        );
        // Nobody holds the role to be told that a version awaits their decision, and nobody else is told in their place.
        expect(await h.budgetNoticesOf('BUDGET_VERSION_AWAITING_DECISION', version.id)).toEqual([]);
      } finally {
        await h.setRole('SPENDING_APPROVER', boss);
      }
    });

    it('says nothing while somebody holds the role, and tells once when the role is taken back with a version still sent', async () => {
      const version = await sentVersion();
      expect(await alertsOf(version.id)).toEqual([]);

      await h.clearRole('SPENDING_APPROVER');
      try {
        const alerts = await alertsOf(version.id);
        expect(alerts).toHaveLength(1);
        expect(alerts[0].event_key).toMatch(new RegExp(`^CONTROLLED_WAIT_ALERT:BUDGET_VERSION:${version.id}:role:`));
        expect(alerts[0].recipient_employee_id).toBe(await superAdmin());
      } finally {
        await h.setRole('SPENDING_APPROVER', boss);
      }
    });

    it('writes one notice when the role change is heard twice', async () => {
      const version = await sentVersion();
      const listener = h.ctx.app.get(SpendingApproverWaitListener, { strict: false });
      const runner = h.ctx.app.get(TransactionRunner, { strict: false });
      const change = {
        id: 'heard-twice-1',
        role: 'SPENDING_APPROVER',
        fromEmployeeId: boss.employeeId,
        toEmployeeId: null,
      } as const;

      await runner.run((tx) => listener.onRoleChange(tx, change));
      await runner.run((tx) => listener.onRoleChange(tx, change));

      const alerts = (await alertsOf(version.id)).filter((alert) => alert.event_key.endsWith(':role:heard-twice-1'));
      expect(alerts).toHaveLength(1);
    });

    it('tells again for a new stretch of waiting after the role was given and taken back', async () => {
      const version = await sentVersion();

      await h.clearRole('SPENDING_APPROVER');
      await h.setRole('SPENDING_APPROVER', boss);
      await h.clearRole('SPENDING_APPROVER');
      try {
        const keys = (await alertsOf(version.id)).map((alert) => alert.event_key);
        expect(keys).toHaveLength(2);
        expect(new Set(keys).size).toBe(2);
      } finally {
        await h.setRole('SPENDING_APPROVER', boss);
      }
    });

    it('tells once when the spending approver leaves the company while a version is sent', async () => {
      const departing = await h.staff(await h.departmentWithUnit('P-LVB'), 'LVB-C9');
      await h.setRole('SPENDING_APPROVER', departing);
      try {
        const version = await sentVersion();
        expect(await alertsOf(version.id)).toEqual([]);

        await h.leaveCompany(departing);

        const alerts = await alertsOf(version.id);
        expect(alerts).toHaveLength(1);
        expect(alerts[0].event_key).toMatch(new RegExp(`^CONTROLLED_WAIT_ALERT:BUDGET_VERSION:${version.id}:left:`));
        // The role is taken back afterwards from a person who had left: the stretch began when they left, no second notice.
        await h.clearRole('SPENDING_APPROVER');
        expect(await alertsOf(version.id)).toHaveLength(1);
      } finally {
        await h.setRole('SPENDING_APPROVER', boss);
      }
    });
  });
});
