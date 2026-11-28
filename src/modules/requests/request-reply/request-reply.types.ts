export type ReplyKind = 'REQUESTER_RESUBMISSION' | 'HEAD_RESUBMISSION';

export type HumanReturn = { kind: 'NEED' | 'IT_ASSESSMENT' | 'SPEND'; stepId: string; closedAt: Date };

export type LatestReplyRow = { kind: ReplyKind; note: string; authorEmployeeId: string; createdAt: Date };

export type LatestReply = { kind: ReplyKind; note: string; author: { id: string; name: string }; createdAt: Date };
