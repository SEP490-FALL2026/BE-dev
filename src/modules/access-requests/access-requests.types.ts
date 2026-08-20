export type ApprovalStepState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';

export interface ApprovalDecisionContext {
  requesterId: string;
  approverId: string;
  actorId: string;
  stepStatus: ApprovalStepState;
}

export type ApprovalDecisionPolicyResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'SELF_APPROVAL_FORBIDDEN' | 'APPROVER_MISMATCH' | 'STEP_ALREADY_DECIDED';
    };
