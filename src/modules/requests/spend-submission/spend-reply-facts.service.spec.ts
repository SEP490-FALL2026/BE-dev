import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { RequestReplyRepo } from '../request-reply/request-reply.repo';
import type { ReturnFacts, ReturnStepFact } from '../request-reply/request-reply.types';
import type { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import { SpendReplyFactsService } from './spend-reply-facts.service';

const TS = new Date('2026-06-01T09:00:00.000Z');

function spendReturnFacts(stepId: string, replied: string[] = []): ReturnFacts {
  const step: ReturnStepFact = {
    id: stepId,
    kind: 'SPEND_APPROVAL',
    sequence: 2,
    state: 'CLOSED',
    createdAt: new Date(TS.getTime() - 60_000),
    decidedAt: TS,
    approvalRecord: { decision: 'RETURNED', decidedAt: TS },
    spendDecision: null,
  };
  return { steps: [step], repliedStepIds: new Set(replied) };
}

describe('SpendReplyFactsService', () => {
  it('loads pendingSpendReturnsOf for a whole batch in a single returnFactsOf call regardless of batch size', async () => {
    const refsOf = jest.fn().mockResolvedValue(new Map());
    const returnFactsOf = jest.fn().mockResolvedValue(
      new Map<string, ReturnFacts>([
        ['req-1', spendReturnFacts('step-1')],
        ['req-2', spendReturnFacts('step-2', ['step-2'])],
        ['req-3', { steps: [], repliedStepIds: new Set() }],
      ]),
    );
    const tx = {} as unknown as DbTx;
    const service = new SpendReplyFactsService(
      { refsOf } as unknown as RequestTicketRepo,
      { returnFactsOf } as unknown as RequestReplyRepo,
    );

    const pending = await service.pendingSpendReturnsOf(['req-1', 'req-2', 'req-3'], tx);

    expect(returnFactsOf).toHaveBeenCalledTimes(1);
    expect(returnFactsOf).toHaveBeenCalledWith(['req-1', 'req-2', 'req-3'], tx);
    expect([...pending.entries()]).toEqual([['req-1', { kind: 'SPEND', stepId: 'step-1', closedAt: TS }]]);
  });

  it('returns awaiting request ids from spendReturnsAwaitingReply and delegates refsOf', async () => {
    const refMap = new Map([['req-1', { id: 'ticket-1', position: 1, itemCount: 2 }]]);
    const refsOf = jest.fn().mockResolvedValue(refMap);
    const returnFactsOf = jest.fn().mockResolvedValue(new Map([['req-1', spendReturnFacts('step-1')]]));
    const service = new SpendReplyFactsService(
      { refsOf } as unknown as RequestTicketRepo,
      { returnFactsOf } as unknown as RequestReplyRepo,
    );

    await expect(service.refsOf(['req-1'])).resolves.toBe(refMap);
    await expect(service.spendReturnsAwaitingReply(['req-1'])).resolves.toEqual(new Set(['req-1']));
  });
});
