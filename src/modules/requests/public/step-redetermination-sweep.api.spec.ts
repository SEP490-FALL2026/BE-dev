import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { OneStepConversionService } from '../reassignment/one-step-conversion.service';
import type { StepReassignmentService } from '../reassignment/step-reassignment.service';
import { StepRedeterminationSweepApi } from './step-redetermination-sweep.api';

describe('StepRedeterminationSweepApi.dailyPass', () => {
  it('reconciles combined held-need and queued-spend requests in order returned by dailyPassRequestIds', async () => {
    const reconciledOrder: string[] = [];
    const reassignment = {
      waitingRequestIds: jest.fn().mockResolvedValue([]),
      requestIdsHeldByLeavers: jest.fn().mockResolvedValue([]),
      dailyPassRequestIds: jest.fn().mockResolvedValue(['req-pos-1', 'req-standalone', 'req-pos-2']),
      reconcileInOwnTransaction: jest.fn((id: string) => {
        reconciledOrder.push(id);
        return Promise.resolve({ moved: 0, waiting: 0, converted: 0 });
      }),
    };

    const api = new StepRedeterminationSweepApi(
      { pendingIds: jest.fn().mockResolvedValue([]) } as unknown as OneStepConversionService,
      reassignment as unknown as StepReassignmentService,
      { businessToday: jest.fn().mockResolvedValue('2026-06-01') } as unknown as OrganizationReadApi,
    );

    const result = await api.sweep(new Date('2026-06-01T08:00:00.000Z'));

    expect(reassignment.dailyPassRequestIds).toHaveBeenCalledWith(200);
    expect(reconciledOrder).toEqual(['req-pos-1', 'req-standalone', 'req-pos-2']);
    expect(result.dailyPassRequests).toBe(3);
    expect(result.failedRequests).toBe(0);
  });
});
