import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { ChecklistVerdict } from '../../policies/public/policy-checklist.types';
import { AccessRequestGroupUsesLinesError, AccessRequestNotFoundError } from '../access-request/access-request.errors';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { NeedDecisionService } from './need-decision.service';

const actor: AuthenticatedPrincipal = {
  employeeId: 'head',
  subject: 'account',
  appUserId: 'account',
  sessionId: 'session',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
};
const input = { decision: 'APPROVE' as const, checklist: { policyVersionId: 'policy', answers: [] } };
const tx = {} as DbTx;
const request = {
  id: 'request',
  organizationId: 'org',
  departmentId: 'design',
  type: 'PERSONAL_GRANT',
  branch: 'INTERNAL_FREE',
  requesterEmployeeId: 'staff',
  beneficiaryEmployeeIds: ['staff'],
  needSteps: [],
  needStep: { id: 'step', state: 'PENDING', assigneeEmployeeId: 'head', routingRow: 1 },
} as unknown as AccessRequestRecord;

function build(record: AccessRequestRecord | null = request) {
  const runner = { run: (work: (client: DbTx) => unknown) => work(tx) };
  const repo = { lockById: jest.fn().mockResolvedValue(record), recordNeedDecision: jest.fn() };
  const audit = { record: jest.fn() };
  const verdict = { version: 1, answers: [] };
  const checklists = { judge: jest.fn().mockResolvedValue({ verdict, reason: null }), record: jest.fn() };
  const effects = { follow: jest.fn().mockResolvedValue(record) };
  const service = new NeedDecisionService(
    runner as never,
    repo as never,
    audit as never,
    {} as never,
    effects as never,
    checklists as never,
  );
  return { service, repo, audit, checklists, effects, verdict };
}

describe('NeedDecisionService single need decision', () => {
  it('refuses a missing request and conceals a request the caller cannot see', async () => {
    await expect(build(null).service.decide(actor, request.id, input)).rejects.toBeInstanceOf(
      AccessRequestNotFoundError,
    );
    await expect(
      build().service.decide({ ...actor, employeeId: 'outsider', roles: ['EMPLOYEE'] }, request.id, input),
    ).rejects.toBeInstanceOf(AccessRequestNotFoundError);
  });

  it('refuses a group before judging the checklist', async () => {
    const f = build({ ...request, type: 'GROUP_GRANT' });
    await expect(f.service.decide(actor, request.id, input)).rejects.toBeInstanceOf(AccessRequestGroupUsesLinesError);
    expect(f.checklists.judge).not.toHaveBeenCalled();
  });

  it.each([
    ['OWN_REQUEST', { requesterEmployeeId: actor.employeeId }],
    ['NOT_THE_ASSIGNEE', { needStep: { ...request.needStep, assigneeEmployeeId: 'other' } }],
    ['STEP_NOT_PENDING', { needStep: { ...request.needStep, state: 'APPROVED' } }],
  ] as const)('refuses %s without judging or recording', async (reason, patch) => {
    const f = build({ ...request, ...patch });
    await expect(f.service.decide(actor, request.id, input)).rejects.toMatchObject({ reason });
    expect(f.checklists.judge).not.toHaveBeenCalled();
    expect(f.repo.recordNeedDecision).not.toHaveBeenCalled();
  });

  it('judges once, writes the decision and records the judged checklist for that request', async () => {
    const f = build();
    await expect(f.service.decide(actor, request.id, input)).resolves.toBe(request);
    expect(f.checklists.judge).toHaveBeenCalledTimes(1);
    expect(f.checklists.judge).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ stepCode: '1.2', checklist: input.checklist }),
    );
    expect(f.repo.recordNeedDecision).toHaveBeenCalledTimes(1);
    expect(f.repo.recordNeedDecision.mock.calls[0]).toMatchObject([
      tx,
      { requestState: 'AWAITING_EXECUTION', record: { decision: 'APPROVED' } },
    ]);
    expect(f.checklists.record).toHaveBeenCalledTimes(1);
    expect(f.checklists.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        verdict: f.verdict,
        subjects: [{ kind: 'ACCESS_REQUEST', id: request.id }],
      }),
    );
    expect(f.checklists.judge.mock.invocationCallOrder[0]).toBeLessThan(
      f.repo.recordNeedDecision.mock.invocationCallOrder[0],
    );
    expect(f.repo.recordNeedDecision.mock.invocationCallOrder[0]).toBeLessThan(
      f.checklists.record.mock.invocationCallOrder[0],
    );
  });

  it('records the supplied checklist and reason without judging it again', async () => {
    const f = build();
    const verdict: ChecklistVerdict = {
      policyVersionId: 'batch-policy',
      versionNumber: 2,
      stepCode: '1.2',
      answers: [],
      hasNo: false,
      noItems: [],
    };
    const reason = 'No longer needed';

    await expect(
      f.service.decide(actor, request.id, { ...input, decision: 'REJECT' }, { verdict, reason }),
    ).resolves.toBe(request);
    expect(f.checklists.judge).not.toHaveBeenCalled();
    expect(f.checklists.record).toHaveBeenCalledTimes(1);
    expect(f.checklists.record).toHaveBeenCalledWith(tx, expect.objectContaining({ verdict, decision: 'REJECT' }));
    expect(f.repo.recordNeedDecision.mock.calls[0]).toMatchObject([tx, { record: { decision: 'REJECTED', reason } }]);
  });
});
