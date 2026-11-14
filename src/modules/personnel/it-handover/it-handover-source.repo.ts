import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { HandoverSource, HandoverSourceFacts } from './it-handover.types';

/**
 * The little the hand-over of an IT Admin who leaves reads of the two files it hangs on (`offboarding_cases`, `department_transfers`) —
 * tables of this module, read here so this capability needs none of the capabilities that own them. A use case reads a file unlocked, locks
 * the employee, then takes the file row `FOR UPDATE` and reads it again.
 */
@Injectable()
export class ItHandoverSourceRepo {
  /** The employee of the file, unlocked: the use case locks the employee before the file. Null when the file does not exist. */
  async employeeOf(source: HandoverSource, tx: DbTx): Promise<string | null> {
    const rows =
      source.kind === 'OFFBOARDING_CASE'
        ? await tx.$queryRaw<
            { employee_id: string }[]
          >`SELECT employee_id FROM offboarding_cases WHERE id = ${source.id}::uuid`
        : await tx.$queryRaw<
            { employee_id: string }[]
          >`SELECT employee_id FROM department_transfers WHERE id = ${source.id}::uuid`;

    return rows[0]?.employee_id ?? null;
  }

  /** The file held `FOR UPDATE` until the transaction ends, read after the lock; null when it does not exist. */
  async lockSource(tx: DbTx, source: HandoverSource): Promise<HandoverSourceFacts | null> {
    if (source.kind === 'OFFBOARDING_CASE') {
      const rows = await tx.$queryRaw<
        { organization_id: string; employee_id: string; state: string; left_on: Date | null }[]
      >`SELECT organization_id, employee_id, state::text AS state, left_on FROM offboarding_cases WHERE id = ${source.id}::uuid FOR UPDATE`;
      const row = rows[0];

      return row
        ? {
            ...source,
            organizationId: row.organization_id,
            employeeId: row.employee_id,
            cancelled: row.state === 'CANCELLED',
            leftOn: row.left_on ? fromDateColumn(row.left_on) : null,
            effectiveOn: null,
          }
        : null;
    }
    const rows = await tx.$queryRaw<
      { organization_id: string; employee_id: string; status: string; effective_on: Date }[]
    >`SELECT organization_id, employee_id, status::text AS status, effective_on FROM department_transfers WHERE id = ${source.id}::uuid FOR UPDATE`;
    const row = rows[0];

    return row
      ? {
          ...source,
          organizationId: row.organization_id,
          employeeId: row.employee_id,
          cancelled: row.status === 'CANCELLED',
          leftOn: null,
          effectiveOn: fromDateColumn(row.effective_on),
        }
      : null;
  }
}
