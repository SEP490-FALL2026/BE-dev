import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PROJECT_ROOT } from '../../support/cli-process';
import { dropDisposableDatabase, provisionDisposableDatabase } from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';
import { dayFromToday, lineWorld } from '../../support/w3-lines-world';

const TARGET = migrationEndingWith('_w3_subscription_lines_seat_ledger');
const sqlOf = (directory: string): string =>
  readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', directory, 'migration.sql'), 'utf8');

/**
 * Redesign wave 3, W3-15 (M5, `20261203000100_w3_subscription_lines_seat_ledger`): every period of seats becomes one line, a period that
 * continues another closes the line of the other the day before, and each line that is serving opens a ledger with the seats the period
 * bought. Two live periods of one plan in one workspace stop the migration.
 */
describe('M5 w3_subscription_lines_seat_ledger migration (integration, real PostgreSQL)', () => {
  it(
    'gives each period of seats a line, closes the ones that continued or ended, opens the ledger of the ones that serve, and leaves a draft with none',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying history failed: ${before.stdout}`);
        const w = await lineWorld(sql);
        const { vendorId, workspaceId } = await w.vendor('Anthropic');
        const claude = await w.plan(vendorId, 'Claude Team', 'K2');
        const jira = await w.plan(vendorId, 'Claude Max', 'K2');
        const draftPlan = await w.plan(vendorId, 'Claude Pro', 'K2');
        const endedPlan = await w.plan(vendorId, 'Claude Free', 'K2');
        const k3Plan = await w.plan(vendorId, 'Claude Docs', 'K3');

        // A period that was continued by one already running: the first closes the day before the second began.
        const first = await w.period(claude, workspaceId, {
          startDate: dayFromToday(-200),
          endDate: dayFromToday(-31),
        });
        const second = await w.period(claude, workspaceId, {
          startDate: dayFromToday(-30),
          endDate: dayFromToday(300),
          renewedFromId: first,
          quantity: 7,
        });
        // A period that still serves for twenty days and is continued by one that has not begun: the ledger of the first opens today, the second one at its start.
        const old = await w.period(jira, workspaceId, { startDate: dayFromToday(-100), endDate: dayFromToday(19) });
        const next = await w.period(jira, workspaceId, {
          startDate: dayFromToday(20),
          endDate: dayFromToday(380),
          renewedFromId: old,
          quantity: 9,
        });
        const draft = await w.period(draftPlan, workspaceId, { status: 'DRAFT', quantity: 3, vendorMinimumSeats: 25 });
        const ended = await w.period(endedPlan, workspaceId, {
          startDate: dayFromToday(-400),
          endDate: dayFromToday(-50),
        });
        // A plan that is not of seats has no line.
        await w.period(k3Plan, workspaceId, { startDate: dayFromToday(-10), endDate: dayFromToday(100) });

        await sql.query(sqlOf(TARGET));

        const today = (
          await sql.query<{ today: string }>(
            `SELECT to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS today`,
          )
        ).rows[0].today;
        const lineOf = async (subscriptionId: string) =>
          (
            await sql.query<{
              id: string;
              workspace_id: string;
              minimum_seats: number | null;
              ledger_opened_on: string | null;
              closed_on: string | null;
              closed_reason: string | null;
              renewed_from_line_id: string | null;
            }>(
              `SELECT id, workspace_id, minimum_seats, to_char(ledger_opened_on, 'YYYY-MM-DD') AS ledger_opened_on,
                      to_char(closed_on, 'YYYY-MM-DD') AS closed_on, closed_reason, renewed_from_line_id
                 FROM subscription_lines WHERE subscription_id = $1`,
              [subscriptionId],
            )
          ).rows;
        const ledgerOf = async (lineId: string) =>
          (
            await sql.query<{ effective_on: string; delta: number; reason: string; source: string; note: string }>(
              `SELECT to_char(effective_on, 'YYYY-MM-DD') AS effective_on, delta, reason, source, note
                 FROM seat_changes WHERE subscription_line_id = $1`,
              [lineId],
            )
          ).rows;

        expect((await sql.query(`SELECT 1 FROM subscription_lines`)).rowCount).toBe(6);
        const [firstLine] = await lineOf(first);
        const [secondLine] = await lineOf(second);
        expect(firstLine).toMatchObject({
          workspace_id: workspaceId,
          closed_on: dayFromToday(-31),
          closed_reason: 'RENEWED',
          ledger_opened_on: null,
        });
        expect(secondLine).toMatchObject({
          closed_on: null,
          closed_reason: null,
          ledger_opened_on: today,
          renewed_from_line_id: firstLine.id,
        });
        expect(await ledgerOf(firstLine.id)).toEqual([]);
        expect(await ledgerOf(secondLine.id)).toEqual([
          { effective_on: today, delta: 7, reason: 'INITIAL', source: 'ADJUSTMENT', note: 'Mở sổ khi chuyển đổi' },
        ]);

        const [oldLine] = await lineOf(old);
        const [nextLine] = await lineOf(next);
        expect(oldLine).toMatchObject({
          closed_on: dayFromToday(19),
          closed_reason: 'RENEWED',
          ledger_opened_on: today,
        });
        expect(nextLine).toMatchObject({
          closed_on: null,
          ledger_opened_on: dayFromToday(20),
          renewed_from_line_id: oldLine.id,
        });
        expect(await ledgerOf(oldLine.id)).toEqual([expect.objectContaining({ reason: 'INITIAL', delta: 5 })]);
        expect(await ledgerOf(nextLine.id)).toEqual([
          expect.objectContaining({ effective_on: dayFromToday(20), delta: 9, reason: 'RENEWAL' }),
        ]);

        const [draftLine] = await lineOf(draft);
        expect(draftLine).toMatchObject({ ledger_opened_on: null, closed_reason: null, minimum_seats: 25 });
        expect(await ledgerOf(draftLine.id)).toEqual([]);

        const [endedLine] = await lineOf(ended);
        expect(endedLine).toMatchObject({
          closed_on: dayFromToday(-50),
          closed_reason: 'ENDED',
          ledger_opened_on: null,
        });
        // The periods themselves are untouched: the old columns stay as they were.
        expect(
          (
            await sql.query<{ purchased_quantity: number }>(
              `SELECT purchased_quantity FROM subscriptions WHERE id = $1`,
              [second],
            )
          ).rows[0].purchased_quantity,
        ).toBe(7);
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS,
  );

  it(
    'stops, naming the workspace, when two periods of one plan are live in one workspace, and writes nothing',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying history failed: ${before.stdout}`);
        const w = await lineWorld(sql);
        const { vendorId, workspaceId } = await w.vendor('Anthropic');
        const claude = await w.plan(vendorId, 'Claude Team', 'K2');
        await w.period(claude, workspaceId, { status: 'DRAFT' });
        await w.period(claude, workspaceId);

        await expect(sql.query(sqlOf(TARGET))).rejects.toMatchObject({
          code: '23505',
          constraint: 'subscription_lines_workspace_plan_live',
          message: expect.stringContaining(workspaceId) as string,
        });

        expect(
          (await sql.query<{ table_name: string | null }>(`SELECT to_regclass('subscription_lines') AS table_name`))
            .rows[0].table_name,
        ).toBeNull();
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    },
    DEPLOY_TIMEOUT_MS,
  );
});
