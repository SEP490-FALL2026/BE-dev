import type { HumanReturn, ReturnFacts, ReturnStepFact } from './request-reply.types';

interface IndexedHumanReturn extends HumanReturn {
  stepKind: ReturnStepFact['kind'];
  sequence: number;
}

function spendReturnAt(step: ReturnStepFact): Date | null {
  if (step.approvalRecord?.decision === 'RETURNED') return step.decidedAt ?? step.approvalRecord.decidedAt;
  if (step.spendDecision?.decision === 'RETURNED') return step.decidedAt ?? step.spendDecision.decidedAt;
  return null;
}

function toHumanReturn(step: ReturnStepFact): IndexedHumanReturn | null {
  if (step.state !== 'CLOSED') return null;
  if (step.kind === 'NEED' && step.approvalRecord?.decision === 'RETURNED') {
    return {
      kind: 'NEED',
      stepId: step.id,
      closedAt: step.decidedAt ?? step.approvalRecord.decidedAt,
      stepKind: 'NEED',
      sequence: step.sequence,
    };
  }
  if (step.kind !== 'SPEND_APPROVAL') return null;
  const closedAt = spendReturnAt(step);
  return closedAt
    ? { kind: 'SPEND', stepId: step.id, closedAt, stepKind: 'SPEND_APPROVAL', sequence: step.sequence }
    : null;
}

function extractHumanReturns(steps: readonly ReturnStepFact[]): IndexedHumanReturn[] {
  const returns: IndexedHumanReturn[] = [];
  let lastAssessment: ReturnStepFact | undefined;

  for (const step of steps) {
    if (step.kind === 'IT_ASSESSMENT') lastAssessment = step;
    const mapped = toHumanReturn(step);
    if (mapped) returns.push(mapped);
  }

  // Only a CLOSED IT_ASSESSMENT step sent the proposal back; COMPLETED does not require a reply note.
  if (lastAssessment?.state === 'CLOSED' && lastAssessment.decidedAt !== null) {
    returns.push({
      kind: 'IT_ASSESSMENT',
      stepId: lastAssessment.id,
      closedAt: lastAssessment.decidedAt,
      stepKind: 'IT_ASSESSMENT',
      sequence: lastAssessment.sequence,
    });
  }
  return returns;
}

function pickLatestReturn(returns: readonly IndexedHumanReturn[]): IndexedHumanReturn | null {
  let latest: IndexedHumanReturn | null = null;
  for (const candidate of returns) {
    if (
      latest === null ||
      candidate.closedAt.getTime() > latest.closedAt.getTime() ||
      (candidate.closedAt.getTime() === latest.closedAt.getTime() && candidate.sequence > latest.sequence)
    ) {
      latest = candidate;
    }
  }
  return latest;
}

function hasSubsequentReopenedStep(steps: readonly ReturnStepFact[], latest: IndexedHumanReturn): boolean {
  const closedMs = latest.closedAt.getTime();
  return steps.some(
    (step) => step.kind === latest.stepKind && step.sequence > latest.sequence && step.createdAt.getTime() >= closedMs,
  );
}

/**
 * Single shared definition of the latest human return awaiting a reply (SPEC §7.9 steps 2 and 4).
 * Returns null if the latest return already has a reply or has a subsequent reopened step of the same kind,
 * rather than falling back to an older unreplied return.
 */
export function pendingHumanReturn(facts: ReturnFacts): HumanReturn | null {
  const latest = pickLatestReturn(extractHumanReturns(facts.steps));
  if (latest === null) return null;
  if (facts.repliedStepIds.has(latest.stepId) || hasSubsequentReopenedStep(facts.steps, latest)) return null;
  return { kind: latest.kind, stepId: latest.stepId, closedAt: latest.closedAt };
}

export function pendingSpendReturn(facts: ReturnFacts): HumanReturn | null {
  const pending = pendingHumanReturn(facts);
  return pending?.kind === 'SPEND' ? pending : null;
}

/** Latest SPEND_APPROVAL human return timestamp regardless of reply/reopen state, for QĐ-117k(2) check comparison. */
export function latestSpendReturnAt(facts: ReturnFacts): Date | null {
  let latest: Date | null = null;
  for (const step of facts.steps) {
    if (step.kind !== 'SPEND_APPROVAL' || step.state !== 'CLOSED') continue;
    const closedAt = spendReturnAt(step);
    if (closedAt && (latest === null || closedAt.getTime() > latest.getTime())) latest = closedAt;
  }
  return latest;
}
