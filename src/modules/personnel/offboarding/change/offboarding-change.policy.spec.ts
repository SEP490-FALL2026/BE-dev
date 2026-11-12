import { cancelTakesBackEffects, changeFactsOf, revocationsWithdrawnOf } from './offboarding-change.policy';

describe('what moving the last working day of a handover is judged on (US-03-04 AC-14, AC-22)', () => {
  it('judges the new day against the day it is, the day the person came, the day the placement began and the day it was', () => {
    expect(
      changeFactsOf(
        { state: 'HANDING_OVER', accessBlockMode: 'WITH_LAST_DAY', lastWorkingDay: '2026-11-10' },
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
      accessBlockMode: 'WITH_LAST_DAY',
      today: '2026-11-03',
      hireDate: '2026-01-05',
      placementFrom: '2026-02-01',
      currentLastWorkingDay: '2026-11-10',
      newLastWorkingDay: '2026-11-12',
      reason: 'Bàn giao thêm',
    });
  });
});

describe('what cancelling a handover does to the tasks and the machines (MF2-C, QĐ-110c, R-41)', () => {
  it('takes its effect on tasks and machines only when the block had already taken effect (cancelTakesBackEffects)', () => {
    expect(cancelTakesBackEffects('IN_FORCE')).toBe(true);
    expect(cancelTakesBackEffects('CLEARED')).toBe(false);
    expect(cancelTakesBackEffects('NONE')).toBe(false);
  });

  it('counts what the withdrawn reasons did to the tasks and ignores the seats the departure never asked for (revocationsWithdrawnOf)', () => {
    expect(revocationsWithdrawnOf([])).toEqual({ cancelled: 0, itAdminToClose: 0, continues: 0 });
    expect(
      revocationsWithdrawnOf([
        'CANCELLED',
        'CANCELLED',
        'IT_ADMIN_TO_CLOSE',
        'CONTINUES',
        'NOT_FOUND',
        'ALREADY_ENDED',
      ]),
    ).toEqual({ cancelled: 2, itAdminToClose: 1, continues: 1 });
  });
});
