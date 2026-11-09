import { judgeNewRequestLimits, manyPaidSoftwareReasonOf, type LimitFacts } from './request-limits.policy';

const facts = (over: Partial<LimitFacts> = {}): LimitFacts => ({
  planId: 'plan-figma-pro',
  applicationId: 'app-figma',
  openNew: [],
  openLimit: 3,
  paidApplicationIds: new Set<string>(),
  paidThreshold: 10,
  exemption: null,
  ...over,
});

const apps = (count: number, ...extra: string[]): Set<string> =>
  new Set([...Array.from({ length: count }, (_, index) => `app-${index}`), ...extra]);

describe('judgeNewRequestLimits (BR-MF1-01)', () => {
  describe('BR-MF1-01e GH-1: a request of the same plan open', () => {
    it('refuses with the open request of the same plan', () => {
      const verdict = judgeNewRequestLimits(facts({ openNew: [{ requestId: 'r-1', planId: 'plan-figma-pro' }] }));

      expect(verdict).toMatchObject({ refusal: 'HAS_OPEN_REQUEST', openRequestId: 'r-1' });
    });

    it('lets a request of another plan of the same application through (judged by plan, not application)', () => {
      const verdict = judgeNewRequestLimits(
        facts({ planId: 'plan-figma-org', openNew: [{ requestId: 'r-1', planId: 'plan-figma-pro' }] }),
      );

      expect(verdict.refusal).toBeNull();
    });

    it('a proposal names no plan: an open proposal never matches it, it only counts', () => {
      const verdict = judgeNewRequestLimits(facts({ planId: null, openNew: [{ requestId: 'r-1', planId: null }] }));

      expect(verdict).toMatchObject({ refusal: null, openCount: 1 });
    });
  });

  describe('BR-MF1-01f GH-2: requests for new access open', () => {
    it('refuses the fourth when three are open, listing them oldest first', () => {
      const open = ['r-1', 'r-2', 'r-3'].map((requestId, index) => ({ requestId, planId: `plan-${index}` }));

      const verdict = judgeNewRequestLimits(facts({ openNew: open }));

      expect(verdict).toMatchObject({
        refusal: 'OPEN_LIMIT_REACHED',
        openRequestIds: ['r-1', 'r-2', 'r-3'],
        openCount: 3,
      });
    });

    it('lets the third through when two are open', () => {
      const open = ['r-1', 'r-2'].map((requestId, index) => ({ requestId, planId: `plan-${index}` }));

      expect(judgeNewRequestLimits(facts({ openNew: open })).refusal).toBeNull();
    });

    it('follows the parameter the Super Admin set (four)', () => {
      const open = ['r-1', 'r-2', 'r-3'].map((requestId, index) => ({ requestId, planId: `plan-${index}` }));

      expect(judgeNewRequestLimits(facts({ openNew: open, openLimit: 4 })).refusal).toBeNull();
    });

    it('GH-1 is told before GH-2 when both apply', () => {
      const open = ['r-1', 'r-2', 'r-3'].map((requestId, index) => ({
        requestId,
        planId: index === 1 ? 'plan-figma-pro' : `plan-${index}`,
      }));

      expect(judgeNewRequestLimits(facts({ openNew: open }))).toMatchObject({
        refusal: 'HAS_OPEN_REQUEST',
        openRequestId: 'r-2',
      });
    });
  });

  describe('QĐ-108c / QĐ-103t: an exempt request (ROLE_ENDED, TRANSFER_OVERLAP)', () => {
    it.each(['ROLE_ENDED', 'TRANSFER_OVERLAP'] as const)('%s skips GH-1 and GH-2 but not GH-3', (exemption) => {
      const open = ['r-1', 'r-2', 'r-3'].map((requestId) => ({ requestId, planId: 'plan-figma-pro' }));

      const verdict = judgeNewRequestLimits(
        facts({ openNew: open, exemption, applicationId: 'app-miro', paidApplicationIds: apps(10) }),
      );

      expect(verdict).toMatchObject({ refusal: null, openCount: 0, manyPaidSoftware: { count: 10, threshold: 10 } });
    });
  });

  describe('BR-MF1-01g GH-3: many paid applications in use', () => {
    it('flags a person who uses ten paid applications asking for another one', () => {
      const verdict = judgeNewRequestLimits(facts({ applicationId: 'app-miro', paidApplicationIds: apps(10) }));

      expect(verdict).toMatchObject({
        refusal: null,
        manyPaidSoftware: { count: 10, threshold: 10 },
        paidSoftwareCount: 10,
      });
    });

    it('does not flag nine (the count is of applications: two plans of one application are one, K5 is not read)', () => {
      const verdict = judgeNewRequestLimits(facts({ applicationId: 'app-miro', paidApplicationIds: apps(9) }));

      expect(verdict.manyPaidSoftware).toBeNull();
      expect(verdict.paidSoftwareCount).toBe(9);
    });

    it('M-16: does not flag another plan of an application the person already uses at ten', () => {
      const verdict = judgeNewRequestLimits(
        facts({ applicationId: 'app-figma', paidApplicationIds: apps(9, 'app-figma') }),
      );

      expect(verdict.manyPaidSoftware).toBeNull();
    });

    it('flags a proposal of new software (no application known yet)', () => {
      const verdict = judgeNewRequestLimits(facts({ planId: null, applicationId: null, paidApplicationIds: apps(10) }));

      expect(verdict.manyPaidSoftware).toEqual({ count: 10, threshold: 10 });
    });

    it('is told together with a refusal: GH-3 never refuses by itself', () => {
      const open = ['r-1', 'r-2', 'r-3'].map((requestId, index) => ({ requestId, planId: `plan-${index}` }));

      const verdict = judgeNewRequestLimits(
        facts({ openNew: open, applicationId: 'app-miro', paidApplicationIds: apps(12) }),
      );

      expect(verdict).toMatchObject({ refusal: 'OPEN_LIMIT_REACHED', manyPaidSoftware: { count: 12 } });
    });
  });
});

describe('manyPaidSoftwareReasonOf (BR-MF1-01g GH-3)', () => {
  const flagged = { manyPaidSoftware: { count: 10, threshold: 10 } };

  it('keeps the reason of a flagged request, trimmed', () => {
    expect(manyPaidSoftwareReasonOf(flagged, '  needed for the client  ')).toEqual({
      flagged: true,
      reason: 'needed for the client',
      missing: false,
    });
  });

  it.each([undefined, null, '', '   '])('a flagged request with the reason %p misses it', (reason) => {
    expect(manyPaidSoftwareReasonOf(flagged, reason)).toEqual({ flagged: true, reason: null, missing: true });
  });

  it('drops a reason sent for a request that is not flagged', () => {
    expect(manyPaidSoftwareReasonOf({ manyPaidSoftware: null }, 'why not')).toEqual({
      flagged: false,
      reason: null,
      missing: false,
    });
  });
});
