import { planUsageRatesOf } from './plan-usage.policy';

describe('AF-08 QĐ-109d: what one weekly pass leaves of the use of each plan (KPI-3)', () => {
  const seats = [
    { chainRootId: 'c1', planId: 'slack' },
    { chainRootId: 'c2', planId: 'slack' },
    { chainRootId: 'c3', planId: 'slack' },
    { chainRootId: 'c4', planId: 'figma' },
  ];

  it('counts a seat active when it showed activity in the 30 days that end on the day of the pass', () => {
    const rates = planUsageRatesOf(
      seats,
      [
        { seatChainId: 'c1', status: 'ACTIVE', lastActiveDate: '2026-11-09' },
        // 29 days before the day of the pass: still within the 30 days.
        { seatChainId: 'c2', status: 'INACTIVE', lastActiveDate: '2026-10-11' },
        // 30 days before: out of the window.
        { seatChainId: 'c3', status: 'INACTIVE', lastActiveDate: '2026-10-10' },
      ],
      '2026-11-09',
    );

    expect(rates).toEqual([{ planId: 'slack', activeSeats: 2, assessedSeats: 3 }]);
  });

  it('leaves out a plan none of whose seats could be judged: no figure, never zero', () => {
    const rates = planUsageRatesOf(
      seats,
      [
        { seatChainId: 'c4', status: 'NO_DATA', lastActiveDate: null },
        { seatChainId: 'c1', status: 'UNMATCHED_IDENTITY', lastActiveDate: null },
        { seatChainId: 'c2', status: 'INACTIVE', lastActiveDate: null },
      ],
      '2026-11-09',
    );

    expect(rates).toEqual([{ planId: 'slack', activeSeats: 0, assessedSeats: 1 }]);
  });

  it('ignores the state of a chain the pass did not judge', () => {
    expect(
      planUsageRatesOf(seats, [{ seatChainId: 'gone', status: 'ACTIVE', lastActiveDate: '2026-11-09' }], '2026-11-09'),
    ).toEqual([]);
  });
});
