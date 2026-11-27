import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { SeatLedgerService } from './ledger/seat-ledger.service';
import { SeatChangeQueryService } from './seat-change-query.service';
import { SubscriptionLineNotFoundError } from './subscription-line.errors';

describe('SeatChangeQueryService (W3-15)', () => {
  it('throws 404 SUBSCRIPTION_LINE.NOT_FOUND when line does not exist and maps beneficiary/purchase/recorder', async () => {
    const missing = new SeatChangeQueryService(
      { listPagedByLine: jest.fn().mockResolvedValue(null) } as unknown as SeatLedgerService,
      {} as OrganizationReadApi,
    );
    await expect(missing.listByLine('line-missing', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(
      SubscriptionLineNotFoundError,
    );

    const service = new SeatChangeQueryService(
      {
        listPagedByLine: jest.fn().mockResolvedValue({
          total: 1,
          items: [
            {
              id: 'chg-1',
              effectiveOn: '2026-11-20',
              delta: 2,
              reason: 'TOP_UP',
              source: 'VENDOR_RECORD',
              basis: 'NONE',
              requestId: 'req-1',
              beneficiaryEmployeeId: 'emp-1',
              seatPurchase: { id: 'pur-1', code: 'MUA-000001' },
              note: 'added two seats',
              outOfProcess: false,
              autoRecorded: false,
              recordedByEmployeeId: 'emp-khoa',
              recordedAt: new Date('2026-11-20T05:00:00.000Z'),
            },
          ],
        }),
      } as unknown as SeatLedgerService,
      {
        getEmployees: jest.fn().mockResolvedValue([
          { id: 'emp-1', employeeCode: 'NV001', fullName: 'Nguyen Van A' },
          { id: 'emp-khoa', employeeCode: 'KHOA', fullName: 'Khoa Tran' },
        ]),
      } as unknown as OrganizationReadApi,
    );

    const page = await service.listByLine('line-1', { page: 1, pageSize: 20 });
    expect(page.pagination.totalItems).toBe(1);
    expect(page.items).toEqual([
      {
        id: 'chg-1',
        effectiveOn: '2026-11-20',
        delta: 2,
        reason: 'TOP_UP',
        source: 'VENDOR_RECORD',
        basis: 'NONE',
        request: { id: 'req-1', code: null },
        beneficiary: { employeeId: 'emp-1', employeeCode: 'NV001', fullName: 'Nguyen Van A' },
        seatPurchase: { id: 'pur-1', code: 'MUA-000001' },
        note: 'added two seats',
        outOfProcess: false,
        autoRecorded: false,
        recordedBy: { employeeId: 'emp-khoa', fullName: 'Khoa Tran' },
        recordedAt: '2026-11-20T05:00:00.000Z',
      },
    ]);
  });
});
