import { businessDateAt } from '../../../core/business-date';
import { GhostSeatRunReads } from './ghost-seat-run-reads.service';

describe('the day a head kept or exempted a seat is the day of the organization', () => {
  it('is the Vietnamese day of the instant it was closed, not the UTC day: 01:00 on the 29th is still the 28th in UTC', async () => {
    const reads = new GhostSeatRunReads(
      {
        lastKeptOrExemptedOf: jest
          .fn()
          .mockResolvedValue(
            new Map([['chain', { id: 'rec', closeReason: 'KEPT', closedAt: new Date('2026-11-28T18:00:00.000Z') }]]),
          ),
      } as never,
      { businessToday: jest.fn((now: Date) => Promise.resolve(businessDateAt(now, 'Asia/Ho_Chi_Minh'))) } as never,
    );

    expect((await reads.lastKeptOrExemptedOf(['chain'])).get('chain')).toEqual({
      id: 'rec',
      closeReason: 'KEPT',
      closedOn: '2026-11-29',
    });
  });
});
