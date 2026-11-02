import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AccountRecordService } from '../accounts/account-record.service';
import { RoleGrantService } from '../accounts/role-grant.service';
import { RequestPartyIneligibleError } from '../public/request-party.errors';
import type { RequestPartyBlock, RequestPartyReason, RequestParties } from '../public/request-party.types';
import { ineligibleReasons, requestPartyBlock, type RequestPartyFacts } from './request-party.policy';

/**
 * Who can never be a party of a Request (`D-S21`): one answer for every way to create, preview or save one. The locking judgment
 * takes the accounts `FOR SHARE` first, in the order of their ids, and reads after, so it and the grant of the role (which holds the
 * account `FOR UPDATE`) wait on the same row; it locks no employee, the route has done that before. The unlocked judgment reads the
 * effective grant without a lock. People with no department are not read yet: the unplaced item adds that fact.
 */
@Injectable()
export class RequestPartyEligibilityService {
  constructor(
    private readonly accounts: AccountRecordService,
    private readonly grants: RoleGrantService,
  ) {}

  async assertEligible(tx: DbTx, parties: RequestParties): Promise<void> {
    const facts = await this.lockedFacts(tx, peopleOf(parties));
    const block = requestPartyBlock(parties, facts);
    if (block !== null) throw new RequestPartyIneligibleError(block);
  }

  blockOf(parties: RequestParties, tx?: DbTx): Promise<RequestPartyBlock | null> {
    return this.unlockedFacts(tx).then((facts) => requestPartyBlock(parties, facts));
  }

  async ineligibleAmong(
    employeeIds: readonly string[],
    tx?: DbTx,
    options?: { lockForShare?: boolean },
  ): Promise<ReadonlyMap<string, RequestPartyReason>> {
    const facts =
      options?.lockForShare && tx !== undefined
        ? await this.lockedFacts(tx, employeeIds)
        : await this.unlockedFacts(tx);

    return ineligibleReasons(employeeIds, facts);
  }

  private async lockedFacts(tx: DbTx, employeeIds: readonly string[]): Promise<RequestPartyFacts> {
    const spendingApproverEmployeeId = await this.accounts.lockSpendingApproverAmong(
      tx,
      [...new Set(employeeIds)].sort(),
    );

    return { spendingApproverEmployeeId, unplacedEmployeeIds: new Set() };
  }

  private async unlockedFacts(tx?: DbTx): Promise<RequestPartyFacts> {
    return {
      spendingApproverEmployeeId: await this.grants.spendingApproverEmployeeId(tx),
      unplacedEmployeeIds: new Set(),
    };
  }
}

function peopleOf(parties: RequestParties): string[] {
  return parties.requesterEmployeeId === null
    ? [...parties.beneficiaryEmployeeIds]
    : [parties.requesterEmployeeId, ...parties.beneficiaryEmployeeIds];
}
