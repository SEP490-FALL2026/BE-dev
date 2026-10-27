import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation } from '../../../infrastructure/database/unique-violation';
import { DirectionRefusedError } from './cost-center-direction.errors';

/** The Cost Center as the link reads it, after it is locked. */
export interface LockedCostCenter {
  id: string;
  organizationId: string;
  status: 'ACTIVE' | 'INACTIVE';
  departmentId: string | null;
}

/** The department as the link reads it, after it is locked. */
export interface LockedDepartment {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
}

/**
 * The persistence of `pnpm ops:cost-center-direction` (F01, spec L.11): the one writer of `cost_center_direction_activations`
 * and `cost_center_department_links`, and the writer of the link on `cost_centers` the procedure makes. The command may run
 * against a database that has not yet got the compatibility migration, so it asks the catalog first and names the columns
 * and tables only after it has seen them all.
 */
@Injectable()
export class CostCenterDirectionRepo {
  /** True when the column and both tables of the compatibility migration exist. */
  async schemaReady(tx: DbTx): Promise<boolean> {
    const [probe] = await tx.$queryRaw<{ ready: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'cost_centers' AND column_name = 'department_id')
             AND to_regclass('public.cost_center_department_links') IS NOT NULL
             AND to_regclass('public.cost_center_direction_activations') IS NOT NULL AS "ready"`;

    return probe.ready;
  }

  /** Whether the organization has its activation row. */
  async isActivated(tx: DbTx, organizationId: string): Promise<boolean> {
    return (await tx.costCenterDirectionActivation.count({ where: { organizationId } })) > 0;
  }

  /** The installation's organization, held until the transaction ends so two activations queue one behind the other. */
  async lockOrganization(tx: DbTx): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS "id" FROM "organizations" FOR UPDATE`;

    return rows[0]?.id ?? null;
  }

  async insertActivation(
    tx: DbTx,
    input: {
      organizationId: string;
      releaseEvidence: string;
      approvedBy: string;
      operator: string;
      environment: string;
    },
  ): Promise<{ id: string }> {
    return tx.costCenterDirectionActivation.create({
      data: {
        organizationId: input.organizationId,
        releaseEvidence: input.releaseEvidence,
        approverRef: input.approvedBy,
        operatorRef: input.operator,
        environment: input.environment,
      },
      select: { id: true },
    });
  }

  /** The organization of a Cost Center, read without a lock: the department is locked first, then the Cost Center. */
  async organizationOf(tx: DbTx, costCenterId: string): Promise<string | null> {
    const rows = await tx.$queryRaw<{ organizationId: string }[]>`
      SELECT "organization_id"::text AS "organizationId" FROM "cost_centers" WHERE "id" = ${costCenterId}::uuid`;

    return rows[0]?.organizationId ?? null;
  }

  /** The department with this code, held `FOR UPDATE`: a Cost Center created for it, or another link, waits (lock order T-11). */
  async lockDepartmentByCode(tx: DbTx, organizationId: string, code: string): Promise<LockedDepartment | null> {
    const rows = await tx.$queryRaw<{ id: string; status: 'ACTIVE' | 'INACTIVE' }[]>`
      SELECT "id"::text AS "id", "status"::text AS "status" FROM "departments"
       WHERE "organization_id" = ${organizationId}::uuid AND "code" = ${code} FOR UPDATE`;

    return rows[0] ?? null;
  }

  /** The Cost Center, held `FOR UPDATE` after its department, and read in a statement of its own. */
  async lockCostCenter(tx: DbTx, costCenterId: string): Promise<LockedCostCenter | null> {
    const rows = await tx.$queryRaw<LockedCostCenter[]>`
      SELECT "id"::text AS "id", "organization_id"::text AS "organizationId", "status"::text AS "status",
             "department_id"::text AS "departmentId"
        FROM "cost_centers" WHERE "id" = ${costCenterId}::uuid FOR UPDATE`;

    return rows[0] ?? null;
  }

  async hasActiveCostCenter(tx: DbTx, departmentId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"::text AS "id" FROM "cost_centers" WHERE "department_id" = ${departmentId}::uuid AND "status" = 'ACTIVE'`;

    return rows.length > 0;
  }

  /**
   * The record of the link, written BEFORE the Cost Center gets its department (the database refuses it afterwards).
   * The database also refuses it when something is already charged to the Cost Center in a way the link would contradict —
   * a request or a seat of another department, or any budget or commitment, which carry no department of their own
   * (trigger `cost_center_department_links_references_consistent`): that is DirectionRefusedError, nothing was written.
   */
  async insertLinkRecord(
    tx: DbTx,
    input: {
      organizationId: string;
      costCenterId: string;
      departmentId: string;
      basis: string;
      approvedBy: string;
      operator: string;
      environment: string;
    },
  ): Promise<{ id: string }> {
    try {
      return await tx.costCenterDepartmentLink.create({
        data: {
          organizationId: input.organizationId,
          costCenterId: input.costCenterId,
          departmentId: input.departmentId,
          basisReference: input.basis,
          approverRef: input.approvedBy,
          operatorRef: input.operator,
          environment: input.environment,
        },
        select: { id: true },
      });
    } catch (error) {
      // The trigger says it in its message (`cost_center_department_links_references_consistent`); the driver error carries that text.
      if (isCheckViolation(error, 'history that contradicts this department')) {
        throw new DirectionRefusedError('COST_CENTER_REFERENCES_CONFLICT');
      }
      throw error;
    }
  }

  /**
   * Gives the Cost Center its department. `linked_at` is the moment of the write for a Cost Center in use — it is the
   * department's current one from now on, nothing before is charged to it (`QĐ-87d(3)`) — and `deactivated_at` for a
   * retired one (its current interval is empty); never before the Cost Center or the department was created (F68).
   */
  async link(tx: DbTx, costCenterId: string, departmentId: string): Promise<Date> {
    const rows = await tx.$queryRaw<{ linkedAt: Date }[]>`
      UPDATE "cost_centers" c
         SET "department_id" = d."id",
             "linked_at" = GREATEST(
               CASE WHEN c."status" = 'ACTIVE' THEN now() ELSE COALESCE(c."deactivated_at", c."created_at") END,
               c."created_at", d."created_at")
        FROM "departments" d
       WHERE c."id" = ${costCenterId}::uuid AND d."id" = ${departmentId}::uuid
      RETURNING c."linked_at" AS "linkedAt"`;

    return rows[0].linkedAt;
  }
}
