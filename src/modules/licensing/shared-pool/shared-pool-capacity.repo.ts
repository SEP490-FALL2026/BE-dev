import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/** The seats a subscription holds from today on, and how many of them are held by a right whose revocation is still open. */
export interface SubscriptionOccupancy {
  occupied: number;
  inRevocation: number;
}

/**
 * Which of these periods the company has decided to end and whose decision still stands (`Q-162`, `A1C-02`): a case decided `CANCEL` that
 * waits for its outcome, or whose outcome is the one decided. A cancellation the vendor refused, or that ended another way, ends nothing.
 * It is written here, the lowest capability that asks it (the pool grants nothing from such a subscription; the renewals read it too through
 * their repo), so that the two never differ. One statement, only the ids.
 */
export async function endingAmongOf(
  client: DbTx | PrismaService,
  subscriptionIds: readonly string[],
): Promise<Set<string>> {
  if (subscriptionIds.length === 0) return new Set();
  const rows = await client.subscriptionRenewal.findMany({
    where: {
      subscriptionId: { in: [...subscriptionIds] },
      decidedChoice: 'CANCEL',
      OR: [{ state: 'DECIDED' }, { state: 'OUTCOME_RECORDED', outcome: 'AS_DECIDED' }],
    },
    select: { subscriptionId: true },
  });

  return new Set(rows.map((row) => row.subscriptionId));
}

