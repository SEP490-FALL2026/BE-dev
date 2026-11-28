import { pendingHumanReturn, pendingSpendReturn } from './request-reply.policy';
import type { HumanReturn, ReturnStepFact } from './request-reply.types';

function makeReturnStep(
  kind: HumanReturn['kind'],
  stepId: string,
  sequence: number,
  closedAt: Date,
  createdAt = new Date(closedAt.getTime() - 60_000),
): ReturnStepFact {
  if (kind === 'NEED') {
    return {
      id: stepId,
      kind: 'NEED',
      sequence,
      state: 'CLOSED',
      createdAt,
      decidedAt: closedAt,
      approvalRecord: { decision: 'RETURNED', decidedAt: closedAt },
      spendDecision: null,
    };
  }
  if (kind === 'IT_ASSESSMENT') {
    return {
      id: stepId,
      kind: 'IT_ASSESSMENT',
      sequence,
      state: 'CLOSED',
      createdAt,
      decidedAt: closedAt,
      approvalRecord: null,
      spendDecision: null,
    };
  }
  return {
    id: stepId,
    kind: 'SPEND_APPROVAL',
    sequence,
    state: 'CLOSED',
    createdAt,
    decidedAt: closedAt,
    approvalRecord: { decision: 'RETURNED', decidedAt: closedAt },
    spendDecision: null,
  };
}

function makeOpenStep(
  kind: ReturnStepFact['kind'],
  stepId: string,
  sequence: number,
  createdAt: Date,
  state = 'PENDING',
): ReturnStepFact {
  return {
    id: stepId,
    kind,
    sequence,
    state,
    createdAt,
    decidedAt: null,
    approvalRecord: null,
    spendDecision: null,
  };
}

describe('request-reply.policy', () => {
  describe('pendingHumanReturn (§7.9 step 2 & step 4)', () => {
    it.each<HumanReturn['kind']>(['NEED', 'IT_ASSESSMENT', 'SPEND'])(
      'returns the single %s human return when its stepId has not been replied',
      (kind) => {
        const closedAt = new Date('2026-06-01T10:00:00.000Z');
        const stepId = `step-${kind.toLowerCase()}`;
        const step = makeReturnStep(kind, stepId, 1, closedAt);

        expect(pendingHumanReturn({ steps: [step], repliedStepIds: new Set() })).toEqual({
          kind,
          stepId,
          closedAt,
        });
      },
    );

    it('returns null when there are no human returns', () => {
      expect(pendingHumanReturn({ steps: [], repliedStepIds: new Set() })).toBeNull();
    });

    it('returns null when the latest human return has already been replied', () => {
      const step = makeReturnStep('NEED', 'step-1', 1, new Date('2026-06-01T10:00:00.000Z'));

      expect(pendingHumanReturn({ steps: [step], repliedStepIds: new Set(['step-1']) })).toBeNull();
    });

    it('returns null without falling back to an older unreplied return when the latest return is replied', () => {
      const older = makeReturnStep('NEED', 'step-old', 1, new Date('2026-06-01T09:00:00.000Z'));
      const latest = makeReturnStep('SPEND', 'step-latest', 2, new Date('2026-06-02T09:00:00.000Z'));

      expect(
        pendingHumanReturn({
          steps: [older, latest],
          repliedStepIds: new Set(['step-latest']),
        }),
      ).toBeNull();
    });

    it('returns the latest return when an older one is replied and the latest is not', () => {
      const older = makeReturnStep('NEED', 'step-old', 1, new Date('2026-06-01T09:00:00.000Z'));
      const latestClosedAt = new Date('2026-06-02T09:00:00.000Z');
      const latest = makeReturnStep('IT_ASSESSMENT', 'step-latest', 2, latestClosedAt);

      expect(
        pendingHumanReturn({
          steps: [latest, older],
          repliedStepIds: new Set(['step-old']),
        }),
      ).toEqual({ kind: 'IT_ASSESSMENT', stepId: 'step-latest', closedAt: latestClosedAt });
    });

    it.each<HumanReturn['kind']>(['NEED', 'IT_ASSESSMENT', 'SPEND'])(
      'returns null for pre-W4 %s return when a subsequent step of the same kind was already reopened',
      (kind) => {
        const closedAt = new Date('2026-06-01T10:00:00.000Z');
        const retStep = makeReturnStep(kind, 'step-1', 1, closedAt);
        const reopenedKind: ReturnStepFact['kind'] = kind === 'SPEND' ? 'SPEND_APPROVAL' : kind;
        const reopenedStep = makeOpenStep(reopenedKind, 'step-2', 2, new Date('2026-06-01T11:00:00.000Z'));

        expect(pendingHumanReturn({ steps: [retStep, reopenedStep], repliedStepIds: new Set() })).toBeNull();
      },
    );

    it('returns null when C1 returned SPEND_APPROVAL and one-step conversion later reopened SPEND_APPROVAL (QĐ-116c)', () => {
      const returnedSpend = makeReturnStep('SPEND', 'step-spend-1', 2, new Date('2026-06-01T10:00:00.000Z'));
      const convertedSpend = {
        ...makeOpenStep('SPEND_APPROVAL', 'step-spend-2', 3, new Date('2026-06-02T08:00:00.000Z'), 'CLOSED'),
        decidedAt: new Date('2026-06-02T08:00:01.000Z'),
      };

      expect(
        pendingHumanReturn({
          steps: [returnedSpend, convertedSpend],
          repliedStepIds: new Set(),
        }),
      ).toBeNull();
    });

    it('keeps NEED return pending when a parallel GROUP_GRANT NEED step with higher sequence was created earlier', () => {
      const submittedAt = new Date('2026-06-01T08:00:00.000Z');
      const returnedAt = new Date('2026-06-01T10:00:00.000Z');
      const returnedMemberNeed = makeReturnStep('NEED', 'step-need-1', 1, returnedAt, submittedAt);
      const parallelHeadNeed = makeOpenStep('NEED', 'step-need-2', 2, submittedAt, 'APPROVED');

      expect(
        pendingHumanReturn({
          steps: [returnedMemberNeed, parallelHeadNeed],
          repliedStepIds: new Set(),
        }),
      ).toEqual({ kind: 'NEED', stepId: 'step-need-1', closedAt: returnedAt });
    });

    it('ignores COMPLETED IT_ASSESSMENT steps and filters SPEND returns via pendingSpendReturn', () => {
      const closedAt = new Date('2026-06-01T10:00:00.000Z');
      const completedAssessment = makeOpenStep('IT_ASSESSMENT', 'step-it', 1, closedAt, 'COMPLETED');
      const returnedNeed = makeReturnStep('NEED', 'step-need', 2, closedAt);

      expect(pendingHumanReturn({ steps: [completedAssessment], repliedStepIds: new Set() })).toBeNull();
      expect(pendingSpendReturn({ steps: [returnedNeed], repliedStepIds: new Set() })).toBeNull();
    });
  });
});
