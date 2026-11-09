import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/** The seats a subscription holds today, and how many of them are held by a right whose revocation is still open. */
export interface SubscriptionOccupancy {
  occupied: number;
  inRevocation: number;
}

/** Reads the assignments and tasks of licensing to tell how much of the pool of a plan is taken. */
@Injectable()
export class SharedPoolCapacityRepo {
  /**
   * For each subscription, the assignments in force on `today` (the reading the seats of a subscription are counted by: it has
   * started and has not ended) and, of those, the ones with a revocation task not yet completed, closed or cancelled.
   */
  async occupancyOf(
    tx: DbTx,
    subscriptionIds: readonly string[],
    today: BusinessDate,
  ): Promise<Map<string, SubscriptionOccupancy>> {
    const result = new Map<string, SubscriptionOccupancy>();
    if (subscriptionIds.length === 0) return result;
    const rows = await tx.$queryRaw<{ subscription_id: string; occupied: bigint; in_revocation: bigint }[]>`
      SELECT a."subscription_id" AS subscription_id,
             count(*) AS occupied,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM "provisioning_tasks" t
                WHERE t."assignment_id" = a."id"
                  AND t."kind" = 'REVOKE'
                  AND t."status" NOT IN ('COMPLETED', 'CLOSED_FAILED', 'CANCELLED')
             )) AS in_revocation
        FROM "license_assignments" a
       WHERE a."subscription_id" = ANY(${[...subscriptionIds]}::uuid[])
         AND a."valid_from" <= ${today}::date
         AND (a."valid_until" IS NULL OR ${today}::date < a."valid_until")
       GROUP BY a."subscription_id"`;
    for (const row of rows) {
      result.set(row.subscription_id, { occupied: Number(row.occupied), inRevocation: Number(row.in_revocation) });
    }

    return result;
  }
}
