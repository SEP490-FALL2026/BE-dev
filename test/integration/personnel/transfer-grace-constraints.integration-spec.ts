import { TransferHarness } from '../../support/transfer-harness';
import type { Department } from '../../support/request-harness';

const h = new TransferHarness();

/**
 * `MF3-B.1` (`QĐ-110p`, `QĐ-110r`, SPEC §6): what the database holds about the grace of a transfer — the two days of the grace come together
 * on a transfer that took effect, are written once, the snapshots follow the transfer, and the closing names an account or the system. On real
 * PostgreSQL, with SQL only (the rows are the ones the routes write; no route writes the grace yet).
 */
describe('the grace of a transfer, as the database keeps it (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let sequence = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-GD');
    fin = await h.departmentWithUnit('P-GF');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A transfer that took effect today (the day of a transfer recorded for today is its own). */
  const effective = async (): Promise<{ id: string; effectiveOn: string }> => {
    sequence += 1;
    const person = await h.veteran(des, `GD-E${sequence}`);
    const wire = await h.moveToday(person, fin);
    expect(wire.status).toBe('EFFECTIVE');

    return { id: wire.id, effectiveOn: wire.effectiveOn };
  };
  const pending = async (): Promise<string> => {
    sequence += 1;
    const person = await h.veteran(des, `GD-P${sequence}`);

    return (
      await h.recorded({
        employeeId: person.employeeId,
        toDepartmentId: fin.id,
        effectiveOn: h.day(30),
        groundsNote: h.groundsNote,
      })
    ).id;
  };
  const sql = (text: string, values: unknown[] = []) => h.ctx.sql.query(text, values);
  const row = async (id: string) =>
    (
      await sql(
        `SELECT to_char(grace_ends_on, 'YYYY-MM-DD') AS grace_ends_on, to_char(grace_reminder_on, 'YYYY-MM-DD') AS grace_reminder_on,
                reminded_at, snapshot_before, snapshot_after, closed_at, closed_by_app_user_id, closed_by_system
           FROM department_transfers WHERE id = $1`,
        [id],
      )
    ).rows[0] as Record<string, unknown>;
  const openGrace = (id: string, ends: string, reminder: string) =>
    sql(`UPDATE department_transfers SET grace_ends_on = $2, grace_reminder_on = $3 WHERE id = $1`, [
      id,
      ends,
      reminder,
    ]);

  it('has no grace, no snapshot and no closing on a transfer that took effect, and the system did not close it', async () => {
    const { id } = await effective();

    expect(await row(id)).toMatchObject({
      grace_ends_on: null,
      grace_reminder_on: null,
      reminded_at: null,
      snapshot_before: null,
      snapshot_after: null,
      closed_at: null,
      closed_by_app_user_id: null,
      closed_by_system: false,
    });
  });

  it('opens the grace of a transfer that took effect, with its reminder, and the snapshot of what the person held', async () => {
    const { id, effectiveOn } = await effective();

    await sql(
      `UPDATE department_transfers SET grace_ends_on = $2::date + 4, grace_reminder_on = $2::date + 2,
              snapshot_before = '{"rights":[]}'::jsonb WHERE id = $1`,
      [id, effectiveOn],
    );

    const found = await row(id);
    expect(found.snapshot_before).toEqual({ rights: [] });
    expect(found.grace_ends_on).not.toBeNull();
  });

  it('refuses a grace on a transfer that waits, and the two days of the grace apart', async () => {
    const waiting = await pending();
    const { id, effectiveOn } = await effective();

    await expect(openGrace(waiting, h.day(34), h.day(32))).rejects.toThrow(/department_transfers_grace_check/);
    await expect(
      sql(`UPDATE department_transfers SET grace_ends_on = $2 WHERE id = $1`, [id, h.day(4)]),
    ).rejects.toThrow(/department_transfers_grace_check/);
    await expect(
      sql(`UPDATE department_transfers SET grace_reminder_on = $2 WHERE id = $1`, [id, effectiveOn]),
    ).rejects.toThrow(/department_transfers_grace_check/);
    await expect(sql(`UPDATE department_transfers SET reminded_at = now() WHERE id = $1`, [id])).rejects.toThrow(
      /department_transfers_grace_check/,
    );
  });

  it('refuses a grace that ends before the transfer took effect and a reminder after the end', async () => {
    const { id, effectiveOn } = await effective();

    await expect(
      sql(
        `UPDATE department_transfers SET grace_ends_on = $2::date - 1, grace_reminder_on = $2::date - 1 WHERE id = $1`,
        [id, effectiveOn],
      ),
    ).rejects.toThrow(/department_transfers_grace_check/);
    await expect(
      sql(
        `UPDATE department_transfers SET grace_ends_on = $2::date + 4, grace_reminder_on = $2::date + 5 WHERE id = $1`,
        [id, effectiveOn],
      ),
    ).rejects.toThrow(/department_transfers_grace_check/);
  });

  it('writes the grace, the reminder and the snapshot once: a second write of any of them is refused', async () => {
    const { id, effectiveOn } = await effective();
    await sql(
      `UPDATE department_transfers SET grace_ends_on = $2::date + 4, grace_reminder_on = $2::date + 2,
              snapshot_before = '{"rights":[]}'::jsonb WHERE id = $1`,
      [id, effectiveOn],
    );
    await sql(`UPDATE department_transfers SET reminded_at = now() WHERE id = $1`, [id]);

    for (const change of [
      `grace_ends_on = grace_ends_on + 1`,
      `grace_reminder_on = grace_reminder_on + 1`,
      `reminded_at = now() + interval '1 hour'`,
      `snapshot_before = '{"rights":[1]}'::jsonb`,
    ])
      await expect(sql(`UPDATE department_transfers SET ${change} WHERE id = $1`, [id])).rejects.toThrow(
        /written once/,
      );
  });

  it('changes nothing else of a transfer that took effect: not the department, not the day, not the status', async () => {
    const { id } = await effective();

    for (const change of [
      `to_department_id = from_department_id`,
      `effective_on = effective_on + 1`,
      `status = 'PENDING'`,
    ])
      await expect(sql(`UPDATE department_transfers SET ${change} WHERE id = $1`, [id])).rejects.toThrow(
        /changes only its grace, its snapshots and its closing/,
      );
  });

  it('closes a transfer by the system with a snapshot after, and never changes it again', async () => {
    const { id, effectiveOn } = await effective();
    await sql(
      `UPDATE department_transfers SET grace_ends_on = $2::date + 4, grace_reminder_on = $2::date + 2 WHERE id = $1`,
      [id, effectiveOn],
    );

    await sql(
      `UPDATE department_transfers SET closed_at = now(), closed_by_system = true, snapshot_after = '{"rights":[]}'::jsonb WHERE id = $1`,
      [id],
    );

    expect(await row(id)).toMatchObject({
      closed_by_system: true,
      closed_by_app_user_id: null,
      snapshot_after: { rights: [] },
    });
    await expect(sql(`UPDATE department_transfers SET reminded_at = now() WHERE id = $1`, [id])).rejects.toThrow(
      /cannot change again|changes only its grace/,
    );
  });

  it('closes a transfer by an account as before, and refuses a closing that names both the system and an account, or neither', async () => {
    const byAccount = await effective();
    const both = await effective();
    const neither = await effective();
    const admin = h.seed.superAdmin.appUserId;

    await sql(`UPDATE department_transfers SET closed_at = now(), closed_by_app_user_id = $2 WHERE id = $1`, [
      byAccount.id,
      admin,
    ]);

    expect(await row(byAccount.id)).toMatchObject({ closed_by_system: false, closed_by_app_user_id: admin });
    await expect(
      sql(
        `UPDATE department_transfers SET closed_at = now(), closed_by_app_user_id = $2, closed_by_system = true WHERE id = $1`,
        [both.id, admin],
      ),
    ).rejects.toThrow(/department_transfers_closure_check/);
    await expect(sql(`UPDATE department_transfers SET closed_at = now() WHERE id = $1`, [neither.id])).rejects.toThrow(
      /department_transfers_closure_check/,
    );
    await expect(
      sql(`UPDATE department_transfers SET closed_by_system = true WHERE id = $1`, [neither.id]),
    ).rejects.toThrow(/department_transfers_closure_check/);
  });

  it('keeps a snapshot after only on a transfer that closed, and a snapshot before only on one that took effect', async () => {
    const waiting = await pending();
    const { id } = await effective();

    await expect(
      sql(`UPDATE department_transfers SET snapshot_after = '{}'::jsonb WHERE id = $1`, [id]),
    ).rejects.toThrow(/department_transfers_snapshot_check/);
    await expect(
      sql(`UPDATE department_transfers SET snapshot_before = '{}'::jsonb WHERE id = $1`, [waiting]),
    ).rejects.toThrow(/department_transfers_snapshot_check/);
    await expect(
      sql(`UPDATE department_transfers SET snapshot_before = '[]'::jsonb WHERE id = $1`, [id]),
    ).rejects.toThrow(/department_transfers_snapshot_check/);
  });
});
