import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import { OrganizationApi } from '../../organization/public/organization.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { EmployeeRecord, PlacementInForce } from '../../organization/public/organization.types';
import type { PersonnelActor } from '../public/personnel.types';
import { TransferChangeService } from '../transfer/transfer-change.service';
import { TransferGuardService } from '../transfer/transfer-guard.service';
import { placementHeld } from '../transfer/transfer.policy';
import type { TransferRecord } from '../transfer/transfer.types';
import { OffboardingRefusedError } from './offboarding.errors';
import { departureEffectiveOn, recordRefusal, subjectRefusal } from './offboarding.policy';
import { OffboardingRepo } from './offboarding.repo';
import type { RecordOffboardingInput } from './offboarding.types';

/** What the person was when the departure was asked for, read before the locks so they can be taken in the order of the protocol. */
export interface DepartureSeen {
  before: PlacementInForce | null;
  endsOn: BusinessDate;
  leavesAsHead: boolean;
  waiting: TransferRecord | null;
  cancelledPlacement?: { placementId: string; departmentId: string; validFrom: BusinessDate } | null;
}

/** What the person is under the locks: the employee, the placement in force, and the transfer that waits. */
export interface DepartureHeld {
  employee: EmployeeRecord;
  current: PlacementInForce | null;
  pending: TransferRecord | null;
}

/**
 * Everything a departure needs to hold before one row is written (`US-03-04` AC-2, AC-8, AC-18, AC-19): what the person is, the locks
 * of the protocol (the departments by id, the employee, a chosen successor, the accounts), what changed meanwhile, and what the policy
 * of the record refuses on the facts read under the locks. Throws OffboardingRefusedError for all of it.
 */
