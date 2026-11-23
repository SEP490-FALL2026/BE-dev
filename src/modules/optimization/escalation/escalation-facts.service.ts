import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingGhostSeatApi } from '../../licensing/public/licensing-ghost-seat.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelApi } from '../../personnel/public/personnel.api';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import type { EscalationFacts } from './escalation.types';

/** What the batch reads once for every recommendation it names: the seats, the holders in a transfer and where each holder is placed. */
export interface EscalationBatchFacts {
  seats: Map<string, { isMachineAccount: boolean }>;
  inTransfer: Set<string>;
  leaveOrHandover: Set<string>;
  placements: Map<string, string>;
}

/**
 * The facts the rule of the early push judges (`escalation.policy.ts`): read for the whole batch, never for each recommendation, except the
 * placement of a holder, which the organization answers one person at a time.
 */
@Injectable()
export class EscalationFactsService {
  constructor(
    private readonly licensing: LicensingGhostSeatApi,
    private readonly personnel: PersonnelApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** The seats that hold a seat today, the holders in a transfer in force and the departments the holders are in, of the recommendations named. */
  async ofBatch(tx: DbTx, today: BusinessDate, records: readonly GhostSeatRecord[]): Promise<EscalationBatchFacts> {
    const employeeIds = [...new Set(records.flatMap((record) => (record.employeeId ? [record.employeeId] : [])))];
    if (employeeIds.length === 0)
      return { seats: new Map(), inTransfer: new Set(), leaveOrHandover: new Set(), placements: new Map() };
    const seats = await this.licensing.listSeatsForRules({ asOf: today, employeeIds }, tx);
    const transfers = await this.personnel.getTransfersInOverlap(employeeIds, today);
    const leaveOrHandover = await this.leaveOrHandoverOf(employeeIds, today);
    const placements = new Map<string, string>();
    for (const employeeId of employeeIds) {
      const placement = await this.organizationReads.getEmployeePlacement(employeeId, today, tx);
      if (placement) placements.set(employeeId, placement.departmentId);
    }

    return {
      seats: new Map(seats.map((seat) => [seat.chainRootId, { isMachineAccount: seat.isMachineAccount }])),
      inTransfer: new Set(transfers.map((transfer) => transfer.employeeId)),
      leaveOrHandover,
      placements,
    };
  }

  /** The holders on a long leave today (the same rule as the weekly pass: begun, and not ended before tomorrow) and the ones handing over before leaving. */
  private async leaveOrHandoverOf(employeeIds: readonly string[], today: BusinessDate): Promise<Set<string>> {
    const away = new Set<string>();
    for (const leave of await this.personnel.getLeaveIntervals(employeeIds, today, today)) {
      if (leave.startedOn <= today && (leave.endedOn === null || leave.endedOn > today)) away.add(leave.employeeId);
    }
    for (const handover of await this.personnel.getHandingOverCases(employeeIds)) away.add(handover.employeeId);

    return away;
  }

  /** What the rule reads of one recommendation, out of what the batch read. */
  of(record: GhostSeatRecord | null, batch: EscalationBatchFacts): EscalationFacts {
    return {
      record,
      seat: record?.seatChainId ? (batch.seats.get(record.seatChainId) ?? null) : null,
      inTransfer: record?.employeeId ? batch.inTransfer.has(record.employeeId) : false,
      onLeaveOrHandover: record?.employeeId ? batch.leaveOrHandover.has(record.employeeId) : false,
      placementDepartmentId: record?.employeeId ? (batch.placements.get(record.employeeId) ?? null) : null,
    };
  }

  /** Whether this person is the IT Admin in charge of the department: the audit says it. */
  async isInCharge(tx: DbTx, departmentId: string, employeeId: string): Promise<boolean> {
    return (await this.organizationReads.getItAdminInChargeOfDepartment(departmentId, tx)) === employeeId;
  }

  /**
   * Whether the caller is allowed to push a watch recommendation for the department: allowed only when the caller is an acting
   * IT Admin (usable in-charge or usable appointed substitute) of the department.
   */
  async departmentAccessOf(
    tx: DbTx,
    departmentId: string,
    actorEmployeeId: string,
  ): Promise<{ allowed: boolean; byInCharge: boolean; bySubstitute: boolean }> {
    const acting = (
      await this.organizationReads.itAdminsActingFor(
        [departmentId],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      )
    ).get(departmentId);
    if (!acting || !acting.actors.includes(actorEmployeeId)) {
      return { allowed: false, byInCharge: false, bySubstitute: false };
    }

    return {
      allowed: true,
      byInCharge: acting.inCharge === actorEmployeeId,
      bySubstitute: acting.substitute === actorEmployeeId && acting.inCharge !== actorEmployeeId,
    };
  }
}
