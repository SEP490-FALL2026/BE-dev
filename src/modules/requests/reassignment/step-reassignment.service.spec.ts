import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { orderByTicketPosition } from '../request-ticket/request-ticket-order.policy';
import type { ReassignableRequest } from '../step-routing/step-reassignment.repo';
import { StepReassignmentService } from './step-reassignment.service';

/**
 * The queue of the head: a request for a person that waits to be sent on (`AWAITING_SPEND_SUBMISSION`) with no open step goes one step when its requester
 * becomes the head of its department, by the event of the head period or the daily pass.
 */
describe('StepReassignmentService: the request in the queue of the head', () => {
  const tx = {} as DbTx;
  const now = new Date('2026-11-23T03:00:00Z');
  const queued = (over: Partial<ReassignableRequest> = {}): ReassignableRequest => ({
    id: 'req-1',
    organizationId: 'org-1',
    type: 'GRANT',
    routingMode: 'VIA_HEAD',
    branch: 'PAID_IN_CATALOG',
    state: 'AWAITING_SPEND_SUBMISSION',
    requesterEmployeeId: 'emp-1',
    departmentId: 'dept-1',
    chainHasSpendStep: true,
    beneficiaryEmployeeIds: ['emp-1'],
    lines: [],
    steps: [],
    ticket: null,
    ...over,
  });

  function build(request: ReassignableRequest, isHead: boolean) {
    const repo = { lockWithOpenSteps: jest.fn(() => Promise.resolve([request])) };
    const targets = {
      gatherToday: jest.fn(() => Promise.resolve({ today: '2026-11-23' })),
      isRequesterHead: jest.fn(() => Promise.resolve(isHead)),
    };
    const spending = { finishConversionById: jest.fn(() => Promise.resolve()) };
    const heads = { convert: jest.fn(() => Promise.resolve()), record: jest.fn() };
    const service = new StepReassignmentService(
      {} as never,
      repo as never,
      targets as never,
      {} as never,
      { getEmployees: jest.fn(() => Promise.resolve([])) } as never,
      { record: jest.fn() } as never,
      spending as never,
      heads as never,
    );

    return { service, targets, spending, heads };
  }

  it('marks the request one step, records it as the system and finishes the conversion when the requester is the head', async () => {
    const { service, spending, heads } = build(queued(), true);

    const result = await service.reconcileRequests(
      tx,
      ['req-1'],
      { kind: 'HEAD_CHANGED', employeeId: null },
      'corr-1',
      now,
    );

    expect(heads.convert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'req-1' }),
      { kind: 'SYSTEM', trigger: 'HEAD_CHANGED', correlationId: 'corr-1' },
      undefined,
    );
    expect(spending.finishConversionById).toHaveBeenCalledWith(tx, 'req-1', now);
    expect(result.endedNotRequired).toBe(1);
  });

  it('leaves the request in the queue when its requester is not the head', async () => {
    const { service, spending, heads } = build(queued(), false);

    const result = await service.reconcileRequests(
      tx,
      ['req-1'],
      { kind: 'HEAD_CHANGED', employeeId: null },
      'corr-1',
      now,
    );

    expect(heads.convert).not.toHaveBeenCalled();
    expect(spending.finishConversionById).not.toHaveBeenCalled();
    expect(result.endedNotRequired).toBe(0);
  });

  it.each([
    ['a request for a group', { type: 'GROUP_GRANT' as const }],
    ['a request already of one step', { routingMode: 'ONE_STEP' as const }],
    ['a request that is not in the queue', { state: 'PENDING' }],
  ])('does not even ask whether the requester is the head for %s', async (_name, over) => {
    const { service, targets, heads } = build(queued(over), true);

    await service.reconcileRequests(tx, ['req-1'], { kind: 'HEAD_CHANGED', employeeId: null }, 'corr-1', now);

    expect(targets.isRequesterHead).not.toHaveBeenCalled();
    expect(heads.convert).not.toHaveBeenCalled();
  });

  it('does not look at the queue for the retry of a step that waits', async () => {
    const { service, targets } = build(queued(), true);

    await service.reconcileRequests(tx, ['req-1'], { kind: 'WAITING_RETRY', employeeId: null }, 'corr-1', now);

    expect(targets.isRequesterHead).not.toHaveBeenCalled();
  });

  it('reconciles same-ticket queued spend requests in ascending ticket position order regardless of id order', async () => {
    const reqPos2 = { ...queued({ id: 'req-1' }), ticket: { id: 'ticket-1', position: 2 } };
    const reqStandalone = { ...queued({ id: 'req-2' }), ticket: null };
    const reqPos1 = { ...queued({ id: 'req-3' }), ticket: { id: 'ticket-1', position: 1 } };
    const order: string[] = [];
    const repo = { lockWithOpenSteps: jest.fn(() => Promise.resolve([reqPos2, reqStandalone, reqPos1])) };
    const targets = {
      gatherToday: jest.fn(() => Promise.resolve({ today: '2026-11-23' })),
      isRequesterHead: jest.fn(() => Promise.resolve(true)),
    };
    const spending = {
      finishConversionById: jest.fn((_tx: DbTx, id: string) => {
        order.push(id);
        return Promise.resolve();
      }),
    };
    const heads = { convert: jest.fn(() => Promise.resolve()), record: jest.fn() };
    const service = new StepReassignmentService(
      {} as never,
      repo as never,
      targets as never,
      {} as never,
      { getEmployees: jest.fn(() => Promise.resolve([])) } as never,
      { record: jest.fn() } as never,
      spending as never,
      heads as never,
    );

    const result = await service.reconcileRequests(
      tx,
      ['req-1', 'req-2', 'req-3'],
      { kind: 'HEAD_CHANGED', employeeId: null },
      'corr-1',
      now,
    );

    expect(order).toEqual(['req-3', 'req-2', 'req-1']);
    expect(result.endedNotRequired).toBe(3);
  });

  it('checks budget in ascending ticket position order across PENDING and AWAITING_SPEND_SUBMISSION items of one ticket (RB-9)', async () => {
    const r11Pending = {
      ...queued({
        id: 'req-11',
        state: 'PENDING',
        steps: [
          {
            id: 'step-11',
            kind: 'NEED' as const,
            sequence: 1,
            state: 'PENDING' as const,
            assigneeEmployeeId: 'head-old',
            waitingReason: null,
            routingRow: 1,
            samePersonAsSpend: false,
            createdAt: now,
            waitingSince: null,
          },
        ],
      }),
      ticket: { id: 'ticket-rb9', position: 2 },
    };
    const r12Queued = {
      ...queued({ id: 'req-12', state: 'AWAITING_SPEND_SUBMISSION' }),
      ticket: { id: 'ticket-rb9', position: 1 },
    };
    const order: string[] = [];
    const repo = {
      lockWithOpenSteps: jest.fn(() => Promise.resolve([r11Pending, r12Queued])),
      endNeedStepNotRequired: jest.fn(() => Promise.resolve()),
    };
    const targets = {
      gatherToday: jest.fn(() => Promise.resolve({ today: '2026-11-23' })),
      targetOf: jest.fn(() =>
        Promise.resolve({ assigneeEmployeeId: null, notRequired: 'REQUESTER_IS_HEAD', routingRow: 2 }),
      ),
      isRequesterHead: jest.fn(() => Promise.resolve(true)),
    };
    const spending = {
      finishConversionById: jest.fn((_tx: DbTx, id: string) => {
        order.push(id);
        return Promise.resolve();
      }),
    };
    const heads = { convert: jest.fn(() => Promise.resolve()), record: jest.fn(() => Promise.resolve()) };
    const service = new StepReassignmentService(
      {} as never,
      repo as never,
      targets as never,
      {} as never,
      { getEmployees: jest.fn(() => Promise.resolve([])) } as never,
      { record: jest.fn() } as never,
      spending as never,
      heads as never,
    );

    const result = await service.reconcileRequests(
      tx,
      ['req-11', 'req-12'],
      { kind: 'HEAD_CHANGED', employeeId: null },
      'corr-1',
      now,
    );

    expect(order).toEqual(['req-12', 'req-11']);
    expect(result.endedNotRequired).toBe(2);
  });

  it.each([
    {
      name: '[R3(PH1#3), X, R1(PH1#1)] -> [R1, X, R3]',
      items: [
        { id: 'R3', ticket: { id: 'PH1', position: 3 } },
        { id: 'X', ticket: null },
        { id: 'R1', ticket: { id: 'PH1', position: 1 } },
      ],
      expected: ['R1', 'X', 'R3'],
    },
    {
      name: '[A(PH1#2), B(PH2#1), C(PH1#1)] -> [C, B, A]',
      items: [
        { id: 'A', ticket: { id: 'PH1', position: 2 } },
        { id: 'B', ticket: { id: 'PH2', position: 1 } },
        { id: 'C', ticket: { id: 'PH1', position: 1 } },
      ],
      expected: ['C', 'B', 'A'],
    },
    {
      name: 'without tickets keeps original order',
      items: [
        { id: 'X1', ticket: null },
        { id: 'X2', ticket: null },
      ],
      expected: ['X1', 'X2'],
    },
  ])('orderByTicketPosition: $name', ({ items, expected }) => {
    expect(orderByTicketPosition(items).map((item) => item.id)).toEqual(expected);
  });
});
