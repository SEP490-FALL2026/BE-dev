import { grantChecklistBody, termBody } from './request.steps';

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
