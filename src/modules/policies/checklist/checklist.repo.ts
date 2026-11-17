import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { policyContentJson, type PolicyContent } from '../library/library.json';
import type { ChecklistDecision, ChecklistSubject, ChecklistVerdict } from '../public/policy-checklist.types';

/** The version in force of a policy: the highest published one. */
export interface VersionInForce {
  policyCode: string;
  policyVersionId: string;
  versionNumber: number;
  content: PolicyContent;
}

export interface NewDecisionChecklist {
  organizationId: string;
  verdict: ChecklistVerdict;
  subject: ChecklistSubject;
  decision: ChecklistDecision;
  decidedByEmployeeId: string;
  decidedAt: Date;
}

/** The versions in force that the questions are read from, and the rows of answers added to `decision_checklists`. */
@Injectable()
export class ChecklistRepo {
  /** The version in force of every policy of the organization. */
  async versionsInForce(tx: DbTx, organizationId: string): Promise<VersionInForce[]> {
    const rows = await tx.policyVersion.findMany({
      where: { organizationId, versionNumber: { not: null } },
      orderBy: [{ policyId: 'asc' }, { versionNumber: 'desc' }],
      distinct: ['policyId'],
      select: { id: true, versionNumber: true, content: true, policy: { select: { code: true } } },
    });

    return rows.map((row) => ({
      policyCode: row.policy.code,
      policyVersionId: row.id,
      versionNumber: row.versionNumber ?? 0,
      content: policyContentJson.decode(row.content),
    }));
  }

  /** One row for each subject, the same answers in each. */
  async insertMany(tx: DbTx, rows: readonly NewDecisionChecklist[]): Promise<void> {
    if (rows.length === 0) return;
    await tx.decisionChecklist.createMany({
      data: rows.map((row) => ({
        organizationId: row.organizationId,
        policyVersionId: row.verdict.policyVersionId,
        stepCode: row.verdict.stepCode,
        subjectKind: row.subject.kind,
        subjectId: row.subject.id,
        lineEmployeeId: row.subject.lineEmployeeId ?? null,
        decidedByEmployeeId: row.decidedByEmployeeId,
        decision: row.decision,
        answers: row.verdict.answers,
        hasNo: row.verdict.hasNo,
        decidedAt: row.decidedAt,
      })),
    });
  }
}
