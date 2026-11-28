import type { TermRefusal } from '../../../core/term-limit';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { EmployeeNotStartedError, FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import {
  AccessRequestAlreadyHoldsAccessError,
  AccessRequestApplicationRetiredError,
  AccessRequestNoDepartmentError,
  AccessRequestNotPriceableError,
  AccessRequestOpenLimitReachedError,
  AccessRequestOpenRequestExistsError,
  AccessRequestPlanBoundToDeviceError,
  AccessRequestPlanNotFoundError,
  AccessRequestSuperAdminCannotRequestError,
  AccessRequestTermRefusedError,
} from '../access-request/access-request.errors';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { AccessRequestService } from './access-request.service';

const actor: AuthenticatedPrincipal = {
  employeeId: 'employee',
  subject: 'account',
  appUserId: 'account',
  sessionId: 'session',
  directRoles: ['EMPLOYEE'],
  roles: ['EMPLOYEE'],
};
const body = { planId: 'plan', businessReason: 'Design work', termMonths: 2 };
const tx = {} as DbTx;
const termRefusals: TermRefusal[] = [
  'TERM_REQUIRED',
  'TERM_MONTHS_OUT_OF_RANGE',
  'TERM_NOT_ASKED',
  'TERM_LONG_TERM_NOT_ALLOWED',
  'TERM_CONTRACT_ENDED',
  'K1_ANNUAL_TERM_FIXED',
  'K1_ANNUAL_CONTRACT_TOO_SHORT',
];

function build() {
  const assessed = {
    unit: { departmentId: 'dept', costCenter: { id: 'cc' } },
    policy: { branch: 'PAID_IN_CATALOG', version: 1, slaWorkingDays: 2, chain: ['NEED', 'SPEND_APPROVAL'] },
    pricing: { status: 'COMPUTED', amount: { amountMinor: 200n, currency: 'VND' }, budgetYear: 2026 },
    routing: { decision: { outcome: 'ASSIGNED', row: 1, role: 'MANAGER', assigneeEmployeeId: 'head' } },
    term: { start: '2026-06-01', months: 2, end: '2026-07-31', cutAt: null, startedMonths: 2 },
    target: { provisioningType: 'K2' },
    termRefusal: null,
    contractEndDate: null,
    heldAccess: null,
    graceHold: null,
  };
  const stored = { id: 'request' } as unknown as AccessRequestRecord;
  const repo = {
    insert: jest.fn().mockResolvedValue({ id: stored.id, needStepId: 'step' }),
    findById: jest.fn().mockResolvedValue(stored),
  };
  const routing = { start: jest.fn() };
  const runner = { run: (work: (client: DbTx) => unknown) => work(tx) };
  const sender = { lockEligible: jest.fn().mockResolvedValue({ organizationId: 'organization' }) };
  const assessment = {
    settings: jest.fn().mockResolvedValue({ slaWorkingDays: 2 }),
    assess: jest.fn().mockResolvedValue(assessed),
    assessParty: jest.fn().mockResolvedValue({ today: '2026-06-01', unit: assessed.unit }),
  };
  const audit = { record: jest.fn() };
  const limits = { settings: jest.fn().mockResolvedValue({}), lock: jest.fn(), requireForOne: jest.fn() };
  const service = new AccessRequestService(
    routing as never,
    runner as never,
    repo as never,
    sender as never,
    assessment as never,
    audit as never,
    {} as never,
    limits as never,
  );
  return { service, assessed, assessment, limits, sender, repo, audit, routing, stored };
}

describe('AccessRequestService single submission', () => {
  it('refuses a Super Admin before reading settings or locking the sender', async () => {
    const f = build();
    await expect(f.service.submit({ ...actor, roles: ['SUPER_ADMIN'] }, body)).rejects.toBeInstanceOf(
      AccessRequestSuperAdminCannotRequestError,
    );
    expect(f.assessment.settings).not.toHaveBeenCalled();
    expect(f.sender.lockEligible).not.toHaveBeenCalled();
  });

  it('refuses a held seat before the limits check', async () => {
    const f = build();
    f.assessment.assess.mockResolvedValue({ ...f.assessed, heldAccess: { assignmentId: 'seat' } });
    await expect(f.service.submit(actor, body)).rejects.toMatchObject({ name: 'AccessRequestAlreadyHoldsAccessError' });
    expect(f.limits.requireForOne).not.toHaveBeenCalled();
    expect(f.repo.insert).not.toHaveBeenCalled();
  });

  it.each(termRefusals)('surfaces %s without writing a request', async (reason) => {
    const f = build();
    f.assessment.assess.mockResolvedValue({ ...f.assessed, termRefusal: reason });
    await expect(f.service.submit(actor, body)).rejects.toMatchObject({
      name: 'AccessRequestTermRefusedError',
      reason,
    });
    expect(f.repo.insert).not.toHaveBeenCalled();
  });

  it.each([new AccessRequestOpenRequestExistsError('open'), new AccessRequestOpenLimitReachedError(10, '2026-06-08')])(
    'preserves the limits refusal $name',
    async (error) => {
      const f = build();
      f.limits.requireForOne.mockRejectedValue(error);
      await expect(f.service.submit(actor, body)).rejects.toBe(error);
      expect(f.repo.insert).not.toHaveBeenCalled();
    },
  );

  it.each([
    new AccessRequestPlanBoundToDeviceError(),
    new AccessRequestNoDepartmentError(),
    new EmployeeNotStartedError(),
    new FinanceSetupIncompleteError('dept'),
  ])('preserves the assessment refusal $name', async (error) => {
    const f = build();
    f.assessment.assess.mockRejectedValue(error);
    await expect(f.service.submit(actor, body)).rejects.toBe(error);
    expect(f.limits.requireForOne).not.toHaveBeenCalled();
    expect(f.repo.insert).not.toHaveBeenCalled();
  });

  it('locks the sender, assesses with a department lock, and checks limits before writing and routing', async () => {
    const f = build();
    await expect(f.service.submit(actor, body)).resolves.toBe(f.stored);
    expect(f.assessment.assess).toHaveBeenCalledWith(tx, expect.objectContaining({ lockDepartment: true }));
    const calls = [
      f.sender.lockEligible,
      f.limits.lock,
      f.assessment.assess,
      f.limits.requireForOne,
      f.repo.insert,
      f.audit.record,
      f.routing.start,
    ].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(f.limits.requireForOne).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([...calls].sort((first, second) => first - second));
    expect(f.audit.record).toHaveBeenCalledTimes(2);
    expect(f.routing.start).toHaveBeenCalledWith(tx, actor, f.stored.id, expect.any(Date));
  });

  it('writes an internal K5 request without a Cost Center', async () => {
    const f = build();
    f.assessment.assess.mockResolvedValue({
      ...f.assessed,
      unit: { departmentId: 'dept', costCenter: null },
      target: { provisioningType: 'K5' },
      policy: { ...f.assessed.policy, branch: 'INTERNAL_FREE', chain: ['NEED'] },
      pricing: { status: 'NOT_APPLICABLE' },
    });
    await expect(f.service.submit(actor, body)).resolves.toBe(f.stored);
    expect(f.assessment.assessParty).not.toHaveBeenCalled();
    expect(f.repo.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ branch: 'INTERNAL_FREE', costCenterId: null }),
    );
  });
});

