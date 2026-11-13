import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDays } from '../../../src/core/business-date';
import { graceOf } from '../../../src/modules/personnel/transfer-grace/transfer-grace.policy';
import { PROJECT_ROOT } from '../../support/cli-process';
import { migrationEndingWith } from '../../support/migration-history';
import type { Department } from '../../support/request-harness';
import { TransferHarness } from '../../support/transfer-harness';

const h = new TransferHarness();

/**
 * `MF3-B.2` (m-17, `QĐ-110p`, `QĐ-110r`, D-82): every transfer that took effect and is not closed gets its grace from the day of the release,
 * whatever it has in the old model — no review at all (the person held no seat, so the old code opened none), a review still open, or one that
 * was decided or superseded without the IT Admin closing the transfer — and the reviews still open of those transfers end as `SUPERSEDED`.
 * The migration is run again on rows written the way the old release left them; the days are the ones of the policy of the grace.
 */
describe('the grace of the transfers that took effect before the release (integration, real PostgreSQL)', () => {
  let from: Department;
  let to: Department;
  let sequence = 0;
  const NOTICES: string[] = [];
  const sql = <T extends object = Record<string, unknown>>(text: string, values: unknown[] = []) =>
    h.ctx.sql.query<T>(text, values);

  beforeAll(async () => {
    await h.start();
    from = await h.departmentWithUnit('P-BF-FROM');
    to = await h.departmentWithUnit('P-BF-TO');
    h.ctx.sql.on('notice', (notice) => NOTICES.push(notice.message ?? ''));
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const migration = () =>
    readFileSync(
      join(
        PROJECT_ROOT,
        'prisma',
        'migrations',
        migrationEndingWith('_personnel_transfer_grace_backfill'),
        'migration.sql',
      ),
      'utf8',
    );

  /** A transfer that took effect today, written the way the old release left it: no grace and no snapshot, `backdate` days ago. */
  const oldTransfer = async (backdate = 30): Promise<{ id: string; employeeId: string; effectiveOn: string }> => {
    sequence += 1;
    const person = await h.veteran(from, `BF-E${sequence}`);
    const wire = await h.moveToday(person, to);
    await sql('BEGIN');
    try {
      await sql('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await sql(
        `UPDATE department_transfers SET grace_ends_on = NULL, grace_reminder_on = NULL, reminded_at = NULL,
                snapshot_before = NULL, effective_on = effective_on - $2::int WHERE id = $1`,
        [wire.id, backdate],
      );
      await sql('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await sql('COMMIT');
    } catch (error) {
      await sql('ROLLBACK');
      throw error;
    }

    return { id: wire.id, employeeId: person.employeeId, effectiveOn: addDays(wire.effectiveOn, -backdate) };
  };
  /** The review the old release opened for the transfer, in the state given. */
  const reviewOf = async (id: string, status: 'OPEN' | 'COMPLETED' | 'SUPERSEDED'): Promise<string> => {
    const { rows } = await sql<{ id: string }>(
      `INSERT INTO transfer_reviews (id, organization_id, employee_id, transfer_id, placement_id, department_id, effective_on, due_on,
                                     status, completed_at)
       SELECT gen_random_uuid(), t.organization_id, t.employee_id, t.id, t.opens_placement_id, t.to_department_id, t.effective_on,
              t.effective_on + 5, $2::"TransferReviewStatus", CASE WHEN $2 = 'COMPLETED' THEN now() END
         FROM department_transfers t WHERE t.id = $1 RETURNING id`,
      [id, status],
    );

    return rows[0].id;
  };
  const graceOfRow = async (id: string) =>
    (
      await sql(
        `SELECT to_char(grace_ends_on, 'YYYY-MM-DD') AS ends, to_char(grace_reminder_on, 'YYYY-MM-DD') AS reminder,
                snapshot_before, closed_at
           FROM department_transfers WHERE id = $1`,
        [id],
      )
    ).rows[0] as { ends: string | null; reminder: string | null; snapshot_before: unknown; closed_at: Date | null };
  const reviewStatus = async (id: string): Promise<string> =>
    (await sql<{ status: string }>('SELECT status::text AS status FROM transfer_reviews WHERE id = $1', [id])).rows[0]
      .status;
  /** The grace of the policy over a calendar with the days off given, from the day of the release. */
  const policy = (effectiveOn: string, off: ReadonlySet<string> = new Set()) =>
    graceOf({
      effectiveOn,
      notedOn: h.today(),
      workingDays: 5,
      reminderWorkingDays: 2,
      nonWorkingDates: off,
    });

  it('gives the grace of the policy, from the day of the release, to a transfer that has no review at all (the person held no seat)', async () => {
    const old = await oldTransfer();

    await sql(migration());

    const grace = policy(old.effectiveOn);
    expect(await graceOfRow(old.id)).toMatchObject({
      ends: grace.endsOn,
      reminder: grace.reminderOn,
      snapshot_before: null,
    });
    // Not the thirty days ago it took effect: the person is given the whole grace from the day of the release.
    expect(grace.startsOn).toBe(h.today());
    expect(grace.endsOn > addDays(h.today(), 3)).toBe(true);
  }, 120_000);

  it('gives it to a transfer whose review is still open, and ends that review as superseded without deleting it or its lines', async () => {
    const old = await oldTransfer();
    const review = await reviewOf(old.id, 'OPEN');

    await sql(migration());

    const grace = policy(old.effectiveOn);
    expect(await graceOfRow(old.id)).toMatchObject({ ends: grace.endsOn, reminder: grace.reminderOn });
    expect(await reviewStatus(review)).toBe('SUPERSEDED');
    expect(
      (await sql<{ n: number }>('SELECT count(*)::int AS n FROM transfer_reviews WHERE id = $1', [review])).rows[0].n,
    ).toBe(1);
  }, 120_000);

  it('gives it to a transfer whose review was decided or superseded and that nobody closed, and leaves those reviews as they are', async () => {
    const completed = await oldTransfer();
    const superseded = await oldTransfer();
    const completedReview = await reviewOf(completed.id, 'COMPLETED');
    const supersededReview = await reviewOf(superseded.id, 'SUPERSEDED');

    await sql(migration());

    for (const old of [completed, superseded]) {
      const grace = policy(old.effectiveOn);
      expect(await graceOfRow(old.id)).toMatchObject({ ends: grace.endsOn, reminder: grace.reminderOn });
    }
    expect([await reviewStatus(completedReview), await reviewStatus(supersededReview)]).toEqual([
      'COMPLETED',
      'SUPERSEDED',
    ]);
  }, 120_000);

  it('leaves alone a transfer that waits, one that was cancelled and one an IT Admin closed, and the open review of the closed one', async () => {
    sequence += 1;
    const waitingPerson = await h.veteran(from, `BF-W${sequence}`);
    const waiting = await h.recorded({
      employeeId: waitingPerson.employeeId,
      toDepartmentId: to.id,
      effectiveOn: h.day(30),
      groundsNote: h.groundsNote,
    });
    sequence += 1;
    const cancelledPerson = await h.veteran(from, `BF-C${sequence}`);
    const cancelled = await h.recorded({
      employeeId: cancelledPerson.employeeId,
      toDepartmentId: to.id,
      effectiveOn: h.day(30),
      groundsNote: h.groundsNote,
    });
    await h.cancelTransfer(cancelled.id, { reason: 'Không còn cần', groundsNote: h.groundsNote }).expect(200);
    const closed = await oldTransfer();
    await sql('UPDATE department_transfers SET closed_at = now(), closed_by_app_user_id = $2 WHERE id = $1', [
      closed.id,
      h.seed.superAdmin.appUserId,
    ]);
    const closedReview = await reviewOf(closed.id, 'OPEN');

    await sql(migration());

    for (const id of [waiting.id, cancelled.id, closed.id])
      expect(await graceOfRow(id)).toMatchObject({ ends: null, reminder: null });
    expect(await reviewStatus(closedReview)).toBe('OPEN');
  }, 120_000);

  it('counts a day off in the calendar of the organization, as the policy does', async () => {
    const old = await oldTransfer();
    const dayOff = addDays(h.today(), 1);
    await sql(
      `INSERT INTO non_working_dates (id, organization_id, date, reason) SELECT gen_random_uuid(), organization_id, $1, 'Nghỉ lễ'
         FROM department_transfers WHERE id = $2`,
      [dayOff, old.id],
    );
    try {
      await sql(migration());

      const grace = policy(old.effectiveOn, new Set([dayOff]));
      expect(await graceOfRow(old.id)).toMatchObject({ ends: grace.endsOn, reminder: grace.reminderOn });
    } finally {
      await sql('DELETE FROM non_working_dates WHERE date = $1', [dayOff]);
    }
  }, 120_000);

  it('says how many transfers of each kind it dealt with, and is safe to run twice: the second run changes nothing', async () => {
    const without = await oldTransfer();
    const open = await oldTransfer();
    const done = await oldTransfer();
    await reviewOf(open.id, 'OPEN');
    await reviewOf(done.id, 'COMPLETED');
    NOTICES.length = 0;

    await sql(migration());

    const said = NOTICES.find((message) => message.startsWith('transfers that took effect and are not closed')) ?? '';
    // Other transfers of the other cases of this file may have been given their grace by the runs before: the three of this case are counted.
    expect(said).toMatch(/without a review: [1-9]\d*/);
    expect(said).toMatch(/with an open review: [1-9]\d*/);
    expect(said).toMatch(/with a decided or superseded review: [1-9]\d*/);
    const first = [await graceOfRow(without.id), await graceOfRow(open.id), await graceOfRow(done.id)];
    NOTICES.length = 0;

    await sql(migration());

    expect([await graceOfRow(without.id), await graceOfRow(open.id), await graceOfRow(done.id)]).toEqual(first);
    expect(NOTICES.find((message) => message.startsWith('transfers that took effect and are not closed'))).toMatch(
      /given a grace: 0/,
    );
  }, 120_000);

  it('writes one audit event of the system for each grace it gave, and none for a transfer it left alone', async () => {
    const old = await oldTransfer();
    const migrationEvents = async (id: string) =>
      (
        await sql<{ actor_kind: string; actor_app_user_id: string | null; after: Record<string, unknown> }>(
          `SELECT actor_kind::text, actor_app_user_id, after FROM audit_events
            WHERE action = 'DEPARTMENT_TRANSFER.GRACE_OPENED' AND resource_id = $1
              AND correlation_id = '20261113001900_personnel_transfer_grace_backfill'`,
          [id],
        )
      ).rows;

    await sql(migration());

    const events = await migrationEvents(old.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor_kind: 'SYSTEM', actor_app_user_id: null });
    expect(events[0].after).toMatchObject({ graceEndsOn: policy(old.effectiveOn).endsOn });
    await sql(migration());
    expect(await migrationEvents(old.id)).toHaveLength(1);
  }, 120_000);
});
