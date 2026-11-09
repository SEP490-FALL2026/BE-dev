import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RequestPartyEligibilityApi } from '../../identity-access/public/request-party-eligibility.api';
import { AssignmentNotFoundError } from '../../licensing/public/licensing.errors';
import { LicensingRenewalApi } from '../../licensing/public/licensing-renewal.api';
import type { AssignmentFacts } from '../../licensing/public/licensing-renewal.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import type { BusinessDate } from '../../../core/business-date';
import { RenewalRequestRefusedError } from './renewal-request.errors';

/**
 * The seat a renewal is for, read under the lock of its subscription and then of itself, and the people of the renewal judged as
 * parties of a Request before any department is read (`D-S21`): the sender and the holder of the seat cannot be the spending approver.
 * The sender's employee is locked first, as a renewal sent after the end (a new request) does next: employee, then account.
 */
@Injectable()
export class RenewalSeatFactsService {
  constructor(
    private readonly licensingRenewals: LicensingRenewalApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly requestParties: RequestPartyEligibilityApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  /**
   * The days of the window of the renewal of the right ending on `previousEnd` (`QĐ-108b`): those it was recorded with when it opened, or
   * the parameter in force when it has not been recorded yet. Read without a lock: a recorded window never changes.
   */
  async windowDaysOf(tx: DbTx, assignmentId: string, previousEnd: BusinessDate): Promise<number> {
    const recorded = await this.licensingRenewals.renewalWindowOf(assignmentId, previousEnd, tx);

    return recorded?.windowDays ?? Number(await this.parameters.getValue('RENEWAL_WINDOW_DAYS'));
  }

  /** Throws RenewalRequestRefusedError (the seat is not there) and RequestPartyIneligibleError. */
  async lockedFactsOf(tx: DbTx, senderEmployeeId: string, assignmentId: string): Promise<AssignmentFacts> {
    // Only the holder asks (`QĐ-100t`): somebody else is told so before any row is locked, and learns nothing of who may not be a party.
    const seen = await this.readFacts(tx, assignmentId);
    if (seen.employeeId !== senderEmployeeId) throw new RenewalRequestRefusedError('NOT_HOLDER');
    const facts = await this.lockedFacts(tx, assignmentId);
    await this.organizationReads.lockEmployeeForShare(tx, senderEmployeeId);
    await this.requestParties.assertEligible(tx, {
      requesterEmployeeId: senderEmployeeId,
      beneficiaryEmployeeIds: [facts.employeeId],
    });

    return facts;
  }

  private readFacts(tx: DbTx, assignmentId: string): Promise<AssignmentFacts> {
    return this.facts(tx, assignmentId, false);
  }

  private lockedFacts(tx: DbTx, assignmentId: string): Promise<AssignmentFacts> {
    return this.facts(tx, assignmentId, true);
  }

  private async facts(tx: DbTx, assignmentId: string, lock: boolean): Promise<AssignmentFacts> {
    try {
      return await this.licensingRenewals.getAssignmentFacts(tx, assignmentId, { lock });
    } catch (error) {
      if (error instanceof AssignmentNotFoundError) throw new RenewalRequestRefusedError('ASSIGNMENT_NOT_FOUND');
      throw error;
    }
  }
}
