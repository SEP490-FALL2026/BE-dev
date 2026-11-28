import { HttpStatus } from '@nestjs/common';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { RequestReplyRepo } from '../request-reply/request-reply.repo';
import type { HumanReturn, ReturnFacts, ReturnStepFact } from '../request-reply/request-reply.types';
import type { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import type { ReserveConfirmationService } from '../reserve-confirmation/reserve-confirmation.service';
import type { SpendBatchRepo } from '../spend/spend-batch.repo';
import type { RoutingOutcome, SpendRoutingService } from '../spend/spend-routing.service';
import { SpendReplyNoteNotInBatchError } from '../spend/spend.errors';
import { toSpendApiException } from '../spend/spend.http-errors';
import type { SpendBatchRecorder } from './spend-batch-recorder.service';
import { SpendBatchWriterService } from './spend-batch-writer.service';
import { SpendBatchService } from './spend-batch.service';
import type { SpendHeadService } from './spend-head.service';
import { SpendTicketReplyService } from './spend-ticket-reply.service';

const ORG = '00000000-0000-4000-8000-000000000001';
const DEP = '00000000-0000-4000-8000-0000000000d1';
const HEAD = '00000000-0000-4000-8000-0000000000f1';
const APPROVER_A = '00000000-0000-4000-8000-0000000000a1';
const APPROVER_B = '00000000-0000-4000-8000-0000000000a2';
const TICKET_1 = '00000000-0000-4000-8000-000000000101';
const REQ_1 = '00000000-0000-4000-8000-000000000001';
const REQ_3 = '00000000-0000-4000-8000-000000000003';
const REQ_4 = '00000000-0000-4000-8000-000000000004';
const STEP_RETURNED = '00000000-0000-4000-8000-000000000501';

const actor: AuthenticatedPrincipal = {
  subject: HEAD,
  appUserId: HEAD,
  sessionId: 'sess-1',
  employeeId: HEAD,
  directRoles: ['MANAGER'],
  roles: ['MANAGER'],
};

function makeRequest(id: string, ticket: AccessRequestRecord['ticket'] = null): AccessRequestRecord {
  const day = new Date('2026-06-01T00:00:00.000Z');
  return {
    id,
    organizationId: ORG,
    type: 'GRANT',
    branch: 'PAID_IN_CATALOG',
    state: 'AWAITING_SPEND_SUBMISSION',
    routing: { mode: 'VIA_HEAD', oneStepReason: null },
    planId: '00000000-0000-4000-8000-000000000b01',
    requesterEmployeeId: '00000000-0000-4000-8000-000000000e01',
    departmentId: DEP,
    costCenterId: '00000000-0000-4000-8000-000000000c01',
    businessReason: 'Need tool',
    termMonths: 4,
    pricing: {
      status: 'PRICED',
      missingReason: null,
      kind: 'RECURRING',
      budgetYear: 2026,
      expectedEndDate: null,
      amountMonths: 4,
      amount: { amountMinor: 2_000_000n, currency: 'VND' },
      unitPrice: { amountMinor: 500_000n, currency: 'VND' },
      monthlyPriceMinor: 500_000n,
      billingCycle: 'MONTHLY',
      nextYearAmount: null,
    },
    planLine: null,
    offPlan: true,
    expectedEndDate: null,
    policy: {
      version: 2,
      branch: 'PAID_IN_CATALOG',
      chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
      slaWorkingDays: 3,
    },
    submittedAt: day,
    ticket,
    withdrawal: null,
    cancellation: null,
    serviceAccount: null,
    oneStepBlockedReason: null,
    limitExemption: null,
    replacesAssignmentId: null,
    beneficiaryEmployeeIds: ['00000000-0000-4000-8000-000000000e01'],
    needStep: {
      id: 'step-need',
      state: 'APPROVED',
      assigneeEmployeeId: HEAD,
      routingRow: 1,
      waitingReason: null,
      samePersonAsSpend: false,
      slaWorkingDays: 3,
      createdAt: day,
      assignedAt: day,
      decidedAt: day,
    },
    needDecision: null,
    needSteps: [],
    lines: [],
    renewal: null,
  };
}

type RoutedOutcome = Extract<RoutingOutcome, { status: 'ROUTED' }>;

function buildHarness(options: {
  records: Map<string, AccessRequestRecord>;
  humanReturns?: Map<string, HumanReturn[]>;
  repliedSteps?: Map<string, Set<string>>;
  routeOutcome?: (requestId: string) => RoutingOutcome;
}) {
  const tx = {} as unknown as import('../../../infrastructure/database/transaction-runner').DbTx;
  const runnerRun = jest.fn(<T>(fn: (t: typeof tx) => Promise<T>) => fn(tx));
  const lockById = jest.fn((_t: unknown, id: string) => Promise.resolve(options.records.get(id) ?? null));
  const createBatch = jest.fn().mockResolvedValue('batch-1');
  const route = jest.fn((_t: unknown, _actor: unknown, req: AccessRequestRecord): Promise<RoutingOutcome> => {
    if (options.routeOutcome) return Promise.resolve(options.routeOutcome(req.id));
    return Promise.resolve({
      status: 'ROUTED',
      outcome: 'WITHIN_BASE',
      check: { blockReasons: [] } as unknown as RoutedOutcome['check'],
      step: { assigneeEmployeeId: APPROVER_A } as unknown as RoutedOutcome['step'],
    });
  });
  const recorderSubmitted = jest.fn().mockResolvedValue(undefined);
  const returnFactsOf = jest.fn((ids: readonly string[]) => {
    const map = new Map<string, ReturnFacts>();
    for (const id of ids) {
      const steps: ReturnStepFact[] = (options.humanReturns?.get(id) ?? []).map((ret, idx) => ({
        id: ret.stepId,
        kind: ret.kind === 'SPEND' ? 'SPEND_APPROVAL' : ret.kind,
        sequence: idx + 1,
        state: 'CLOSED',
        createdAt: new Date(ret.closedAt.getTime() - 60_000),
        decidedAt: ret.closedAt,
        approvalRecord: ret.kind === 'IT_ASSESSMENT' ? null : { decision: 'RETURNED', decidedAt: ret.closedAt },
        spendDecision: null,
      }));
      map.set(id, { steps, repliedStepIds: options.repliedSteps?.get(id) ?? new Set<string>() });
    }
    return Promise.resolve(map);
  });
  const insertReply = jest.fn().mockResolvedValue({ id: 'reply-1' });

  const ticketReplies = new SpendTicketReplyService(
    { refsOf: jest.fn() } as unknown as RequestTicketRepo,
    { returnFactsOf, insert: insertReply } as unknown as RequestReplyRepo,
  );
  const writer = new SpendBatchWriterService(
    { create: createBatch } as unknown as SpendBatchRepo,
    { submitted: recorderSubmitted } as unknown as SpendBatchRecorder,
    ticketReplies,
  );

  const service = new SpendBatchService(
    { run: runnerRun } as unknown as TransactionRunner,
    { lockById } as unknown as AccessRequestRepo,
    { departmentOf: jest.fn().mockResolvedValue(DEP) } as unknown as SpendHeadService,
    { route } as unknown as SpendRoutingService,
    {
      judgeBatchChecklist: jest.fn(),
      recordBatchChecklist: jest.fn(),
      confirmOnCheck: jest.fn(),
    } as unknown as ReserveConfirmationService,
    {
      businessToday: jest.fn().mockResolvedValue('2026-06-01'),
      getOwningUnits: jest.fn().mockResolvedValue(new Map()),
      requireUnitCostCenter: jest.fn(),
    } as unknown as OrganizationReadApi,
    writer,
  );

  return { service, runnerRun, lockById, createBatch, route, recorderSubmitted, insertReply };
}

const withinBase = (assigneeEmployeeId: string | null = APPROVER_A): RoutingOutcome => ({
  status: 'ROUTED',
  outcome: 'WITHIN_BASE',
  check: { blockReasons: [] } as unknown as RoutedOutcome['check'],
  step: assigneeEmployeeId ? ({ assigneeEmployeeId } as unknown as RoutedOutcome['step']) : null,
});

const blocked = (reason: 'OVER_RESERVE' | 'NO_APPROVED_BUDGET' | 'PRICE_EXPIRED' = 'OVER_RESERVE'): RoutingOutcome => ({
  status: 'ROUTED',
  outcome: 'BLOCKED',
  check: { blockReasons: [reason] } as unknown as RoutedOutcome['check'],
  step: null,
});

const usesReserve = (): RoutingOutcome => ({
  status: 'ROUTED',
  outcome: 'USES_RESERVE',
  check: { blockReasons: [] } as unknown as RoutedOutcome['check'],
  step: null,
});

const spendReturn = (requestId: string): [string, HumanReturn[]] => [
  requestId,
  [{ kind: 'SPEND', stepId: STEP_RETURNED, closedAt: new Date('2026-06-01T09:00:00Z') }],
];
const res = (requestId: string, outcome: string, stopReason: string | null = null) => ({
  requestId,
  outcome,
  stopReason,
  reserveConfirmation: 'NOT_GIVEN',
});
const replyInsert = (requestId: string, note: string) => ({
  organizationId: ORG,
  requestId,
  kind: 'HEAD_RESUBMISSION',
  returnedStepId: STEP_RETURNED,
  note,
  authorEmployeeId: HEAD,
});

describe('SpendBatchService (§7.7 ticket order & §7.10 reply notes)', () => {
  describe('§7.10 reply notes on head resubmission', () => {
    it.each([
      {
        name: 'A: pending C1 return without note -> STOPPED REPLY_NOTE_REQUIRED, other item proceeds, no reply inserted',
        requestIds: [REQ_1, REQ_4],
        replyNotes: [],
        humanReturns: new Map([spendReturn(REQ_1)]),
        routeOutcome: () => withinBase(),
        expectedResults: [res(REQ_1, 'STOPPED', 'REPLY_NOTE_REQUIRED'), res(REQ_4, 'SENT_TO_APPROVER')],
        expectedRoutedIds: [REQ_4],
        expectedInserts: [],
      },
      {
        name: 'B: pending C1 return with note and WITHIN_BASE -> SENT_TO_APPROVER, inserts HEAD_RESUBMISSION once',
        requestIds: [REQ_1],
        replyNotes: [{ requestId: REQ_1, note: '  Bo sung giai trinh chi phi  ' }],
        humanReturns: new Map([spendReturn(REQ_1)]),
        routeOutcome: () => withinBase(),
        expectedResults: [res(REQ_1, 'SENT_TO_APPROVER')],
        expectedRoutedIds: [REQ_1],
        expectedInserts: [replyInsert(REQ_1, 'Bo sung giai trinh chi phi')],
      },
      {
        name: 'D & T-W4-6: no pending C1 return (e.g. system recheck only) -> proceeds without note, ignores extra note',
        requestIds: [REQ_1],
        replyNotes: [{ requestId: REQ_1, note: 'Unneeded note' }],
        humanReturns: new Map<string, HumanReturn[]>(),
        routeOutcome: () => withinBase(),
        expectedResults: [res(REQ_1, 'SENT_TO_APPROVER')],
        expectedRoutedIds: [REQ_1],
        expectedInserts: [],
      },
      {
        name: 'E: pending C1 return with note but budget check returns BLOCKED -> STOPPED, MUST NOT insert reply',
        requestIds: [REQ_1],
        replyNotes: [{ requestId: REQ_1, note: 'Giai trinh nhung vuot ngan sach' }],
        humanReturns: new Map([spendReturn(REQ_1)]),
        routeOutcome: () => blocked('OVER_RESERVE'),
        expectedResults: [res(REQ_1, 'STOPPED', 'OVER_RESERVE')],
        expectedRoutedIds: [REQ_1],
        expectedInserts: [],
      },
      {
        name: 'AWAITING_RESERVE_CONFIRMATION inserts HEAD_RESUBMISSION reply when item leaves reply-awaiting state',
        requestIds: [REQ_1],
        replyNotes: [{ requestId: REQ_1, note: 'Giai trinh su dung du phong' }],
        humanReturns: new Map([spendReturn(REQ_1)]),
        routeOutcome: () => usesReserve(),
        expectedResults: [res(REQ_1, 'AWAITING_RESERVE_CONFIRMATION')],
        expectedRoutedIds: [REQ_1],
        expectedInserts: [replyInsert(REQ_1, 'Giai trinh su dung du phong')],
      },
    ])(
      '$name',
      async ({
        requestIds,
        replyNotes,
        humanReturns,
        routeOutcome,
        expectedResults,
        expectedRoutedIds,
        expectedInserts,
      }) => {
        const records = new Map(requestIds.map((id) => [id, makeRequest(id)]));
        const harness = buildHarness({ records, humanReturns, routeOutcome });

        const response = await harness.service.submit(actor, requestIds, [], undefined, replyNotes);

        expect(response.results).toEqual(expectedResults);
        expect(harness.route.mock.calls.map((call) => call[2].id)).toEqual(expectedRoutedIds);
        const insertedPayloads = (harness.insertReply.mock.calls as unknown[][]).map((call) => call[1]);
        expect(insertedPayloads).toEqual(expectedInserts);
      },
    );

    it('C: throws SpendReplyNoteNotInBatchError (422 SPEND.REPLY_NOTE_NOT_IN_BATCH) and creates no batch when replyNotes names an outside request', async () => {
      const records = new Map([[REQ_1, makeRequest(REQ_1)]]);
      const harness = buildHarness({ records });

      const thrown = await harness.service
        .submit(actor, [REQ_1], [], undefined, [{ requestId: REQ_4, note: 'Outside' }])
        .catch((err: unknown) => err);

      expect(thrown).toBeInstanceOf(SpendReplyNoteNotInBatchError);
      expect((thrown as SpendReplyNoteNotInBatchError).requestIds).toEqual([REQ_4]);
      expect(harness.runnerRun).not.toHaveBeenCalled();
      expect(harness.createBatch).not.toHaveBeenCalled();

      const mapped = toSpendApiException(thrown) as ApiException;
      expect(mapped.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mapped.getResponse()).toMatchObject({
        code: 'SPEND.REPLY_NOTE_NOT_IN_BATCH',
        details: { requestIds: [REQ_4] },
      });
    });

    it('does not require a reply note when the latest SPEND return already has a reply', async () => {
      const records = new Map([[REQ_1, makeRequest(REQ_1)]]);
      const humanReturns = new Map([
        [REQ_1, [{ kind: 'SPEND' as const, stepId: STEP_RETURNED, closedAt: new Date('2026-06-01T09:00:00Z') }]],
      ]);
      const repliedSteps = new Map([[REQ_1, new Set([STEP_RETURNED])]]);
      const harness = buildHarness({ records, humanReturns, repliedSteps });

      const response = await harness.service.submit(actor, [REQ_1]);

      expect(response.results).toEqual([
        { requestId: REQ_1, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'NOT_GIVEN' },
      ]);
      expect(harness.insertReply).not.toHaveBeenCalled();
    });
  });

  describe('§7.7 ticket order in batch processing and body order restoration', () => {
    it('locks by sorted id, processes in processingOrder, and restores results, batch items, and recorder arrays to body order', async () => {
      const records = new Map<string, AccessRequestRecord>([
        [REQ_3, makeRequest(REQ_3, { id: TICKET_1, position: 3, itemCount: 3 })],
        [REQ_4, makeRequest(REQ_4, null)],
        [REQ_1, makeRequest(REQ_1, { id: TICKET_1, position: 1, itemCount: 3 })],
      ]);
      const routeCalls: string[] = [];
      const harness = buildHarness({
        records,
        routeOutcome: (requestId) => {
          routeCalls.push(requestId);
          if (requestId === REQ_1) return withinBase(APPROVER_A);
          if (requestId === REQ_4) return blocked('OVER_RESERVE');
          return withinBase(APPROVER_B);
        },
      });

      const bodyIds = [REQ_3, REQ_4, REQ_1];
      const response = await harness.service.submit(actor, bodyIds);

      expect(harness.lockById.mock.calls.map((call) => call[1])).toEqual([REQ_1, REQ_3, REQ_4]);
      expect(routeCalls).toEqual([REQ_1, REQ_4, REQ_3]);
      expect(response.results).toEqual([
        { requestId: REQ_3, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'NOT_GIVEN' },
        { requestId: REQ_4, outcome: 'STOPPED', stopReason: 'OVER_RESERVE', reserveConfirmation: 'NOT_GIVEN' },
        { requestId: REQ_1, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'NOT_GIVEN' },
      ]);

      const batchCreateArgs = (harness.createBatch.mock.calls as unknown[][])[0][1] as {
        items: { requestId: string; outcome: string }[];
      };
      expect(batchCreateArgs.items.map((item) => [item.requestId, item.outcome])).toEqual([
        [REQ_3, 'SENT_TO_APPROVER'],
        [REQ_4, 'STOPPED'],
        [REQ_1, 'SENT_TO_APPROVER'],
      ]);

      const recorderArgs = (harness.recorderSubmitted.mock.calls as unknown[][])[0][2];
      expect(recorderArgs).toMatchObject({
        requestIds: [REQ_3, REQ_4, REQ_1],
        outcomes: ['SENT_TO_APPROVER', 'STOPPED', 'SENT_TO_APPROVER'],
        openedFor: [APPROVER_B, null, APPROVER_A],
      });
    });
  });
});
