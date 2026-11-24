import { HttpStatus } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { AssessmentReturnService } from '../assessment-decision/assessment-return.service';
import { AssessmentCompletionService } from './assessment-completion.service';
import { AssessmentRefusedError } from './assessment.errors';
import { ASSESSMENT_ERROR_EXAMPLES, toAssessmentApiException } from './assessment.http-errors';
import { AssessmentGate } from './assessment-gate.service';
import { AssessmentRejectionService } from './assessment-rejection.service';
import { AssessmentService } from './assessment.service';
import { InternalRegistrationService } from './internal-registration.service';

const tx = {} as DbTx;
const actor = (employeeId: string): AuthenticatedPrincipal => ({
  subject: `u-${employeeId}`,
  appUserId: `u-${employeeId}`,
  sessionId: 'sess-1',
  employeeId,
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
});

const proposalRequest = (over: Partial<AccessRequestRecord> = {}): AccessRequestRecord =>
  ({
    id: 'req-1',
    organizationId: 'org-1',
    type: 'GRANT',
    branch: 'NEW_SOFTWARE',
    state: 'AWAITING_IT_ASSESSMENT',
    requesterEmployeeId: 'emp-req',
    beneficiaryEmployeeIds: ['emp-req'],
    departmentId: 'dept-1',
    policy: { version: 3, branch: 'NEW_SOFTWARE', chain: ['NEED', 'IT_ASSESSMENT'], slaWorkingDays: 2 },
    routing: { mode: 'VIA_HEAD', oneStepReason: null, oneStepBlockedReason: null },
    ...over,
  }) as unknown as AccessRequestRecord;

describe('AssessmentGate.requireAssessor', () => {
  function setup(acting?: {
    inCharge: string | null;
    substitute: string | null;
    defaultAssignee: string | null;
    actors: string[];
  }) {
    const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(acting?.actors ?? []));
    const itAdminsActingFor = jest.fn(
      async (_depts: readonly string[], usable: (ids: readonly string[]) => Promise<ReadonlySet<string>>) => {
        await usable(['it-1', 'it-sub']);
        return acting ? new Map([['dept-1', acting]]) : new Map();
      },
    );
    const gate = new AssessmentGate(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { itAdminsActingFor } as never,
      { findUsableItAdminEmployeeIds } as never,
    );

    return { gate, itAdminsActingFor, findUsableItAdminEmployeeIds };
  }

  it('allows the usable in-charge IT Admin with bySubstitute = false', async () => {
    const { gate, itAdminsActingFor, findUsableItAdminEmployeeIds } = setup({
      inCharge: 'it-1',
      substitute: null,
      defaultAssignee: 'it-1',
      actors: ['it-1'],
    });

    const result = await gate.requireAssessor(tx, actor('it-1'), proposalRequest());

    expect(result).toEqual({ bySubstitute: false });
    expect(itAdminsActingFor).toHaveBeenCalledWith(['dept-1'], expect.any(Function), tx);
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-1', 'it-sub'], tx);
  });

  it('allows an appointed usable substitute with bySubstitute = true', async () => {
    const { gate } = setup({
      inCharge: 'it-1',
      substitute: 'it-sub',
      defaultAssignee: 'it-sub',
      actors: ['it-1', 'it-sub'],
    });

    await expect(gate.requireAssessor(tx, actor('it-sub'), proposalRequest())).resolves.toEqual({ bySubstitute: true });
  });

  it('refuses a non-acting IT Admin with ASSESSMENT_NOT_IN_CHARGE', async () => {
    const { gate } = setup({
      inCharge: 'it-1',
      substitute: null,
      defaultAssignee: 'it-1',
      actors: ['it-1'],
    });

    await expect(gate.requireAssessor(tx, actor('it-other'), proposalRequest())).rejects.toEqual(
      new AssessmentRefusedError('ASSESSMENT_NOT_IN_CHARGE'),
    );
  });

  it('refuses when no acting IT Admin exists with ASSESSMENT_NOT_IN_CHARGE', async () => {
    const { gate } = setup(undefined);

    await expect(gate.requireAssessor(tx, actor('it-other'), proposalRequest())).rejects.toEqual(
      new AssessmentRefusedError('ASSESSMENT_NOT_IN_CHARGE'),
    );
  });

  it('checks OWN_REQUEST and NOT_AWAITING_ASSESSMENT before ASSESSMENT_NOT_IN_CHARGE', async () => {
    const { gate } = setup(undefined);

    await expect(gate.requireAssessor(tx, actor('emp-req'), proposalRequest({ state: 'PENDING' }))).rejects.toEqual(
      new AssessmentRefusedError('OWN_REQUEST'),
    );
    await expect(gate.requireAssessor(tx, actor('it-other'), proposalRequest({ state: 'PENDING' }))).rejects.toEqual(
      new AssessmentRefusedError('NOT_AWAITING_ASSESSMENT'),
    );
  });
});

