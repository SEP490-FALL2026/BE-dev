import type { DbTx } from '../../../infrastructure/database/transaction-runner';
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
});
