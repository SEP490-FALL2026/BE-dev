import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

/** The subscription as the assignment reads it, after it is locked. */
export interface LockedSubscriptionForOwner {
  id: string;
  organizationId: string;
  ownerDepartmentId: string | null;
}

export interface OwnerAssignmentRow {
  id: string;
  departmentId: string;
}

/**
 * The persistence of `pnpm ops:assign-subscription-owner` (F02, spec L.3): the one writer of
 * `subscription_owner_assignments`. The command may run against a database that has not yet got the expansion migration,
 * so it asks the catalog first and names the column and the table only after it has seen both.
 */
@Injectable()
export class SubscriptionOwnerAssignmentRepo {
  /** True when both objects of the expansion migration exist. */
  async schemaReady(tx: DbTx): Promise<boolean> {
    const [probe] = await tx.$queryRaw<{ ready: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'subscriptions'
                        AND column_name = 'owner_department_id')
             AND to_regclass('public.subscription_owner_assignments') IS NOT NULL AS "ready"`;

    return probe.ready;
  }

  /** The subscription, held until the transaction ends so two assignments of it queue one behind the other. */
  async lockSubscription(tx: DbTx, id: string): Promise<LockedSubscriptionForOwner | null> {
    const rows = await tx.$queryRaw<{ id: string; organizationId: string; ownerDepartmentId: string | null }[]>`
      SELECT "id"::text AS "id", "organization_id"::text AS "organizationId",
             "owner_department_id"::text AS "ownerDepartmentId"
        FROM "subscriptions" WHERE "id" = ${id}::uuid FOR UPDATE`;

    return rows[0] ?? null;
  }

  async findAssignment(tx: DbTx, subscriptionId: string): Promise<OwnerAssignmentRow | null> {
    return tx.subscriptionOwnerAssignment.findUnique({
      where: { subscriptionId },
      select: { id: true, departmentId: true },
    });
  }

  async insert(
    tx: DbTx,
    input: {
      organizationId: string;
      subscriptionId: string;
      departmentId: string;
      basis: string;
      operator: string;
      environment: string;
    },
  ): Promise<OwnerAssignmentRow> {
    return tx.subscriptionOwnerAssignment.create({
      data: {
        organizationId: input.organizationId,
        subscriptionId: input.subscriptionId,
        departmentId: input.departmentId,
        basisReference: input.basis,
        operatorRef: input.operator,
        environment: input.environment,
      },
      select: { id: true, departmentId: true },
    });
  }
}