/** Reads the assignments and tasks of licensing to tell how much of the pool of a plan is taken. */
@Injectable()
export class SharedPoolCapacityRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * For each subscription, the most assignments it holds on any day from `today` on (the reading the database counts a new seat by,
   * `license_assignments_seat_capacity`: an assignment that starts later, a seat carried to a period recorded ahead of its start
   * included, takes its place from its first day) and, of the assignments not ended, the ones with a revocation task not yet completed,
   * closed or cancelled.
   */
  occupancyOf(
    tx: DbTx,
    subscriptionIds: readonly string[],
    today: BusinessDate,
  ): Promise<Map<string, SubscriptionOccupancy>> {
    return this.read(tx, subscriptionIds, today);
  }

  /** The same without a transaction, for a read of many subscription rows at once (the queue of grants): one statement whatever their number. */
  occupancyOfMany(
    subscriptionIds: readonly string[],
    today: BusinessDate,
  ): Promise<Map<string, SubscriptionOccupancy>> {
    return this.read(this.prisma, subscriptionIds, today);
  }

  /**
   * Peak occupancy from `today` on scoped to `(subscription_id, plan_id)` so multi-plan period rows count each
   * plan line's assignments separately (`W3-15`, `W3-16`).
   */
  occupancyOfPlan(
    tx: DbTx,
    subscriptionIds: readonly string[],
    planId: string,
    today: BusinessDate,
  ): Promise<Map<string, SubscriptionOccupancy>> {
    return this.read(tx, subscriptionIds, today, planId);
  }

  /** Batch per-(subscription, plan) occupancy read keyed by `${subscriptionId}:${planId}`. */
  async occupancyOfPlanPairs(
    pairs: readonly { subscriptionId: string; planId: string }[],
    today: BusinessDate,
  ): Promise<Map<string, SubscriptionOccupancy>> {
    const result = new Map<string, SubscriptionOccupancy>();
    if (pairs.length === 0) return result;
    const subscriptionIds = [...new Set(pairs.map((pair) => pair.subscriptionId))];
    const planIds = [...new Set(pairs.map((pair) => pair.planId))];
    const rows = await this.prisma.$queryRaw<
      { subscription_id: string; plan_id: string; occupied: bigint; in_revocation: bigint }[]
    >`
      WITH "open" AS (
        SELECT a."subscription_id", a."plan_id", a."valid_from", a."valid_until",
               EXISTS (
                 SELECT 1 FROM "provisioning_tasks" t
                  WHERE t."assignment_id" = a."id"
                    AND t."kind" = 'REVOKE'
                    AND t."status" NOT IN ('COMPLETED', 'CLOSED_FAILED', 'CANCELLED')
               ) AS "revoking"
          FROM "license_assignments" a
         WHERE a."subscription_id" = ANY(${subscriptionIds}::uuid[])
           AND a."plan_id" = ANY(${planIds}::uuid[])
           AND (a."valid_until" IS NULL OR ${today}::date < a."valid_until")
      ), "days" AS (
        SELECT DISTINCT o."subscription_id", o."plan_id", GREATEST(o."valid_from", ${today}::date) AS "day" FROM "open" o
      )
      SELECT d."subscription_id" AS subscription_id,
             d."plan_id" AS plan_id,
             MAX((
               SELECT count(*) FROM "open" b
                WHERE b."subscription_id" = d."subscription_id"
                  AND b."plan_id" = d."plan_id"
                  AND b."valid_from" <= d."day"
                  AND (b."valid_until" IS NULL OR d."day" < b."valid_until")
             )) AS occupied,
             MAX((
               SELECT count(*) FROM "open" r
                WHERE r."subscription_id" = d."subscription_id"
                  AND r."plan_id" = d."plan_id"
                  AND r."revoking"
             )) AS in_revocation
        FROM "days" d
       GROUP BY d."subscription_id", d."plan_id"`;
    for (const row of rows) {
      result.set(`${row.subscription_id}:${row.plan_id}`, {
        occupied: Number(row.occupied),
        inRevocation: Number(row.in_revocation),
      });
    }

    return result;
  }

  /** `endingAmong` for the pool: the ones it grants nothing from (`A1C-02`). */
  endingAmong(subscriptionIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    return endingAmongOf(tx ?? this.prisma, subscriptionIds);
  }

  private async read(
    client: DbTx | PrismaService,
    subscriptionIds: readonly string[],
    today: BusinessDate,
    planId?: string,
  ): Promise<Map<string, SubscriptionOccupancy>> {
    const result = new Map<string, SubscriptionOccupancy>();
    if (subscriptionIds.length === 0) return result;
    const planFilter = planId ? Prisma.sql`AND a."plan_id" = ${planId}::uuid` : Prisma.empty;
    // The count only rises on the day an assignment starts, so its peak from today on is on today or on one of those days.
    const rows = await client.$queryRaw<{ subscription_id: string; occupied: bigint; in_revocation: bigint }[]>`
      WITH "open" AS (
        SELECT a."subscription_id", a."valid_from", a."valid_until",
               EXISTS (
                 SELECT 1 FROM "provisioning_tasks" t
                  WHERE t."assignment_id" = a."id"
                    AND t."kind" = 'REVOKE'
                    AND t."status" NOT IN ('COMPLETED', 'CLOSED_FAILED', 'CANCELLED')
               ) AS "revoking"
          FROM "license_assignments" a
         WHERE a."subscription_id" = ANY(${[...subscriptionIds]}::uuid[])
           ${planFilter}
           AND (a."valid_until" IS NULL OR ${today}::date < a."valid_until")
      ), "days" AS (
        SELECT DISTINCT o."subscription_id", GREATEST(o."valid_from", ${today}::date) AS "day" FROM "open" o
      )
      SELECT d."subscription_id" AS subscription_id,
             MAX((
               SELECT count(*) FROM "open" b
                WHERE b."subscription_id" = d."subscription_id"
                  AND b."valid_from" <= d."day"
                  AND (b."valid_until" IS NULL OR d."day" < b."valid_until")
             )) AS occupied,
             MAX((
               SELECT count(*) FROM "open" r WHERE r."subscription_id" = d."subscription_id" AND r."revoking"
             )) AS in_revocation
        FROM "days" d
       GROUP BY d."subscription_id"`;
    for (const row of rows) {
      result.set(row.subscription_id, { occupied: Number(row.occupied), inRevocation: Number(row.in_revocation) });
    }

    return result;
  }

  /**
   * For each subscription of a K4 plan, the keys free to give (`QĐ-103d`): the keys in the store and not withdrawn, less the grants of the
   * subscription still open whose seat holds no key yet (each of them takes one when it is completed). Never below zero.
   */
  freeKeysOf(client: DbTx | PrismaService, subscriptionIds: readonly string[]): Promise<Map<string, number>> {
    return this.readKeys(client, subscriptionIds);
  }

  /** The same without a transaction, for the queue of grants. */
  freeKeysOfMany(subscriptionIds: readonly string[]): Promise<Map<string, number>> {
    return this.readKeys(this.prisma, subscriptionIds);
  }

  private async readKeys(
    client: DbTx | PrismaService,
    subscriptionIds: readonly string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (subscriptionIds.length === 0) return result;
    const rows = await client.$queryRaw<{ subscription_id: string; free: bigint }[]>`
      SELECT s."id" AS subscription_id,
             GREATEST(0,
               (SELECT count(*) FROM "license_keys" k
                 WHERE k."subscription_id" = s."id" AND k."status" = 'IN_STORE' AND k."withdrawn_at" IS NULL)
               - (SELECT count(*) FROM "provisioning_tasks" t
                    JOIN "license_assignments" a ON a."id" = t."assignment_id"
                   WHERE a."subscription_id" = s."id"
                     AND t."kind" = 'GRANT'
                     AND t."status" NOT IN ('COMPLETED', 'CLOSED_FAILED', 'CANCELLED')
                     AND NOT EXISTS (SELECT 1 FROM "license_keys" g WHERE g."assignment_id" = a."id"))
             ) AS free
        FROM unnest(${[...subscriptionIds]}::uuid[]) AS s("id")`;
    for (const row of rows) result.set(row.subscription_id, Number(row.free));

    return result;
  }
}
