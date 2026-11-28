import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { RequestReplyRepo } from '../request-reply/request-reply.repo';
import type { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import type { SlaQueueAgeService } from '../sla/sla-queue-age.service';
import type { BudgetCheckRepo } from '../spend/budget-check.repo';
import type { SpendRequestRepo } from '../spend/spend-request.repo';
import type { SpendWireViewService } from '../spend/spend-wire-view.service';
import type { SpendHeadService } from './spend-head.service';
import type { SpendQueueOutcomeService } from './spend-queue-outcome.service';
import { SpendQueueService } from './spend-queue.service';
import { SpendReplyFactsService } from './spend-reply-facts.service';

const DEP = '00000000-0000-4000-8000-0000000000d1';
const HEAD = '00000000-0000-4000-8000-0000000000f1';
const REQ_1 = '00000000-0000-4000-8000-000000000001';
const REQ_2 = '00000000-0000-4000-8000-000000000002';
const TICKET_1 = '00000000-0000-4000-8000-000000000101';

const actor: AuthenticatedPrincipal = {
  subject: HEAD,
  appUserId: HEAD,
  sessionId: 's',
  employeeId: HEAD,
  directRoles: ['MANAGER'],
  roles: ['MANAGER'],
};

describe('SpendQueueService.page (§7.4 ticketRef & §7.10 replyNoteRequired)', () => {
  it('loads ticketRef via refsOf and replyNoteRequired via spendReturnsAwaitingReply in one batch each', async () => {
    const rows = [
      {
        id: REQ_1,
        planId: null,
        requesterEmployeeId: HEAD,
        amountMinor: 1_500_000n,
        amountCurrency: 'VND',
        expectedSpendOn: null,
        budgetYear: 2026,
        offPlan: true,
        planLineVersionId: null,
        pricingStatus: 'PRICED',
        type: 'GRANT',
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        spendQueuedAt: new Date('2026-06-01T00:00:00.000Z'),
        proposal: { softwareName: 'Miro' },
        beneficiaries: [{ employeeId: HEAD }],
        _count: { beneficiaries: 1 },
      },
      {
        id: REQ_2,
        planId: null,
        requesterEmployeeId: HEAD,
        amountMinor: 2_000_000n,
        amountCurrency: 'VND',
        expectedSpendOn: null,
        budgetYear: 2026,
        offPlan: true,
        planLineVersionId: null,
        pricingStatus: 'PRICED',
        type: 'GRANT',
        updatedAt: new Date('2026-06-01T01:00:00.000Z'),
        spendQueuedAt: new Date('2026-06-01T01:00:00.000Z'),
        proposal: { softwareName: 'Notion' },
        beneficiaries: [{ employeeId: HEAD }],
        _count: { beneficiaries: 1 },
      },
    ];

    const refsOf = jest.fn().mockResolvedValue(new Map([[REQ_1, { id: TICKET_1, position: 2, itemCount: 3 }]]));
    const closedAt = new Date('2026-06-01T00:00:00.000Z');
    const returnFactsOf = jest.fn().mockResolvedValue(
      new Map([
        [
          REQ_1,
          {
            steps: [
              {
                id: 'step-spend-1',
                kind: 'SPEND_APPROVAL',
                sequence: 2,
                state: 'CLOSED',
                createdAt: new Date(closedAt.getTime() - 60_000),
                decidedAt: closedAt,
                approvalRecord: { decision: 'RETURNED', decidedAt: closedAt },
                spendDecision: null,
              },
            ],
            repliedStepIds: new Set<string>(),
          },
        ],
      ]),
    );
    const replyFacts = new SpendReplyFactsService(
      { refsOf } as unknown as RequestTicketRepo,
      { returnFactsOf } as unknown as RequestReplyRepo,
    );
    const checkRanAt = new Date('2026-05-31T23:00:00.000Z');
    const latestChecks = new Map([
      [
        REQ_1,
        {
          outcome: 'USES_RESERVE',
          route: 'SPEND_APPROVAL',
          blockReasons: [],
          staleCostEvidence: false,
          overBaseByMinor: 500_000n,
          overByMinor: null,
          currency: 'VND',
          ranAt: checkRanAt,
        },
      ],
      [
        REQ_2,
        {
          outcome: 'USES_RESERVE',
          route: 'SPEND_APPROVAL',
          blockReasons: [],
          staleCostEvidence: false,
          overBaseByMinor: 500_000n,
          overByMinor: null,
          currency: 'VND',
          ranAt: checkRanAt,
        },
      ],
    ]);

    const service = new SpendQueueService(
      { departmentOf: jest.fn().mockResolvedValue(DEP) } as unknown as SpendHeadService,
      { queuePage: jest.fn().mockResolvedValue({ rows, total: 2 }) } as unknown as SpendRequestRepo,
      { latestOf: jest.fn().mockResolvedValue(latestChecks) } as unknown as BudgetCheckRepo,
      { expectedFor: jest.fn().mockResolvedValue(new Map()) } as unknown as SpendQueueOutcomeService,
      { getPlanSummaries: jest.fn().mockResolvedValue([]) } as unknown as CatalogApi,
      {
        people: jest
          .fn()
          .mockResolvedValue(new Map([[HEAD, { employeeId: HEAD, employeeCode: 'E-1', fullName: 'Head' }]])),
        units: jest.fn().mockResolvedValue(new Map([['VND', 0]])),
      } as unknown as SpendWireViewService,
      { ageOf: jest.fn().mockResolvedValue(new Map()) } as unknown as SlaQueueAgeService,
      replyFacts,
    );

    const result = await service.page(actor, { page: 1, pageSize: 20 });

    expect(refsOf).toHaveBeenCalledTimes(1);
    expect(refsOf).toHaveBeenCalledWith([REQ_1, REQ_2]);
    expect(returnFactsOf).toHaveBeenCalledTimes(1);
    expect(returnFactsOf).toHaveBeenCalledWith([REQ_1, REQ_2]);
    expect(result.items[0]).toMatchObject({
      requestId: REQ_1,
      stage: 'NOT_SUBMITTED',
      ticketRef: { id: TICKET_1, position: 2, itemCount: 3 },
      replyNoteRequired: true,
    });
    expect(result.items[1]).toMatchObject({
      requestId: REQ_2,
      stage: 'RESERVE_CONFIRMATION',
      ticketRef: null,
      replyNoteRequired: false,
    });
  });
});