@Injectable()
export class OffboardingPreconditions {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly history: OrganizationHistoryApi,
    private readonly guard: TransferGuardService,
    private readonly transfers: TransferChangeService,
    private readonly repo: OffboardingRepo,
  ) {}

  async require(
    tx: DbTx,
    actor: PersonnelActor,
    input: RecordOffboardingInput,
    today: BusinessDate,
  ): Promise<{ seen: DepartureSeen; held: DepartureHeld }> {
    const seen = await this.readBeforeLocks(tx, input, today);
    await this.lockInOrder(tx, actor, input, seen);
    const held = await this.readAfterLocks(tx, input, seen, today);
    await this.requireRecordable(tx, input, { seen, held }, today);

    return { seen, held };
  }

  /**
   * The employee, the placement in force on the day, the day the placement ends, whether they head the department on their last day in
   * office, and the transfer that waits. Refused at once for a person who is unknown, gone, already handing over, or given no last day.
   */
  private async readBeforeLocks(tx: DbTx, input: RecordOffboardingInput, today: BusinessDate): Promise<DepartureSeen> {
    const person = await this.organizationReads.getEmployee(input.employeeId, tx);
    const refused = subjectRefusal(person, input.lastWorkingDay);
    if (refused) throw new OffboardingRefusedError(refused);

    const before = await this.history.getPlacementInForce(tx, input.employeeId, today);
    if (before) {
      const endsOn = departureEffectiveOn({
        lastWorkingDay: input.lastWorkingDay as BusinessDate,
        blockNow: input.accessBlockMode === 'BLOCK_NOW',
        today,
        placementFrom: before.validFrom,
      });
      const leavesAsHead = await this.headsOnLastDay(input.employeeId, before.departmentId, endsOn);
      const waiting = await this.transfers.peekPendingOf(tx, input.employeeId);

      return { before, endsOn, leavesAsHead, waiting, cancelledPlacement: null };
    }

    const isUnplaced = (await this.organizationReads.unplacedAmong([input.employeeId], tx)).has(input.employeeId);
    if (isUnplaced) {
      const endsOn = departureEffectiveOn({
        lastWorkingDay: input.lastWorkingDay as BusinessDate,
        blockNow: input.accessBlockMode === 'BLOCK_NOW',
        today,
        placementFrom: null,
      });
      return { before: null, endsOn, leavesAsHead: false, waiting: null, cancelledPlacement: null };
    }

    const scheduled = await this.organizationReads.getScheduledFirstPlacement(input.employeeId, today, tx);
    if (scheduled) {
      const effectiveLastDay = input.lastWorkingDay as BusinessDate;
      if (effectiveLastDay < scheduled.validFrom) {
        const endsOn = departureEffectiveOn({
          lastWorkingDay: input.lastWorkingDay as BusinessDate,
          blockNow: input.accessBlockMode === 'BLOCK_NOW',
          today,
          placementFrom: null,
        });
        return { before: null, endsOn, leavesAsHead: false, waiting: null, cancelledPlacement: scheduled };
      }
      throw new OffboardingRefusedError('PLACEMENT_OVERLAP', {
        reason: 'FIRST_PLACEMENT_PENDING',
        validFrom: scheduled.validFrom,
      });
    }

    throw new OffboardingRefusedError('PLACEMENT_OVERLAP', { reason: 'NO_OPEN_PLACEMENT' });
  }

  private async headsOnLastDay(employeeId: string, departmentId: string, endsOn: BusinessDate): Promise<boolean> {
    return (
      (await this.organizationReads.getHeadedDepartment(employeeId, addDays(endsOn, -1)))?.departmentId === departmentId
    );
  }

  /** The departments by id, then the employee (and a chosen successor), then the accounts. */
  private async lockInOrder(
    tx: DbTx,
    actor: PersonnelActor,
    input: RecordOffboardingInput,
    seen: DepartureSeen,
  ): Promise<void> {
    if (seen.cancelledPlacement) {
      await this.history.lockDepartments(tx, {
        updateIds: [],
        shareIds: [seen.cancelledPlacement.departmentId],
      });
    } else if (seen.before) {
      await this.history.lockDepartments(tx, {
        updateIds: seen.leavesAsHead ? [seen.before.departmentId] : [],
        shareIds: [seen.before.departmentId, ...(seen.waiting ? [seen.waiting.toDepartmentId] : [])],
      });
    }
    await this.organization.lockEmployeeForUpdate(tx, input.employeeId);
    if (seen.leavesAsHead && input.successor?.kind === 'EMPLOYEE') {
      await this.lockSuccessor(tx, input.successor.employeeId);
    }
    await this.guard.requireOperatorSubject(tx, actor, input.employeeId);
  }

  /** The employee and the placement as they are under the locks; another writer in between is `CONCURRENT_CHANGE`. */
  private async readAfterLocks(
    tx: DbTx,
    input: RecordOffboardingInput,
    seen: DepartureSeen,
    today: BusinessDate,
  ): Promise<DepartureHeld> {
    const employee = await this.organizationReads.getEmployee(input.employeeId, tx);
    if (!employee) throw new OffboardingRefusedError('CONCURRENT_CHANGE');

    const current = await this.history.getPlacementInForce(tx, input.employeeId, today);
    if (seen.before) {
      if (!placementHeld(current, seen.before.placementId)) {
        throw new OffboardingRefusedError('CONCURRENT_CHANGE');
      }
      const heads = await this.headsOnLastDay(input.employeeId, seen.before.departmentId, seen.endsOn);
      if (heads !== seen.leavesAsHead) throw new OffboardingRefusedError('CONCURRENT_CHANGE');
      const pending = await this.transfers.pendingOf(tx, input.employeeId, today);
      if (pending?.id !== seen.waiting?.id) throw new OffboardingRefusedError('CONCURRENT_CHANGE');

      return { employee, current, pending };
    }

    await this.verifyUnplacedAfterLocks(tx, input.employeeId, current, seen, today);

    return { employee, current: null, pending: null };
  }

  private async verifyUnplacedAfterLocks(
    tx: DbTx,
    employeeId: string,
    current: PlacementInForce | null,
    seen: DepartureSeen,
    today: BusinessDate,
  ): Promise<void> {
    if (current !== null) {
      throw new OffboardingRefusedError('CONCURRENT_CHANGE');
    }
    if (seen.cancelledPlacement) {
      const scheduled = await this.organizationReads.getScheduledFirstPlacement(employeeId, today, tx);
      if (!scheduled || scheduled.placementId !== seen.cancelledPlacement.placementId) {
        throw new OffboardingRefusedError('CONCURRENT_CHANGE');
      }
    } else {
      const isUnplaced = (await this.organizationReads.unplacedAmong([employeeId], tx)).has(employeeId);
      if (!isUnplaced) throw new OffboardingRefusedError('CONCURRENT_CHANGE');
    }
  }

  private async requireRecordable(
    tx: DbTx,
    input: RecordOffboardingInput,
    facts: { seen: DepartureSeen; held: DepartureHeld },
    today: BusinessDate,
  ): Promise<void> {
    const { seen, held } = facts;
    const refusal = recordRefusal({
      today,
      hireDate: held.employee.hireDate,
      placementFrom: held.current ? held.current.validFrom : null,
      lastWorkingDay: input.lastWorkingDay,
      accessBlockMode: input.accessBlockMode,
      employee: { status: held.employee.status, workState: held.employee.workState },
      grounds: input.grounds,
      pendingTransfer: held.pending && { effectiveOn: held.pending.effectiveOn },
      cancelPendingTransfer: input.cancelPendingTransfer === true,
      namedAsSuccessor: await this.repo.isNamedSuccessorOfPendingTransfer(tx, input.employeeId),
      // Only a person with a placement in force heads a department (an unplaced one never does), so there is a department to judge.
      successor:
        seen.leavesAsHead && seen.before
          ? await this.guard.judgeSuccessor(tx, {
              chosen: input.successor,
              leaverId: input.employeeId,
              departmentId: seen.before.departmentId,
              day: seen.endsOn,
            })
          : null,
    });
    if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);
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
