import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/**
 * The carrying of seats to the next period of a subscription (`QĐ-35c`) and the taking of it back: each new seat names the one it
 * continues. The one writer of the `RENEWAL_CARRY` rows, for the seats held when a renewal is recorded and for a seat granted after
 * the next period was recorded ahead. The database keeps the seats bought (INV-01) and the one seat of a person (INV-02).
 */
@Injectable()
export class AssignmentCarryRepo {
  /**
   * Carries the seats to the new period in the caller's transaction: a new seat on the new subscription from its first day for
   * each, naming the seat it continues and keeping its person, account, Cost Center, expected end and the flag of a machine account with its
   * reason (a flagged seat that lost its flag would break INV-02 beside the personal seat of the same IT Admin); then each old seat ends that
   * day, so no day has the person twice or not at all. Returns how many were carried.
   */
  async carry(
    tx: DbTx,
    input: {
      assignmentIds: readonly string[];
      nextSubscriptionId: string;
      startDate: BusinessDate;
      actorAppUserId: string;
    },
  ): Promise<number> {
    if (input.assignmentIds.length === 0) return 0;
    const ids = [...input.assignmentIds];
    const inserted = await tx.$executeRaw`
      INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
             account_identifier, normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from,
             valid_from_basis, valid_until, expected_end_date, predecessor_id, created_by_app_user_id, is_machine_account,
             machine_account_note)
      SELECT gen_random_uuid(), a.organization_id, a.kind, 'RENEWAL_CARRY', a.plan_id, ${input.nextSubscriptionId}::uuid,
             a.employee_id, a.account_identifier, a.normalized_account_identifier, a.reason, a.cost_center_id,
             a.owning_department_id, ${input.startDate}::date, 'RECORDED',
             CASE WHEN a.valid_until > ${input.startDate}::date THEN a.valid_until END, a.expected_end_date, a.id,
             ${input.actorAppUserId}::uuid, a.is_machine_account, a.machine_account_note
        FROM license_assignments a
       WHERE a.id = ANY(${ids}::uuid[])
       ORDER BY a.valid_from, a.id`;
    await tx.$executeRaw`
      UPDATE license_assignments SET valid_until = ${input.startDate}::date
       WHERE id = ANY(${ids}::uuid[])`;

    return inserted;
  }

  /**
   * Takes back the carrying of a seat whose grant did not come to be (failed or cancelled): the seat it was carried to on the next
   * period is voided the way the grant is (it ends the day it started, so no day counts it) and the seat itself is open again, so the
   * grant can be voided as an open one. Returns whether there was a carrying to take back: a carried seat that is no longer open
   * (ended since) is left as it is.
   */
  async takeBack(tx: DbTx, assignmentId: string, how: 'FAILED' | 'CANCELLED', now: Date): Promise<boolean> {
    const voided =
      how === 'FAILED'
        ? await tx.$queryRaw<{ valid_from: string }[]>`
            UPDATE license_assignments SET failed_at = ${now}, valid_until = valid_from
             WHERE predecessor_id = ${assignmentId}::uuid AND source = 'RENEWAL_CARRY'
               AND failed_at IS NULL AND cancelled_at IS NULL AND valid_until IS NULL
            RETURNING to_char(valid_from, 'YYYY-MM-DD') AS valid_from`
        : await tx.$queryRaw<{ valid_from: string }[]>`
            UPDATE license_assignments SET cancelled_at = ${now}, valid_until = valid_from
             WHERE predecessor_id = ${assignmentId}::uuid AND source = 'RENEWAL_CARRY'
               AND failed_at IS NULL AND cancelled_at IS NULL AND valid_until IS NULL
            RETURNING to_char(valid_from, 'YYYY-MM-DD') AS valid_from`;
    if (voided.length === 0) return false;
    await tx.$executeRaw`
      UPDATE license_assignments SET valid_until = NULL
       WHERE id = ${assignmentId}::uuid AND valid_until = ${voided[0].valid_from}::date`;

    return true;
  }
}
