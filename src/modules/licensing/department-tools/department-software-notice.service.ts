import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { SoftwareProposal } from './department-software.types';

/**
 * Tells the people a proposal to add software to the list of a department concerns (`QĐ-110t`): the IT Admin in charge when it is made,
 * and the head who made it when it is decided. Both notices are written in the transaction of the change, so they exist exactly when it
 * commits, and once for each recipient and proposal however many times it is looked at. They carry ids, the decision and the reason the
 * IT Admin gave for a rejection, and nothing else.
 */
@Injectable()
export class DepartmentSoftwareNotice {
  constructor(
    private readonly notifications: NotificationsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /**
   * Notifies the acting IT Admins of the department (in-charge and active substitute), or falls back to the usable Super Admin when
   * none can act.
   */
  async proposed(tx: DbTx, proposal: SoftwareProposal): Promise<void> {
    const acting = (
      await this.organizationReads.itAdminsActingFor(
        [proposal.departmentId],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      )
    ).get(proposal.departmentId);
    let recipients = acting && acting.actors.length > 0 ? acting.actors : [];
    if (recipients.length === 0) {
      const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);
      recipients = superAdmin !== null ? [superAdmin] : [];
    }
    for (const recipientEmployeeId of recipients) {
      await this.notifications.notifyInApp(tx, {
        organizationId: proposal.organizationId,
        recipientEmployeeId,
        code: 'DEPARTMENT_SOFTWARE_PROPOSED',
        subject: { type: 'DEPARTMENT_SOFTWARE_PROPOSAL', id: proposal.id },
        params: {
          proposalId: proposal.id,
          departmentId: proposal.departmentId,
          applicationId: proposal.applicationId,
          planId: proposal.planId,
        },
        eventKey: `DEPARTMENT_SOFTWARE_PROPOSED:${proposal.id}`,
      });
    }
  }

  /** The head who made the proposal: accepted (the place is now in the list) or rejected with the reason of the IT Admin. */
  async decided(
    tx: DbTx,
    proposal: SoftwareProposal,
    decision: { state: 'ACCEPTED' | 'REJECTED'; reason: string | null },
  ): Promise<void> {
    await this.notifications.notifyInApp(tx, {
      organizationId: proposal.organizationId,
      recipientEmployeeId: proposal.proposedByEmployeeId,
      code: 'DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED',
      subject: { type: 'DEPARTMENT_SOFTWARE_PROPOSAL', id: proposal.id },
      params: {
        proposalId: proposal.id,
        departmentId: proposal.departmentId,
        applicationId: proposal.applicationId,
        planId: proposal.planId,
        decision: decision.state,
        reason: decision.reason,
      },
      eventKey: `DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED:${proposal.id}`,
    });
  }
}
