import { versionLineZbbJson } from './budget-line-zbb.json';
import type { LineType, ZbbExplanation } from './budget-line-zbb.json';

export interface VersionLineRecord {
  position: number;
  proposalId: string | null;
  proposalPosition: number | null;
  description: string;
  planId: string | null;
  seats: number | null;
  amountMinor: bigint;
  financeComment: string | null;
  adjustmentReason: string | null;
  lineType: LineType;
  zbb: ZbbExplanation | null;
  /** Copied from the proposal line; null for a line Finance added with none. */
  priorityRank: number | null;
}

export interface LinePatch {
  description?: string;
  planId?: string | null;
  seats?: number | null;
  amountMinor?: bigint;
  financeComment?: string | null;
  adjustmentReason?: string | null;
  lineType?: LineType;
  zbb?: ZbbExplanation | null;
  priorityRank?: number | null;
}

export const lineData = (line: Omit<VersionLineRecord, 'position'>) => ({
  proposalId: line.proposalId,
  proposalPosition: line.proposalPosition,
  description: line.description,
  planId: line.planId,
  seats: line.seats,
  amountMinor: line.amountMinor,
  financeComment: line.financeComment,
  adjustmentReason: line.adjustmentReason,
  lineType: line.lineType,
  zbb: versionLineZbbJson.encode(line.zbb),
  priorityRank: line.priorityRank,
});
