import { Injectable } from '@nestjs/common';
import { ApprovalDecisionContext, ApprovalDecisionPolicyResult } from './access-requests.types';
import { ApprovalPolicy } from './policies/approval.policy';

/** Public application facade for access-request workflows. */
@Injectable()
export class AccessRequestsService {
  constructor(private readonly approvalPolicy: ApprovalPolicy) {}

  canDecideApproval(context: ApprovalDecisionContext): ApprovalDecisionPolicyResult {
    return this.approvalPolicy.canDecide(context);
  }
}
