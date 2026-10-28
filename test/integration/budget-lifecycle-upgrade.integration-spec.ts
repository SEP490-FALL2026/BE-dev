import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { activateCostCenterLink, lastCompatibilityMigration } from '../support/compat-release';
import { stopCliProcesses } from '../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { expansionWorld, ExpansionWorld, sqlState } from '../support/expansion-world';
import { DEPLOY_TIMEOUT_MS, deployMigrations } from '../support/migration-history';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.7 (F62, F63, F36, F66, F67; spec I, J.1, J.2, J.4): the structure of the
 * annual budget lifecycle. The history is deployed through the compatibility release, the rows the old path of refusing a version
 * left behind are put there as that release's predecessor wrote them (a proposal given back with the refusal behind it), and the
 * final chain is deployed in one `migrate deploy`: the proposals are reconciled deterministically (R1, R2), the one Finance really
 * gave back is left alone, a draft of a withdrawn proposal is detached, and the new rules are the ones the database keeps.
 */
const AT = {
  returned: '2026-09-01T10:00:00Z',
  resent: '2026-09-02T10:00:00Z',
  sent: '2026-08-20T10:00:00Z',
};

describe('the budget lifecycle structure over rows of the old path (integration, PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: ExpansionWorld;
  const employee = (): string => world.ownerEmployeeId;
  const rows = {
    r1: { proposal: randomUUID(), version: randomUUID(), decision: randomUUID() },
    r2: { proposal: randomUUID(), version: randomUUID(), decision: randomUUID(), resent: randomUUID() },
    finance: randomUUID(),
    withdrawn: { proposal: randomUUID(), draft: randomUUID() },
    spare: { proposal: randomUUID(), version: randomUUID(), decision: randomUUID() },
  };
  let decisionsBefore = '';

  async function legacyReturn(
    ids: { proposal: string; version: string; decision: string },
    costCenter: string,
    year: number,
  ): Promise<void> {
    await sql.query(
      `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, total_minor, currency, submitted_by_employee_id,
          submitted_at, returned_reason, returned_by_employee_id, returned_at)
       VALUES ($1, $2, $3, $4, 'RETURNED', 1000, 'VND', $5, $6, 'not enough', $5, $7)`,
      [ids.proposal, world.organizationId, costCenter, year, employee(), AT.sent, AT.returned],
    );
    await sql.query(
      `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, proposal_id, base_minor, reserve_minor,
          total_minor, currency, high_value_percent, created_by_employee_id, sent_by_employee_id, sent_at)
       VALUES ($1, $2, $3, $4, 1, 'INITIAL', 'REJECTED', $5, 1000, 0, 1000, 'VND', 20, $6, $6, $7)`,
      [ids.version, world.organizationId, costCenter, year, ids.proposal, employee(), AT.sent],
    );
    await sql.query(
      `INSERT INTO budget_version_decisions (id, organization_id, version_id, decision, reason, decided_by_employee_id, total_minor, currency, decided_at)
       VALUES ($1, $2, $3, 'REJECTED', 'not enough', $4, 1000, 'VND', $5)`,
      [ids.decision, world.organizationId, ids.version, employee(), AT.returned],
    );
  }

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const before = await deployMigrations(database, { through: lastCompatibilityMigration() });
    if (before.code !== 0) throw new Error(`Deploying the compatibility history failed: ${before.stdout}`);
    world = await expansionWorld(sql);
    await activateCostCenterLink(sql, world.organizationId);

    await legacyReturn(rows.r1, world.costCenters.eng, 2026);
    await legacyReturn(rows.r2, world.costCenters.ops, 2026);
    await sql.query(
      `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, previous_proposal_id, total_minor, currency,
          submitted_by_employee_id, submitted_at)
       VALUES ($1, $2, $3, 2026, 'SUBMITTED', $4, 1200, 'VND', $5, $6)`,
      [rows.r2.resent, world.organizationId, world.costCenters.ops, rows.r2.proposal, employee(), AT.resent],
    );
    await legacyReturn(rows.spare, world.costCenters.eng, 2028);
    // A proposal that Finance really gave back (no refusal of a version behind it).
    await sql.query(
      `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, total_minor, currency, submitted_by_employee_id,
          submitted_at, returned_reason, returned_by_employee_id, returned_at)
       VALUES ($1, $2, $3, 2027, 'RETURNED', 900, 'VND', $4, $5, 'unclear lines', $4, $6)`,
      [rows.finance, world.organizationId, world.costCenters.eng, employee(), AT.sent, AT.returned],
    );
    // A proposal the head withdrew after Finance had made a draft from it.
    await sql.query(
      `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, total_minor, currency, submitted_by_employee_id,
          submitted_at, withdrawn_at)
       VALUES ($1, $2, $3, 2027, 'WITHDRAWN', 800, 'VND', $4, $5, $6)`,
      [rows.withdrawn.proposal, world.organizationId, world.costCenters.ops, employee(), AT.sent, AT.returned],
    );
    await sql.query(
      `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, proposal_id, base_minor, reserve_minor,
          total_minor, currency, high_value_percent, created_by_employee_id)
       VALUES ($1, $2, $3, 2027, 1, 'INITIAL', 'DRAFT', $4, 800, 0, 800, 'VND', 20, $5)`,
      [rows.withdrawn.draft, world.organizationId, world.costCenters.ops, rows.withdrawn.proposal, employee()],
    );
    decisionsBefore = (
      await sql.query<{ sum: string }>(
        `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS sum FROM budget_version_decisions t`,
      )
    ).rows[0].sum;

    const deploy = await deployMigrations(database);
    if (deploy.code !== 0) throw new Error(`Deploying the final release failed: ${deploy.stdout}\n${deploy.stderr}`);
  }, DEPLOY_TIMEOUT_MS * 3);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  describe('reconciling the proposals the old path gave back (spec J.2)', () => {
    const proposal = async (id: string) =>
      (
        await sql.query<{
          state: string;
          returned_reason: string | null;
          succeeded_at: Date | null;
          previous_proposal_id: string | null;
          successor_of_proposal_id: string | null;
        }>(
          `SELECT state, returned_reason, succeeded_at, previous_proposal_id, successor_of_proposal_id FROM budget_proposals WHERE id = $1`,
          [id],
        )
      ).rows[0];

    it('R1: nothing was sent after the return, so the proposal is reviewed again and the return is gone', async () => {
      expect(await proposal(rows.r1.proposal)).toEqual({
        state: 'REVIEWED',
        returned_reason: null,
        succeeded_at: null,
        previous_proposal_id: null,
        successor_of_proposal_id: null,
      });
    });

    it('R2: the one proposal that sent it again becomes its successor, and the return is gone', async () => {
      const returned = await proposal(rows.r2.proposal);
      const resent = await proposal(rows.r2.resent);
      expect(returned.state).toBe('REVIEWED');
      expect(returned.returned_reason).toBeNull();
      expect(returned.succeeded_at?.toISOString()).toBe(new Date(AT.resent).toISOString());
      expect(resent.state).toBe('SUBMITTED');
      expect(resent.previous_proposal_id).toBeNull();
      expect(resent.successor_of_proposal_id).toBe(rows.r2.proposal);
    });

    it('leaves the proposal Finance really gave back as it was, writes one SYSTEM audit record per changed proposal, and the refusals untouched', async () => {
      expect((await proposal(rows.finance)).state).toBe('RETURNED');
      const audit = await sql.query<{ resource_id: string; rule: string; actor_kind: string }>(
        `SELECT resource_id, after->>'rule' AS rule, actor_kind FROM audit_events
          WHERE action = 'BUDGET_PROPOSAL.LEGACY_REJECTION_RECONCILED' ORDER BY resource_id COLLATE "C"`,
      );
      // One record for each proposal that changes: the returned ones, and the proposal that sent one again (R2) becomes its successor.
      const expected = [
        [rows.r1.proposal, 'R1'],
        [rows.r2.proposal, 'R2'],
        [rows.r2.resent, 'R2'],
        [rows.spare.proposal, 'R1'],
      ].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      expect(audit.rows.map((row) => [row.resource_id, row.rule])).toEqual(expected);
      expect(audit.rows.every((row) => row.actor_kind === 'SYSTEM')).toBe(true);
      // The record of the returned proposal says what it was before (its own predecessor, not the resender's); the resender's says it stopped being a resubmission.
      const records = await sql.query<{
        resource_id: string;
        before: Record<string, unknown>;
        after: Record<string, unknown>;
      }>(
        `SELECT resource_id, before, after FROM audit_events
          WHERE action = 'BUDGET_PROPOSAL.LEGACY_REJECTION_RECONCILED' AND resource_id = ANY($1)`,
        [[rows.r2.proposal, rows.r2.resent]],
      );
      const byId = new Map(records.rows.map((row) => [row.resource_id, row]));
      expect(byId.get(rows.r2.proposal)?.before).toMatchObject({ state: 'RETURNED' });
      expect(byId.get(rows.r2.proposal)?.before.previousProposalId).not.toBe(rows.r2.proposal);
      expect(byId.get(rows.r2.resent)?.before).toMatchObject({ previousProposalId: rows.r2.proposal });
      expect(byId.get(rows.r2.resent)?.after).toMatchObject({ successorOfProposalId: rows.r2.proposal });
      const after = (
        await sql.query<{ sum: string }>(
          `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS sum FROM budget_version_decisions t`,
        )
      ).rows[0].sum;
      expect(after).toBe(decisionsBefore);
    });
  });

  describe('detaching the draft of a withdrawn proposal (F36, QĐ-91a)', () => {
    it('marks it detached from the moment of the withdrawal, keeps it a draft, and lets a new draft take its place', async () => {
      const { rows: found } = await sql.query<{ state: string; detached_at: Date | null }>(
        `SELECT state, detached_at FROM budget_versions WHERE id = $1`,
        [rows.withdrawn.draft],
      );
      expect(found[0].state).toBe('DRAFT');
      expect(found[0].detached_at?.toISOString()).toBe(new Date(AT.returned).toISOString());

      const next = randomUUID();
      await sql.query(
        `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, total_minor, currency, submitted_by_employee_id)
         VALUES ($1, $2, $3, 2027, 'SUBMITTED', 700, 'VND', $4)`,
        [next, world.organizationId, world.costCenters.ops, employee()],
      );
      expect(
        await sqlState(
          sql,
          `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, proposal_id, base_minor, reserve_minor,
              total_minor, currency, high_value_percent, created_by_employee_id)
           VALUES (gen_random_uuid(), $1, $2, 2027, 2, 'INITIAL', 'DRAFT', $3, 700, 0, 700, 'VND', 20, $4)`,
          [world.organizationId, world.costCenters.ops, next, employee()],
        ),
      ).toBeNull();
    });
  });

  describe('the proposal that follows a refused version (F63, spec J.1)', () => {
    const successor = (overrides: {
      costCenter?: string;
      year?: number;
      of?: string;
      previous?: string | null;
      state?: string;
    }) =>
      sqlState(
        sql,
        `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, previous_proposal_id, successor_of_proposal_id,
            total_minor, currency, submitted_by_employee_id)
         VALUES ($1, $2, $3, $4, $5::"BudgetProposalState", $6, $7, 500, 'VND', $8)`,
        [
          randomUUID(),
          world.organizationId,
          overrides.costCenter ?? world.costCenters.eng,
          overrides.year ?? 2026,
          overrides.state ?? 'SUBMITTED',
          overrides.previous ?? null,
          overrides.of ?? rows.r1.proposal,
          employee(),
        ],
      );

    it('refuses a successor of another Cost Center or year, of a proposal not reviewed, one that is not submitted, and one that is also a resubmission', async () => {
      expect(await successor({ costCenter: world.costCenters.ops })).toBe('23514');
      expect(await successor({ year: 2027 })).toBe('23514');
      expect(await successor({ of: rows.finance, year: 2027 })).toBe('23514');
      expect(await successor({ state: 'REVIEWED' })).toBe('23514');
      expect(await successor({ previous: rows.r1.proposal })).toBe('23514');
    });

    it('takes a valid successor, marks the proposal succeeded in the same statement, and refuses a second one', async () => {
      expect(await successor({})).toBeNull();
      const { rows: found } = await sql.query<{ succeeded: boolean }>(
        `SELECT succeeded_at IS NOT NULL AS succeeded FROM budget_proposals WHERE id = $1`,
        [rows.r1.proposal],
      );
      expect(found).toEqual([{ succeeded: true }]);
      expect(['23514', '23505']).toContain(await successor({}));
    });

    it('keeps the two links of a proposal fixed once written', async () => {
      expect(
        await sqlState(sql, `UPDATE budget_proposals SET successor_of_proposal_id = $2 WHERE id = $1`, [
          rows.r2.resent,
          rows.r1.proposal,
        ]),
      ).toBe('23514');
      expect(
        await sqlState(sql, `UPDATE budget_proposals SET succeeded_at = now() WHERE id = $1`, [rows.r2.proposal]),
      ).toBe('23514');
    });

    it('refuses at commit a proposal that says it was succeeded when none follows it', async () => {
      await sql.query('BEGIN');
      await sql.query(`UPDATE budget_proposals SET succeeded_at = now() WHERE id = $1`, [rows.spare.proposal]);
      let state: string | undefined;
      try {
        await sql.query('COMMIT');
      } catch (error) {
        state = (error as { code?: string }).code;
      }
      expect(state).toBe('23514');
      await sql.query('ROLLBACK').catch(() => undefined);
    });
  });

  describe('the version that follows a refused one (F63)', () => {
    const next = (overrides: {
      predecessor: string;
      costCenter?: string;
      year?: number;
      kind?: string;
      number: number;
    }) =>
      sqlState(
        sql,
        `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, proposal_id, rejected_predecessor_id,
            base_minor, reserve_minor, total_minor, currency, high_value_percent, created_by_employee_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::"BudgetVersionKind", 'DRAFT', $6, $7, 500, 0, 500, 'VND', 20, $8)`,
        [
          world.organizationId,
          overrides.costCenter ?? world.costCenters.eng,
          overrides.year ?? 2028,
          overrides.number,
          overrides.kind ?? 'INITIAL',
          rows.spare.proposal,
          overrides.predecessor,
          employee(),
        ],
      );

    it('refuses a predecessor of another Cost Center or year, one that is not refused, and a revision', async () => {
      expect(await next({ predecessor: rows.r1.version, number: 2 })).toBe('23514');
      expect(await next({ predecessor: rows.spare.version, costCenter: world.costCenters.ops, number: 2 })).toBe(
        '23514',
      );
      expect(await next({ predecessor: rows.withdrawn.draft, number: 2 })).toBe('23514');
      expect(await next({ predecessor: rows.spare.version, kind: 'REVISION', number: 2 })).not.toBeNull();
    });

    it('takes the version made again from the same proposal and refuses a second one after the same refusal', async () => {
      expect(await next({ predecessor: rows.spare.version, number: 2 })).toBeNull();
      expect(['23514', '23505']).toContain(await next({ predecessor: rows.spare.version, number: 3 }));
    });
  });

  describe('closing at the end of the year (F62, QĐ-91c)', () => {
    it('needs the moment for the closed states and allows the one that never was sent to expire as a draft', async () => {
      expect(
        await sqlState(sql, `UPDATE budget_versions SET state = 'EXPIRED' WHERE id = $1`, [rows.withdrawn.draft]),
      ).toBe('23514');
      expect(
        await sqlState(sql, `UPDATE budget_versions SET never_current = true WHERE id = $1`, [rows.withdrawn.draft]),
      ).toBe('23514');
      expect(
        await sqlState(sql, `UPDATE budget_proposals SET state = 'CLOSED_FISCAL_YEAR_ENDED' WHERE id = $1`, [
          rows.finance,
        ]),
      ).toBe('23514');
      expect(
        await sqlState(
          sql,
          `UPDATE budget_versions SET state = 'EXPIRED', expired_at = now(), never_current = true WHERE id = $1`,
          [rows.withdrawn.draft],
        ),
      ).toBeNull();
    });
  });

  describe('the history of the edits of a version (F66, spec J.4)', () => {
    const history = (seq: number, kind: string, shape: Record<string, string>) =>
      sqlState(
        sql,
        `INSERT INTO budget_version_history (id, organization_id, version_id, seq, kind, version_state, position, from_position, to_position,
            line_count, before, after, changed_by_employee_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::"BudgetVersionHistoryKind", 'DRAFT', ${shape.position ?? 'NULL'}, ${shape.from ?? 'NULL'},
            ${shape.to ?? 'NULL'}, ${shape.count ?? 'NULL'}, ${shape.before ?? 'NULL'}, ${shape.after ?? `'{}'::jsonb`}, $5)`,
        [world.organizationId, rows.r2.version, seq, kind, employee()],
      );

    it('takes a row of each shape, refuses a wrong shape and a duplicate position in the sequence', async () => {
      expect(await history(1, 'FIGURES_UPDATED', { before: `'{}'::jsonb` })).toBeNull();
      expect(await history(2, 'LINE_UPDATED', { before: `'{}'::jsonb`, position: '1' })).toBeNull();
      expect(await history(3, 'LINES_ADDED', { from: '1', to: '2', count: '2', after: `'[]'::jsonb` })).toBeNull();
      expect(await history(4, 'FIGURES_UPDATED', {})).toBe('23514');
      expect(await history(5, 'LINES_ADDED', { from: '1', to: '2', after: `'[]'::jsonb` })).toBe('23514');
      expect(await history(1, 'FIGURES_UPDATED', { before: `'{}'::jsonb` })).toBe('23505');
    });

    it('is append-only for everyone: no update, no delete, no truncate', async () => {
      expect(await sqlState(sql, `UPDATE budget_version_history SET seq = seq + 10`)).toBe('23001');
      expect(await sqlState(sql, `DELETE FROM budget_version_history`)).toBe('23001');
      expect(await sqlState(sql, `TRUNCATE budget_version_history`)).toBe('23001');
    });
  });

  describe('the notices held for a department that has no head yet (F67, T-11)', () => {
    const held = (key: string, deliveredAt: string | null, deliveredTo: string | null) =>
      sqlState(
        sql,
        `INSERT INTO held_department_notifications (id, organization_id, department_id, code, event_key, delivered_at, delivered_to_employee_id)
         VALUES (gen_random_uuid(), $1, $2, 'BUDGET_PROPOSAL_CLOSED_YEAR_END', $3, $4::timestamptz, $5::uuid)`,
        [world.organizationId, world.departments.eng, key, deliveredAt, deliveredTo],
      );

    it('keeps one row for each event, and delivery moment and recipient go together', async () => {
      expect(await held('held-1', null, null)).toBeNull();
      expect(await held('held-1', null, null)).toBe('23505');
      expect(await held('held-2', '2026-10-01T00:00:00Z', null)).toBe('23514');
      expect(await held('held-3', null, employee())).toBe('23514');
      expect(await held('held-4', '2026-10-01T00:00:00Z', employee())).toBeNull();
    });
  });
});
