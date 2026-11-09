import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  type DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

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

  /** One call of the summary; a state that is final carries its `finished_at` unless the test leaves it out. */
  function insertCall(
    status: string,
    options: { revision: string; actor?: string; org?: string; finishedAt?: string | null; id?: string },
  ): Promise<Rejection> {
    const finishedAt =
      options.finishedAt === undefined
        ? ['COMPLETED', 'NO_VALID_OUTPUT', 'STALE', 'FAILED'].includes(status)
          ? '2026-11-04T09:00:00Z'
          : null
        : options.finishedAt;

    return attempt(
      `INSERT INTO ai_invocations (id, organization_id, feature, actor_app_user_id, actor_employee_id, status, source_revision, finished_at)
       VALUES ($1, $2, 'ACCESS_REQUEST_QUEUE_SUMMARY', $3, $4, $5::"AiInvocationStatus", $6, $7)`,
      [
        options.id ?? randomUUID(),
        options.org ?? organizationId,
        options.actor ?? actorAppUserId,
        actorEmployeeId,
        status,
        options.revision,
        finishedAt,
      ],
    );
  }

  it('has the two enums the contract names, with their values in the order of the life of a call', async () => {
    const result = await client.query<{ typname: string; labels: string[] }>(
      `SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
         FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname IN ('AiFeature', 'AiInvocationStatus') GROUP BY t.typname ORDER BY t.typname`,
    );

    expect(result.rows).toEqual([
      { typname: 'AiFeature', labels: ['ACCESS_REQUEST_QUEUE_SUMMARY'] },
      {
        typname: 'AiInvocationStatus',
        labels: ['PENDING', 'RUNNING', 'COMPLETED', 'NO_VALID_OUTPUT', 'STALE', 'FAILED'],
      },
    ]);
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
    expect(result.rows[0].indexdef).toMatch(/organization_id, actor_app_user_id, feature, source_revision/);
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
