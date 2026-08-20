import { Injectable } from '@nestjs/common';
import { ApprovalDecisionContext, ApprovalDecisionPolicyResult } from '../access-requests.types';

@Injectable()
export class ApprovalPolicy {
  canDecide(context: ApprovalDecisionContext): ApprovalDecisionPolicyResult {
    if (context.requesterId === context.actorId) {
      return { allowed: false, reason: 'SELF_APPROVAL_FORBIDDEN' };
    }

    if (context.approverId !== context.actorId) {
      return { allowed: false, reason: 'APPROVER_MISMATCH' };
    }

    if (context.stepStatus !== 'PENDING') {
      return { allowed: false, reason: 'STEP_ALREADY_DECIDED' };
    }

    return { allowed: true };
  }
}