describe('assessment commands pass tx to requireAssessor and record bySubstitute in audit', () => {
  const runner = { run: (work: (c: DbTx) => unknown) => work(tx) } as never;
  const req = proposalRequest();
  const sub = actor('it-sub');
  const fullAssessment = {
    classification: 'PAID_LICENSED',
    vendorName: 'Miro',
    plannedPlanName: 'Pro',
    provisioningType: 'K2',
    adminConsole: true,
    memberExport: true,
    sso: false,
    termsSummary: 'Annual',
    memberUsageMethod: 'Console',
    grantRevokeMethod: 'Email',
    dataSensitivity: 'MEDIUM',
    opinionStatus: null,
    opinionNote: null,
    controlLevel: 'PARTIAL',
    quote: {
      unitPrice: { amountMinor: 200_000n, currency: 'VND' },
      originalPrice: null,
      billingCycle: 'MONTHLY',
      validFrom: '2026-01-01',
      validUntil: null,
    },
  };

  it.each([true, false])('AssessmentService.save records bySubstitute=%s cleanly', async (bySubstitute) => {
    const gate = {
      lockProposal: jest.fn().mockResolvedValue(req),
      requireAssessor: jest.fn().mockResolvedValue({ bySubstitute }),
      requireAssessment: jest.fn().mockResolvedValue(fullAssessment),
      standsIn: jest.fn().mockResolvedValue(true),
    };
    const audit = { record: jest.fn() };
    const service = new AssessmentService(
      runner,
      gate as never,
      { toPatch: jest.fn().mockResolvedValue({}) } as never,
      { patch: jest.fn() } as never,
      audit as never,
      { of: jest.fn().mockResolvedValue({}) } as never,
    );

    await service.save(sub, 'req-1', { vendorName: 'Miro' });

    expect(gate.requireAssessor).toHaveBeenCalledWith(tx, sub, req);
    const event = (audit.record.mock.calls[0] as [unknown, { after: Record<string, unknown> }])[1];
    if (bySubstitute) expect(event.after.bySubstitute).toBe(true);
    else expect('bySubstitute' in event.after).toBe(false);
  });

  it('AssessmentCompletionService.complete passes tx and records bySubstitute', async () => {
    const gate = {
      lockProposal: jest.fn().mockResolvedValue(req),
      requireAssessor: jest.fn().mockResolvedValue({ bySubstitute: true }),
      requireProposalFacts: jest.fn().mockResolvedValue({
        assessment: fullAssessment,
        proposal: { existingApplicationId: null },
      }),
      namesInternalApplication: jest.fn().mockResolvedValue(false),
      judgeChecklist: jest.fn().mockResolvedValue({ verdict: { policyVersionId: 'pv-1' } }),
      finishStep: jest.fn().mockResolvedValue(true),
      keepChecklist: jest.fn(),
    };
    const audit = { record: jest.fn() };
    const service = new AssessmentCompletionService(
      runner,
      gate as never,
      { setPriced: jest.fn(), findById: jest.fn().mockResolvedValue(req) } as never,
      { complete: jest.fn() } as never,
      audit as never,
      { enterAfterAssessment: jest.fn() } as never,
      { priceCompleted: jest.fn().mockResolvedValue({ amount: null, amountMonths: 1, budgetYear: 2026 }) } as never,
      { fit: jest.fn().mockResolvedValue({ request: { ...req, termMonths: 1 }, termMonthsCleared: false }) } as never,
    );

    await service.complete(sub, 'req-1', { checklist: { policyVersionId: 'pv-1', answers: [] } });

    expect(gate.requireAssessor).toHaveBeenCalledWith(tx, sub, req);
    const event = (audit.record.mock.calls[0] as [unknown, { after: Record<string, unknown> }])[1];
    expect(event.after.bySubstitute).toBe(true);
  });

  it('AssessmentRejectionService.reject passes tx and records bySubstitute', async () => {
    const gate = {
      lockProposal: jest.fn().mockResolvedValue(req),
      requireAssessor: jest.fn().mockResolvedValue({ bySubstitute: true }),
      judgeRefusal: jest.fn().mockResolvedValue({ verdict: {}, reason: 'No' }),
      finishStep: jest.fn().mockResolvedValue(true),
      keepChecklist: jest.fn(),
    };
    const audit = { record: jest.fn() };
    const service = new AssessmentRejectionService(
      runner,
      gate as never,
      {} as never,
      { reject: jest.fn() } as never,
      { setState: jest.fn(), findById: jest.fn().mockResolvedValue(req) } as never,
      audit as never,
      { ended: jest.fn() } as never,
    );

    await service.reject(sub, 'req-1', {
      kind: 'NOT_ELIGIBLE',
      checklist: { policyVersionId: 'pv-1', answers: [] },
    } as never);

    expect(gate.requireAssessor).toHaveBeenCalledWith(tx, sub, req);
    const event = (audit.record.mock.calls[0] as [unknown, { after: Record<string, unknown> }])[1];
    expect(event.after.bySubstitute).toBe(true);
  });

  it('InternalRegistrationService.register passes tx and records bySubstitute', async () => {
    const gate = {
      requireAssessor: jest.fn().mockResolvedValue({ bySubstitute: true }),
      requireProposalFacts: jest.fn().mockResolvedValue({
        assessment: { classification: 'INTERNAL', dataSensitivity: 'LOW' },
        proposal: { existingApplicationId: null, softwareName: 'InternalTool' },
      }),
      finishStep: jest.fn().mockResolvedValue(true),
    };
    const audit = { record: jest.fn() };
    const service = new InternalRegistrationService(
      {} as never,
      runner,
      {
        lockById: jest.fn().mockResolvedValue(req),
        setRegistered: jest.fn(),
        findById: jest.fn().mockResolvedValue(req),
      } as never,
      { patch: jest.fn(), complete: jest.fn() } as never,
      gate as never,
      {
        registerInternalSoftware: jest
          .fn()
          .mockResolvedValue({ status: 'REGISTERED', applicationId: 'app-1', planId: 'plan-1' }),
      } as never,
      { registrationPricing: jest.fn().mockResolvedValue({ quote: null, pricing: {} }) } as never,
      audit as never,
    );

    await service.register(sub, 'req-1', {});

    expect(gate.requireAssessor).toHaveBeenCalledWith(tx, sub, req);
    const event = (audit.record.mock.calls[0] as [unknown, { after: Record<string, unknown> }])[1];
    expect(event.after.bySubstitute).toBe(true);
  });

  it('AssessmentReturnService.send passes tx and records bySubstitute', async () => {
    const gate = {
      lockProposal: jest.fn().mockResolvedValue(req),
      requireAssessor: jest.fn().mockResolvedValue({ bySubstitute: true }),
      judgeRefusal: jest.fn().mockResolvedValue({ verdict: {}, reason: 'Missing info' }),
      finishStep: jest.fn().mockResolvedValue(true),
      keepChecklist: jest.fn(),
    };
    const audit = { record: jest.fn() };
    const service = new AssessmentReturnService(
      runner,
      gate as never,
      { setState: jest.fn(), findById: jest.fn().mockResolvedValue(req) } as never,
      audit as never,
    );

    await service.send(sub, 'req-1', { checklist: { policyVersionId: 'pv-1', answers: [] } } as never);

    expect(gate.requireAssessor).toHaveBeenCalledWith(tx, sub, req);
    const event = (audit.record.mock.calls[0] as [unknown, { after: Record<string, unknown> }])[1];
    expect(event.after.bySubstitute).toBe(true);
  });
});

describe('assessment HTTP error mapping', () => {
  it('maps ASSESSMENT_NOT_IN_CHARGE to 403 ACCESS_REQUEST.ASSESSMENT_NOT_IN_CHARGE', () => {
    const mapped = toAssessmentApiException(new AssessmentRefusedError('ASSESSMENT_NOT_IN_CHARGE'));

    expect(mapped).toBeInstanceOf(ApiException);
    const exception = mapped as ApiException;
    expect(exception.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(exception.getResponse()).toEqual({
      code: 'ACCESS_REQUEST.ASSESSMENT_NOT_IN_CHARGE',
      message: 'Only the acting IT Admin of the requester’s department may assess this request.',
    });
  });

  it('exposes ASSESSMENT_NOT_IN_CHARGE in ASSESSMENT_ERROR_EXAMPLES', () => {
    expect(ASSESSMENT_ERROR_EXAMPLES.ASSESSMENT_NOT_IN_CHARGE).toEqual({
      code: 'ACCESS_REQUEST.ASSESSMENT_NOT_IN_CHARGE',
      message: 'Only the acting IT Admin of the requester’s department may assess this request.',
    });
  });
});
