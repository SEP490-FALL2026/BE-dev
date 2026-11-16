import { RequestResubmissionService } from './request-resubmission.service';
import {
  AccessRequestNotAwaitingRevisionError,
  AccessRequestNotRequesterError,
} from '../access-request/access-request.errors';
describe('BR-MF1-02: requester resubmission', () => {
  const tx = {};
  const request = {
    id: 'request',
    requesterEmployeeId: 'requester',
    state: 'AWAITING_REQUESTER_REVISION',
    routing: { mode: 'ONE_STEP' },
  };
  const repo = { lockById: jest.fn(), findById: jest.fn(), addNeedStep: jest.fn(), setState: jest.fn() };
  const spend = { route: jest.fn() };
  const lines = { lock: jest.fn(), repointNeed: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new RequestResubmissionService(
    { run: (fn: (tx: unknown) => unknown) => fn(tx) } as never,
    repo as never,
    spend as never,
    lines as never,
    audit as never,
  );
  const actor = { employeeId: 'requester' } as never;
  beforeEach(() => {
    jest.resetAllMocks();
    repo.lockById.mockResolvedValue(request);
    repo.findById.mockResolvedValue(request);
  });
  it('uses the package-3 check even when its result still blocks', async () => {
    await expect(service.resubmit(actor, 'request')).resolves.toBe(request);
    expect(spend.route).toHaveBeenCalledWith(tx, actor, request, 'SUBMISSION', expect.any(Date));
  });
  it('refuses a different actor before checking any budget', async () => {
    await expect(service.resubmit({ employeeId: 'other' } as never, 'request')).rejects.toBeInstanceOf(
      AccessRequestNotRequesterError,
    );
    expect(spend.route).not.toHaveBeenCalled();
  });
  it.each(['PENDING', 'AWAITING_SPEND_DECISION', 'REJECTED'])('refuses resubmission at %s', async (state) => {
    repo.lockById.mockResolvedValue({ ...request, state });
    await expect(service.resubmit(actor, 'request')).rejects.toBeInstanceOf(AccessRequestNotAwaitingRevisionError);
  });
});

describe('PL-2.2 (QĐ-111ap, R-24): the sender sends on again a request the head sent back at the need step', () => {
  const tx = {};
  const returned = (id: string) => ({
    id,
    state: 'CLOSED',
    assigneeEmployeeId: 'head',
    routingRow: 1,
    slaWorkingDays: 2,
    decision: { decision: 'RETURNED' },
  });
  const viaHead = {
    id: 'request',
    organizationId: 'org',
    type: 'GRANT',
    requesterEmployeeId: 'requester',
    state: 'AWAITING_REQUESTER_REVISION',
    routing: { mode: 'VIA_HEAD' },
    needSteps: [returned('step-1')],
  };
  const repo = { lockById: jest.fn(), findById: jest.fn(), addNeedStep: jest.fn(), setState: jest.fn() };
  const spend = { route: jest.fn() };
  const lines = { lock: jest.fn(), repointNeed: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new RequestResubmissionService(
    { run: (fn: (tx: unknown) => unknown) => fn(tx) } as never,
    repo as never,
    spend as never,
    lines as never,
    audit as never,
  );
  const actor = { employeeId: 'requester' } as never;
  beforeEach(() => {
    jest.resetAllMocks();
    repo.lockById.mockResolvedValue(viaHead);
    repo.findById.mockResolvedValue(viaHead);
    repo.addNeedStep.mockResolvedValue('step-2');
  });

  it('opens a new need step for the head of the returned one and waits for the head, not for the spending approver', async () => {
    await service.resubmit(actor, 'request');

    expect(repo.addNeedStep).toHaveBeenCalledWith(tx, {
      requestId: 'request',
      now: expect.any(Date) as unknown,
      step: { state: 'PENDING', assigneeEmployeeId: 'head', routingRow: 1, waitingReason: null, slaWorkingDays: 2 },
    });
    expect(repo.setState).toHaveBeenCalledWith(tx, 'request', 'PENDING');
    expect(spend.route).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('refuses when the last need step was not sent back', async () => {
    repo.lockById.mockResolvedValue({
      ...viaHead,
      needSteps: [{ ...returned('step-1'), decision: { decision: 'APPROVED' } }],
    });

    await expect(service.resubmit(actor, 'request')).rejects.toBeInstanceOf(AccessRequestNotAwaitingRevisionError);
    expect(repo.addNeedStep).not.toHaveBeenCalled();
  });

  it('moves the people of a group who still wait for their need to the new step, and leaves the others where they are', async () => {
    repo.lockById.mockResolvedValue({
      ...viaHead,
      type: 'GROUP_GRANT',
      needSteps: [returned('step-1'), { ...returned('step-own'), state: 'PENDING', decision: null }],
    });
    lines.lock.mockResolvedValue([
      { employeeId: 'e1', state: 'AWAITING_NEED', needStepId: 'step-1' },
      { employeeId: 'e2', state: 'AWAITING_NEED', needStepId: 'step-1' },
      { employeeId: 'head', state: 'AWAITING_NEED', needStepId: 'step-own' },
    ]);

    await service.resubmit(actor, 'request');

    expect(repo.addNeedStep).toHaveBeenCalledTimes(1);
    expect(lines.repointNeed).toHaveBeenCalledWith(tx, 'request', ['e1', 'e2'], 'step-2');
  });
});
