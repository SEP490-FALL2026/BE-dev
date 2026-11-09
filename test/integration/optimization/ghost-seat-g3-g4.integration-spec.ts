import { randomUUID } from 'node:crypto';
import { addDays } from '../../../src/core/business-date';
import { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import { ghostSeatEvidenceJson } from '../../../src/modules/optimization/ghost-seat/ghost-seat-evidence.json';
import { BoardQueryService } from '../../../src/modules/optimization/board/board-query.service';
import { BoardSummaryService } from '../../../src/modules/optimization/board/board-summary.service';
import { UsageRulesThresholdService } from '../../../src/modules/optimization/usage-rules/threshold/usage-rules-threshold.service';
import { UsageNegationService } from '../../../src/modules/optimization/usage-rules/usage-negation.service';
import { UsageRulesContextService } from '../../../src/modules/optimization/usage-rules/usage-rules-context.service';
import { UsageRulesService } from '../../../src/modules/optimization/usage-rules/usage-rules.service';
import { createDepartment } from '../../support/builders/organization.builder';
import { seedUsageRecommendation } from '../../support/ghost-seat-usage-evidence';
import { pretendBusinessToday } from '../../support/pretend-today';
import { EVENT_SOURCE, UsageHarness } from '../../support/vendor-usage-harness';

const h = new UsageHarness();
let week = 0;
let tag = 0;

/** Every test is judged in an ISO week no other test used, so each run claims its own period (`RULE_SCHEDULE_G3_G4` is weekly). */
const nextToday = (): string => addDays('2026-09-07', 7 * (week += 1));

interface Holder {
  /** The last day of activity the report carries for the person; null for a person the report does not name. */
  last: string | null;
  grantedOn?: string;
}

interface Row {
  id: string;
  group: string;
  state: string;
  close_reason: string | null;
  tier: string | null;
  confidence: string | null;
  activity_status: string | null;
  inactive_days: number | null;
  last_active_date: string | null;
  evidence: Record<string, unknown>;
  previous_recommendation_id: string | null;
  activity_after_decision_on: string | null;
}

describe('G3 / G4: the weekly pass, gates 2-7, the three states, days over the coverage, tiers and confidence (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
  }, 360000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await h.stop();
  }, 120000);

  const service = () => h.ctx.app.get(UsageRulesService);

  /** An application with a source that tells the negative, seats of the holders from `grantedOn`, and one confirmed report. */
  async function world(
    today: string,
    holders: Holder[],
    window: { from: string; to: string },
    options: { event?: boolean; noSource?: boolean } = {},
  ) {
    pretendBusinessToday(h.ctx.app, today);
    tag += 1;
    const { applicationId, planId, subscriptionId } = await h.usageApp();
    const codes = holders.map((_holder, index) => `GX${tag}H${index}`);
    await h.seatsOn(
      subscriptionId!,
      holders.map((holder, index) => ({ code: codes[index], grantedOn: holder.grantedOn ?? addDays(window.from, -1) })),
    );
    const people: string[] = [];
    for (const code of codes) people.push(await h.person(code));
    let sourceId: string | null = null;
    if (!options.noSource) {
      const source = await h.source(applicationId, {
        evidenceDirection: 'POSITIVE_AND_NEGATIVE',
        ...(options.event ? EVENT_SOURCE : {}),
      });
      sourceId = source.id;
      const named = holders.flatMap((holder, index) =>
        holder.last ? [[`${codes[index].toLowerCase()}@acme.vn`, holder.last]] : [],
      );
      await h.confirmed(
        source.id,
        options.event
          ? h.report(
              ['email', 'day', 'event'],
              named.map(([email, day]) => [email, day, 'login']),
            )
          : h.report(['email', 'last_active'], named),
        { coverageFrom: window.from, coverageTo: window.to },
      );
    }

    return { applicationId, planId, subscriptionId: subscriptionId!, codes, people, sourceId };
  }

  const rowsOf = async (employeeId: string): Promise<Row[]> =>
    (
      await h.ctx.sql.query<Row>(
        `SELECT id, "group", state, close_reason, tier, confidence, activity_status, inactive_days,
                to_char(last_active_date, 'YYYY-MM-DD') AS last_active_date, evidence, previous_recommendation_id,
                to_char(activity_after_decision_on, 'YYYY-MM-DD') AS activity_after_decision_on
           FROM ghost_seat_recommendations WHERE employee_id = $1 ORDER BY created_at, id`,
        [employeeId],
      )
    ).rows;

  const noticesOf = async (employeeId: string, code: string) =>
    (
      await h.ctx.sql.query<{ one: number }>(
        `SELECT 1 AS one FROM in_app_notifications WHERE recipient_employee_id = $1 AND code = $2`,
        [employeeId, code],
      )
    ).rows;

  const seatState = async (employeeId: string) =>
    (
      await h.ctx.sql.query<{ status: string; gate: string | null; inactive_days: number | null }>(
        `SELECT status::text, gate::text, inactive_days FROM ghost_seat_seat_states WHERE employee_id = $1`,
        [employeeId],
      )
    ).rows[0];

  const skipOf = async (runId: string, employeeId: string) =>
    (
      await h.ctx.sql.query<{ gate: string; detail: Record<string, unknown> }>(
        `SELECT k.gate::text, k.detail FROM ghost_seat_rule_skips k JOIN license_assignments a ON a.id = k.subject_id
          WHERE k.run_id = $1 AND a.employee_id = $2`,
        [runId, employeeId],
      )
    ).rows[0];

  const seedOn = (employeeId: string, group: 'G2' | 'G4', tier: 'MONITOR' | 'REVIEW' = 'MONITOR') =>
    seedUsageRecommendation(h.ctx.sql, h.seed.organizationId, { employeeId, group, tier });

  it('US-10-03 AC-2, TC-3: a holder the report never names is a G3 of the action tier; the other holder, active 10 days ago, has none', async () => {
    const today = nextToday();
    const w = await world(today, [{ last: null }, { last: addDays(today, -10) }], {
      from: addDays(today, -91),
      to: addDays(today, -1),
    });

    const run = await service().run(new Date());

    expect(run).toMatchObject({ ruleSet: 'G3_G4', status: 'COMPLETED' });
    const [g3] = await rowsOf(w.people[0]);
    expect(g3).toMatchObject({
      group: 'G3',
      state: 'OPEN',
      tier: 'ACTION',
      activity_status: 'NEVER_ACTIVE',
      inactive_days: null,
    });
    expect(['HIGH', 'MEDIUM']).toContain(g3.confidence);
    expect(await rowsOf(w.people[1])).toEqual([]);
    expect(await seatState(w.people[0])).toMatchObject({ status: 'INACTIVE' });
    expect(await seatState(w.people[1])).toMatchObject({ status: 'ACTIVE' });
    // TC-3: the evidence passes the codec, is complete and carries no volume of use.
    const evidence = ghostSeatEvidenceJson.decode(g3.evidence);
    expect(evidence).toMatchObject({ group: 'G3', thresholds: { origin: 'ORGANIZATION' }, coverageDays: 91 });
    expect(JSON.stringify(g3.evidence)).not.toMatch(/tokens|sessions|responses|volume/);
  });

  it('US-10-03 AC-1, AC-5, M5-18: last activity 66 days ago over a window of 91 days is a G4 review of 65 days; 41 days ago is a watch on the board, no recommendation', async () => {
    const today = nextToday();
    const w = await world(
      today,
      [{ last: addDays(today, -66) }, { last: addDays(today, -41) }, { last: addDays(today, -3) }],
      {
        from: addDays(today, -91),
        to: addDays(today, -1),
      },
    );

    await service().run(new Date());

    expect((await rowsOf(w.people[0]))[0]).toMatchObject({
      group: 'G4',
      tier: 'REVIEW',
      inactive_days: 65,
      state: 'OPEN',
      activity_status: 'INACTIVE',
    });
    // M5-18, FR-4.12: the watch tier is the board's only, never a recommendation.
    expect(await rowsOf(w.people[1])).toEqual([]);
    expect(await seatState(w.people[1])).toMatchObject({ status: 'INACTIVE', inactive_days: 40 });
    expect(await rowsOf(w.people[2])).toEqual([]);
  });

  it('DA6-05: reports of two separate months count only the covered days (20 + 31 = 51, a watch), not the gap', async () => {
    const today = nextToday();
    pretendBusinessToday(h.ctx.app, today);
    tag += 1;
    const { applicationId, subscriptionId } = await h.usageApp();
    const code = `GX${tag}GAP`;
    await h.seatsOn(subscriptionId!, [{ code, grantedOn: addDays(today, -200) }]);
    const person = await h.person(code);
    const other = `GX${tag}OTH`;
    await h.seatsOn(subscriptionId!, [{ code: other, grantedOn: addDays(today, -200) }]);
    await h.person(other);
    const source = await h.source(applicationId, { evidenceDirection: 'POSITIVE_AND_NEGATIVE' });
    const first = addDays(today, -92);
    const second = addDays(today, -31);
    const email = `${code.toLowerCase()}@acme.vn`;
    const otherEmail = `${other.toLowerCase()}@acme.vn`;
    const lastDay = addDays(first, 9);
    await h.confirmed(
      source.id,
      h.report(
        ['email', 'last_active'],
        [
          [email, lastDay],
          [otherEmail, addDays(today, -2)],
        ],
      ),
      {
        coverageFrom: first,
        coverageTo: addDays(first, 29),
      },
    );
    await h.confirmed(
      source.id,
      h.report(
        ['email', 'last_active'],
        [
          [email, lastDay],
          [otherEmail, addDays(today, -2)],
        ],
      ),
      {
        coverageFrom: second,
        coverageTo: addDays(today, -1),
      },
    );

    await service().run(new Date());

    // M5-18: a watch is the state of the seat only.
    expect(await rowsOf(person)).toEqual([]);
    expect(await seatState(person)).toMatchObject({ status: 'INACTIVE', inactive_days: 20 + 31 });
  });

  it('US-10-02 AC-12, AC-2: a seat usable 10 days ago is new and left out; so is one whose grant waits; neither is a recommendation', async () => {
    const today = nextToday();
    const w = await world(today, [{ last: null, grantedOn: addDays(today, -10) }, { last: addDays(today, -2) }], {
      from: addDays(today, -91),
      to: addDays(today, -1),
    });

    const run = await service().run(new Date());

    expect(await rowsOf(w.people[0])).toEqual([]);
    expect(await skipOf(run!.id, w.people[0])).toMatchObject({ gate: 'NEW_ASSIGNMENT' });
    expect(await seatState(w.people[0])).toMatchObject({ status: 'EXCLUDED', gate: 'NEW_ASSIGNMENT' });
  });

  it('M5-01, FR-4.9 gate 4, QĐ-77n: a seat granted long ago whose grant task is still open is NOT_USABLE, never a G3', async () => {
    const today = nextToday();
    const w = await world(today, [{ last: null }, { last: addDays(today, -2) }], {
      from: addDays(today, -91),
      to: addDays(today, -1),
    });
    // The invitation is still waiting: the grant task of the first link was never completed.
    await h.ctx.sql.query(
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, max_attempts, created_by_app_user_id)
       SELECT gen_random_uuid(), organization_id, id, 'GRANT', 'MANUAL', gen_random_uuid(), 4, gen_random_uuid()
         FROM license_assignments WHERE employee_id = $1`,
      [w.people[0]],
    );

    const run = await service().run(new Date());

    expect(await rowsOf(w.people[0])).toEqual([]);
    expect(await skipOf(run!.id, w.people[0])).toMatchObject({ gate: 'NOT_USABLE' });
    expect(await seatState(w.people[0])).toMatchObject({ status: 'EXCLUDED', gate: 'NOT_USABLE' });
  });

  it('US-10-03 AC-3: an application with no source has every seat NO_DATA, never inactive and never a G3', async () => {
    const today = nextToday();
    const w = await world(
      today,
      [{ last: null }, { last: null }],
      { from: addDays(today, -91), to: addDays(today, -1) },
      { noSource: true },
    );

    const run = await service().run(new Date());

    for (const person of w.people) {
      expect(await rowsOf(person)).toEqual([]);
      expect(await seatState(person)).toMatchObject({ status: 'NO_DATA', gate: 'NO_DATA' });
      expect(await skipOf(run!.id, person)).toMatchObject({ gate: 'NO_DATA' });
    }
  });

  it('US-10-02 AC-3, Q-91: a report that ended 9 days ago is stale: STALE_SOURCE, no G3, and the IT Admin is told once however many weeks pass', async () => {
    const today = nextToday();
    const w = await world(today, [{ last: null }, { last: addDays(today, -20) }], {
      from: addDays(today, -100),
      to: addDays(today, -9),
    });

    const run = await service().run(new Date());

    expect(await rowsOf(w.people[0])).toEqual([]);
    expect(await skipOf(run!.id, w.people[0])).toMatchObject({ gate: 'STALE_SOURCE' });
    expect(await seatState(w.people[0])).toMatchObject({ status: 'INSUFFICIENT_EVIDENCE' });
    const notices = async () =>
      (
        await h.ctx.sql.query<{ params: Record<string, unknown> }>(
          `SELECT params FROM in_app_notifications WHERE code = 'USAGE_SOURCE_STALE' AND params->>'applicationId' = $1`,
          [w.applicationId],
        )
      ).rows;
    // M5-36: every usable IT Admin is told, once each.
    const itAdmins = await h.ctx.app.get(IdentityAccessApi).findAllUsableItAdminEmployeeIds();
    expect(itAdmins.length).toBeGreaterThan(0);
    expect(await notices()).toHaveLength(itAdmins.length);
    expect((await notices())[0].params).toMatchObject({ coverageTo: addDays(today, -9), freshnessDays: 9 });

    // The next week the same report is the same source and day: nothing more is said.
    const later = nextToday();
    pretendBusinessToday(h.ctx.app, later);
    await service().run(new Date());
    expect(await notices()).toHaveLength(itAdmins.length);
  });

  it('US-10-02 AC-5, US-10-03 AC-9: covered 48 days (usable 15/07, window to 31/08) is left out for COVERAGE; 78 days is judged', async () => {
    const today = nextToday();
    const w = await world(
      today,
      [
        { last: null, grantedOn: addDays(today, -48) },
        { last: null, grantedOn: addDays(today, -78) },
        { last: addDays(today, -2), grantedOn: addDays(today, -78) },
      ],
      { from: addDays(today, -78), to: addDays(today, -1) },
    );

    const run = await service().run(new Date());

    expect(await rowsOf(w.people[0])).toEqual([]);
    expect(await skipOf(run!.id, w.people[0])).toMatchObject({ gate: 'COVERAGE', detail: { requiredDays: 60 } });
    expect(await seatState(w.people[0])).toMatchObject({ status: 'INSUFFICIENT_EVIDENCE', gate: 'COVERAGE' });
    expect((await rowsOf(w.people[1]))[0]).toMatchObject({ group: 'G3' });
  });

  it('INV-12, TC-2: an identifier of the application tied to no one stops a G3 for the holder who is not seen: UNMATCHED_IDENTITY', async () => {
    const today = nextToday();
    pretendBusinessToday(h.ctx.app, today);
    tag += 1;
    const { applicationId, subscriptionId } = await h.usageApp();
    const codes = [`GX${tag}U0`, `GX${tag}U1`];
    await h.seatsOn(
      subscriptionId!,
      codes.map((code) => ({ code, grantedOn: addDays(today, -100) })),
    );
    const people = [await h.person(codes[0]), await h.person(codes[1])];
    const source = await h.source(applicationId, { evidenceDirection: 'POSITIVE_AND_NEGATIVE' });
    await h.confirmed(
      source.id,
      h.report(
        ['email', 'last_active'],
        [
          [`${codes[1].toLowerCase()}@acme.vn`, addDays(today, -2)],
          ['nobody-knows@acme.vn', addDays(today, -3)],
        ],
      ),
      { coverageFrom: addDays(today, -91), coverageTo: addDays(today, -1) },
    );

    const run = await service().run(new Date());

    expect(await rowsOf(people[0])).toEqual([]);
    expect(await skipOf(run!.id, people[0])).toMatchObject({ gate: 'UNMATCHED_IDENTITY' });
    expect(await seatState(people[0])).toMatchObject({ status: 'UNMATCHED_IDENTITY' });
  });

  it('FR-4.11, DA6-13, CF-7: a holder who only logged in is inactive for every covered day (70, review) with a contradicting signal, medium; never a G3', async () => {
    const today = nextToday();
    const w = await world(
      today,
      [{ last: addDays(today, -1) }, { last: addDays(today, -1) }],
      { from: addDays(today, -70), to: addDays(today, -1) },
      { event: true },
    );

    await service().run(new Date());

    const rows = await rowsOf(w.people[0]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      group: 'G4',
      tier: 'REVIEW',
      inactive_days: 70,
      activity_status: 'INACTIVE',
      confidence: 'MEDIUM',
    });
    expect(JSON.stringify(rows[0].evidence)).toMatch(/Contradicting signal/);
  });

  it('FR-4.13, US-10-03 AC-6: an application threshold of 120 for review keeps 80 days a watch, with the origin APPLICATION', async () => {
    const today = nextToday();
    const w = await world(today, [{ last: addDays(today, -81) }, { last: addDays(today, -2) }], {
      from: addDays(today, -125),
      to: addDays(today, -1),
    });
    await h.ctx.sql.query(
      `INSERT INTO ghost_seat_application_thresholds (organization_id, application_id, monitor_days, review_days, action_days, updated_by_app_user_id)
       VALUES ($1, $2, 30, 120, 200, gen_random_uuid())`,
      [h.seed.organizationId, w.applicationId],
    );

    await service().run(new Date());

    // M5-18: 80 days under a review threshold of 120 is a watch: on the board, no recommendation.
    expect(await rowsOf(w.people[0])).toEqual([]);
    expect(await seatState(w.people[0])).toMatchObject({ status: 'INACTIVE', inactive_days: 80 });
  });

  it('R-J01 / DA6-16: a right that ends within a month is left out and not recommended; an open G4 of one that now ends within a month closes LEFT_TO_EXPIRE with no notice', async () => {
    const today = nextToday();
    const w = await world(
      today,
      [{ last: addDays(today, -66) }, { last: addDays(today, -66) }, { last: addDays(today, -2) }],
      {
        from: addDays(today, -91),
        to: addDays(today, -1),
      },
    );
    await h.ctx.sql.query(`UPDATE license_assignments SET expected_end_date = $2 WHERE employee_id = $1`, [
      w.people[1],
      addDays(today, 20),
    ]);

    const run = await service().run(new Date());

    expect(await rowsOf(w.people[1])).toEqual([]);
    expect(await skipOf(run!.id, w.people[1])).toMatchObject({ gate: 'TIME_BOUND_ENDING' });
    const [open] = await rowsOf(w.people[0]);
    expect(open).toMatchObject({ group: 'G4', state: 'OPEN' });

    const later = nextToday();
    pretendBusinessToday(h.ctx.app, later);
    await h.ctx.sql.query(`UPDATE license_assignments SET expected_end_date = $2 WHERE employee_id = $1`, [
      w.people[0],
      addDays(later, 20),
    ]);
    await service().run(new Date());

    expect((await rowsOf(w.people[0]))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'LEFT_TO_EXPIRE' });
    expect(await noticesOf(w.people[0], 'GHOST_SEAT_NEW')).toEqual([]);
  });

  it('M5-18, FR-4.12: a seat that was a watch on the board becomes a review recommendation once it rises a tier', async () => {
    const today = nextToday();
    const w = await world(today, [{ last: addDays(today, -41) }, { last: addDays(today, -2) }], {
      from: addDays(today, -91),
      to: addDays(today, -1),
    });
    await service().run(new Date());
    // M5-18: the watch is the board's only; the review it rises to is the first recommendation of the seat.
    expect(await rowsOf(w.people[0])).toEqual([]);

    // Four weeks on, with a newer report that adds no activity, the same seat has 68 days: the watch rises to review in the same row.
    const later = addDays(today, 28);
    pretendBusinessToday(h.ctx.app, later);
    const source = w.sourceId!;
    await h.confirmed(
      source,
      h.report(
        ['email', 'last_active'],
        [
          [`${w.codes[0].toLowerCase()}@acme.vn`, addDays(today, -41)],
          [`${w.codes[1].toLowerCase()}@acme.vn`, addDays(later, -2)],
        ],
      ),
      { coverageFrom: addDays(today, 0), coverageTo: addDays(later, -1) },
    );
    week += 4;
    await service().run(new Date());

    const rows = await rowsOf(w.people[0]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tier: 'REVIEW', group: 'G4' });
    expect(rows[0].inactive_days).toBeGreaterThanOrEqual(60);
  });

  it('M5-02, FR-4.9 gate 8: a seat whose G2 is still open is left out with OPEN_RECOMMENDATION; no G3 is tried, nothing fails', async () => {
    const today = nextToday();
    const w = await world(today, [{ last: null }, { last: addDays(today, -2) }], {
      from: addDays(today, -91),
      to: addDays(today, -1),
    });
    const g2 = await seedOn(w.people[0], 'G2');

    const run = await service().run(new Date());

    expect(await rowsOf(w.people[0])).toEqual([expect.objectContaining({ id: g2, group: 'G2', state: 'OPEN' })]);
    expect(await skipOf(run!.id, w.people[0])).toMatchObject({ gate: 'OPEN_RECOMMENDATION' });
    expect(await seatState(w.people[0])).toMatchObject({ status: 'EXCLUDED', gate: 'OPEN_RECOMMENDATION' });
    expect(run).toMatchObject({ status: 'COMPLETED' });
  });

  it('M5-12, FR-4.9 gates 3 and 7: an undecided G4 of a holder now on long leave closes OUT_OF_SCOPE; one whose right ends within a month closes LEFT_TO_EXPIRE even while on leave', async () => {
    const today = nextToday();
    const w = await world(
      today,
      [{ last: addDays(today, -66) }, { last: addDays(today, -66) }, { last: addDays(today, -2) }],
      { from: addDays(today, -91), to: addDays(today, -1) },
    );
    const onLeave = await seedOn(w.people[0], 'G4', 'REVIEW');
    const ending = await seedOn(w.people[1], 'G4', 'REVIEW');
    for (const person of [w.people[0], w.people[1]]) {
      await h.ctx.sql.query(
        `INSERT INTO employee_leaves (id, organization_id, employee_id, started_on, approved_return_on, status, grounds_type,
                                      grounds_reference, grounds_issuer, grounds_issued_on, started_by_app_user_id)
         VALUES (gen_random_uuid(), $1, $2, $3::date, $4::date, 'ACTIVE', 'T', 'M5-12', 'I', $3::date, gen_random_uuid())`,
        [h.seed.organizationId, person, addDays(today, -1), addDays(today, 60)],
      );
    }
    await h.ctx.sql.query(`UPDATE license_assignments SET expected_end_date = $2 WHERE employee_id = $1`, [
      w.people[1],
      addDays(today, 20),
    ]);

    const run = await service().run(new Date());

    expect((await rowsOf(w.people[0]))[0]).toMatchObject({
      id: onLeave,
      state: 'CLOSED',
      close_reason: 'OUT_OF_SCOPE',
    });
    expect(await skipOf(run!.id, w.people[0])).toMatchObject({ gate: 'LEAVE_OR_HANDOVER' });
    expect((await rowsOf(w.people[1]))[0]).toMatchObject({
      id: ending,
      state: 'CLOSED',
      close_reason: 'LEFT_TO_EXPIRE',
    });
  });

  it('M5-14: a fault of the rules while a report is confirmed is undone behind a savepoint; the import is kept COMPLETED', async () => {
    jest.spyOn(h.ctx.app.get(UsageNegationService), 'negateForApplication').mockImplementation(async (tx) => {
      // A statement that fails aborts the transaction unless the listener fenced it.
      await tx.$executeRawUnsafe('SELECT 1 / 0');

      return 0;
    });
    const today = nextToday();
    const w = await world(today, [{ last: addDays(today, -2) }], { from: addDays(today, -91), to: addDays(today, -1) });

    const { rows } = await h.ctx.sql.query<{ status: string }>(
      `SELECT status::text FROM usage_imports WHERE source_id = $1`,
      [w.sourceId],
    );
    expect(rows).toEqual([{ status: 'COMPLETED' }]);
  });

  it('M5-13, TC-2: a recommendation a report denied while the pass ran is not made again from the evidence the pass read before', async () => {
    const today = nextToday();
    const w = await world(today, [{ last: addDays(today, -66) }, { last: addDays(today, -2) }], {
      from: addDays(today, -91),
      to: addDays(today, -1),
    });
    const denied = await seedOn(w.people[0], 'G4', 'REVIEW');
    const context = h.ctx.app.get(UsageRulesContextService);
    const original = context.applicationOf.bind(context);
    jest.spyOn(context, 'applicationOf').mockImplementation(async (run, applicationId, seats) => {
      const app = await original(run, applicationId, seats);
      // The listener of a confirmed report closes it after the pass began and after it read the evidence.
      await h.ctx.sql.query(
        `UPDATE ghost_seat_recommendations SET state = 'CLOSED', close_reason = 'NEGATED', closed_at = now() + interval '1 second'
          WHERE id = $1 AND state <> 'CLOSED'`,
        [denied],
      );

      return app;
    });

    await service().run(new Date());

    expect(await rowsOf(w.people[0])).toEqual([expect.objectContaining({ id: denied, close_reason: 'NEGATED' })]);
  });

  it('M5-18, FR-4.12: a watch made before is closed OUT_OF_SCOPE by the next pass and holds no place at gate 8', async () => {
    const today = nextToday();
    const w = await world(today, [{ last: addDays(today, -41) }, { last: addDays(today, -2) }], {
      from: addDays(today, -91),
      to: addDays(today, -1),
    });
    const watch = await seedOn(w.people[0], 'G4');
    // The watch was made from the last day the report shows (41 days ago): no later day of activity denies it (NEGATED), whatever today is.
    // The denial reads the column `last_active_date`, the evidence only shows it: both are written.
    await h.ctx.sql.query(
      `UPDATE ghost_seat_recommendations
          SET evidence = jsonb_set(evidence, '{lastActiveDate}', to_jsonb($2::text)), last_active_date = $2::date
        WHERE id = $1`,
      [watch, addDays(today, -41)],
    );

    await service().run(new Date());

    expect((await rowsOf(w.people[0]))[0]).toMatchObject({ id: watch, state: 'CLOSED', close_reason: 'OUT_OF_SCOPE' });
    expect(await rowsOf(w.people[0])).toHaveLength(1);
  });

  it('US-10-04 AC-5, Q-92: the confirmation of a report with activity after the last day closes an undecided G4 NEGATED at once, with no notice; a decided reclaim stays and is flagged', async () => {
    const today = nextToday();
    const w = await world(
      today,
      [{ last: addDays(today, -66) }, { last: addDays(today, -66) }, { last: addDays(today, -2) }],
      {
        from: addDays(today, -91),
        to: addDays(today, -1),
      },
    );
    await service().run(new Date());
    const [open] = await rowsOf(w.people[0]);
    const [decided] = await rowsOf(w.people[1]);
    expect(open).toMatchObject({ state: 'OPEN' });
    await h.ctx.sql.query(`UPDATE ghost_seat_recommendations SET state = 'RECLAIM_DECIDED' WHERE id = $1`, [
      decided.id,
    ]);

    const yesterday = addDays(today, -1);
    await h.confirmed(
      w.sourceId!,
      h.report(
        ['email', 'last_active'],
        [
          [`${w.codes[0].toLowerCase()}@acme.vn`, yesterday],
          [`${w.codes[1].toLowerCase()}@acme.vn`, yesterday],
          [`${w.codes[2].toLowerCase()}@acme.vn`, addDays(today, -2)],
        ],
      ),
      { coverageFrom: addDays(today, -91), coverageTo: addDays(today, -1) },
    );

    expect((await rowsOf(w.people[0]))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'NEGATED' });
    expect((await rowsOf(w.people[1]))[0]).toMatchObject({
      state: 'RECLAIM_DECIDED',
      activity_after_decision_on: yesterday,
    });
    expect(await noticesOf(w.people[0], 'GHOST_SEAT_NEW')).toEqual([]);
  });

  it('QĐ-90c (DA6-15): a holder in a transfer that has taken effect gets the new G4 already PAUSED, with the transfer named', async () => {
    const today = nextToday();
    const w = await world(today, [{ last: addDays(today, -66) }, { last: addDays(today, -2) }], {
      from: addDays(today, -91),
      to: addDays(today, -1),
    });
    const transferId = await insertTransfer(w.people[0], addDays(today, -3));

    await service().run(new Date());

    expect((await rowsOf(w.people[0]))[0]).toMatchObject({ group: 'G4', state: 'PAUSED' });
    const paused = await h.ctx.sql.query<{ pause_transfer_id: string; paused_at: Date }>(
      `SELECT pause_transfer_id, paused_at FROM ghost_seat_recommendations WHERE employee_id = $1`,
      [w.people[0]],
    );
    expect(paused.rows[0].pause_transfer_id).toBe(transferId);
    expect(paused.rows[0].paused_at).not.toBeNull();
  });

  it('FR-5.10: the board gives each seat one state, a seat with no data or an identity not matched has no days, and the summary names them apart from the inactive', async () => {
    const today = nextToday();
    const noData = await world(
      today,
      [{ last: null }, { last: null }],
      { from: addDays(today, -91), to: addDays(today, -1) },
      { noSource: true },
    );
    const active = await world(today, [{ last: addDays(today, -2) }, { last: addDays(today, -80) }], {
      from: addDays(today, -91),
      to: addDays(today, -1),
    });
    await service().run(new Date());

    const states = await h.ctx.app
      .get(BoardQueryService)
      .listSeatStates({ applicationId: noData.applicationId, page: 1, pageSize: 10 });
    expect(states.items).toHaveLength(2);
    expect(states.items[0]).toMatchObject({
      status: 'NO_DATA',
      reason: 'NO_DATA',
      lastActiveDate: null,
      inactiveDays: null,
    });
    const inactive = await h.ctx.app
      .get(BoardQueryService)
      .listSeatStates({ applicationId: active.applicationId, status: 'INACTIVE', page: 1, pageSize: 10 });
    expect(inactive.items).toHaveLength(1);
    expect(inactive.items[0].inactiveDays).toBeGreaterThanOrEqual(60);
    const summary = await h.ctx.app.get(BoardSummaryService).summary();
    expect(summary.usage.noSource).toBeGreaterThanOrEqual(2);
    expect(summary.usage.inactive).toBeGreaterThanOrEqual(1);
    expect(summary.groups.G4.unclosedCount).toBeGreaterThanOrEqual(1);
  });

  it('FR-4.13: the thresholds of an application are set, read, audited and removed; days out of order and an unknown application are refused', async () => {
    const today = nextToday();
    const w = await world(today, [{ last: addDays(today, -2) }], { from: addDays(today, -91), to: addDays(today, -1) });
    const thresholds = h.ctx.app.get(UsageRulesThresholdService);
    const actor = {
      appUserId: h.seed.superAdmin.appUserId,
      roles: ['SUPER_ADMIN'],
      sessionId: 'session-1',
      employeeId: h.seed.superAdmin.employeeId,
    } as never;

    await expect(
      thresholds.set(actor, w.applicationId, { monitorDays: 60, reviewDays: 30, actionDays: 90 }),
    ).rejects.toThrow(/rise/);
    await expect(
      thresholds.set(actor, '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', {
        monitorDays: 30,
        reviewDays: 60,
        actionDays: 90,
      }),
    ).rejects.toThrow(/exist/);
    const set = await thresholds.set(actor, w.applicationId, { monitorDays: 20, reviewDays: 40, actionDays: 80 });
    expect(set.threshold).toMatchObject({
      applicationId: w.applicationId,
      monitorDays: 20,
      reviewDays: 40,
      actionDays: 80,
    });
    expect((await thresholds.list({ page: 1, pageSize: 100 })).items.map((item) => item.applicationId)).toContain(
      w.applicationId,
    );
    const audit = await h.ctx.sql.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE resource_type = 'GHOST_SEAT_THRESHOLD' AND resource_id = $1 ORDER BY occurred_at`,
      [w.applicationId],
    );
    expect(audit.rows.map((row) => row.action)).toEqual(['GHOST_SEAT_THRESHOLD.SET']);

    await thresholds.remove(actor, w.applicationId);
    expect((await thresholds.list({ page: 1, pageSize: 100 })).items.map((item) => item.applicationId)).not.toContain(
      w.applicationId,
    );
    await expect(thresholds.remove(actor, w.applicationId)).rejects.toThrow(/exist/);
  });

  async function insertTransfer(employeeId: string, effectiveOn: string): Promise<string> {
    const target = await createDepartment(h.ctx, h.admin, { code: `GXT${tag}`, name: `Target ${tag}` });
    const id = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO department_transfers (id, organization_id, employee_id, from_department_id, to_department_id, effective_on, status,
         effective_at, closes_placement_id, opens_placement_id, grounds_type, grounds_reference, grounds_issuer, grounds_issued_on,
         recorded_by_app_user_id)
       VALUES ($1, $2, $3, $4, $5, $6::date, 'EFFECTIVE', now(), gen_random_uuid(), gen_random_uuid(), 'DECISION', 'D-1', 'HR', $6::date,
         gen_random_uuid())`,
      [id, h.seed.organizationId, employeeId, h.seed.departmentId, target.id, effectiveOn],
    );

    return id;
  }
});
