import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LeaveService } from '../leave/leave.service';
import type { PersonnelActor } from '../public/personnel.types';
import type { EventBasis, SuperAdminEventParameters } from '../public/super-admin-event.types';
import { SuperAdminEventAnchor, type Subject } from './super-admin-event-anchor.service';

export type LeaveEventParameters = Extract<SuperAdminEventParameters, { mode: 'leave-start' | 'leave-return' }>;

/** The events of the long leave family: the service that writes each one in the transaction of the ticket, the same rules as the application's. */
@Injectable()
export class SuperAdminLeaveEvents {
  constructor(
    private readonly anchor: SuperAdminEventAnchor,
    private readonly leaves: LeaveService,
  ) {}

  /** Answers the id of the leave the event made or changed. */
  async write(
    tx: DbTx,
    actor: PersonnelActor,
    subject: Subject,
    parameters: LeaveEventParameters,
    basis: EventBasis,
  ): Promise<string> {
    switch (parameters.mode) {
      case 'leave-start': {
        if (parameters.fromNotice) {
          return this.anchor.fromNotice(tx, actor, subject, parameters.mode, parameters.fromNotice, basis, {
            startedOn: parameters.startedOn,
            approvedReturnOn: parameters.approvedReturnOn,
          });
        }

        return (
          await this.leaves.startInTx(tx, actor, {
            employeeId: subject.id,
            startedOn: parameters.startedOn,
            approvedReturnOn: parameters.approvedReturnOn,
            grounds: basis,
          })
        ).id;
      }
      case 'leave-return':
        await this.anchor.assertAbout(tx, 'LEAVE', parameters.leaveId, subject);

        return (
          await this.leaves.confirmReturn(
            actor,
            parameters.leaveId,
            { returnedOn: parameters.returnedOn, grounds: basis },
            tx,
          )
        ).id;
    }
  }
}
