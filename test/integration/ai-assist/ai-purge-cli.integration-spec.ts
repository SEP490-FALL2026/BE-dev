import { randomUUID } from 'node:crypto';
import { CLI_COLD_START_MS, CliResult, cliWorkingDirectory, runCli, stopCliProcesses } from '../../support/cli-process';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';

/**
 * `pnpm ops:ai-purge --through YYYY-MM-DD [--apply]` (`US-15-05`): the content of the calls of the AI (`ai_invocation_contents`)
 * created on or before the end of a day (UTC) is deleted, the calls themselves (`ai_invocations`) are kept, and the deletion is
 * audited as the operator in the transaction that deletes. The default run only counts.
 */
const OPERATOR = 'ops-lead@acme.example';
const THROUGH = '2026-10-31';
const LIVE = new Set(['PENDING', 'RUNNING']);

describe('ops:ai-purge (integration, real CLI and PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  /** One call with its content for each instant, by name. */
  const ids = new Map<string, string>();

  const run = (args: string[]): Promise<CliResult> =>
    runCli('ai-purge', args, {
      cwd: cliWorkingDirectory('slm-ai-purge'),
      environment: { NODE_ENV: 'production', DATABASE_URL: ctx.database.url },
    });
  const apply = () => run(['--through', THROUGH, '--apply', '--operator', OPERATOR]);
  const count = async (table: string, where = 'true'): Promise<number> =>
    Number((await ctx.sql.query<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`)).rows[0].n);
  const state = async () => ({
    invocations: await count('ai_invocations'),
    contents: await count('ai_invocation_contents'),
    purged: await count('audit_events', `action = 'AI_INVOCATION.PURGED'`),
  });
  const keptContents = async (): Promise<string[]> => {
    const rows = await ctx.sql.query<{ invocation_id: string }>(
      'SELECT invocation_id FROM ai_invocation_contents ORDER BY created_at',
    );
    const names = new Map([...ids].map(([name, id]) => [id, name]));

    return rows.rows.map((row) => names.get(row.invocation_id) ?? row.invocation_id);
  };
  const statuses = async (): Promise<Record<string, string>> => {
    const rows = await ctx.sql.query<{ id: string; status: string }>('SELECT id, status FROM ai_invocations');
    const byId = new Map(rows.rows.map((row) => [row.id, row.status]));

    return Object.fromEntries([...ids].map(([name, id]) => [name, byId.get(id) ?? 'MISSING']));
  };

  async function insertCall(name: string, createdAt: string, status = 'COMPLETED'): Promise<void> {
    const id = randomUUID();
    ids.set(name, id);
    await ctx.sql.query(
      `INSERT INTO ai_invocations (id, organization_id, feature, actor_app_user_id, actor_employee_id, status, source_revision, created_at, finished_at)
       VALUES ($1, $2, 'ACCESS_REQUEST_QUEUE_SUMMARY', $3, $4, $7::"AiInvocationStatus", $5, $6, $8)`,
      [
        id,
        seed.organizationId,
        randomUUID(),
        randomUUID(),
        `revision-${name}`,
        createdAt,
        status,
        LIVE.has(status) ? null : createdAt,
      ],
    );
    await ctx.sql.query(
      `INSERT INTO ai_invocation_contents (invocation_id, context, prompt_text, raw_response, created_at)
       VALUES ($1, '{"generatedAt":"2026-10-01T00:00:00.000Z","requests":[]}', 'a prompt', 'an answer', $2)`,
      [id, createdAt],
    );
  }

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    await insertCall('old', '2026-10-01T08:00:00.000Z');
    await insertCall('last-millisecond', '2026-10-31T23:59:59.999Z');
    await insertCall('first-millisecond-after', '2026-11-01T00:00:00.000Z');
    await insertCall('recent', '2026-11-03T08:00:00.000Z');
    // Live calls older than the cut-off: their content is what the run in progress still has to write into.
    await insertCall('pending-old', '2026-10-02T08:00:00.000Z', 'PENDING');
    await insertCall('running-old', '2026-10-03T08:00:00.000Z', 'RUNNING');
    // A call that failed holds no place of its revision: its content goes, its status stays.
    await insertCall('failed-old', '2026-10-04T08:00:00.000Z', 'FAILED');
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
    stopCliProcesses();
  });

  it(
    'prints the usage with the arguments and the exit codes for --help, with nothing configured',
    async () => {
      const result = await runCli('ai-purge', ['--help'], {
        cwd: cliWorkingDirectory('slm-ai-purge'),
        environment: { NODE_ENV: 'production' },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('ops:ai-purge');
      expect(result.stdout).toContain('--through');
      expect(result.stdout).toContain('--apply');
      expect(result.stdout).toMatch(/Exit codes: 0 .* 2 .* 1/s);
    },
    CLI_COLD_START_MS,
  );

  it(
    'refuses a --through that is missing, not a date, not a real day or in the future with exit 1, and changes nothing',
    async () => {
      const before = await state();
      const refused = [
        await run([]),
        await run(['--through', '31/10/2026']),
        await run(['--through', '2026-02-30']),
        await run(['--through', '2999-01-01']),
        await run(['--through', THROUGH, '--apply']),
      ];

      expect(refused.map((result) => result.code)).toEqual([1, 1, 1, 1, 1]);
      expect(refused[0].stderr).toContain('--through is required');
      expect(refused[4].stderr).toContain('--operator is required with --apply');
      expect(await state()).toEqual(before);
    },
    CLI_COLD_START_MS * 5,
  );

  it(
    'by default only counts: it says how many contents would go and writes nothing, not a row, not an event',
    async () => {
      const before = await state();

      const result = await run(['--through', THROUGH]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('mode:     DRY RUN');
      expect(result.stdout).toContain(`through:  ${THROUGH}`);
      expect(result.stdout).toContain('contents: 3');
      expect(result.stdout).toContain('Nothing was deleted');
      // Nothing of what the contents hold is printed.
      expect(result.stdout + result.stderr).not.toMatch(/a prompt|an answer|generatedAt/);
      expect(await state()).toEqual(before);
    },
    CLI_COLD_START_MS,
  );

  it(
    'exits 2 on a dry run that finds nothing to delete',
    async () => {
      const result = await run(['--through', '2026-09-30']);

      expect(result.code).toBe(2);
      expect(result.stdout).toContain('contents: 0');
    },
    CLI_COLD_START_MS,
  );

  it(
    'rolls the deletion back and exits 1 when its audit event cannot be written: the contents stay',
    async () => {
      await ctx.sql.query(`CREATE FUNCTION refuse_purge_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.action = 'AI_INVOCATION.PURGED' THEN RAISE EXCEPTION 'audit refused'; END IF;
          RETURN NEW;
        END $$`);
      await ctx.sql.query(
        `CREATE TRIGGER refuse_purge_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION refuse_purge_audit()`,
      );
      try {
        const before = await state();

        const result = await apply();

        expect(result.code).toBe(1);
        expect(await state()).toEqual(before);
      } finally {
        await ctx.sql.query('DROP TRIGGER refuse_purge_audit ON audit_events');
        await ctx.sql.query('DROP FUNCTION refuse_purge_audit()');
      }
    },
    CLI_COLD_START_MS,
  );

  it(
    'with --apply deletes the contents created on or before the end of the day and keeps every call, with one OPERATOR event',
    async () => {
      const result = await apply();

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('mode:     APPLIED');
      expect(result.stdout).toContain('contents: 3');
      // The last millisecond of the day goes; the first millisecond of the next day stays, and so does what is later.
      // ... and so do the two live calls older than the cut-off: a call that is still running keeps its content.
      expect(await keptContents()).toEqual(['pending-old', 'running-old', 'first-millisecond-after', 'recent']);
      expect(await count('ai_invocations')).toBe(7);
      // A completed call whose content went is STALE: it no longer holds the place of its queue revision, so the same
      // revision may be asked again. The others keep their status, and every call keeps its end.
      expect(await statuses()).toEqual({
        old: 'STALE',
        'last-millisecond': 'STALE',
        'first-millisecond-after': 'COMPLETED',
        recent: 'COMPLETED',
        'pending-old': 'PENDING',
        'running-old': 'RUNNING',
        'failed-old': 'FAILED',
      });
      expect(await count('ai_invocations', `status = 'STALE' AND finished_at IS NULL`)).toBe(0);
      const events = await ctx.sql.query(
        `SELECT actor_kind, actor_app_user_id, actor_roles, action, resource_type, operator_reference, after, organization_id
           FROM audit_events WHERE action = 'AI_INVOCATION.PURGED'`,
      );
      expect(events.rows).toEqual([
        {
          actor_kind: 'OPERATOR',
          actor_app_user_id: null,
          actor_roles: [],
          action: 'AI_INVOCATION.PURGED',
          resource_type: 'AiInvocationContent',
          operator_reference: OPERATOR,
          after: { deletedCount: 3, through: THROUGH },
          organization_id: seed.organizationId,
        },
      ]);
    },
    CLI_COLD_START_MS,
  );

  it(
    'run again exits 2 and writes no second event: only live calls are left on or before that day, and a live call is never purged',
    async () => {
      const before = await state();

      const result = await apply();

      expect(result.code).toBe(2);
      expect(result.stdout).toContain('contents: 0');
      expect(await state()).toEqual(before);
      expect(before.purged).toBe(1);
    },
    CLI_COLD_START_MS,
  );
  it(
    'a dry run that finds only live calls on or before the day counts none and exits 2',
    async () => {
      const result = await run(['--through', '2026-10-03']);

      expect(result.code).toBe(2);
      expect(result.stdout).toContain('contents: 0');
    },
    CLI_COLD_START_MS,
  );

  it(
    'accepts today (UTC) as --through, and still counts only the calls that are not live',
    async () => {
      await insertCall('today', new Date().toISOString());
      await insertCall('running-today', new Date().toISOString(), 'RUNNING');
      const before = await state();

      const result = await run(['--through', new Date().toISOString().slice(0, 10)]);

      expect(result.code).toBe(0);
      // The call of the 1st (first millisecond after), the recent one and the one of this moment; the live ones stay out.
      expect(result.stdout).toContain('contents: 3');
      expect(await state()).toEqual(before);
    },
    CLI_COLD_START_MS,
  );
});
