import { medianSeconds, timingsOf, type TimingFacts, type TimingStep } from './request-timing.policy';

const at = (day: number, hour = 9) => new Date(Date.UTC(2026, 9, day, hour, 0, 0));
const step = (kind: TimingStep['kind'], state: string, createdAt: Date, decidedAt: Date | null): TimingStep => ({
  kind,
  state,
  createdAt,
  decidedAt,
});

/** The request of the example of the story: sent 09:00 on 1 October, need on the 2nd, sent on as spend on the 5th, decided 10:00 on the 6th. */
function paid(overrides: Partial<TimingFacts> = {}): TimingFacts {
  return {
    requestState: 'COMPLETED',
    submittedAt: at(1),
    grantCompletedAt: at(7, 10),
    steps: [step('NEED', 'APPROVED', at(1), at(2)), step('SPEND_APPROVAL', 'APPROVED', at(5), at(6, 10))],
    queueSentAt: at(5),
    ...overrides,
  };
}

describe('the time a request took (US-05-15 AC-1, AC-6, AC-11)', () => {
  it('measures the example of the story: 435 600 seconds to approve, 86 400 to grant, 522 000 in all', () => {
    const timings = timingsOf(paid());

    expect(timings).toMatchObject({
      approvedAt: at(6, 10),
      grantCompletedAt: at(7, 10),
      approvalSeconds: 435_600,
      grantSeconds: 86_400,
      totalSeconds: 522_000,
      countedInKpi: true,
    });
  });

  it('gives a total that is the sum of the two parts when each part falls on half a second', () => {
    const half = (ms: number) => new Date(at(1).getTime() + ms);
    const timings = timingsOf(
      paid({
        steps: [step('NEED', 'APPROVED', at(1), half(1_400))],
        grantCompletedAt: half(2_800),
        queueSentAt: null,
      }),
    );

    expect(timings.approvalSeconds).toBe(1);
    expect(timings.grantSeconds).toBe(1);
    expect(timings.totalSeconds).toBe(2);
  });

  it('shows the wait in the queue of the head as three days, and each step and the grant as a segment', () => {
    const { segments } = timingsOf(paid());

    expect(segments.map((segment) => segment.kind)).toEqual(['NEED', 'QUEUE_WAIT', 'SPEND_DECISION', 'GRANT']);
    expect(segments.find((segment) => segment.kind === 'QUEUE_WAIT')).toMatchObject({
      startedAt: at(2),
      endedAt: at(5),
      seconds: 3 * 86_400,
    });
    expect(segments.find((segment) => segment.kind === 'NEED')?.seconds).toBe(86_400);
    expect(segments.find((segment) => segment.kind === 'SPEND_DECISION')?.seconds).toBe(86_400 + 3600);
    expect(segments.find((segment) => segment.kind === 'GRANT')).toMatchObject({
      startedAt: at(6, 10),
      endedAt: at(7, 10),
    });
  });

  it('has no time of Finance after the approval, and at most one segment of each of the six kinds', () => {
    const { segments } = timingsOf(
      paid({
        steps: [
          step('NEED', 'APPROVED', at(1), at(2)),
          step('IT_ASSESSMENT', 'COMPLETED', at(2), at(3)),
          step('FINANCE_REVIEW', 'COMPLETED', at(5), at(5, 12)),
          step('FINANCE_REVIEW', 'COMPLETED', at(5, 13), at(5, 15)),
          step('SPEND_APPROVAL', 'APPROVED', at(5, 16), at(6, 10)),
        ],
      }),
    );

    expect(segments.map((segment) => segment.kind)).toEqual([
      'NEED',
      'IT_ASSESSMENT',
      'QUEUE_WAIT',
      'FINANCE_REVIEW',
      'SPEND_DECISION',
      'GRANT',
    ]);
    expect(segments.filter((segment) => segment.kind === 'FINANCE_REVIEW')).toHaveLength(1);
    expect(segments.find((segment) => segment.kind === 'FINANCE_REVIEW')?.startedAt).toEqual(at(5, 13));
  });

  it('takes the assessment of the IT Admin into the approval of new software', () => {
    const timings = timingsOf(
      paid({
        steps: [
          step('NEED', 'APPROVED', at(1), at(2)),
          step('IT_ASSESSMENT', 'COMPLETED', at(2), at(4)),
          step('SPEND_APPROVAL', 'APPROVED', at(5), at(6)),
        ],
      }),
    );

    expect(timings.approvedAt).toEqual(at(6));
    expect(timings.segments.find((segment) => segment.kind === 'IT_ASSESSMENT')).toMatchObject({
      startedAt: at(2),
      endedAt: at(4),
    });
  });

  it('counts a request in the indicator only when the task of the grant was completed', () => {
    for (const [requestState, grantCompletedAt] of [
      ['EXECUTING', null],
      ['AWAITING_EXECUTION', null],
      ['FAILED', null],
    ] as const) {
      const timings = timingsOf(paid({ requestState, grantCompletedAt }));

      expect(timings).toMatchObject({ countedInKpi: false, grantSeconds: null, totalSeconds: null });
      expect(timings.approvalSeconds).toBe(435_600);
      expect(timings.segments.find((segment) => segment.kind === 'GRANT')).toMatchObject({
        endedAt: null,
        seconds: null,
      });
    }
  });

  it('has no approval time while a decision is still to be made or when the request ended without one', () => {
    for (const requestState of [
      'PENDING',
      'AWAITING_SPEND_SUBMISSION',
      'AWAITING_SPEND_DECISION',
      'REJECTED',
      'IT_REJECTED',
      'WITHDRAWN',
    ]) {
      const timings = timingsOf({
        requestState,
        submittedAt: at(1),
        grantCompletedAt: null,
        steps: [step('NEED', 'APPROVED', at(1), at(2))],
        queueSentAt: null,
      });

      expect(timings).toMatchObject({ approvedAt: null, approvalSeconds: null, countedInKpi: false });
      expect(timings.segments.some((segment) => segment.kind === 'GRANT')).toBe(false);
    }
  });

  it('shows a wait that is still open in the queue of the head, from the decision of the need', () => {
    const { segments } = timingsOf({
      requestState: 'AWAITING_SPEND_SUBMISSION',
      submittedAt: at(1),
      grantCompletedAt: null,
      steps: [step('NEED', 'APPROVED', at(1), at(2))],
      queueSentAt: null,
    });

    expect(segments.find((segment) => segment.kind === 'QUEUE_WAIT')).toEqual({
      kind: 'QUEUE_WAIT',
      startedAt: at(2),
      endedAt: null,
      seconds: null,
    });
  });

  it('shows only the latest wait when Finance gave the request back and the head sent it on again', () => {
    const { segments } = timingsOf(
      paid({
        steps: [
          step('NEED', 'APPROVED', at(1), at(2)),
          step('FINANCE_REVIEW', 'COMPLETED', at(5), at(7)),
          step('SPEND_APPROVAL', 'APPROVED', at(9), at(10)),
        ],
        queueSentAt: at(8),
        grantCompletedAt: at(11),
      }),
    );

    expect(segments.find((segment) => segment.kind === 'QUEUE_WAIT')).toMatchObject({
      startedAt: at(7),
      endedAt: at(8),
      seconds: 86_400,
    });
  });

  it('makes no wait in the queue for a request that never had a spend step', () => {
    const { segments } = timingsOf({
      requestState: 'COMPLETED',
      submittedAt: at(1),
      grantCompletedAt: at(4),
      steps: [step('NEED', 'APPROVED', at(1), at(2))],
      queueSentAt: null,
    });

    expect(segments.map((segment) => segment.kind)).toEqual(['NEED', 'GRANT']);
  });

  it('counts a renewal as approved but never in the indicator: it has no grant', () => {
    const timings = timingsOf({
      requestState: 'COMPLETED',
      submittedAt: at(1),
      grantCompletedAt: null,
      steps: [step('NEED', 'APPROVED', at(1), at(2))],
      queueSentAt: null,
    });

    expect(timings).toMatchObject({ approvedAt: at(2), countedInKpi: false, totalSeconds: null });
  });
});

describe('the median of the time to grant (for the report of the indicator)', () => {
  const counted = (totalSeconds: number) => ({ totalSeconds, countedInKpi: true });

  it('is the middle value of an odd number of requests and the mean of the two in the middle of an even number', () => {
    expect(medianSeconds([counted(300), counted(100), counted(200)])).toBe(200);
    expect(medianSeconds([counted(100), counted(400), counted(200), counted(300)])).toBe(250);
  });

  it('leaves out the requests that are not counted, and is empty when none is', () => {
    expect(
      medianSeconds([
        counted(100),
        { totalSeconds: null, countedInKpi: false },
        { totalSeconds: 9_999, countedInKpi: false },
        counted(300),
      ]),
    ).toBe(200);
    expect(medianSeconds([])).toBeNull();
    expect(medianSeconds([{ totalSeconds: null, countedInKpi: false }])).toBeNull();
  });
});
