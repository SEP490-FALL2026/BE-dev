import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { BeneficiaryGoneScope } from '../public/requests.types';

/**
 * Tells the acting IT Admins about a request the system did not close because its grant is being carried out: the vendor may already
 * have sent the invitation, so the IT Admin checks it, takes it back and closes the request by hand (`DepartureCancellationService`, which
 * stays open to the IT Admin). The notice goes to the acting IT Admins of the department the request was sent from (usable in-charge and
 * any usable substitute), or, when none can act, to the usable Super Admin. Written in the transaction of the sweep, once per recipient,
 * request, and person.
 */
@Injectable()
export class BeneficiaryGoneItNotice {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly notifications: NotificationsApi,
  ) {}

  async tell(
    tx: DbTx,
    request: { id: string; organizationId: string; departmentId: string },
    employeeId: string,
    scope: BeneficiaryGoneScope,
  ): Promise<void> {
    for (const recipientEmployeeId of await this.recipients(tx, request.departmentId)) {
      await this.notifications.notifyInApp(tx, {
        organizationId: request.organizationId,
        recipientEmployeeId,
        code: 'REQUEST_BENEFICIARY_GONE_IT_CHECK',
        subject: { type: 'ACCESS_REQUEST', id: request.id },
        params: {
          requestId: request.id,
          beneficiaryEmployeeId: employeeId,
          reasonKind: scope.kind === 'ALL_OPEN' ? 'DEPARTURE' : 'TRANSFER',
        },
        eventKey: `BENEFICIARY_GONE_IT_CHECK:${request.id}:${employeeId}`,
      });
    }
  }

  private async recipients(tx: DbTx, departmentId: string): Promise<string[]> {
    const acting = (
      await this.organizationReads.itAdminsActingFor(
        [departmentId],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      )
    ).get(departmentId);
    if (acting && acting.actors.length > 0) return acting.actors;

    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);
    return superAdmin !== null ? [superAdmin] : [];
  }
}
