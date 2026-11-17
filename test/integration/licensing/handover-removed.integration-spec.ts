import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from '../../support/cli-process';
import { migrationEndingWith } from '../../support/migration-history';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();
const TARGET = migrationEndingWith('_handover_duties_cancel_open');
const CLEAN = 'Xuất bảng trước khi gỡ';

/**
 * `QĐ-110g`: no confirmation of a handover is asked in any case of a revocation. Real PostgreSQL: a seat of a plan that loses data is
 * revoked for each source with no duty, no hold on the work, no notice and no audit event of a handover (the work is taken and
 * completed at once), and the migration cancels the duties that were still open when the rule changed.
 */
describe('the handover confirmation is gone (integration, real PostgreSQL)', () => {
  let lossy: { subscriptionId: string; planId: string };
  let seats = 0;
  const code = () => `E-HR-${(seats += 1)}`;

  beforeAll(async () => {
    await h.start();
    const subscriptionId = await h.subscription(20, 'K2');
    const planId = await h.planOf(subscriptionId);
    await h.ctx.sql.query(`UPDATE plans SET data_loss_on_removal = true, revocation_note = $2 WHERE id = $1`, [
      planId,
      CLEAN,
    ]);
    lossy = { subscriptionId, planId };
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const nothingOfAHandover = async (): Promise<void> => {
    expect(await h.count('handover_duties')).toBe(0);
    for (const sql of [
      `SELECT count(*)::int AS n FROM in_app_notifications WHERE code LIKE 'HANDOVER\\_%'`,
      `SELECT count(*)::int AS n FROM audit_events WHERE action LIKE 'HANDOVER\\_DUTY.%'`,
    ]) {
      expect((await h.ctx.sql.query<{ n: number }>(sql)).rows[0].n).toBe(0);
    }
  };

  it.each([
    'GHOST_SEAT',
    'DEPARTURE',
    'ABRUPT_DEPARTURE',
    'TIME_LIMITED_EXPIRY',
    'RETURN',
    'MANAGER_NOT_NEEDED',
    'TRANSFER_REVIEW',
  ])(
    'revokes a seat of a plan that loses data for the source %s with no duty, no hold and no notice: the IT Admin takes it and completes it at once',
    async (source) => {
      const assignmentId = await h.seat({ subscriptionId: lossy.subscriptionId }, code());
      const head = await h.person(code());

      const { taskId } = await h.open(assignmentId, source, {
        decision: { decidedByEmployeeId: head, decidedRole: 'MANAGER' },
      });

      await nothingOfAHandover();
      await h.claim(taskId).expect(200);
      await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' }).expect(200);
      expect((await h.assignmentRow(assignmentId)).valid_until).toBe(h.today());
      await nothingOfAHandover();
    },
    120_000,
  );

  it('shows the note of the plan on the card of the task for the IT Admin to read, and asks nobody to confirm it', async () => {
    const assignmentId = await h.seat({ subscriptionId: lossy.subscriptionId }, code());
    const { taskId } = await h.open(assignmentId, 'GHOST_SEAT');

    const card = await h.revocationOf(taskId);

    expect(card.plan).toMatchObject({ preRevocationNote: CLEAN });
    expect(card).toMatchObject({ status: 'QUEUED' });
    await nothingOfAHandover();
  });

  describe('the migration that cancels the duties still open (QĐ-110g)', () => {
    /** A duty row as an older release wrote it; `state` says whether it is open, confirmed or cancelled. */
    const writeDuty = async (state: 'OPEN' | 'CONFIRMED' | 'CANCELLED'): Promise<string> => {
      const assignmentId = await h.seat({ subscriptionId: lossy.subscriptionId }, code());
      const { rows } = await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO handover_duties (id, organization_id, assignment_id, employee_id, source, leaver_is_head, confirmer_role,
           data_loss, due_on, created_by_app_user_id, confirmed_value, confirmed_by_employee_id, confirmed_role, confirmed_at,
           cancelled_at, cancel_reason)
         SELECT gen_random_uuid(), a.organization_id, a.id, a.employee_id, 'DEPARTURE', false, 'IT_ADMIN', true, '2026-11-20', $2,
                CASE WHEN $3 = 'CONFIRMED' THEN 'HANDLED'::"HandoverValue" END,
                CASE WHEN $3 = 'CONFIRMED' THEN a.employee_id END,
                CASE WHEN $3 = 'CONFIRMED' THEN 'IT_ADMIN'::"HandoverConfirmedRole" END,
                CASE WHEN $3 = 'CONFIRMED' THEN now() END,
                CASE WHEN $3 = 'CANCELLED' THEN now() END,
                CASE WHEN $3 = 'CANCELLED' THEN 'Rút đơn nghỉ việc' END
           FROM license_assignments a WHERE a.id = $1
         RETURNING id`,
        [assignmentId, randomUUID(), state],
      );

      return rows[0].id;
    };
    const stateOf = async (id: string) =>
      (
        await h.ctx.sql.query<{ confirmed: boolean; cancelled: boolean; cancel_reason: string | null }>(
          `SELECT confirmed_at IS NOT NULL AS confirmed, cancelled_at IS NOT NULL AS cancelled, cancel_reason
             FROM handover_duties WHERE id = $1`,
          [id],
        )
      ).rows[0];

    it('cancels every open duty as RULE_CHANGED, leaves a confirmed duty and an already cancelled one as they were, and is safe to run twice', async () => {
      const open = [await writeDuty('OPEN'), await writeDuty('OPEN')];
      const confirmed = await writeDuty('CONFIRMED');
      const cancelled = await writeDuty('CANCELLED');
      const sql = readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', TARGET, 'migration.sql'), 'utf8');

      await h.ctx.sql.query(sql);

      for (const id of open) {
        expect(await stateOf(id)).toEqual({ confirmed: false, cancelled: true, cancel_reason: 'RULE_CHANGED' });
      }
      expect(await stateOf(confirmed)).toEqual({ confirmed: true, cancelled: false, cancel_reason: null });
      expect(await stateOf(cancelled)).toEqual({
        confirmed: false,
        cancelled: true,
        cancel_reason: 'Rút đơn nghỉ việc',
      });
      const stillOpen = await h.ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM handover_duties WHERE confirmed_at IS NULL AND cancelled_at IS NULL`,
      );
      expect(stillOpen.rows[0].n).toBe(0);

      await h.ctx.sql.query(sql);
      expect(await stateOf(cancelled)).toEqual({
        confirmed: false,
        cancelled: true,
        cancel_reason: 'Rút đơn nghỉ việc',
      });
    }, 120_000);
  });
});
