import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SpendRoutingService } from '../spend/spend-routing.service';
import { RequesterHeadConversionService } from '../step-routing/requester-head-conversion.service';

describe('SpendRoutingService conversion & assessment entry', () => {
  const tx = {} as DbTx;
  const now = new Date('2026-11-22T09:00:00.000Z');
  const actor: AuthenticatedPrincipal = {
    subject: 'u-it',
    appUserId: 'u-it',
    sessionId: 'sess-1',
    employeeId: 'emp-it',
    directRoles: ['IT_ADMIN'],
    roles: ['IT_ADMIN'],
  };

  const baseRequest = (overrides: Record<string, unknown> = {}) => ({
    id: 'req-1',
    organizationId: 'org-1',
    type: 'GRANT',
    branch: 'NEW_SOFTWARE',
    state: 'AWAITING_IT_ASSESSMENT',
    requesterEmployeeId: 'emp-1',
    beneficiaryEmployeeIds: ['emp-1'],
    departmentId: 'dept-1',
    routing: { mode: 'VIA_HEAD', oneStepReason: null, oneStepBlockedReason: null },
    policy: { chain: ['NEED', 'IT_ASSESSMENT', 'SPEND_APPROVAL'], slaWorkingDays: 2 },
    pricing: { status: 'PRICED' },
    needDecision: { decision: 'APPROVED' },
    ...overrides,
  });

  const makeService = () => {
    const requests = {
      findById: jest.fn(),
      markOneStep: jest.fn(),
      setOneStepBlockedReason: jest.fn(),
      setState: jest.fn(),
    };
    const checks = { run: jest.fn() };
    const steps = { findOpen: jest.fn(), open: jest.fn() };
    const targets = { isRequesterHead: jest.fn(), usableSpendingApproverEmployeeId: jest.fn() };
    const audit = { record: jest.fn() };
    const service = new SpendRoutingService(
      requests as never,
      checks as never,
      steps as never,
      targets as never,
      audit as never,
      new RequesterHeadConversionService(requests as never, audit as never),
    );

    return { service, requests, checks, steps, targets, audit };
  };

  it('converts a VIA_HEAD individual proposal in enterAfterAssessment when the requester became head', async () => {
    const { service, requests, checks, steps, targets, audit } = makeService();
    const viaHead = baseRequest();
    const converted = baseRequest({
      routing: { mode: 'ONE_STEP', oneStepReason: 'REQUESTER_IS_HEAD', oneStepBlockedReason: null },
    });
    requests.findById.mockResolvedValueOnce(viaHead).mockResolvedValueOnce(converted);
    targets.isRequesterHead.mockResolvedValue(true);
    checks.run.mockResolvedValue({
      status: 'ROUTED',
      check: {
        id: 'chk-1',
        number: 1,
        trigger: 'SUBMISSION',
        route: 'ONE_STEP',
        outcome: 'WITHIN_BASE',
        blockReasons: [],
        overBaseByMinor: null,
        overByMinor: null,
        years: [],
        periodClosed: false,
        staleCostEvidence: false,
      },
    });
    targets.usableSpendingApproverEmployeeId.mockResolvedValue('emp-approver');
    steps.open.mockResolvedValue({ id: 'spend-1', assigneeEmployeeId: 'emp-approver' });

    await service.enterAfterAssessment(tx, actor, 'req-1', now);

    expect(requests.markOneStep).toHaveBeenCalledWith(tx, 'req-1', 'REQUESTER_IS_HEAD');
    expect(audit.record).toHaveBeenCalledTimes(2);
    const [, firstEvent] = audit.record.mock.calls[0] as [unknown, { action: string; after: Record<string, unknown> }];
    expect(firstEvent.action).toBe('ACCESS_REQUEST.STEP_NOT_REQUIRED');
    expect(firstEvent.after).toMatchObject({
      requestId: 'req-1',
      stepKind: 'NEED',
      trigger: 'ASSESSMENT_COMPLETED',
      oneStepReason: 'REQUESTER_IS_HEAD',
      requesterBecameHead: true,
    });
    expect(checks.run).toHaveBeenCalledWith(tx, converted, 'SUBMISSION', actor, now);
    expect(requests.setState).toHaveBeenCalledWith(tx, 'req-1', 'AWAITING_SPEND_DECISION');
  });

  it('leaves GROUP_GRANT and non-head proposals untouched in enterAfterAssessment', async () => {
    const { service, requests, checks, targets, audit } = makeService();
    requests.findById.mockResolvedValueOnce(baseRequest({ type: 'GROUP_GRANT' }));

    await service.enterAfterAssessment(tx, actor, 'req-1', now);

    expect(targets.isRequesterHead).not.toHaveBeenCalled();
    expect(requests.markOneStep).not.toHaveBeenCalled();
    expect(checks.run).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();

    requests.findById.mockResolvedValueOnce(baseRequest());
    targets.isRequesterHead.mockResolvedValue(false);

    await service.enterAfterAssessment(tx, actor, 'req-1', now);

    expect(requests.markOneStep).not.toHaveBeenCalled();
    expect(checks.run).not.toHaveBeenCalled();
  });

  it('routes an already ONE_STEP proposal directly in enterAfterAssessment without re-marking', async () => {
    const { service, requests, checks, targets } = makeService();
    const oneStep = baseRequest({
      routing: { mode: 'ONE_STEP', oneStepReason: 'REQUESTER_IS_HEAD', oneStepBlockedReason: null },
    });
    requests.findById.mockResolvedValueOnce(oneStep);
    checks.run.mockResolvedValue({ status: 'NOT_CHECKABLE', reason: 'NO_ACTIVE_BUDGET' });

    await service.enterAfterAssessment(tx, actor, 'req-1', now);

    expect(targets.isRequesterHead).not.toHaveBeenCalled();
    expect(requests.markOneStep).not.toHaveBeenCalled();
    expect(requests.setOneStepBlockedReason).toHaveBeenCalledWith(tx, 'req-1', 'NO_ACTIVE_BUDGET');
    expect(requests.setState).toHaveBeenCalledWith(tx, 'req-1', 'AWAITING_REQUESTER_REVISION');
  });

  it('sends a converted ONE_STEP request back to AWAITING_REQUESTER_REVISION when finishConversion finds budget BLOCKED', async () => {
    const { service, requests, checks, steps } = makeService();
    const oneStepPaid = baseRequest({
      branch: 'PAID_IN_CATALOG',
      routing: { mode: 'ONE_STEP', oneStepReason: 'REQUESTER_IS_HEAD', oneStepBlockedReason: null },
    });
    steps.findOpen.mockResolvedValue(null);
    checks.run.mockResolvedValue({
      status: 'ROUTED',
      check: {
        id: 'chk-blocked',
        number: 2,
        trigger: 'SUBMISSION',
        route: 'ONE_STEP',
        outcome: 'BLOCKED',
        blockReasons: ['OVER_BUDGET_WITH_RESERVE'],
        overBaseByMinor: 500_000n,
        overByMinor: 200_000n,
        years: [],
        periodClosed: false,
        staleCostEvidence: false,
      },
    });

    await service.finishConversion(tx, oneStepPaid as never, now);

    expect(steps.open).not.toHaveBeenCalled();
    expect(requests.setState).toHaveBeenCalledWith(tx, 'req-1', 'AWAITING_REQUESTER_REVISION');
  });

  it('skips finishConversion when SPEND_APPROVAL step is already open', async () => {
    const { service, checks, steps } = makeService();
    steps.findOpen.mockResolvedValue({ id: 'spend-existing', state: 'PENDING' });

    await service.finishConversion(tx, baseRequest() as never, now);

    expect(checks.run).not.toHaveBeenCalled();
  });
});
