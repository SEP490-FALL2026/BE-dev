import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { ApiAccount } from '../../support/api-accounts';
import { DevicesHarness, type NoticeWire, type SessionWire } from '../../support/devices-harness';

const h = new DevicesHarness();

interface ResultWire {
  date?: string;
  tool?: string;
  outcome: string;
  reasonCode: string | null;
}

describe('the allowlist, the days of usage and the status of tools a collector sends (integration, real PostgreSQL)', () => {
  let notice: NoticeWire;
  let apps: Record<string, string>;
  let counter = 0;
  const sql = (): Client => h.ctx.sql;
  const today = () => h.today();
  const yesterday = () => new Date(Date.parse(`${h.today()}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
  const resultsOf = (response: { body: unknown }) =>
    (response.body as { data: { results: ResultWire[] } }).data.results;
  const holder = async (): Promise<ApiAccount> => {
    counter += 1;
    return h.account(`E-USE${counter}`, await h.person(`E-USE${counter}`), 'EMPLOYEE');
  };
  const rowsOf = async (registrationId: string) =>
    (
      await sql().query<{ tool: string; responses: number; total_tokens: string; generated_at: Date }>(
        `SELECT tool, responses, total_tokens, generated_at FROM ai_usage_days WHERE registration_id = $1 ORDER BY tool, usage_date`,
        [registrationId],
      )
    ).rows;
  const rejectionsIn = async (deviceId: string) =>
    (
      await sql().query<{ reason_code: string; usage_date: Date | null; endpoint: string }>(
        `SELECT reason_code, usage_date, endpoint FROM intake_rejections WHERE device_id = $1 ORDER BY rejected_at, id`,
        [deviceId],
      )
    ).rows;

  beforeAll(async () => {
    await h.start();
    // The first thing a collector asks is the session: no version of the allowlist is published yet.
    notice = await h.published();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-09-02 AC-7: the session tells a collector to report nothing until the IT Admin publishes the first version, then which tools', async () => {
    const person = await holder();
    const machine = await h.signedMachine(person, notice);
    await h.acknowledge(person, machine.registrationId as string, notice.id).expect(201);
    const { token } = await h.enrolled(machine.registrationId as string);

    expect(h.dataOf<SessionWire & { allowlist: object }>(await h.session(token).expect(200)).allowlist).toEqual({
      version: null,
      entries: [],
    });
    apps = await h.allowlisted();
    const session = h.dataOf<{ allowlist: { version: number; entries: { kind: string; key: string }[] } }>(
      await h.session(token).expect(200),
    );

    expect(session.allowlist.version).toBe(1);
    expect(session.allowlist.entries).toEqual([
      { kind: 'AI_TOOL', key: 'CLAUDE_CODE' },
      { kind: 'AI_TOOL', key: 'CODEX' },
    ]);
  });

  it('US-09-02 AC-7, QĐ-62o: refuses an application that is not in the catalog, one the company built, a messaging service and a list that changes nothing', async () => {
    const internal = await h.catalogApplication('INTERNAL');
    const messaging = await h.catalogApplication('SAAS', true);
    const ok = await h.catalogApplication();
    const publish = (aiTools: object[]) => h.allowlistPublish({ reason: 'Try.', aiTools });

    expect(h.codeOf(await publish([{ tool: 'CODEX', applicationId: randomUUID() }]).expect(422))).toBe(
      'COLLECTOR_ALLOWLIST.APPLICATION_NOT_FOUND',
    );
    expect(h.codeOf(await publish([{ tool: 'CODEX', applicationId: internal }]).expect(422))).toBe(
      'COLLECTOR_ALLOWLIST.APPLICATION_NOT_ELIGIBLE',
    );
    expect(h.codeOf(await publish([{ tool: 'CODEX', applicationId: messaging }]).expect(422))).toBe(
      'COLLECTOR_ALLOWLIST.APPLICATION_NOT_ELIGIBLE',
    );
    expect(
      h.codeOf(
        await publish(Object.entries(apps).map(([tool, applicationId]) => ({ tool, applicationId }))).expect(409),
      ),
    ).toBe('COLLECTOR_ALLOWLIST.UNCHANGED');
    await publish([
      { tool: 'CODEX', applicationId: ok },
      { tool: 'CODEX', applicationId: internal },
    ]).expect(422);
    expect(await sql().query(`SELECT 1 FROM collector_allowlist_versions`)).toHaveProperty('rowCount', 1);
  });

  it('lists the tools of the version in force with their applications and marks the one still experimental', async () => {
    const withAgy = { ...apps, ANTIGRAVITY_CLI: await h.catalogApplication() };
    await h
      .allowlistPublish({
        reason: 'Antigravity is added.',
        aiTools: Object.entries(withAgy).map(([tool, applicationId]) => ({ tool, applicationId })),
      })
      .expect(201);

    const page = h.dataOf<{
      items: { versionNumber: number; key: string; experimental: boolean; application: { id: string; name: string } }[];
    }>(await h.allowlistEntries().expect(200));

    expect(page.items.map((item) => [item.versionNumber, item.key, item.experimental])).toEqual([
      [2, 'ANTIGRAVITY_CLI', true],
      [2, 'CLAUDE_CODE', false],
      [2, 'CODEX', false],
    ]);
    expect(page.items.every((item) => item.application.name.length > 0)).toBe(true);
    await h.allowlistEntries('', h.finance).expect(403);
    apps = withAgy;
  });

  it('US-09-03 AC-2, US-09-04 AC-12: accepts nothing before the holder acknowledges and nothing after collection is stopped, writing down why', async () => {
    const person = await holder();
    const machine = await h.signedMachine(person, notice);
    const { token } = await h.enrolled(machine.registrationId as string);
    const batch = h.usageBatch(today(), new Date());

    expect(h.codeOf(await h.sendUsage(token, batch).expect(403))).toBe('DEVICE.NOT_ACKNOWLEDGED');
    expect(h.codeOf(await h.sendStatus(token, { snapshots: [] }).expect(422))).toBe('VALIDATION_ERROR');
    await h.acknowledge(person, machine.registrationId as string, notice.id).expect(201);
    expect(resultsOf(await h.sendUsage(token, batch).expect(200))).toEqual([
      { date: today(), outcome: 'ACCEPTED', reasonCode: null },
    ]);

    await sql().query(
      `UPDATE device_registrations SET collection_stopped_at = now(), acknowledged_from = NULL WHERE id = $1`,
      [machine.registrationId],
    );
    expect(h.codeOf(await h.sendUsage(token, batch).expect(403))).toBe('DEVICE.COLLECTION_STOPPED');
    expect(h.dataOf<SessionWire>(await h.session(token).expect(200)).state).toBe('COLLECTION_STOPPED');
    expect((await rejectionsIn(machine.id)).map((row) => row.reason_code)).toEqual([
      'NOT_ACKNOWLEDGED',
      'COLLECTION_STOPPED',
    ]);
  });

  it('US-09-05 AC-10, AC-12: the build made last wins; a batch sent twice and an older one that arrives late change nothing; credentials merge into one row', async () => {
    const person = await holder();
    const { device, token } = await h.collected(person, notice);
    const registrationId = device.registrationId as string;
    const now = Date.now();
    const build = (offsetMs: number, counts: { responses: number; totalTokens: number }) =>
      h.usageBatch(today(), new Date(now + offsetMs), ['CODEX'], counts);

    expect(
      resultsOf(await h.sendUsage(token, build(-5_000, { responses: 3, totalTokens: 900 })).expect(200))[0].outcome,
    ).toBe('ACCEPTED');
    expect(
      resultsOf(await h.sendUsage(token, build(-5_000, { responses: 3, totalTokens: 900 })).expect(200))[0].outcome,
    ).toBe('UNCHANGED');
    expect(
      resultsOf(await h.sendUsage(token, build(-1_000, { responses: 5, totalTokens: 1500 })).expect(200))[0].outcome,
    ).toBe('ACCEPTED');
    expect(
      resultsOf(await h.sendUsage(token, build(-800, { responses: 5, totalTokens: 1500 })).expect(200))[0].outcome,
    ).toBe('UNCHANGED'); // the same counts in a later build: the tool resends its whole window each week
    // G-L2: that later build moved the instant the counts were confirmed, so a different count made between the two cannot win now.
    expect(
      resultsOf(await h.sendUsage(token, build(-900, { responses: 1, totalTokens: 100 })).expect(200))[0].outcome,
    ).toBe('UNCHANGED');
    expect(
      resultsOf(await h.sendUsage(token, build(-9_000, { responses: 1, totalTokens: 100 })).expect(200))[0].outcome,
    ).toBe('UNCHANGED');
    expect(await rowsOf(registrationId)).toMatchObject([{ tool: 'CODEX', responses: 5, total_tokens: '1500' }]);

    const second = await h.enrolled(registrationId);
    expect(
      resultsOf(await h.sendUsage(second.token, build(-500, { responses: 7, totalTokens: 2100 })).expect(200))[0]
        .outcome,
    ).toBe('ACCEPTED');
    expect(await rowsOf(registrationId)).toMatchObject([{ tool: 'CODEX', responses: 7, total_tokens: '2100' }]);
    const credential = await sql().query<{ credential_id: string }>(
      `SELECT credential_id FROM ai_usage_days WHERE registration_id = $1`,
      [registrationId],
    );
    expect(credential.rows[0].credential_id).toBe(second.credentialId);
    const lastAccepted = await h.listCredentials(registrationId).expect(200);
    expect(
      (lastAccepted.body as { data: { items: { lastAcceptedAt: string | null }[] } }).data.items.some(
        (item) => item.lastAcceptedAt !== null,
      ),
    ).toBe(true);
  });

  it('US-09-05 AC-3, AC-14: judges each day on its own — a day before the acknowledgement, a tool off the allowlist, a clock ahead, a coverage the window cannot hold', async () => {
    const { device, token } = await h.collected(await holder(), notice);
    const generatedAt = new Date();
    const send = (body: object) => h.sendUsage(token, body).expect(200);
    const day = (date: string, tools: object[]) => ({ date, tools });
    const tool = (name: string, coverage = 'PARTIAL', responses = 1, totalTokens = 10) => ({
      tool: name,
      coverage,
      responses,
      totalTokens,
    });

    const mixed = resultsOf(
      await send({
        generatedAt: generatedAt.toISOString(),
        days: [day(yesterday(), [tool('CODEX')]), day(today(), [tool('CODEX')])],
      }),
    );
    expect(mixed).toEqual([
      { date: yesterday(), outcome: 'REJECTED', reasonCode: 'OUTSIDE_WINDOW' },
      { date: today(), outcome: 'ACCEPTED', reasonCode: null },
    ]);
    const other = resultsOf(
      await send({
        generatedAt: generatedAt.toISOString(),
        days: [day(today(), [tool('CODEX'), tool('CLAUDE_CODE', 'COVERED')])],
      }),
    );
    expect(other[0].reasonCode).toBe('INVALID_COVERAGE');
    const ahead = resultsOf(await send(h.usageBatch(today(), new Date(Date.now() + 10 * 60_000))));
    expect(ahead).toEqual([{ date: today(), outcome: 'REJECTED', reasonCode: 'FUTURE_GENERATED_AT' }]);
    const nothingCounted = resultsOf(
      await send({
        generatedAt: generatedAt.toISOString(),
        days: [day(today(), [tool('CLAUDE_CODE', 'NOT_OBSERVABLE', 2, 5)])],
      }),
    );
    expect(nothingCounted[0].reasonCode).toBe('INVALID_COVERAGE');

    const reasons = (await rejectionsIn(device.id)).map((row) => row.reason_code);
    expect(reasons).toEqual(['OUTSIDE_WINDOW', 'INVALID_COVERAGE', 'FUTURE_GENERATED_AT', 'INVALID_COVERAGE']);
  });

  it('a tool left out of a day does not touch the count kept for it, and a tool the allowlist does not name refuses the whole day', async () => {
    const { device, token } = await h.collected(await holder(), notice);
    await h
      .allowlistPublish({
        reason: 'Back to two tools.',
        aiTools: [
          { tool: 'CLAUDE_CODE', applicationId: apps.CLAUDE_CODE },
          { tool: 'CODEX', applicationId: apps.CODEX },
        ],
      })
      .expect(201);
    const both = h.usageBatch(today(), new Date(Date.now() - 2_000), ['CODEX', 'CLAUDE_CODE']);
    await h.sendUsage(token, both).expect(200);

    const onlyOne = h.usageBatch(today(), new Date(), ['CODEX'], { responses: 9, totalTokens: 9 });
    expect(resultsOf(await h.sendUsage(token, onlyOne).expect(200))[0].outcome).toBe('ACCEPTED');
    const kept = await rowsOf(device.registrationId as string);
    expect(kept.map((row) => [row.tool, row.responses])).toEqual([
      ['CLAUDE_CODE', 3],
      ['CODEX', 9],
    ]);
    // The day the tool was removed from the list is still reportable on that day; ANTIGRAVITY_CLI was removed just now, in the same day.
    expect(
      resultsOf(await h.sendUsage(token, h.usageBatch(today(), new Date(), ['ANTIGRAVITY_CLI'])).expect(200))[0]
        .outcome,
    ).toBe('ACCEPTED');
    expect(await sql().query(`SELECT 1 FROM ai_usage_days WHERE device_id = $1`, [device.id])).toHaveProperty(
      'rowCount',
      3,
    );
  });

  it('refuses a credential of a browser extension on the routes of the AI collector', async () => {
    const person = await holder();
    const machine = await h.active(person, notice);
    const extension = await h.enrolled(machine.registrationId as string, { collectorKind: 'BROWSER_EXTENSION' });

    expect(h.codeOf(await h.sendUsage(extension.token, h.usageBatch(today(), new Date())).expect(403))).toBe(
      'DEVICE.WRONG_COLLECTOR_KIND',
    );
    expect(h.codeOf(await h.sendStatus(extension.token, { snapshots: [] }).expect(403))).toBe(
      'DEVICE.WRONG_COLLECTOR_KIND',
    );
    expect(await rejectionsIn(machine.id)).toEqual([]);
  });

  it('US-09-03 AC-11: the status of tools is accepted only once the notice that names it is acknowledged; then it is kept once', async () => {
    const person = await holder();
    const machine = await h.signedMachine(person, notice);
    await h.acknowledge(person, machine.registrationId as string, notice.id).expect(201);
    const { token } = await h.enrolled(machine.registrationId as string);
    const snapshot = (over: object = {}) => ({
      snapshots: [
        {
          tool: 'CODEX',
          observedAt: new Date().toISOString(),
          auth: { status: 'LOGGED_IN' },
          quota: {
            status: 'OK',
            windows: [
              { code: 'PRIMARY', usedPercent: 40, resetsAt: null },
              { code: 'SECONDARY', usedPercent: 10, resetsAt: new Date(Date.now() + 3_600_000).toISOString() },
            ],
          },
          ...over,
        },
      ],
    });

    expect(h.codeOf(await h.sendStatus(token, snapshot()).expect(403))).toBe('DEVICE.TOOL_STATUS_NOT_ACKNOWLEDGED');
    expect((await rejectionsIn(machine.id)).map((row) => [row.endpoint, row.reason_code])).toEqual([
      ['AI_TOOL_STATUS_SNAPSHOT', 'TOOL_STATUS_NOT_ACKNOWLEDGED'],
    ]);

    const naming = await h.published({ includesToolStatus: true, requiresReacknowledgement: true });
    notice = naming;
    await h.acknowledge(person, machine.registrationId as string, naming.id).expect(201);
    const body = snapshot();
    expect(resultsOf(await h.sendStatus(token, body).expect(200))[0]).toMatchObject({
      tool: 'CODEX',
      outcome: 'ACCEPTED',
      reasonCode: null,
    });
    expect(resultsOf(await h.sendStatus(token, body).expect(200))[0].outcome).toBe('UNCHANGED');
    expect(await sql().query(`SELECT 1 FROM tool_status_windows`)).not.toHaveProperty('rowCount', 0);
    const refused = resultsOf(
      await h
        .sendStatus(
          token,
          snapshot({
            observedAt: new Date(Date.now() + 1_000).toISOString(),
            quota: { status: 'OK', windows: [{ code: 'SESSION', usedPercent: 1, resetsAt: null }] },
          }),
        )
        .expect(200),
    );
    expect(refused[0]).toMatchObject({ outcome: 'REJECTED', reasonCode: 'INVALID_QUOTA' });
    expect(await rowsOf(machine.registrationId as string)).toEqual([]);

    const ofMachine = h.dataOf<{ items: { tool: string; windowCode: string | null; usedPercent: number | null }[] }>(
      await h.deviceStatus(machine.id).expect(200),
    );
    expect(ofMachine.items.map((item) => [item.tool, item.windowCode, item.usedPercent])).toEqual([
      ['CODEX', 'PRIMARY', 40],
      ['CODEX', 'SECONDARY', 10],
    ]);
  });

  it('US-09-07: the IT Admin reads the counted days, the status and the refusals of a machine; the holder reads only what they held; a stranger finds nothing', async () => {
    const first = await holder();
    const second = await holder();
    const stranger = await holder();
    const { device, token } = await h.collected(first, notice);
    await h.sendUsage(token, h.usageBatch(today(), new Date())).expect(200);
    await h.sendUsage(token, h.usageBatch(yesterday(), new Date())).expect(200);

    const asIt = h.dataOf<{
      items: { date: string; tool: string; active: boolean; registrationId: string; experimental: boolean }[];
      pagination: { totalItems: number };
    }>(await h.deviceUsage(device.id).expect(200));
    expect(asIt.items).toMatchObject([
      { date: today(), tool: 'CODEX', active: true, experimental: false, registrationId: device.registrationId },
    ]);
    expect(asIt.pagination.totalItems).toBe(1);
    expect(
      h.dataOf<{ items: object[] }>(await h.deviceUsage(device.id, `?from=${today()}&to=${today()}`).expect(200)).items,
    ).toHaveLength(1);
    expect(
      h.dataOf<{ items: object[] }>(
        await h.deviceUsage(device.id, `?from=${yesterday()}&to=${yesterday()}`).expect(200),
      ).items,
    ).toHaveLength(0);
    await h.deviceUsage(device.id, `?from=${today()}&to=${yesterday()}`).expect(422);
    const rejections = h.dataOf<{ items: { date: string | null; reasonCode: string; endpoint: string }[] }>(
      await h.deviceRejections(device.id, '?reasonCode=OUTSIDE_WINDOW').expect(200),
    );
    expect(rejections.items).toMatchObject([
      { date: yesterday(), reasonCode: 'OUTSIDE_WINDOW', endpoint: 'AI_USAGE_BATCH' },
    ]);

    const mine = h.dataOf<{ items: Record<string, unknown>[] }>(await h.myUsage(first, device.id).expect(200));
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).not.toHaveProperty('registrationId');
    expect(h.codeOf(await h.myUsage(stranger, device.id).expect(404))).toBe('DEVICE.NOT_FOUND');
    expect(h.codeOf(await h.myStatus(stranger, device.id).expect(404))).toBe('DEVICE.NOT_FOUND');
    expect(h.codeOf(await h.deviceUsage(randomUUID()).expect(404))).toBe('DEVICE.NOT_FOUND');
    await h.deviceUsage(device.id, '', h.employee).expect(403);
    await h.deviceStatus(device.id, '', h.finance).expect(403);
    await h.deviceRejections(device.id, '', h.finance).expect(403);

    await h.changeHolder(device.id, second.employeeId).expect(201);
    expect(h.dataOf<{ items: object[] }>(await h.myUsage(first, device.id).expect(200)).items).toHaveLength(1);
    expect(h.dataOf<{ items: object[] }>(await h.myUsage(second, device.id).expect(200)).items).toHaveLength(0);
  });

  it('the database refuses to change or remove a version of the allowlist or one of its entries, and the count of a day cannot be negative', async () => {
    for (const table of ['collector_allowlist_versions', 'collector_allowlist_entries']) {
      for (const statement of [`UPDATE ${table} SET id = id`, `DELETE FROM ${table}`, `TRUNCATE ${table} CASCADE`]) {
        await expect(sql().query(statement)).rejects.toMatchObject({ code: '55000' });
      }
    }
    const row = await sql().query<{ id: string }>(`SELECT id FROM ai_usage_days LIMIT 1`);
    await expect(
      sql().query(`UPDATE ai_usage_days SET responses = -1 WHERE id = $1`, [row.rows[0].id]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      sql().query(`UPDATE ai_usage_days SET coverage = 'NOT_OBSERVABLE' WHERE responses > 0`),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
