export type ReplyKind = 'REQUESTER_RESUBMISSION' | 'HEAD_RESUBMISSION';

export type HumanReturn = { kind: 'NEED' | 'IT_ASSESSMENT' | 'SPEND'; stepId: string; closedAt: Date };

export type ReturnStepFact = {
  id: string;
  kind: 'NEED' | 'IT_ASSESSMENT' | 'FINANCE_REVIEW' | 'SPEND_APPROVAL';
  sequence: number;
  state: string;
  createdAt: Date;
  decidedAt: Date | null;
  approvalRecord: { decision: string; decidedAt: Date } | null;
  spendDecision: { decision: string; decidedAt: Date } | null;
};

export type ReturnFacts = {
  steps: readonly ReturnStepFact[];
  repliedStepIds: ReadonlySet<string>;
};

export type LatestReplyRow = { kind: ReplyKind; note: string; authorEmployeeId: string; createdAt: Date };

export type LatestReply = { kind: ReplyKind; note: string; author: { id: string; name: string }; createdAt: Date };
