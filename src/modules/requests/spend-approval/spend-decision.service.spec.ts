import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { SpendDecisionService, type SpendDecisionInput } from './spend-decision.service';

const actor: AuthenticatedPrincipal = {
  employeeId: 'approver',
  subject: 'account',
  appUserId: 'account',
  sessionId: 'session',
  directRoles: ['SPENDING_APPROVER'],
  roles: ['SPENDING_APPROVER'],
};
const input: SpendDecisionInput = { decision: 'APPROVE', checklist: { policyVersionId: 'policy', answers: [] } };
const tx = {} as DbTx;
const request = {
  id: 'request',
  organizationId: 'org',
  type: 'PERSONAL_GRANT',
  state: 'AWAITING_SPEND_DECISION',
  requesterEmployeeId: 'staff',
  beneficiaryEmployeeIds: ['staff'],
  routing: { mode: 'VIA_HEAD' },
} as unknown as AccessRequestRecord;

function build(record: AccessRequestRecord = request) {
  const runner = { run: (work: (client: DbTx) => unknown) => work(tx) };
  const requests = { findById: jest.fn().mockResolvedValue(record), lockById: jest.fn().mockResolvedValue(record) };
  const steps = {
    findOpen: jest.fn().mockResolvedValue({ id: 'step', assigneeEmployeeId: actor.employeeId, state: 'PENDING' }),
  };
  const checks = {
    run: jest
      .fn()
      .mockResolvedValue({ status: 'CHECKED', check: { id: 'check', outcome: 'COVERED', overByMinor: null } }),
  };
  const confirmations = { ofStep: jest.fn().mockResolvedValue(null) };
  const effects = { sendBack: jest.fn() };
  const decided = { status: 'DECIDED', decision: 'APPROVED', requestState: 'AWAITING_EXECUTION' };
  const recorder = { record: jest.fn().mockResolvedValue(decided) };
  const checklists = {
    judge: jest.fn().mockResolvedValue({ verdict: { version: 1 }, reason: null }),
    record: jest.fn(),
  };
  const service = new SpendDecisionService(
    runner as never,
    requests as never,
    steps as never,
    checks as never,
    confirmations as never,
    effects as never,
    recorder as never,
    checklists as never,
  );
  return { service, requests, steps, checks, effects, recorder, checklists, decided };
}

describe('SpendDecisionService single spend decision', () => {
  it('returns DECIDED and records the checklist after rechecking a covered request', async () => {
    const f = build();
    await expect(f.service.decide(actor, request.id, input)).resolves.toEqual(f.decided);
    expect(f.checks.run).toHaveBeenCalledWith(tx, request, 'SPEND_DECISION', actor, expect.any(Date));
    expect(f.recorder.record).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({ request }),
      expect.objectContaining({ checkId: 'check', decision: 'APPROVED' }),
    );
    expect(f.checklists.record).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['VIA_HEAD', 'HEAD'],
    ['ONE_STEP', 'REQUESTER'],
  ] as const)('bounces a blocked %s request to %s without recording a decision', async (mode, to) => {
    const record = { ...request, routing: { ...request.routing, mode } } as unknown as AccessRequestRecord;
    const f = build(record);
    f.checks.run.mockResolvedValue({
      status: 'CHECKED',
      check: { id: 'check', outcome: 'BLOCKED', blockReasons: ['INSUFFICIENT_BUDGET'], overByMinor: 12n },
    });
    await expect(f.service.decide(actor, request.id, input)).resolves.toMatchObject({
      status: 'BOUNCED',
      to,
      overBy: '12',
    });
    expect(f.effects.sendBack).toHaveBeenCalledTimes(1);
    expect(f.recorder.record).not.toHaveBeenCalled();
    expect(f.checklists.record).not.toHaveBeenCalled();
  });

  it('returns NO_SPEND_STEP before locking or judging when no spend step is open', async () => {
    const f = build();
    f.steps.findOpen.mockResolvedValue(null);
    await expect(f.service.decide(actor, request.id, input)).rejects.toMatchObject({ reason: 'NO_SPEND_STEP' });
    expect(f.requests.lockById).not.toHaveBeenCalled();
    expect(f.checklists.judge).not.toHaveBeenCalled();
  });
});
