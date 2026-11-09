import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { PersonnelActor } from '../public/personnel.types';
import type { EventBasis, SuperAdminEventParameters } from '../public/super-admin-event.types';
import { TransferChangeService } from '../transfer/transfer-change.service';
import { TransferService } from '../transfer/transfer.service';
import { SuperAdminEventAnchor, type Subject } from './super-admin-event-anchor.service';

export type TransferEventParameters = Extract<
  SuperAdminEventParameters,
  { mode: 'transfer-record' | 'transfer-reschedule' | 'transfer-cancel' }
>;

/** The events of the transfer family: the service that writes each one in the transaction of the ticket, the same rules as the application's. */
@Injectable()
export class SuperAdminTransferEvents {
  constructor(
    private readonly anchor: SuperAdminEventAnchor,
    private readonly transfers: TransferService,
    private readonly transferChanges: TransferChangeService,
  ) {}

  /** Answers the id of the transfer the event made or changed. */
  async write(
    tx: DbTx,
    actor: PersonnelActor,
    subject: Subject,
    parameters: TransferEventParameters,
    basis: EventBasis,
  ): Promise<string> {
    switch (parameters.mode) {
      case 'transfer-record': {
        if (parameters.fromNotice) {
          return this.anchor.fromNotice(tx, actor, subject, parameters.mode, parameters.fromNotice, basis, {
            effectiveOn: parameters.effectiveOn,
            toDepartmentId: parameters.toDepartmentId,
            successor: parameters.successor,
          });
        }

        return (
          await this.transfers.recordInTx(tx, actor, {
            employeeId: subject.id,
            toDepartmentId: parameters.toDepartmentId,
            effectiveOn: parameters.effectiveOn,
            grounds: basis,
            successor: parameters.successor,
          })
        ).id;
      }
      case 'transfer-reschedule':
        await this.anchor.assertAbout(tx, 'TRANSFER', parameters.transferId, subject);

        return (
          await this.transferChanges.reschedule(
            actor,
            parameters.transferId,
            {
              newEffectiveOn: parameters.newEffectiveOn,
              reason: parameters.reason,
              grounds: basis,
              successor: parameters.successor,
            },
            tx,
          )
        ).id;
      case 'transfer-cancel':
        await this.anchor.assertAbout(tx, 'TRANSFER', parameters.transferId, subject);

        return (
          await this.transferChanges.cancel(
            actor,
            parameters.transferId,
            { reason: parameters.reason, grounds: basis },
            tx,
          )
        ).id;
    }
  }
}
