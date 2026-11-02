import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RequestPartyEligibilityApi } from '../../identity-access/public/request-party-eligibility.api';
import { AssignmentNotFoundError } from '../../licensing/public/licensing.errors';
import { LicensingRenewalApi } from '../../licensing/public/licensing-renewal.api';
import type { AssignmentFacts } from '../../licensing/public/licensing-renewal.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
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
  ) {}

  /** Throws RenewalRequestRefusedError (the seat is not there) and RequestPartyIneligibleError. */
  async lockedFactsOf(tx: DbTx, senderEmployeeId: string, assignmentId: string): Promise<AssignmentFacts> {
    const facts = await this.lockedFacts(tx, assignmentId);
    await this.organizationReads.lockEmployeeForShare(tx, senderEmployeeId);
    await this.requestParties.assertEligible(tx, {
      requesterEmployeeId: senderEmployeeId,
      beneficiaryEmployeeIds: [facts.employeeId],
    });

    return facts;
  }

  private async lockedFacts(tx: DbTx, assignmentId: string): Promise<AssignmentFacts> {
    try {
      return await this.licensingRenewals.getAssignmentFacts(tx, assignmentId, { lock: true });
    } catch (error) {
      if (error instanceof AssignmentNotFoundError) throw new RenewalRequestRefusedError('ASSIGNMENT_NOT_FOUND');
      throw error;
    }
  }
}
