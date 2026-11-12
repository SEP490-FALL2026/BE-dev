import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDays } from '../../../src/core/business-date';
import { nthWorkingDayFrom } from '../../../src/core/working-days';
import { PROJECT_ROOT } from '../../support/cli-process';
import { migrationEndingWith } from '../../support/migration-history';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new OffboardingHarness();
const NONE: ReadonlySet<string> = new Set();

/**
 * `MF2-D` (`QĐ-110c`, `M-09`, SPEC T-MF2): the deadline of the revocations of a departure is kept on the case, from the day it is written, and
 * moves with the last working day. Over HTTP and SQL on real PostgreSQL; the migration that fills it for the cases still open is run again
 * on rows written the way an older release wrote them.
 */
describe('the deadline of the revocations of a departure (integration, real PostgreSQL)', () => {
  let des: Department;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-RD');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const leaver = async (): Promise<Person> => h.worker(des, `E-RD-${(counter += 1)}`);
  /** The deadline of the rule over a calendar with no day off: the working day number `days` from the day after `lastWorkingDay`. */
  const dueAfter = (lastWorkingDay: string, days = 1, off: ReadonlySet<string> = NONE): string =>
    nthWorkingDayFrom(addDays(lastWorkingDay, 1), days, off);
  const dueOf = async (id: string): Promise<string | null> =>
    (
      await h.ctx.sql.query<{ due: string | null }>(
        `SELECT to_char(revocation_due_on, 'YYYY-MM-DD') AS due FROM offboarding_cases WHERE id = $1`,
        [id],
      )
    ).rows[0].due;

  it('keeps the working day after the last working day on a planned departure, and the same day in the first change of the case', async () => {
    const person = await leaver();

    const wire = await h.recordedCase(person);

    expect(await dueOf(wire.id)).toBe(dueAfter(h.day(10)));
    const changes = await h.ctx.sql.query<{ detail: { impact: { revocationDueOn: string } } }>(
      `SELECT detail FROM offboarding_case_changes WHERE case_id = $1 AND kind = 'RECORDED'`,
      [wire.id],
    );
    expect(changes.rows[0].detail.impact.revocationDueOn).toBe(dueAfter(h.day(10)));
  }, 120_000);

  it('keeps the working day after today on a departure blocked now (the last working day is the day it is recorded)', async () => {
    const person = await leaver();

    const wire = await h.recordedCase(person, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });

    expect(wire.lastWorkingDay).toBe(h.today());
    expect(await dueOf(wire.id)).toBe(dueAfter(h.today()));
  }, 120_000);

  it('moves the deadline with the last working day of a handover under way', async () => {
    const person = await leaver();
    const wire = await h.recordedCase(person);

    await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'Kéo dài thời gian bàn giao' }).expect(200);

    expect(await dueOf(wire.id)).toBe(dueAfter(h.day(20)));
  }, 120_000);

  describe('the parameter and the calendar of the organization', () => {
    const organization = async (): Promise<string> =>
      (await h.ctx.sql.query<{ id: string }>('SELECT id FROM organizations LIMIT 1')).rows[0].id;

    it('counts the working days the parameter says from the day after the last one and skips the days off', async () => {
      const org = await organization();
      const lastDay = h.day(30);
      const dayOff = dueAfter(lastDay);
      await h.ctx.sql.query(
        `INSERT INTO parameter_values (id, organization_id, key, value)
         VALUES (gen_random_uuid(), $1, 'DEPARTURE_REVOCATION_WORKING_DAYS', '2'::jsonb)`,
        [org],
      );
      await h.ctx.sql.query(
        `INSERT INTO non_working_dates (id, organization_id, date, reason) VALUES (gen_random_uuid(), $1, $2, 'Nghỉ lễ thử nghiệm')`,
        [org, dayOff],
      );
      try {
        const person = await leaver();

        const wire = await h.recordedCase(person, { lastWorkingDay: lastDay });

        expect(await dueOf(wire.id)).toBe(dueAfter(lastDay, 2, new Set([dayOff])));
        expect(await dueOf(wire.id)).not.toBe(dueAfter(lastDay, 2));
      } finally {
        await h.ctx.sql.query(
          `UPDATE parameter_values SET valid_to = now() WHERE key = 'DEPARTURE_REVOCATION_WORKING_DAYS' AND valid_to IS NULL`,
        );
        await h.ctx.sql.query('DELETE FROM non_working_dates WHERE date = $1', [dayOff]);
      }
    }, 120_000);
  });

  describe('the migration that gives the deadline to the departures still open', () => {
    const migration = () =>
      readFileSync(
        join(
          PROJECT_ROOT,
          'prisma',
          'migrations',
          migrationEndingWith('_personnel_revocation_due_on'),
          'migration.sql',
        ),
        'utf8',
      );
    /** Cases as an older release wrote them: no deadline. The guard of the table is off for this fixture only, inside one transaction. */
    const withoutDeadline = async (ids: readonly string[]): Promise<void> => {
      await h.ctx.sql.query('BEGIN');
      try {
        await h.ctx.sql.query('ALTER TABLE offboarding_cases DISABLE TRIGGER USER');
        await h.ctx.sql.query('UPDATE offboarding_cases SET revocation_due_on = NULL WHERE id = ANY($1::uuid[])', [
          ids,
        ]);
        await h.ctx.sql.query('ALTER TABLE offboarding_cases ENABLE TRIGGER USER');
        await h.ctx.sql.query('COMMIT');
      } catch (error) {
        await h.ctx.sql.query('ROLLBACK');
        throw error;
      }
    };

    it('fills a handover under way and a person who has left with the deadline of the rule, leaves a cancelled case alone, and is safe to run twice', async () => {
      const planned = await h.recordedCase(await leaver());
      const blockedNow = await h.recordedCase(await leaver(), {
        accessBlockMode: 'BLOCK_NOW',
        lastWorkingDay: undefined,
      });
      const cancelled = await h.recordedCase(await leaver());
      await h.cancelCase(cancelled.id, { reason: 'Người ở lại làm việc' }).expect(200);
      const cancelledDue = await dueOf(cancelled.id);
      await withoutDeadline([planned.id, blockedNow.id]);
      expect([await dueOf(planned.id), await dueOf(blockedNow.id)]).toEqual([null, null]);

      await h.ctx.sql.query(migration());

      expect(await dueOf(planned.id)).toBe(dueAfter(h.day(10)));
      expect(await dueOf(blockedNow.id)).toBe(dueAfter(h.today()));
      expect(await dueOf(cancelled.id)).toBe(cancelledDue);
      await h.ctx.sql.query(migration());
      expect(await dueOf(planned.id)).toBe(dueAfter(h.day(10)));
    }, 180_000);

    it('refuses a deadline that is not after the last working day', async () => {
      const wire = await h.recordedCase(await leaver());

      await expect(
        h.ctx.sql.query('UPDATE offboarding_cases SET revocation_due_on = last_working_day WHERE id = $1', [wire.id]),
      ).rejects.toThrow(/offboarding_cases_revocation_due_check/);
    }, 120_000);
  });
});
