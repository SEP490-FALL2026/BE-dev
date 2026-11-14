import { termBody } from './request.steps';

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
