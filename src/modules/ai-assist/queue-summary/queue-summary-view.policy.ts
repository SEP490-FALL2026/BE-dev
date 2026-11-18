import type { InvocationRecord } from '../invocation/invocation.types';
import { SUMMARY_ERROR_CODES, type QueueSummaryItem, type QueueSummaryView } from './queue-summary.types';

/** The queue of the person now: which steps of the summary still wait for them, and the revision of the queue (null: unreadable). */
export interface SourceNow {
  held: ReadonlySet<string>;
  currentRevision: string | null;
}

/**
 * The summary as its owner reads it. A completed summary is read against the queue now: a line shows only while its step still
 * waits for the person (AC-12), the steps still theirs that it leaves out are counted, and it says when the queue changed since it was
 * composed. When no line is left it reads as NO_VALID_OUTPUT; the record itself is never changed. Any other state shows its code and
 * nothing of the answer.
 */
export function summaryView(record: InvocationRecord, now: SourceNow | null): QueueSummaryView {
  const base: QueueSummaryView = {
    invocationId: record.id,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    sourceStale: false,
    simulated: record.providerMode === 'SIMULATED',
    omittedCount: 0,
    items: [],
    errorCode: record.errorCode,
  };
  if (record.status !== 'COMPLETED' || record.result === null || now === null) return base;
  const { result } = record;
  const accepted = new Map(result.accepted.map((line) => [line.sourceRef, line.summary]));
  const held = result.steps.filter((step) => now.held.has(step.stepId));
  const items = held.flatMap((step): QueueSummaryItem[] => {
    const summary = accepted.get(step.sourceRef);

    return summary === undefined
      ? []
      : [{ requestId: step.requestId, stepId: step.stepId, stepKind: step.stepKind, summary }];
  });
  if (items.length === 0) return { ...base, status: 'NO_VALID_OUTPUT', errorCode: SUMMARY_ERROR_CODES.NO_VALID_OUTPUT };

  return {
    ...base,
    items,
    sourceStale: now.currentRevision !== record.sourceRevision,
    omittedCount: result.total - result.steps.length + (held.length - items.length),
  };
}
