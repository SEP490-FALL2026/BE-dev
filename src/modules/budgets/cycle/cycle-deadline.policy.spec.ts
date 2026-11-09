import { deadlineDuties } from './cycle-deadline.policy';

const cycle = { submissionDeadline: '2026-12-01', decisionDeadline: '2026-12-15', publishedOnce: true };

describe('deadlineDuties', () => {
  it('asks for the setup of the Cost Centers until the submission deadline is over, the day of it included', () => {
    expect(deadlineDuties({ ...cycle, today: '2026-11-30' })).toEqual({
      submissionPassed: false,
      decisionPassed: false,
      costCenterSetup: true,
    });
    expect(deadlineDuties({ ...cycle, today: '2026-12-01' })).toMatchObject({
      submissionPassed: false,
      costCenterSetup: true,
    });
  });

  it('is late the day after the submission deadline, and the decision is late the day after its own', () => {
    expect(deadlineDuties({ ...cycle, today: '2026-12-02' })).toEqual({
      submissionPassed: true,
      decisionPassed: false,
      costCenterSetup: false,
    });
    expect(deadlineDuties({ ...cycle, today: '2026-12-15' }).decisionPassed).toBe(false);
    expect(deadlineDuties({ ...cycle, today: '2026-12-16' }).decisionPassed).toBe(true);
  });

  it('owes nothing while the cycle was never published', () => {
    expect(deadlineDuties({ ...cycle, publishedOnce: false, today: '2026-12-20' })).toEqual({
      submissionPassed: false,
      decisionPassed: false,
      costCenterSetup: false,
    });
  });
});
