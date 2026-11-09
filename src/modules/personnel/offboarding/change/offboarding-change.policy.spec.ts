import { changeFactsOf } from './offboarding-change.policy';

describe('what moving the last working day of a handover is judged on (US-03-04 AC-14, AC-22)', () => {
  it('judges the new day against the day it is, the day the person came, the day the placement began and the day it was', () => {
    expect(
      changeFactsOf(
        { state: 'HANDING_OVER', lastWorkingDay: '2026-11-10' },
        {
          today: '2026-11-03',
          hireDate: '2026-01-05',
          placementFrom: '2026-02-01',
          newLastWorkingDay: '2026-11-12',
          reason: 'Bàn giao thêm',
        },
      ),
    ).toEqual({
      state: 'HANDING_OVER',
      today: '2026-11-03',
      hireDate: '2026-01-05',
      placementFrom: '2026-02-01',
      currentLastWorkingDay: '2026-11-10',
      newLastWorkingDay: '2026-11-12',
      reason: 'Bàn giao thêm',
    });
  });
});
