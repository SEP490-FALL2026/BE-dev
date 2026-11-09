import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { readSqlState } from '../../../infrastructure/database/transaction-runner';
import { PlacementOverlapError } from '../public/organization.errors';

/**
 * The writes of the leaving of a person on the placements and on the employee (`g6-offboarding-record`): the open placement ends
 * the day the person is no longer a member, that end is taken back when the handover is moved or cancelled, and the employee is
 * set `TERMINATED` (the database sets the work state `LEFT` with it). The caller holds the employee `FOR UPDATE`.
 */
@Injectable()
export class EmployeeDepartureRepo {
  /** Ends the open placement of the person on `endsOn`; throws PlacementOverlapError when there is none or it begins on or after that day. */
  async scheduleEnd(
    tx: DbTx,
    employeeId: string,
    endsOn: BusinessDate,
  ): Promise<{ closedPlacementId: string; departmentId: string; validFrom: BusinessDate }> {
    const open = (
      await tx.$queryRaw<{ id: string; department_id: string; valid_from: Date }[]>`
        SELECT id, department_id, valid_from FROM employee_placements
         WHERE employee_id = ${employeeId}::uuid AND valid_to IS NULL FOR UPDATE`
    )[0];
    if (!open) throw new PlacementOverlapError('NO_OPEN_PLACEMENT');
    const validFrom = fromDateColumn(open.valid_from);
    if (validFrom >= endsOn) throw new PlacementOverlapError('NOT_AFTER_CURRENT_PERIOD');
    try {
      await tx.$executeRaw`UPDATE employee_placements SET valid_to = ${endsOn}::date WHERE id = ${open.id}::uuid`;
    } catch (error) {
      if (readSqlState(error) === '23P01') throw new PlacementOverlapError('OVERLAP');
      throw error;
    }

    return { closedPlacementId: open.id, departmentId: open.department_id, validFrom };
  }

  /** Takes back the end written for a handover that has not taken effect: the placement is open again. */
  async cancelEnd(tx: DbTx, placementId: string): Promise<void> {
    const reopened =
      await tx.$executeRaw`UPDATE employee_placements SET valid_to = NULL WHERE id = ${placementId}::uuid`;
    if (reopened !== 1) throw new PlacementOverlapError('NO_OPEN_PLACEMENT');
  }

  /** The person has left: `TERMINATED`, and with it the work state `LEFT` (a trigger keeps the two together). */
  async markLeft(tx: DbTx, employeeId: string): Promise<void> {
    await tx.$executeRaw`UPDATE employees SET status = 'TERMINATED'::"EmployeeStatus", updated_at = now() WHERE id = ${employeeId}::uuid`;
  }
}
