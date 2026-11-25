import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { CommitmentMonthFacadeService } from '../commitment/commitment-month-facade.service';
import { SeatMonthSweeper } from './seat-month.job';
import type { SeatMonthService } from './seat-month.service';

describe('SeatMonthSweeper (W3-07 settlement pass)', () => {
  it('charges ended months then runs commitment-month settlement for ready months and prior December', async () => {
    const readyMonths: string[] = ['2027-01-01'];
    const chargeEndedMonths = jest
      .fn<Promise<{ subscriptions: number; rows: number; failed: number }>, [string, Date]>()
      .mockResolvedValue({
        subscriptions: 1,
        rows: 2,
        failed: 0,
      });
    const seatMonths = {
      chargeEndedMonths,
      isMonthSettlingReady: jest.fn((_org: string, month: string) =>
        Promise.resolve(readyMonths.includes(month) || month === '2026-12-01'),
      ),
    };
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue('2027-02-01'),
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
    };
    const runPass = jest
      .fn<
        Promise<{ settledSlices: number; settledCommitments: number; sweptCommitments: number; releasedMinor: bigint }>,
        [Record<string, unknown>]
      >()
      .mockResolvedValue({ settledSlices: 1, settledCommitments: 1, sweptCommitments: 0, releasedMinor: 50_000n });
    const settlements = { runPass };

    const sweeper = new SeatMonthSweeper(
      seatMonths as unknown as SeatMonthService,
      organizationReads as unknown as OrganizationReadApi,
      settlements as unknown as CommitmentMonthFacadeService,
    );

    await (sweeper as unknown as { pass: () => Promise<void> }).pass();

    expect(chargeEndedMonths).toHaveBeenCalledTimes(1);
    expect(chargeEndedMonths.mock.calls[0][0]).toBe('2027-02-01');
    expect(chargeEndedMonths.mock.calls[0][1]).toBeInstanceOf(Date);
    expect(runPass).toHaveBeenCalledTimes(1);
    expect(runPass.mock.calls[0][0]).toMatchObject({
      organizationId: 'org-1',
      today: '2027-02-01',
      readyMonths: ['2027-01-01'],
      priorDecemberReady: true,
    });
    expect(runPass.mock.calls[0][0].now).toBeInstanceOf(Date);
  });
});
