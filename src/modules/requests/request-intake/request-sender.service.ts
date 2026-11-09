import { SpendRoutingService } from '../spend/spend-routing.service';
import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { RequestPartyEligibilityApi } from '../../identity-access/public/request-party-eligibility.api';
import type { EmployeeRecord } from '../../organization/public/organization.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestNoDepartmentError } from '../access-request/access-request.errors';

/**
 * The person who sends a Request for themselves, as every route that sends one needs them in its transaction: locked `FOR SHARE` so they
 * cannot leave the company before the commit, judged as a party (the spending approver is none, `D-S21`) and only then read, so that
 * no department of theirs is looked at for a person who can never send. The order is the lock protocol's: the employee, then their account.
 */
@Injectable()
export class RequestSenderService {
  constructor(
    private readonly spending: SpendRoutingService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly requestParties: RequestPartyEligibilityApi,
  ) {}

  startOneStep(tx: DbTx, actor: AuthenticatedPrincipal, id: string, now: Date): Promise<void> {
    return this.spending.start(tx, actor, id, now);
  }

  /**
   * `beneficiaryEmployeeIds` are the people the Request is for besides the sender when it is not for the sender alone (the lines of a
   * group draft). Throws RequestPartyIneligibleError and AccessRequestNoDepartmentError (the person is not in the company).
   */
  async lockEligible(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    beneficiaryEmployeeIds: readonly string[] = [actor.employeeId],
  ): Promise<EmployeeRecord> {
    await this.organizationReads.lockEmployeeForShare(tx, actor.employeeId);
    await this.requestParties.assertEligible(tx, { requesterEmployeeId: actor.employeeId, beneficiaryEmployeeIds });
    const employee = await this.organizationReads.getEmployee(actor.employeeId, tx);
    if (!employee) throw new AccessRequestNoDepartmentError();

    return employee;
  }
}
