import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ChecklistJudgeService } from '../checklist/checklist-judge.service';
import { ChecklistRecordService } from '../checklist/checklist-record.service';
import type {
  ChecklistBody,
  ChecklistDecision,
  ChecklistSubject,
  ChecklistVerdict,
  DecisionStepCode,
} from './policy-checklist.types';

/**
 * What the modules that decide call to ask the checklist of the policy in force (`QĐ-111ap`): `judge` before the decision is written (it throws
 * the errors of `policy-checklist.errors.ts`), `record` after, in the same transaction.
 */
@Injectable()
export class PolicyChecklistApi {
  constructor(
    private readonly judging: ChecklistJudgeService,
    private readonly recording: ChecklistRecordService,
  ) {}

  /** The answers against the version in force at the step, and what they allow of the decision; the reason is the typed one or the one filled in from the answers No. */
  judge(
    tx: DbTx,
    input: {
      organizationId: string;
      stepCode: DecisionStepCode;
      checklist: ChecklistBody;
      decision: ChecklistDecision;
      reason?: string | null;
    },
  ): Promise<{ verdict: ChecklistVerdict; reason: string | null; autoReason: string | null }> {
    return this.judging.judge(tx, input);
  }

  /** Keeps the verdict once for each subject (each request of a batch, each person of a group). */
  record(
    tx: DbTx,
    input: {
      organizationId: string;
      verdict: ChecklistVerdict;
      decision: ChecklistDecision;
      decidedByEmployeeId: string;
      decidedAt: Date;
      subjects: readonly ChecklistSubject[];
    },
  ): Promise<void> {
    return this.recording.record(tx, input);
  }
}
