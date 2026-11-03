import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import { OrganizationApi } from '../../organization/public/organization.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { DepartmentBrief, EmployeeRecord, PlacementInForce } from '../../organization/public/organization.types';
import type { PersonnelActor } from '../public/personnel.types';
import { TransferRefusedError } from './transfer.errors';
import { newTransferRefusal, placementHeld, subjectRefusal } from './transfer.policy';
import { TransferGuardService } from './transfer-guard.service';
import { TransferRepo } from './transfer.repo';
import { TransferSettlementService } from './transfer-settlement.service';
import type { RecordTransferInput } from './transfer.types';

/** What the person was when the change was asked for, read before the locks so they can be taken in the order of the protocol. */
export interface TransferSeen {
  before: PlacementInForce;
  toDepartmentId: string;
  leavesAsHead: boolean;
}

/** What the person is under the locks, with the departments locked for the change. */
export interface TransferHeld {
  employee: EmployeeRecord;
  current: PlacementInForce;
  departments: Map<string, DepartmentBrief>;
}

/**
 * Everything a change of department needs to hold before one row is written (`US-03-01` AC-1, AC-2, AC-4 -> AC-8, AC-11, AC-13 ->
 * AC-18): what the person is, the locks of the protocol (the departments by id, then the employee and a chosen successor, then
 * the accounts), what changed meanwhile, and what the policy of the transfer refuses on the facts read under the locks. Throws
 * TransferRefusedError for all of it.
 */
@Injectable()
export class TransferPreconditions {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly history: OrganizationHistoryApi,
    private readonly guard: TransferGuardService,
    private readonly transfers: TransferRepo,
    private readonly settlement: TransferSettlementService,
  ) {}

  async require(
    tx: DbTx,
    actor: PersonnelActor,
    input: RecordTransferInput,
    today: BusinessDate,
  ): Promise<{ seen: TransferSeen; held: TransferHeld }> {
    const seen = await this.readBeforeLocks(tx, input, today);
    const departments = await this.lockInOrder(tx, actor, input, seen);
    const held = await this.readAfterLocks(tx, input, seen, { today, departments });
    await this.requireRecordable(tx, input, { seen, held }, today);

    return { seen, held };
  }

  private async readBeforeLocks(tx: DbTx, input: RecordTransferInput, today: BusinessDate): Promise<TransferSeen> {
    const person = await this.organizationReads.getEmployee(input.employeeId, tx);
    const refused = subjectRefusal(person);
    if (refused) throw new TransferRefusedError(refused);
    if ((await this.organizationReads.unplacedAmong([input.employeeId], tx)).has(input.employeeId))
      throw new TransferRefusedError('EMPLOYEE_UNPLACED');
    const before = await this.history.getPlacementInForce(tx, input.employeeId, today);
    if (!before) throw new TransferRefusedError('PLACEMENT_OVERLAP');
    const toDepartmentId = input.toDepartmentId ?? before.departmentId;
    const leavesAsHead = await this.headsDepartmentLeft(input, before.departmentId, toDepartmentId);

    return { before, toDepartmentId, leavesAsHead };
  }

  /** Whether the person heads the department they leave on the day before the change: only a change of department leaves one. */
  private async headsDepartmentLeft(
    input: RecordTransferInput,
    fromDepartmentId: string,
    toDepartmentId: string,
  ): Promise<boolean> {
    if (toDepartmentId === fromDepartmentId) return false;
    const headed = await this.organizationReads.getHeadedDepartment(input.employeeId, addDays(input.effectiveOn, -1));

    return headed?.departmentId === fromDepartmentId;
  }

  /** The departments by id, then the employee (and a chosen successor), then the accounts. */
  private async lockInOrder(
    tx: DbTx,
    actor: PersonnelActor,
    input: RecordTransferInput,
    seen: TransferSeen,
  ): Promise<Map<string, DepartmentBrief>> {
    const departments = await this.history.lockDepartments(tx, {
      updateIds: seen.leavesAsHead ? [seen.before.departmentId] : [],
      shareIds: [seen.before.departmentId, seen.toDepartmentId],
    });
    await this.organization.lockEmployeeForUpdate(tx, input.employeeId);
    if (seen.leavesAsHead && input.successor?.kind === 'EMPLOYEE') {
      await this.lockSuccessor(tx, input.successor.employeeId);
    }
    await this.guard.requireOperatorSubject(tx, actor, input.employeeId);

    return departments;
  }

  /** The employee and the placement as they are under the locks; another writer in between is `CONCURRENT_CHANGE`. */
  private async readAfterLocks(
    tx: DbTx,
    input: RecordTransferInput,
    seen: TransferSeen,
    locked: { today: BusinessDate; departments: Map<string, DepartmentBrief> },
  ): Promise<TransferHeld> {
    const employee = await this.organizationReads.getEmployee(input.employeeId, tx);
    const current = await this.history.getPlacementInForce(tx, input.employeeId, locked.today);
    if (!employee || !placementHeld(current, seen.before.placementId)) {
      throw new TransferRefusedError('CONCURRENT_CHANGE');
    }
    const headNow = await this.headsDepartmentLeft(input, seen.before.departmentId, seen.toDepartmentId);
    if (headNow && !seen.leavesAsHead) throw new TransferRefusedError('CONCURRENT_CHANGE');

    return { employee, current, departments: locked.departments };
  }

  private async requireRecordable(
    tx: DbTx,
    input: RecordTransferInput,
    facts: { seen: TransferSeen; held: TransferHeld },
    today: BusinessDate,
  ): Promise<void> {
    const { seen, held } = facts;
    await this.settlement.settleDueOf(tx, input.employeeId, today);
    const destination = held.departments.get(seen.toDepartmentId) ?? null;
    const refusal = newTransferRefusal({
      today,
      effectiveOn: input.effectiveOn,
      employee: { status: held.employee.status, workState: held.employee.workState },
      current: { departmentId: held.current.departmentId, validFrom: held.current.validFrom },
      target: { departmentId: seen.toDepartmentId },
      destinationDepartment: destination && { active: destination.active },
      grounds: input.grounds,
      pending: await this.pendingOf(tx, input.employeeId),
      namedAsSuccessor: await this.transfers.isNamedSuccessorOfPending(tx, input.employeeId),
      successor: await this.guard.successorFacts(tx, {
        required: seen.leavesAsHead,
        chosen: input.successor,
        transfereeId: input.employeeId,
        oldDepartmentId: seen.before.departmentId,
        day: input.effectiveOn,
      }),
    });
    if (refusal) {
      const oldDepartment = held.departments.get(seen.before.departmentId);
      this.guard.refuse(
        refusal,
        refusal.code === 'HEAD_SUCCESSOR_REQUIRED' ? { departmentName: oldDepartment?.name } : undefined,
      );
    }
  }

  private async pendingOf(tx: DbTx, employeeId: string): Promise<{ effectiveOn: BusinessDate } | null> {
    const pending = await this.transfers.findPendingOf(tx, employeeId);

    return pending && { effectiveOn: pending.effectiveOn };
  }

  /** Takes the successor row `FOR SHARE`; one that does not exist is judged by the policy, not here. */
  private async lockSuccessor(tx: DbTx, employeeId: string): Promise<void> {
    try {
      await this.organizationReads.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (!(error instanceof EmployeeNotFoundError)) throw error;
    }
  }
}
