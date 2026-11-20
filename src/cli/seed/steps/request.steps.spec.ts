import { grantChecklistBody } from './request-actions';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import type { DemoRunContext } from '../demo-run.types';
import { requestTextOf, termBody } from './request.steps';

/** QĐ-111i (RQ-2): a request names the time of use in months; there is no end date to send (a body with `expectedEndDate` is a 422). */
describe('the time of use a scenario request sends', () => {
  it('sends the months it asks for, and nothing for a right with no end or a plan bought once', () => {
    expect(termBody(3)).toEqual({ termMonths: 3 });
    expect(termBody(null)).toEqual({});
  });

  it('never sends an end date', () => {
    expect(termBody(1)).not.toHaveProperty('expectedEndDate');
    expect(termBody(null)).not.toHaveProperty('expectedEndDate');
  });
});

/**
 * QĐ-111az (K1-GR): the grant of a K1 seat is completed with the two steps of its checklist, in their order, as well as the evidence; the grant of any
 * other kind takes none (a checklist sent for it is a 422).
 */
describe('the checklist a scenario sends to complete the grant of a K1 seat', () => {
  const NOW = Date.UTC(2026, 10, 15, 8, 0, 0);

  it('ticks both steps, the company email first, each with an instant that is not after now and not before the one before', () => {
    const { k1Checklist } = grantChecklistBody('K1', NOW);

    expect(k1Checklist?.items.map((item) => [item.code, item.done])).toEqual([
      ['COMPANY_EMAIL_REGISTERED', true],
      ['NO_PERSONAL_DEVICE_MFA', true],
    ]);
    const instants = (k1Checklist?.items ?? []).map((item) => Date.parse(item.doneAt));
    expect(instants.every((instant) => instant <= NOW)).toBe(true);
    expect(instants[1]).toBeGreaterThanOrEqual(instants[0]);
  });

  it('carries no evidence of its own: the evidence goes beside it, as the grant of every other kind sends it', () => {
    expect(grantChecklistBody('K1', NOW).k1Checklist).not.toHaveProperty('evidence');
  });

  it.each([['K2'], ['K3'], ['K4'], ['K5'], [null]])('sends nothing for %s', (type) => {
    expect(grantChecklistBody(type, NOW)).toEqual({});
  });
});

/** The reason of a scenario is a business reason a person would write; the note for the developer (`summary`) never reaches the API. */
describe('the text a scenario request sends as its reason', () => {
  const ctx = { fixture: SHARED_DEMO_V4 } as unknown as DemoRunContext;
  const scenarios = SHARED_DEMO_V4.requests;

  it('is the tag and the reason, and carries nothing of the summary', () => {
    for (const scenario of scenarios) {
      const text = requestTextOf(ctx, scenario);
      expect(text).toBe(`[SV-${scenario.key}] ${scenario.reason}`);
      expect(text).not.toContain(scenario.summary);
    }
  });

  it('gives every scenario a reason that fits the limit and speaks of no budget, batch, decision or scenario code', () => {
    for (const { reason } of scenarios) {
      expect(reason.trim().length).toBeGreaterThan(20);
      expect(reason.length).toBeLessThanOrEqual(240);
      expect(reason).not.toMatch(/dự phòng|ngân sách|trình lô|trưởng phòng|QĐ-|DEMO-|\bR\d{2}\b/i);
    }
  });

  it('keeps the two noisy reasons for requests waiting for the spending approver', () => {
    const noisy = scenarios.filter(({ reason }) => reason.includes('drive.saoviet.vn'));
    expect(noisy.map(({ key }) => key).sort()).toEqual(['R31', 'R54']);
    expect(noisy.every(({ target }) => target === 'AWAITING_SPEND_DECISION')).toBe(true);
  });
});
