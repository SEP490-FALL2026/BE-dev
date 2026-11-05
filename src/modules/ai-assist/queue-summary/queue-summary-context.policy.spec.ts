import type { AiSourceStep } from '../../requests/public/requests.types';
import { queueContextSchema } from '../ai-service/ai-service.types';
import { composeQueueContext, queueRevisionOf } from './queue-summary-context.policy';

const GENERATED_AT = new Date('2026-11-04T09:00:00.000Z');

function step(index: number, overrides: Partial<AiSourceStep> = {}): AiSourceStep {
  const id = String(index).padStart(12, '0');

  return {
    stepId: `00000000-0000-4000-8000-${id}`,
    requestId: `10000000-0000-4000-8000-${id}`,
    stepKind: 'NEED_APPROVAL',
    assignedAt: new Date(Date.UTC(2026, 10, 1, 8, index)),
    softwareName: 'Figma',
    beneficiaryDisplayName: 'Nguyễn An',
    reason: 'Cần cho dự án thiết kế',
    termMonths: 3,
    estimatedCost: null,
    ...overrides,
  };
}

const SPEND = (index: number, amount: string | null) =>
  step(index, {
    stepKind: 'SPEND_APPROVAL',
    estimatedCost: amount === null ? null : { amount, currency: 'VND' },
  });

describe('composeQueueContext', () => {
  it('gives each step an opaque reference in order and sends only the allow-listed fields', () => {
    const composed = composeQueueContext([step(1), SPEND(2, '1200000'), step(3)], 3, GENERATED_AT);

    expect(composed.context).toEqual({
      generatedAt: '2026-11-04T09:00:00.000Z',
      requests: [
        {
          sourceRef: 'R001',
          stepKind: 'NEED_APPROVAL',
          softwareName: 'Figma',
          beneficiaryDisplayName: 'Nguyễn An',
          reason: 'Cần cho dự án thiết kế',
          requestedDurationLabel: '3 tháng',
          estimatedCostRef: null,
        },
        expect.objectContaining({ sourceRef: 'R002', stepKind: 'SPEND_APPROVAL', estimatedCostRef: 'C001' }),
        expect.objectContaining({ sourceRef: 'R003', stepKind: 'NEED_APPROVAL', estimatedCostRef: null }),
      ],
    });
    expect(composed.omittedCount).toBe(0);
    // No real id, date of assignment or amount reaches the AI service.
    const sent = JSON.stringify(composed.context);
    expect(sent).not.toContain('00000000-0000-4000-8000');
    expect(sent).not.toContain('10000000-0000-4000-8000');
    expect(sent).not.toContain('1200000');
    expect(sent).not.toContain('2026-11-01');
    expect(queueContextSchema.safeParse(composed.context).success).toBe(true);
  });

  it('keeps, for the backend only, which step, request and cost each reference stands for', () => {
    const composed = composeQueueContext([SPEND(1, '1200000'), step(2)], 2, GENERATED_AT);

    expect(composed.lines).toEqual([
      {
        sourceRef: 'R001',
        stepId: step(1).stepId,
        requestId: step(1).requestId,
        stepKind: 'SPEND_APPROVAL',
        costRef: 'C001',
        cost: { amount: '1200000', currency: 'VND' },
      },
      {
        sourceRef: 'R002',
        stepId: step(2).stepId,
        requestId: step(2).requestId,
        stepKind: 'NEED_APPROVAL',
        costRef: null,
        cost: null,
      },
    ]);
  });

  it('numbers the costs apart from the steps and gives one only to a spend step that has a cost', () => {
    const composed = composeQueueContext(
      [SPEND(1, null), step(2, { estimatedCost: { amount: '5', currency: 'USD' } }), SPEND(3, '10.00'), SPEND(4, '7')],
      4,
      GENERATED_AT,
    );

    expect(composed.context.requests.map((request) => request.estimatedCostRef)).toEqual([null, null, 'C001', 'C002']);
    expect(composed.lines.map((line) => line.cost)).toEqual([
      null,
      null,
      { amount: '10.00', currency: 'VND' },
      { amount: '7', currency: 'VND' },
    ]);
  });

  it('sends at most 20 steps and counts the rest as omitted', () => {
    const steps = Array.from({ length: 23 }, (_value, index) => step(index + 1));

    const composed = composeQueueContext(steps, 31, GENERATED_AT);

    expect(composed.context.requests).toHaveLength(20);
    expect(composed.context.requests[19].sourceRef).toBe('R020');
    expect(composed.omittedCount).toBe(11);
  });

  it('trims the reason and cuts every text to the limits of the contract, by character', () => {
    const composed = composeQueueContext(
      [
        step(1, {
          softwareName: 'S'.repeat(130),
          beneficiaryDisplayName: `${'😀'.repeat(119)}xy`,
          reason: `   ${'😀'.repeat(600)}${'x'.repeat(600)}   `,
          termMonths: 10 ** 61,
        }),
      ],
      1,
      GENERATED_AT,
    );
    const [request] = composed.context.requests;

    expect([...request.softwareName]).toHaveLength(120);
    expect(request.beneficiaryDisplayName).toBe(`${'😀'.repeat(119)}x`);
    expect([...request.reason]).toHaveLength(1000);
    expect(request.reason.startsWith('😀')).toBe(true);
    expect([...(request.requestedDurationLabel ?? '')].length).toBeLessThanOrEqual(60);
    expect(queueContextSchema.safeParse(composed.context).success).toBe(true);
  });

  it('writes the term in months, or nothing when the request has none', () => {
    const composed = composeQueueContext([step(1, { termMonths: 12 }), step(2, { termMonths: null })], 2, GENERATED_AT);

    expect(composed.context.requests.map((request) => request.requestedDurationLabel)).toEqual(['12 tháng', null]);
  });

  it('passes the label of a request for a group as it is', () => {
    const composed = composeQueueContext([step(1, { beneficiaryDisplayName: 'Nhóm 5 người' })], 1, GENERATED_AT);

    expect(composed.context.requests[0].beneficiaryDisplayName).toBe('Nhóm 5 người');
  });
});

describe('queueRevisionOf', () => {
  const steps = [step(1), SPEND(2, '100'), step(3)];

  it('is a SHA-256 in hex, the same for the same steps and total', () => {
    const revision = queueRevisionOf(steps, 3);

    expect(revision).toMatch(/^[0-9a-f]{64}$/);
    expect(queueRevisionOf([...steps], 3)).toBe(revision);
    // The fields a summary reads but does not order by do not move it.
    expect(queueRevisionOf([step(1, { reason: 'other' }), SPEND(2, '999'), step(3)], 3)).toBe(revision);
  });

  it.each([
    ['a step added', [...steps, step(4)], 4],
    ['a step removed', steps.slice(0, 2), 2],
    ['the order changed', [steps[1], steps[0], steps[2]], 3],
    [
      'a step given again later',
      [step(1, { assignedAt: new Date('2026-11-03T00:00:00.000Z') }), steps[1], steps[2]],
      3,
    ],
    ['another kind of step', [step(1, { stepKind: 'SPEND_APPROVAL' }), steps[1], steps[2]], 3],
    ['a step past the first 20 added (the total)', steps, 4],
  ])('changes with %s', (_label, changed, total) => {
    expect(queueRevisionOf(changed, total)).not.toBe(queueRevisionOf(steps, 3));
  });

  it('reads only the first 20 steps, and the total for the rest', () => {
    const many = Array.from({ length: 21 }, (_value, index) => step(index + 1));

    expect(queueRevisionOf(many, 25)).toBe(queueRevisionOf(many.slice(0, 20), 25));
  });
});
