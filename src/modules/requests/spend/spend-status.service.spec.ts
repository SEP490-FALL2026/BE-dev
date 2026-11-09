import { SpendStatusService } from './spend-status.service';
import type { AccessRequestRecord } from '../access-request/access-request.types';
describe('BR-MF1-02: a revision uses current missing-data reasons', () => {
  const checks = {
    latest: jest.fn().mockResolvedValue({ blockReasons: ['OVER_RESERVE'], overByMinor: 99n, currency: 'VND' }),
  };
  const service = new SpendStatusService(checks as never, {} as never, {} as never);
  const base = { id: 'request', state: 'AWAITING_REQUESTER_REVISION', policy: { chain: ['SPEND_APPROVAL'] } };
  it.each(['PRICE_MISSING', 'RATE_MISSING'])('does not show stale overBy with %s', async (reason) => {
    checks.latest.mockClear();
    const result = await service.of({ ...base, oneStepBlockedReason: reason } as unknown as AccessRequestRecord);
    expect(result).toEqual({
      stage: 'RETURNED_TO_REQUESTER',
      blockedReasons: [reason],
      overBy: null,
      refusalReason: null,
    });
    expect(checks.latest).not.toHaveBeenCalled();
  });
  it('shows the latest real check when the result is a budget block', async () => {
    expect(await service.of(base as unknown as AccessRequestRecord)).toMatchObject({
      blockedReasons: ['OVER_RESERVE'],
      overBy: { minor: 99n, currency: 'VND' },
    });
  });
});
