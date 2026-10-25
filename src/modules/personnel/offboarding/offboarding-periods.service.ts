import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationHistoryService } from '../../organization/organization-history.service';
import { HeadHandoverRefusedError, PlacementOverlapError } from '../../organization/organization.errors';
import { OffboardingRefusedError } from './offboarding.errors';
import type { HeadHandoverFacts, OffboardingRecord, SuccessorChoice } from './offboarding.types';

export interface ScheduledDeparture {
  headHandover: HeadHandoverFacts | null;
  placementClosedId: string;
}

/**
 * The periods a departure writes ahead of its day and takes back exactly (`US-03-04` AC-8, AC-14, AC-15, AC-22): the head of the
 * department is handed over first (to a member that day, or to nobody) and only then is the placement of the person ended, because
 * a head is a member for every day of the period. Taking back goes the other way round: the placement is open again, then the head.
 * The caller holds the department `FOR UPDATE` (when the person heads it) and the employee.
 */
@Injectable()
export class OffboardingPeriodsService {
  constructor(private readonly history: OrganizationHistoryService) {}

  async schedule(
    tx: DbTx,
    input: {
      organizationId: string;
      employeeId: string;
      departmentId: string;
      endsOn: BusinessDate;
      leavesAsHead: boolean;
      successor: SuccessorChoice | undefined;
    },
  ): Promise<ScheduledDeparture> {
    const headHandover = input.leavesAsHead ? await this.handOverHead(tx, input) : null;
    try {
      const closed = await this.history.scheduleDepartureEnd(tx, input.employeeId, input.endsOn);

      return { headHandover, placementClosedId: closed.closedPlacementId };
    } catch (error) {
      if (error instanceof PlacementOverlapError)
        throw new OffboardingRefusedError('PLACEMENT_OVERLAP', { reason: error.reason });
      throw error;
    }
  }

  /** The placement is open again and the head of the department is back where it was, as when the case was not yet written. */
  async undo(tx: DbTx, held: Pick<OffboardingRecord, 'placementClosedId' | 'headHandover'>): Promise<void> {
    try {
      if (held.placementClosedId) await this.history.cancelDepartureEnd(tx, held.placementClosedId);
      if (held.headHandover) await this.history.undoScheduledHeadHandover(tx, held.headHandover);
    } catch (error) {
      if (error instanceof PlacementOverlapError) throw new OffboardingRefusedError('CONCURRENT_CHANGE');
      throw error;
    }
  }

  private async handOverHead(
    tx: DbTx,
    input: {
      organizationId: string;
      employeeId: string;
      departmentId: string;
      endsOn: BusinessDate;
      successor: SuccessorChoice | undefined;
    },
  ): Promise<HeadHandoverFacts> {
    const successorEmployeeId = input.successor?.kind === 'EMPLOYEE' ? input.successor.employeeId : null;
    try {
      const moved = await this.history.scheduleHeadHandover(tx, {
        organizationId: input.organizationId,
        departmentId: input.departmentId,
        outgoingEmployeeId: input.employeeId,
        effectiveOn: input.endsOn,
        successorEmployeeId,
      });
      if (!moved) throw new OffboardingRefusedError('CONCURRENT_CHANGE');

      return { ...moved, successor: successorEmployeeId ? 'EMPLOYEE' : 'NONE', successorEmployeeId };
    } catch (error) {
      if (error instanceof HeadHandoverRefusedError) {
        throw new OffboardingRefusedError('SUCCESSOR_NOT_A_MEMBER_ON_DATE', { reason: error.reason });
      }
      throw error;
    }
  }
}
