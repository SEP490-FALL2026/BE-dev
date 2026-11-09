import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OffboardingService } from '../offboarding/offboarding.service';
import type { PersonnelActor } from '../public/personnel.types';
import type { EventBasis, SuperAdminEventParameters } from '../public/super-admin-event.types';
import { DepartureChanges } from './departure-changes.types';
import { SuperAdminEventAnchor, type Subject } from './super-admin-event-anchor.service';

export type DepartureEventParameters = Extract<
  SuperAdminEventParameters,
  { mode: 'departure-record' | 'abrupt-departure-record' | 'departure-change' | 'departure-cancel' }
>;

/** The events of the departure family: the service that writes each one in the transaction of the ticket, the same rules as the application's. */
@Injectable()
export class SuperAdminDepartureEvents {
  constructor(
    private readonly anchor: SuperAdminEventAnchor,
    private readonly offboarding: OffboardingService,
    private readonly offboardingChanges: DepartureChanges,
  ) {}

  /** Answers the id of the case the event made or changed. */
  async write(
    tx: DbTx,
    actor: PersonnelActor,
    subject: Subject,
    parameters: DepartureEventParameters,
    basis: EventBasis,
  ): Promise<string> {
    switch (parameters.mode) {
      case 'departure-record':
      case 'abrupt-departure-record': {
        // The procedure keeps its two names: the sudden departure blocks now, the departure ahead blocks from its last day.
        const accessBlockMode = parameters.mode === 'abrupt-departure-record' ? 'BLOCK_NOW' : 'WITH_LAST_DAY';
        // The procedure names a reason for the transfer it ends; the departure keeps the standard one and confirms the cancellation.
        const cancelPendingTransfer = parameters.cancelTransferReason ? (true as const) : undefined;
        if (parameters.fromNotice) {
          return this.anchor.fromNotice(tx, actor, subject, parameters.mode, parameters.fromNotice, basis, {
            lastWorkingDay: parameters.lastWorkingDay,
            accessBlockMode,
            successor: parameters.successor,
            cancelPendingTransfer,
          });
        }

        return (
          await this.offboarding.recordInTx(tx, actor, {
            employeeId: subject.id,
            lastWorkingDay: parameters.lastWorkingDay,
            accessBlockMode,
            grounds: basis,
            successor: parameters.successor,
            cancelPendingTransfer,
          })
        ).id;
      }
      case 'departure-change':
        await this.anchor.assertAbout(tx, 'CASE', parameters.caseId, subject);

        return (
          await this.offboardingChanges.changeLastDay(
            actor,
            parameters.caseId,
            {
              lastWorkingDay: parameters.lastWorkingDay,
              reason: parameters.reason,
              grounds: basis,
              successor: parameters.successor,
            },
            tx,
          )
        ).id;
      case 'departure-cancel':
        await this.anchor.assertAbout(tx, 'CASE', parameters.caseId, subject);

        return (
          await this.offboardingChanges.cancel(
            actor,
            parameters.caseId,
            { reason: parameters.reason, grounds: basis },
            tx,
          )
        ).id;
    }
  }
}
