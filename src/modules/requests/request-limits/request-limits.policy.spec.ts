import {
  judgeNewRequestLimits,
  manyPaidSoftwareReasonOf,
  weekWindowOf,
  type LimitFacts,
} from './request-limits.policy';

const HCM = 'Asia/Ho_Chi_Minh';

const facts = (over: Partial<LimitFacts> = {}): LimitFacts => ({
  planId: 'plan-figma-pro',
  applicationId: 'app-figma',
  openNew: [],
  sentThisWeek: 0,
  weeklyLimit: 10,
  resetsOn: '2026-11-16',
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

    it('a proposal names no plan: an open proposal never matches it', () => {
      const verdict = judgeNewRequestLimits(facts({ planId: null, openNew: [{ requestId: 'r-1', planId: null }] }));

      expect(verdict.refusal).toBeNull();
    });
  });

  describe('QĐ-111h GH-2: requests for new access sent in the calendar week', () => {
    it('refuses the eleventh when ten were sent this week, and says when the count starts again', () => {
      const verdict = judgeNewRequestLimits(facts({ sentThisWeek: 10 }));

      expect(verdict).toMatchObject({ refusal: 'OPEN_LIMIT_REACHED', sentThisWeek: 10, resetsOn: '2026-11-16' });
    });

    it('lets the tenth through when nine were sent', () => {
      const verdict = judgeNewRequestLimits(facts({ sentThisWeek: 9 }));

      expect(verdict).toMatchObject({ refusal: null, sentThisWeek: 9 });
    });

    it('follows the parameter the Super Admin set (twelve)', () => {
      expect(judgeNewRequestLimits(facts({ sentThisWeek: 10, weeklyLimit: 12 })).refusal).toBeNull();
      expect(judgeNewRequestLimits(facts({ sentThisWeek: 12, weeklyLimit: 12 })).refusal).toBe('OPEN_LIMIT_REACHED');
    });

    it('a request does not count by being open: only what was sent this week does (ten open ones of older weeks do not refuse)', () => {
      const open = Array.from({ length: 10 }, (_, index) => ({ requestId: `r-${index}`, planId: `plan-${index}` }));

      expect(judgeNewRequestLimits(facts({ openNew: open, sentThisWeek: 0 })).refusal).toBeNull();
    });

    it('GH-1 is told before GH-2 when both apply', () => {
      const open = [{ requestId: 'r-2', planId: 'plan-figma-pro' }];

      expect(judgeNewRequestLimits(facts({ openNew: open, sentThisWeek: 10 }))).toMatchObject({
        refusal: 'HAS_OPEN_REQUEST',
        openRequestId: 'r-2',
      });
    });
  });

  describe('QĐ-108c: a request after a role ended (ROLE_ENDED)', () => {
    it('skips GH-1 and GH-2 but not GH-3', () => {
      const open = ['r-1', 'r-2', 'r-3'].map((requestId) => ({ requestId, planId: 'plan-figma-pro' }));

      const verdict = judgeNewRequestLimits(
        facts({
          openNew: open,
          sentThisWeek: 10,
          exemption: 'ROLE_ENDED',
          applicationId: 'app-miro',
          paidApplicationIds: apps(10),
        }),
      );

      expect(verdict).toMatchObject({ refusal: null, sentThisWeek: 0, manyPaidSoftware: { count: 10, threshold: 10 } });
    });
  });

  describe('QĐ-110q: a request in the grace of a transfer (TRANSFER_GRACE) is left out of the count, not of the duplicate', () => {
    const grace = (over: Partial<LimitFacts> = {}) => facts({ exemption: 'TRANSFER_GRACE', ...over });

    it('skips GH-2: a person at the most requests of the week may ask again for what they hold', () => {
      const verdict = judgeNewRequestLimits(grace({ sentThisWeek: 10 }));

      expect(verdict).toMatchObject({ refusal: null, sentThisWeek: 0 });
    });

    it('still refuses a second open request of the same plan, an exempt one included (QĐ-110q frees the count, not the duplicate)', () => {
      const verdict = judgeNewRequestLimits(
        grace({
          openNew: [],
          openIncludingExempt: [{ requestId: 'r-exempt', planId: 'plan-figma-pro' }],
        }),
      );

      expect(verdict).toMatchObject({ refusal: 'HAS_OPEN_REQUEST', openRequestId: 'r-exempt' });
    });

    it('refuses the open request of the same plan the person sent before the transfer', () => {
      const open = [{ requestId: 'r-before', planId: 'plan-figma-pro' }];

      expect(judgeNewRequestLimits(grace({ openNew: open, openIncludingExempt: open }))).toMatchObject({
        refusal: 'HAS_OPEN_REQUEST',
        openRequestId: 'r-before',
      });
    });

    it('lets through when the only open requests are of other plans, exempt ones included', () => {
      const verdict = judgeNewRequestLimits(
        grace({ openIncludingExempt: [{ requestId: 'r-1', planId: 'plan-figma-org' }] }),
      );

      expect(verdict.refusal).toBeNull();
    });

    it('keeps GH-3: many paid applications still ask a reason', () => {
      const verdict = judgeNewRequestLimits(grace({ applicationId: 'app-miro', paidApplicationIds: apps(10) }));

      expect(verdict).toMatchObject({ refusal: null, manyPaidSoftware: { count: 10, threshold: 10 } });
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
      const verdict = judgeNewRequestLimits(
        facts({ sentThisWeek: 10, applicationId: 'app-miro', paidApplicationIds: apps(12) }),
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

describe('weekWindowOf (QĐ-111h, T-RQ1: the calendar week of the organization, not of UTC)', () => {
  it('Sunday 15/11/2026 23:30 in Ho Chi Minh is in the week of Monday 09/11, which ends before Monday 16/11 00:00', () => {
    const window = weekWindowOf(new Date('2026-11-15T16:30:00.000Z'), HCM);

    expect(window).toEqual({
      from: new Date('2026-11-08T17:00:00.000Z'),
      to: new Date('2026-11-15T17:00:00.000Z'),
      resetsOn: '2026-11-16',
    });
  });

  it('Monday 16/11/2026 00:30 in Ho Chi Minh (Sunday 17:30 UTC) is already in the week of 16/11, not in the week that ended half an hour before', () => {
    const window = weekWindowOf(new Date('2026-11-15T17:30:00.000Z'), HCM);

    expect(window).toEqual({
      from: new Date('2026-11-15T17:00:00.000Z'),
      to: new Date('2026-11-22T17:00:00.000Z'),
      resetsOn: '2026-11-23',
    });
  });

  it('the first instant of the week belongs to it, the last millisecond of the week before does not', () => {
    const first = new Date('2026-11-15T17:00:00.000Z');
    const last = new Date('2026-11-15T16:59:59.999Z');

    expect(weekWindowOf(first, HCM).from).toEqual(first);
    expect(weekWindowOf(last, HCM).to).toEqual(first);
  });

  it('the same instant is in another week in another zone: the zone of the organization decides, never UTC', () => {
    const instant = new Date('2026-11-15T17:30:00.000Z');

    expect(weekWindowOf(instant, 'UTC').resetsOn).toBe('2026-11-16');
    expect(weekWindowOf(instant, HCM).resetsOn).toBe('2026-11-23');
  });
});
