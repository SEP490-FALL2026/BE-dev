import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { trySessionAdvisoryLock } from '../../../src/infrastructure/database/session-advisory-lock';
import { ruleRunLockName } from '../../../src/modules/optimization/rule-run/rule-run.policy';
import { UsageRulesService } from '../../../src/modules/optimization/usage-rules/usage-rules.service';
import { pretendBusinessToday } from '../../support/pretend-today';
import { UsageHarness } from '../../support/vendor-usage-harness';

const h = new UsageHarness();
const URL = '/api/v1/ghost-seat-rule-runs';
/** A Monday no other test of this file uses as its business day. */
const TODAY = '2026-08-03';

interface RunWire {
  id: string;
  ruleSet: 'G1_G2' | 'G3_G4';
  periodKey: string;
  status: string;
  createdCount: number;
  updatedCount: number;
  skippedByGate: { gate: string; count: number }[];
}

/**
 * AF-01 (MF-5 demo), `FR-4.12b`: a run of the rules asked for by hand runs the services of the schedule now, on PostgreSQL — it makes
 * the `G1` of a subscription with free seats and the `G3` of a seat never used, a second run makes none twice, a period the schedule
 * already ran does not stop it, a run under way answers 409, and each run is audited with who asked.
 */
describe('POST /ghost-seat-rule-runs: the rules run by hand (integration, real PostgreSQL)', () => {
  let world: { subscriptionId: string; people: string[]; sourceId: string; window: { from: string; to: string } };

  beforeAll(async () => {
    await h.start();
    pretendBusinessToday(h.ctx.app, TODAY);
    const { applicationId, subscriptionId } = await h.usageApp();
    const codes = ['RRN0', 'RRN1'];
    const window = { from: addDays(TODAY, -91), to: addDays(TODAY, -1) };
    await h.seatsOn(
      subscriptionId!,
      codes.map((code) => ({ code, grantedOn: addDays(window.from, -1) })),
    );
    const people: string[] = [];
    for (const code of codes) people.push(await h.person(code));
    const source = await h.source(applicationId, { evidenceDirection: 'POSITIVE_AND_NEGATIVE' });
    world = { subscriptionId: subscriptionId!, people, sourceId: source.id, window };
  }, 360000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
  }, 120000);

  const recommendations = async (group: 'G1' | 'G3', where: string, value: string) =>
    (
      await h.ctx.sql.query<{ id: string; state: string; free_seats: number | null; created_run_id: string }>(
        `SELECT id, state, free_seats, created_run_id FROM ghost_seat_recommendations WHERE "group" = $1 AND ${where} = $2`,
        [group, value],
      )
    ).rows;
  const runNow = (token: string, body: object = {}) =>
    request(h.server()).post(URL).set('Authorization', `Bearer ${token}`).send(body);
  const runsOf = (response: { body: unknown }) => (response.body as { data: { runs: RunWire[] } }).data.runs;

  it('AF-01: usage confirmed after the weekly run waits for next week; the IT Admin runs both sets now and gets G1 and G3', async () => {
    const usageRules = h.ctx.app.get(UsageRulesService);
    // The schedule runs G3/G4 for this ISO week before any report: no evidence, no G3.
    expect(await usageRules.run(new Date())).toMatchObject({ ruleSet: 'G3_G4', status: 'COMPLETED' });
    expect(await recommendations('G3', 'employee_id', world.people[0])).toEqual([]);
    // RRN0 is never named by the report (a seat never used); RRN1 was active ten days ago.
    await h.confirmed(world.sourceId, h.report(['email', 'last_active'], [['rrn1@acme.vn', addDays(TODAY, -10)]]), {
      coverageFrom: world.window.from,
      coverageTo: world.window.to,
    });
    // The week is taken: the schedule alone would make nothing until next week (the gap of AF-01).
    expect(await usageRules.run(new Date())).toBeNull();

    const response = await runNow(h.it1.accessToken);

    expect(response.status).toBe(201);
    const runs = runsOf(response);
    expect(runs.map((run) => [run.ruleSet, run.status])).toEqual([
      ['G1_G2', 'COMPLETED'],
      ['G3_G4', 'COMPLETED'],
    ]);
    expect(runs.every((run) => run.periodKey.startsWith('MANUAL-'))).toBe(true);
    const [g1] = await recommendations('G1', 'subscription_id', world.subscriptionId);
    expect(g1).toMatchObject({ state: 'OPEN', free_seats: 98, created_run_id: runs[0].id });
    const g3 = await recommendations('G3', 'employee_id', world.people[0]);
    expect(g3).toHaveLength(1);
    expect(g3[0]).toMatchObject({ state: 'OPEN', created_run_id: runs[1].id });
    expect(await recommendations('G3', 'employee_id', world.people[1])).toEqual([]);
    // Each run is audited with the person who asked.
    const { rows: audits } = await h.ctx.sql.query<{ actor_kind: string; actor_roles: string[] }>(
      `SELECT actor_kind::text, actor_roles FROM audit_events
        WHERE action = 'GHOST_SEAT.RULE_RUN_REQUESTED' AND resource_type = 'GHOST_SEAT_RULE_RUN' AND resource_id = ANY($1::text[])`,
      [runs.map((run) => run.id)],
    );
    expect(audits).toHaveLength(2);
    expect(audits.every((row) => row.actor_kind === 'USER' && row.actor_roles.includes('IT_ADMIN'))).toBe(true);
  });

  it('AF-01: running again (the Super Admin, the G1/G2 set only, then both) makes no recommendation twice', async () => {
    const before = {
      g1: await recommendations('G1', 'subscription_id', world.subscriptionId),
      g3: await recommendations('G3', 'employee_id', world.people[0]),
    };

    const g1Only = await runNow(h.admin, { rules: ['G1G2'] });
    const both = await runNow(h.it1.accessToken);

    expect(g1Only.status).toBe(201);
    expect(runsOf(g1Only).map((run) => run.ruleSet)).toEqual(['G1_G2']);
    expect(both.status).toBe(201);
    expect(await recommendations('G1', 'subscription_id', world.subscriptionId)).toEqual(before.g1);
    expect(await recommendations('G3', 'employee_id', world.people[0])).toEqual(before.g3);
    const g3Run = runsOf(both).find((run) => run.ruleSet === 'G3_G4');
    expect(g3Run?.createdCount).toBe(0);
  });

  it('AF-01: answers 409 GHOST_SEAT.RULE_RUN_BUSY while a run of the set holds the lock, and runs nothing', async () => {
    const { rows: before } = await h.ctx.sql.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ghost_seat_rule_runs`,
    );
    const lock = await trySessionAdvisoryLock(
      h.ctx.app.get(ConfigService).getOrThrow<string>('DATABASE_URL'),
      ruleRunLockName(h.seed.organizationId, 'G1_G2'),
    );
    expect(lock).not.toBeNull();
    try {
      const response = await runNow(h.it1.accessToken, { rules: ['G1G2'] });

      expect(response.status).toBe(409);
      expect((response.body as { error: { code: string } }).error.code).toBe('GHOST_SEAT.RULE_RUN_BUSY');
    } finally {
      await lock?.release();
    }
    const { rows: after } = await h.ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ghost_seat_rule_runs`);
    expect(after[0].n).toBe(before[0].n);
  });

  it('AF-01: the runs by hand are listed with the scheduled ones, newest first', async () => {
    const response = await request(h.server()).get(URL).set('Authorization', `Bearer ${h.it1.accessToken}`).expect(200);

    const items = (response.body as { data: { items: RunWire[] } }).data.items;
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items[0].periodKey.startsWith('MANUAL-')).toBe(true);
  });
});
