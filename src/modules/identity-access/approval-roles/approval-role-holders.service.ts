import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ApprovalRoleHolders } from '../identity-access.types';
import { ApprovalRoleReaderRepo } from './approval-role-reader.repo';

/**
 * Who holds each approval role now, for the facade other modules call (`US-05-03`: who may hold a step of a request). An
 * unlocked read that changes nothing: the roles are changed by `ApprovalRoleService`, which is not in the facade graph.
 */
@Injectable()
export class ApprovalRoleHoldersService {
  constructor(private readonly reader: ApprovalRoleReaderRepo) {}

  async current(tx?: DbTx): Promise<ApprovalRoleHolders> {
    const holders = await this.reader.currentHolders(tx);
    const holderOf = (role: string): string | null =>
      holders.find((holder) => holder.role === role)?.employeeId ?? null;

    return {
      spendingApproverEmployeeId: holderOf('SPENDING_APPROVER'),
      conflictSubstituteEmployeeId: holderOf('CONFLICT_SUBSTITUTE'),
      fallbackApproverEmployeeId: holderOf('FALLBACK_APPROVER'),
    };
  }
}
