import { createHash } from 'node:crypto';
import type { AiSourceStep } from '../../requests/public/requests.types';
import {
  QUEUE_MAX_REQUESTS,
  QUEUE_TEXT_LIMITS,
  type QueueContext,
  type StepKind,
} from '../ai-service/ai-service.types';

/** What a reference of the context stands for: kept by the backend, never sent. */
export interface ContextLine {
  sourceRef: string;
  stepId: string;
  requestId: string;
  stepKind: StepKind;
  /** The reference of the cost of a spend step that has one (`C001`), else null. */
  costRef: string | null;
  /** The amount the backend writes in place of `{{cost:<costRef>}}`. */
  cost: { amount: string; currency: string } | null;
}

export interface ComposedContext {
  context: QueueContext;
  lines: ContextLine[];
  /** The steps that wait past the first 20: only counted. */
  omittedCount: number;
}

const reference = (letter: 'R' | 'C', index: number) => `${letter}${String(index).padStart(3, '0')}`;

/** Trimmed and cut to `limit` characters (code points), as the AI service counts them. */
const cut = (text: string, limit: number) => [...text.trim()].slice(0, limit).join('');

/**
 * The context of a summary (design 4.1): the first 20 steps that wait for the person, each under an opaque reference in order, with
 * only the allow-listed fields cut to the limits of the contract. No id, date, deadline, holder, budget or amount is sent: a spend
 * step that has a cost is given a reference to it (`C001`), and the backend writes the amount itself when it shows the line.
 */
export function composeQueueContext(steps: readonly AiSourceStep[], total: number, generatedAt: Date): ComposedContext {
  const summarised = steps.slice(0, QUEUE_MAX_REQUESTS);
  let costs = 0;
  const lines = summarised.map((step, index): ContextLine => {
    const priced = step.stepKind === 'SPEND_APPROVAL' && step.estimatedCost !== null;

    return {
      sourceRef: reference('R', index + 1),
      stepId: step.stepId,
      requestId: step.requestId,
      stepKind: step.stepKind,
      costRef: priced ? reference('C', ++costs) : null,
      cost: priced ? step.estimatedCost : null,
    };
  });
  const requests = summarised.map((step, index) => ({
    sourceRef: lines[index].sourceRef,
    stepKind: step.stepKind,
    softwareName: cut(step.softwareName, QUEUE_TEXT_LIMITS.softwareName),
    beneficiaryDisplayName: cut(step.beneficiaryDisplayName, QUEUE_TEXT_LIMITS.beneficiaryDisplayName),
    reason: cut(step.reason, QUEUE_TEXT_LIMITS.reason),
    requestedDurationLabel:
      step.termMonths === null ? null : cut(`${step.termMonths} tháng`, QUEUE_TEXT_LIMITS.requestedDurationLabel),
    estimatedCostRef: lines[index].costRef,
  }));

  return {
    context: { generatedAt: generatedAt.toISOString(), requests },
    lines,
    omittedCount: Math.max(total - summarised.length, 0),
  };
}

/**
 * The revision of the queue of a person: SHA-256 in hex of the ordered (step, kind, time it was given) of the first 20 steps
 * and of how many wait in all, so a step decided, added or given again — among the first 20 or past them — changes it. A step has no
 * revision of its own.
 */
export function queueRevisionOf(steps: readonly AiSourceStep[], total: number): string {
  const ordered = steps
    .slice(0, QUEUE_MAX_REQUESTS)
    .map((step) => [step.stepId, step.stepKind, step.assignedAt.toISOString()]);

  return createHash('sha256')
    .update(JSON.stringify({ total, steps: ordered }))
    .digest('hex');
}
