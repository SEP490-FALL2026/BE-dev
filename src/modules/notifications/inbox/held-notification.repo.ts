import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { HeldDepartmentNotificationInput, InAppParamValue } from '../public/notifications.types';

/** A held notice as it is read back to be handed to the first head of its department. */
export interface HeldNotificationRow {
  id: string;
  organizationId: string;
  code: string;
  subjectType: string | null;
  subjectId: string | null;
  params: Record<string, InAppParamValue>;
  eventKey: string;
}

/**
 * The only writer of `held_department_notifications` (F67, T-11): a notice for a department that has no head yet is kept
 * here, written in the transaction of the event, and handed to the first head the Super Admin names, once, in the
 * transaction of that assignment. This repo changes only the delivery columns, and only while they are empty.
 */
@Injectable()
export class HeldNotificationRepo {
  /** Writes the held notice; false when this event key is already held (an event holds its notice once). */
  async insertIfAbsent(tx: DbTx, input: HeldDepartmentNotificationInput): Promise<boolean> {
    const { count } = await tx.heldDepartmentNotification.createMany({
      data: [
        {
          organizationId: input.organizationId,
          departmentId: input.departmentId,
          code: input.code,
          subjectType: input.subject?.type ?? null,
          subjectId: input.subject?.id ?? null,
          params: input.params,
          eventKey: input.eventKey,
        },
      ],
      skipDuplicates: true,
    });

    return count === 1;
  }

  /**
   * The notices of the department not yet handed to anyone, oldest first, locked so that two assignments of a first head
   * (they cannot both be first, but a retry may meet its own earlier attempt) hand each notice over once.
   */
  async lockUndelivered(tx: DbTx, departmentId: string): Promise<HeldNotificationRow[]> {
    const rows = await tx.$queryRaw<
      {
        id: string;
        organization_id: string;
        code: string;
        subject_type: string | null;
        subject_id: string | null;
        params: Record<string, InAppParamValue>;
        event_key: string;
      }[]
    >`
      SELECT "id"::text AS "id", "organization_id"::text AS "organization_id", "code", "subject_type",
             "subject_id"::text AS "subject_id", "params", "event_key"
        FROM "held_department_notifications"
       WHERE "department_id" = ${departmentId}::uuid AND "delivered_at" IS NULL
       ORDER BY "held_at", "id"
       FOR UPDATE`;

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      code: row.code,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      params: row.params,
      eventKey: row.event_key,
    }));
  }

  async markDelivered(tx: DbTx, ids: readonly string[], employeeId: string, at: Date): Promise<void> {
    if (ids.length === 0) return;
    await tx.heldDepartmentNotification.updateMany({
      where: { id: { in: [...ids] }, deliveredAt: null },
      data: { deliveredAt: at, deliveredToEmployeeId: employeeId },
    });
  }
}
