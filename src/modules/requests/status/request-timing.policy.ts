export type TimingStepKind = 'NEED' | 'IT_ASSESSMENT' | 'FINANCE_REVIEW' | 'SPEND_APPROVAL';

export interface TimingStep {
  kind: TimingStepKind;
  state: string;
  createdAt: Date;
  decidedAt: Date | null;
}

/** What the time of a request is measured from: the moments the steps, the batch and the grant already keep. Nothing is stored for it. */
export interface TimingFacts {
  requestState: string;
  submittedAt: Date;
  /** When the task of the grant was completed; null for a request whose grant is not done, and for a renewal. */
  grantCompletedAt: Date | null;
  /** Every step of the request, oldest first. */
  steps: readonly TimingStep[];
  /** When the head last sent the request on as spend (the batch that held it and did not stop it); null when never. */
  queueSentAt: Date | null;
}

export type SegmentKind = 'NEED' | 'IT_ASSESSMENT' | 'QUEUE_WAIT' | 'FINANCE_REVIEW' | 'SPEND_DECISION' | 'GRANT';

export interface TimingSegment {
  kind: SegmentKind;
  startedAt: Date;
  /** Null while the segment is still open. */
  endedAt: Date | null;
  seconds: number | null;
}

export interface RequestTimings {
  submittedAt: Date;
  /** When the last of the approvals was given; null while a decision is still to be made or when the request ended without one. */
  approvedAt: Date | null;
  grantCompletedAt: Date | null;
  /** From sending to the last approval, the wait of the head to send it on included (`US-05-15` AC-11). */
  approvalSeconds: number | null;
  /** From the last approval to the completion of the task of the grant. */
  grantSeconds: number | null;
  totalSeconds: number | null;
  /** Only a request whose grant task was completed is counted in `KPI-2` (`US-05-15` AC-6). */
  countedInKpi: boolean;
  segments: TimingSegment[];
}

/** The states a request is in once every approval has been given. */
const APPROVED_STATES: ReadonlySet<string> = new Set([
  'AWAITING_EXECUTION',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'AWAITING_IT_CLOSE',
]);

/** The kinds of step that end a stretch of waiting in the queue of the head: what the request waited for before it could be sent on. */
const QUEUE_MARKER_KINDS: ReadonlySet<TimingStepKind> = new Set([
  'NEED',
  'IT_ASSESSMENT',
  'FINANCE_REVIEW',
  'SPEND_APPROVAL',
]);

const seconds = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / 1000);

function segment(kind: SegmentKind, startedAt: Date, endedAt: Date | null): TimingSegment {
  return { kind, startedAt, endedAt, seconds: endedAt === null ? null : seconds(startedAt, endedAt) };
}

/** The step of the kind that was made last: a request that went back to Finance or the approver has more than one. */
function latest(steps: readonly TimingStep[], kind: TimingStepKind): TimingStep | null {
  return steps.filter((step) => step.kind === kind).at(-1) ?? null;
}

/** The last approval: the latest decision of a step that approved, or of the assessment that was completed. */
function approvedAtOf(facts: TimingFacts): Date | null {
  if (!APPROVED_STATES.has(facts.requestState)) return null;
  const decided = facts.steps
    .filter(
      (step) =>
        step.decidedAt !== null &&
        (step.state === 'APPROVED' || (step.kind === 'IT_ASSESSMENT' && step.state === 'COMPLETED')),
    )
    .map((step) => step.decidedAt as Date);

  return decided.length === 0 ? null : new Date(Math.max(...decided.map((moment) => moment.getTime())));
}

/**
 * The wait in the queue of the head: from the moment the request was ready to be sent on (the last step that handed it back to
 * them: the need decision, the assessment, a return from Finance) to the moment they sent it. Open while it still waits there. A
 * request that was never sent has the open wait only while it is in the queue.
 */
function queueWait(facts: TimingFacts): TimingSegment | null {
  const markers = facts.steps
    .filter((step) => QUEUE_MARKER_KINDS.has(step.kind) && step.decidedAt !== null && step.state !== 'REJECTED')
    .map((step) => step.decidedAt as Date);
  const inQueue = facts.requestState === 'AWAITING_SPEND_SUBMISSION';
  const sent = facts.queueSentAt;
  const before = sent === null ? markers : markers.filter((moment) => moment.getTime() <= sent.getTime());
  const after = sent === null ? [] : markers.filter((moment) => moment.getTime() > sent.getTime());
  const latestOf = (moments: readonly Date[]): Date | null =>
    moments.length === 0 ? null : new Date(Math.max(...moments.map((moment) => moment.getTime())));

  if (inQueue) {
    const waitingSince = latestOf(after) ?? latestOf(before);

    return waitingSince === null ? null : segment('QUEUE_WAIT', waitingSince, null);
  }
  const readyAt = latestOf(before);

  return sent === null || readyAt === null ? null : segment('QUEUE_WAIT', readyAt, sent);
}

/**
 * The time a request took (`US-05-15` AC-1, AC-6, AC-11, `FR-3.9`): where it waited for each step, the time to approve it and the
 * time to grant it. The time of Finance after the approval is not here: it is not part of the request. Only a request whose grant
 * task was completed is counted for the indicator, so a retrying, waiting or failed grant never is.
 */
export function timingsOf(facts: TimingFacts): RequestTimings {
  const approvedAt = approvedAtOf(facts);
  const completedAt = facts.grantCompletedAt;
  const segments: TimingSegment[] = [];
  for (const [kind, stepKind] of [
    ['NEED', 'NEED'],
    ['IT_ASSESSMENT', 'IT_ASSESSMENT'],
  ] as const) {
    const step = latest(facts.steps, stepKind);
    if (step) segments.push(segment(kind, step.createdAt, step.decidedAt));
  }
  const queue = queueWait(facts);
  if (queue) segments.push(queue);
  for (const [kind, stepKind] of [
    ['FINANCE_REVIEW', 'FINANCE_REVIEW'],
    ['SPEND_DECISION', 'SPEND_APPROVAL'],
  ] as const) {
    const step = latest(facts.steps, stepKind);
    if (step) segments.push(segment(kind, step.createdAt, step.decidedAt));
  }
  if (approvedAt) segments.push(segment('GRANT', approvedAt, completedAt));

  const approvalSeconds = approvedAt ? seconds(facts.submittedAt, approvedAt) : null;
  const grantSeconds = approvedAt && completedAt ? seconds(approvedAt, completedAt) : null;

  return {
    submittedAt: facts.submittedAt,
    approvedAt,
    grantCompletedAt: completedAt,
    approvalSeconds,
    grantSeconds,
    // The two parts are each rounded to a second, so the total is their sum: a reader who adds them gets the total, never one second off.
    totalSeconds:
      completedAt === null
        ? null
        : approvalSeconds !== null && grantSeconds !== null
          ? approvalSeconds + grantSeconds
          : seconds(facts.submittedAt, completedAt),
    countedInKpi: completedAt !== null,
    segments,
  };
}

/** The median of the total times of the requests counted for the indicator; the mean of the two in the middle for an even count. */
export function medianSeconds(
  timings: readonly Pick<RequestTimings, 'totalSeconds' | 'countedInKpi'>[],
): number | null {
  const totals = timings
    .filter((timing) => timing.countedInKpi && timing.totalSeconds !== null)
    .map((timing) => timing.totalSeconds as number)
    .sort((a, b) => a - b);
  if (totals.length === 0) return null;
  const middle = Math.floor(totals.length / 2);

  return totals.length % 2 === 1 ? totals[middle] : (totals[middle - 1] + totals[middle]) / 2;
}
