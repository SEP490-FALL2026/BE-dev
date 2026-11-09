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
  const repo = { lockById: jest.fn(), findById: jest.fn() };
  const spend = { route: jest.fn() };
  const service = new RequestResubmissionService(
    { run: (fn: (tx: unknown) => unknown) => fn(tx) } as never,
    repo as never,
    spend as never,
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
