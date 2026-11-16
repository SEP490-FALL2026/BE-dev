import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  type DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import { stopCliProcesses } from '../../support/cli-process';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

interface Rejection {
  code: string | null;
  constraint: string | null;
}

describe('the tables of the AI summary keep one live call for each person and queue revision (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let client: Client;
  const organizationId = randomUUID();
  const actorAppUserId = randomUUID();
  const actorEmployeeId = randomUUID();

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    client = new Client({ connectionString: database.url });
    await client.connect();
  }, 240000);

  afterAll(async () => {
    await client?.end().catch(() => undefined);
    if (database) await dropDisposableDatabase(database);
  });

  /** What PostgreSQL said to a statement: the SQLSTATE and the constraint it names, or nulls when it ran. */
  async function attempt(text: string, values: unknown[] = []): Promise<Rejection> {
    try {
      await client.query(text, values);

      return { code: null, constraint: null };
    } catch (error) {
      const { code, constraint } = error as { code?: string; constraint?: string };

      return { code: code ?? 'unknown', constraint: constraint ?? null };
    }
  }

  /** One call of the summary, in MODEL unless told; a state that is final carries its `finished_at` unless the test leaves it out. */
  function insertCall(
    status: string,
    options: {
      revision: string;
      actor?: string;
      org?: string;
      finishedAt?: string | null;
      id?: string;
      mode?: 'MODEL' | 'SIMULATED';
    },
  ): Promise<Rejection> {
    const finishedAt =
      options.finishedAt === undefined
        ? ['COMPLETED', 'NO_VALID_OUTPUT', 'STALE', 'FAILED'].includes(status)
          ? '2026-11-04T09:00:00Z'
          : null
        : options.finishedAt;

    return attempt(
      `INSERT INTO ai_invocations (id, organization_id, feature, actor_app_user_id, actor_employee_id, status, source_revision, finished_at,
          provider_mode)
       VALUES ($1, $2, 'ACCESS_REQUEST_QUEUE_SUMMARY', $3, $4, $5::"AiInvocationStatus", $6, $7, $8::"AiProviderMode")`,
      [
        options.id ?? randomUUID(),
        options.org ?? organizationId,
        options.actor ?? actorAppUserId,
        actorEmployeeId,
        status,
        options.revision,
        finishedAt,
        options.mode ?? 'MODEL',
      ],
    );
  }

  it('has the three enums the contract names, with their values in the order of the life of a call', async () => {
    const result = await client.query<{ typname: string; labels: string[] }>(
      `SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
         FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname IN ('AiFeature', 'AiInvocationStatus', 'AiProviderMode') GROUP BY t.typname ORDER BY t.typname`,
    );

    expect(result.rows).toEqual([
      { typname: 'AiFeature', labels: ['ACCESS_REQUEST_QUEUE_SUMMARY'] },
      {
        typname: 'AiInvocationStatus',
        labels: ['PENDING', 'RUNNING', 'COMPLETED', 'NO_VALID_OUTPUT', 'STALE', 'FAILED'],
      },
      { typname: 'AiProviderMode', labels: ['MODEL', 'SIMULATED'] },
    ]);
  });

  it('refuses a call that does not say its mode: provider_mode has no default', async () => {
    const column = await client.query<{ is_nullable: string; column_default: string | null }>(
      `SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'ai_invocations' AND column_name = 'provider_mode'`,
    );

    expect(column.rows).toEqual([{ is_nullable: 'NO', column_default: null }]);
    expect(
      await attempt(
        `INSERT INTO ai_invocations (id, organization_id, feature, actor_app_user_id, actor_employee_id, status, source_revision)
         VALUES ($1, $2, 'ACCESS_REQUEST_QUEUE_SUMMARY', $3, $4, 'PENDING', 'rev-no-mode')`,
        [randomUUID(), organizationId, actorAppUserId, actorEmployeeId],
      ),
    ).toMatchObject({ code: '23502' });
  });

  it('keeps a live call of each mode for the same person and queue revision, and refuses a second one in the same mode', async () => {
    const revision = 'rev-modes';

    expect(await insertCall('COMPLETED', { revision, mode: 'MODEL' })).toEqual({ code: null, constraint: null });
    expect(await insertCall('RUNNING', { revision, mode: 'SIMULATED' })).toEqual({ code: null, constraint: null });
    expect(await insertCall('PENDING', { revision, mode: 'SIMULATED' })).toEqual({
      code: '23505',
      constraint: 'ai_invocations_active_per_revision',
    });
    expect(await insertCall('PENDING', { revision, mode: 'MODEL' })).toEqual({
      code: '23505',
      constraint: 'ai_invocations_active_per_revision',
    });
  });

  it('refuses a second call that is live for the same person, feature and queue revision, and lets it in once the first has failed', async () => {
    const revision = 'rev-running';
    const first = randomUUID();

    expect(await insertCall('RUNNING', { revision, id: first })).toEqual({ code: null, constraint: null });
    expect(await insertCall('RUNNING', { revision })).toEqual({
      code: '23505',
      constraint: 'ai_invocations_active_per_revision',
    });

    await client.query(
      `UPDATE ai_invocations SET status = 'FAILED', error_code = 'AI.PROVIDER_TIMEOUT', finished_at = now() WHERE id = $1`,
      [first],
    );

    expect(await insertCall('RUNNING', { revision })).toEqual({ code: null, constraint: null });
  });

  it.each(['PENDING', 'RUNNING', 'COMPLETED'])('counts a %s call as live', async (status) => {
    const revision = `rev-live-${status}`;

    expect(await insertCall(status, { revision })).toEqual({ code: null, constraint: null });
    expect(await insertCall('PENDING', { revision })).toMatchObject({
      code: '23505',
      constraint: 'ai_invocations_active_per_revision',
    });
  });

  it.each(['NO_VALID_OUTPUT', 'STALE', 'FAILED'])(
    'does not count a %s call as live: any number of them may stay',
    async (status) => {
      const revision = `rev-dead-${status}`;

      expect(await insertCall(status, { revision })).toEqual({ code: null, constraint: null });
      expect(await insertCall(status, { revision })).toEqual({ code: null, constraint: null });
      expect(await insertCall('RUNNING', { revision })).toEqual({ code: null, constraint: null });
    },
  );

  it('keeps the calls of another person, another queue revision and another organization apart', async () => {
    const revision = 'rev-apart';

    expect(await insertCall('RUNNING', { revision })).toEqual({ code: null, constraint: null });
    expect(await insertCall('RUNNING', { revision, actor: randomUUID() })).toEqual({ code: null, constraint: null });
    expect(await insertCall('RUNNING', { revision: 'rev-apart-2' })).toEqual({ code: null, constraint: null });
    expect(await insertCall('RUNNING', { revision, org: randomUUID() })).toEqual({ code: null, constraint: null });
  });

  it('makes the live-call index partial and names it as the contract does', async () => {
    const result = await client.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'ai_invocations_active_per_revision'`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].indexdef).toMatch(/UNIQUE INDEX/);
    expect(result.rows[0].indexdef).toMatch(
      /\(organization_id, actor_app_user_id, feature, source_revision, provider_mode\)/,
    );
    expect(result.rows[0].indexdef).toMatch(/PENDING.*RUNNING.*COMPLETED/);
  });

  it.each(['COMPLETED', 'NO_VALID_OUTPUT', 'STALE', 'FAILED'])(
    'refuses a %s call that has no finished_at',
    async (status) => {
      expect(await insertCall(status, { revision: `rev-open-${status}`, finishedAt: null })).toEqual({
        code: '23514',
        constraint: 'ai_invocations_final_state_finished_at_check',
      });
    },
  );

  it.each(['PENDING', 'RUNNING'])(
    'lets a %s call wait with no finished_at, and refuses to close it without one',
    async (status) => {
      const id = randomUUID();

      expect(await insertCall(status, { revision: `rev-wait-${status}`, id })).toEqual({
        code: null,
        constraint: null,
      });
      expect(await attempt(`UPDATE ai_invocations SET status = 'FAILED' WHERE id = $1`, [id])).toEqual({
        code: '23514',
        constraint: 'ai_invocations_final_state_finished_at_check',
      });
    },
  );

  describe('ai_invocation_contents', () => {
    it('holds the content of one call, once, and only of a call that exists', async () => {
      const id = randomUUID();
      await insertCall('RUNNING', { revision: 'rev-content', id });
      const insert = `INSERT INTO ai_invocation_contents (invocation_id, context) VALUES ($1, '{"requests": []}'::jsonb)`;

      expect(await attempt(insert, [id])).toEqual({ code: null, constraint: null });
      expect(await attempt(insert, [id])).toMatchObject({ code: '23505' });
      expect(await attempt(insert, [randomUUID()])).toMatchObject({ code: '23503' });
    });

    it('leaves the prompt, the raw response, the parsed output and the result empty until there is something to keep, and the context never', async () => {
      const id = randomUUID();
      await insertCall('RUNNING', { revision: 'rev-content-null', id });

      expect(await attempt(`INSERT INTO ai_invocation_contents (invocation_id) VALUES ($1)`, [id])).toMatchObject({
        code: '23502',
      });
      await client.query(`INSERT INTO ai_invocation_contents (invocation_id, context) VALUES ($1, '{}'::jsonb)`, [id]);
      const row = await client.query<{ created_at: Date }>(
        `SELECT prompt_text, raw_response, parsed, result, created_at FROM ai_invocation_contents WHERE invocation_id = $1`,
        [id],
      );

      expect(row.rows[0]).toMatchObject({ prompt_text: null, raw_response: null, parsed: null, result: null });
      expect(row.rows[0].created_at).toBeInstanceOf(Date);
    });
  });
});

/**
 * The migration that gives each call its mode, over the calls made before it: they all went to the AI service, so they become
 * MODEL; a live one and a kept one keep holding their queue revision, now in MODEL only.
 */
describe('the mode of the AI calls over the calls made before it (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let client: Client;
  const organizationId = randomUUID();
  const actorAppUserId = randomUUID();
  const ids = { running: randomUUID(), completed: randomUUID(), failed: randomUUID() };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    client = new Client({ connectionString: database.url });
    await client.connect();
    const before = await deployMigrations(database, {
      through: migrationBefore(migrationEndingWith('_ai_provider_mode')),
    });
    if (before.code !== 0) throw new Error(`Deploying the history before the mode failed: ${before.stdout}`);
    for (const [status, id] of [
      ['RUNNING', ids.running],
      ['COMPLETED', ids.completed],
      ['FAILED', ids.failed],
    ] as const) {
      await client.query(
        `INSERT INTO ai_invocations (id, organization_id, feature, actor_app_user_id, actor_employee_id, status, source_revision,
            finished_at)
         VALUES ($1, $2, 'ACCESS_REQUEST_QUEUE_SUMMARY', $3, $4, $5::"AiInvocationStatus", $6, $7)`,
        [
          id,
          organizationId,
          actorAppUserId,
          randomUUID(),
          status,
          `rev-old-${status}`,
          status === 'RUNNING' ? null : 'now',
        ],
      );
    }
    const after = await deployMigrations(database);
    if (after.code !== 0) throw new Error(`Deploying the mode over old calls failed: ${after.stdout}`);
  }, 2 * DEPLOY_TIMEOUT_MS);

  afterAll(async () => {
    await client?.end().catch(() => undefined);
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it('makes every call made before it MODEL, and leaves the column without a default', async () => {
    const rows = await client.query<{ id: string; provider_mode: string }>(
      `SELECT id, provider_mode FROM ai_invocations ORDER BY id`,
    );
    const column = await client.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns WHERE table_name = 'ai_invocations' AND column_name = 'provider_mode'`,
    );

    expect(rows.rows).toEqual(
      Object.values(ids)
        .sort()
        .map((id) => ({ id, provider_mode: 'MODEL' })),
    );
    expect(column.rows).toEqual([{ column_default: null }]);
  });

  it('keeps an old live call holding its revision in MODEL, and lets a SIMULATED call of the same revision in', async () => {
    const insert = (mode: string): Promise<string | null> =>
      client
        .query(
          `INSERT INTO ai_invocations (id, organization_id, feature, actor_app_user_id, actor_employee_id, status, source_revision,
              provider_mode)
           VALUES ($1, $2, 'ACCESS_REQUEST_QUEUE_SUMMARY', $3, $4, 'PENDING', 'rev-old-RUNNING', $5::"AiProviderMode")`,
          [randomUUID(), organizationId, actorAppUserId, randomUUID(), mode],
        )
        .then(
          () => null,
          (error: { code?: string }) => error.code ?? 'unknown',
        );

    expect(await insert('MODEL')).toBe('23505');
    expect(await insert('SIMULATED')).toBeNull();
  });
});
