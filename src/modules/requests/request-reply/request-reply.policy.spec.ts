import { pendingHumanReturn } from './request-reply.policy';
import type { HumanReturn } from './request-reply.types';

describe('request-reply.policy', () => {
  describe('pendingHumanReturn (§7.9 step 2)', () => {
    it.each<HumanReturn['kind']>(['NEED', 'IT_ASSESSMENT', 'SPEND'])(
      'returns the single %s human return when its stepId has not been replied',
      (kind) => {
        const ret: HumanReturn = {
          kind,
          stepId: `step-${kind.toLowerCase()}`,
          closedAt: new Date('2026-06-01T10:00:00.000Z'),
        };

        expect(pendingHumanReturn({ returns: [ret], repliedStepIds: new Set() })).toEqual(ret);
      },
    );

    it('returns null when there are no human returns', () => {
      expect(pendingHumanReturn({ returns: [], repliedStepIds: new Set() })).toBeNull();
    });

    it('returns null when the latest human return has already been replied', () => {
      const ret: HumanReturn = {
        kind: 'NEED',
        stepId: 'step-1',
        closedAt: new Date('2026-06-01T10:00:00.000Z'),
      };

      expect(pendingHumanReturn({ returns: [ret], repliedStepIds: new Set(['step-1']) })).toBeNull();
    });

    it('returns null without falling back to an older unreplied return when the latest return is replied', () => {
      const older: HumanReturn = {
        kind: 'NEED',
        stepId: 'step-old',
        closedAt: new Date('2026-06-01T09:00:00.000Z'),
      };
      const latest: HumanReturn = {
        kind: 'SPEND',
        stepId: 'step-latest',
        closedAt: new Date('2026-06-02T09:00:00.000Z'),
      };

      expect(
        pendingHumanReturn({
          returns: [older, latest],
          repliedStepIds: new Set(['step-latest']),
        }),
      ).toBeNull();
    });

    it('returns the latest return when an older one is replied and the latest is not', () => {
      const older: HumanReturn = {
        kind: 'NEED',
        stepId: 'step-old',
        closedAt: new Date('2026-06-01T09:00:00.000Z'),
      };
      const latest: HumanReturn = {
        kind: 'IT_ASSESSMENT',
        stepId: 'step-latest',
        closedAt: new Date('2026-06-02T09:00:00.000Z'),
      };

      expect(
        pendingHumanReturn({
          returns: [latest, older],
          repliedStepIds: new Set(['step-old']),
        }),
      ).toEqual(latest);
    });
  });
});