describe('AccessRequestService ticket item check', () => {
  async function buildTicket() {
    const f = build();
    const party = await f.service.checkPartyWithin(tx, actor, { slaWorkingDays: 2 }, {});
    return { ...f, party };
  }

  it('reuses the department lock and leaves limit checks to the ticket', async () => {
    const f = await buildTicket();
    await expect(f.service.checkItemWithin(tx, actor, f.party, body, {})).resolves.toMatchObject({
      ok: true,
      facts: { body, assessed: f.assessed },
    });
    expect(f.assessment.assessParty).toHaveBeenCalledWith(tx, expect.objectContaining({ lockDepartment: true }));
    expect(f.assessment.assess).toHaveBeenCalledWith(tx, expect.objectContaining({ lockDepartment: false }));
    expect(f.limits.requireForOne).not.toHaveBeenCalled();
  });

  it.each([
    new AccessRequestAlreadyHoldsAccessError({ assignmentId: 'seat', effectiveFrom: '2026-06-01', validUntil: null }),
    new AccessRequestApplicationRetiredError(),
    new AccessRequestNotPriceableError(),
    new AccessRequestPlanBoundToDeviceError(),
    new AccessRequestPlanNotFoundError(),
    new AccessRequestTermRefusedError('TERM_REQUIRED'),
  ])('returns $name as an item refusal', async (error) => {
    const f = await buildTicket();
    f.assessment.assess.mockRejectedValue(error);

    await expect(f.service.checkItemWithin(tx, actor, f.party, body, {})).resolves.toEqual({ ok: false, error });
    expect(f.limits.requireForOne).not.toHaveBeenCalled();
  });

  it.each([new AccessRequestNoDepartmentError(), new Error('unexpected assessment failure')])(
    'propagates $message outside the item check',
    async (error) => {
      const f = await buildTicket();
      f.assessment.assess.mockRejectedValue(error);

      await expect(f.service.checkItemWithin(tx, actor, f.party, body, {})).rejects.toBe(error);
      expect(f.limits.requireForOne).not.toHaveBeenCalled();
    },
  );
});
