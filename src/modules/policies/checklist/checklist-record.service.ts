import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ChecklistDecision, ChecklistSubject, ChecklistVerdict } from '../public/policy-checklist.types';
import { ChecklistRepo } from './checklist.repo';

/** Keeps the answers of a decision: one row for each thing decided (each request of a batch, each person of a group), the same answers in each. */
@Injectable()
export class ChecklistRecordService {
  constructor(private readonly repo: ChecklistRepo) {}

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
    return this.repo.insertMany(
      tx,
      input.subjects.map((subject) => ({
        organizationId: input.organizationId,
        verdict: input.verdict,
        subject,
        decision: subject.decision ?? input.decision,
        decidedByEmployeeId: input.decidedByEmployeeId,
        decidedAt: input.decidedAt,
      })),
    );
  }
}
