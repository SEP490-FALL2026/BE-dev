import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { BeneficiaryGoneScope } from '../public/requests.types';

/**
 * Tells the IT Admin about a request the system did not close because its grant is being carried out (`QĐ-110d`): the vendor may already
 * have sent the invitation, so the IT Admin checks it, takes it back and closes the request by hand (`DepartureCancellationService`, which
 * stays open to the IT Admin). The notice goes to the IT Admin in charge of the department the request was sent from, or, when nobody is in
 * charge, to the first IT Admin who can act. It is written in the transaction of the sweep, so it exists exactly when the sweep commits, and
 * once for the request and the person however many times the sweep looks again.
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
    const recipient =
      (await this.organizationReads.getItAdminInChargeOfDepartment(request.departmentId, tx)) ??
      (await this.identity.findFirstUsableItAdminEmployeeId(tx));
    if (recipient === null) return;

    await this.notifications.notifyInApp(tx, {
      organizationId: request.organizationId,
      recipientEmployeeId: recipient,
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
