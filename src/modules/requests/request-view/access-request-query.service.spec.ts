import { Test } from '@nestjs/testing';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import { RequestReplyRepo } from '../request-reply/request-reply.repo';
import { SpendStatusService } from '../spend/spend-status.service';
import { AccessRequestQueryService } from './access-request-query.service';
import { PricingViewService } from './pricing-view.service';
import { RequestCostViewService } from './request-cost-view.service';
import { RequestReadAccessService } from './request-read-access.service';

const TS = new Date('2026-06-01T08:00:00.000Z');
const REPLY_TS = new Date('2026-06-02T09:00:00.000Z');

function makeRecord(overrides: Partial<AccessRequestRecord> = {}): AccessRequestRecord {
  return {
    id: 'req-1',
    organizationId: 'org-1',
    type: 'GRANT',
    branch: 'PAID_IN_CATALOG',
    state: 'PENDING',
    routing: { mode: 'VIA_HEAD', oneStepReason: null },
    planId: 'plan-1',
    requesterEmployeeId: 'emp-1',
    departmentId: 'dept-1',
    costCenterId: 'cc-1',
    businessReason: 'Project work',
    termMonths: 3,
    pricing: {
      status: 'PRICED',
      missingReason: null,
      kind: 'RECURRING',
      budgetYear: 2026,
      expectedEndDate: null,
      amountMonths: 3,
      amount: { amountMinor: 1_500_000n, currency: 'VND' },
      unitPrice: { amountMinor: 500_000n, currency: 'VND' },
      monthlyPriceMinor: 500_000n,
      billingCycle: 'MONTHLY',
      nextYearAmount: null,
    },
    planLine: null,
    offPlan: false,
    expectedEndDate: null,
    policy: {
      version: 2,
      branch: 'PAID_IN_CATALOG',
      chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
      slaWorkingDays: 3,
    },
    submittedAt: TS,
    ticket: null,
    withdrawal: null,
    cancellation: null,
    serviceAccount: null,
    renewal: null,
    beneficiaryEmployeeIds: ['emp-1'],
    needStep: {
      id: 'step-1',
      state: 'PENDING',
      assigneeEmployeeId: 'head-1',
      routingRow: 1,
      waitingReason: null,
      samePersonAsSpend: false,
      slaWorkingDays: 3,
      createdAt: TS,
      assignedAt: TS,
      decidedAt: null,
    },
    needSteps: [],
    needDecision: null,
    lines: [],
    ...overrides,
  };
}

describe('AccessRequestQueryService', () => {
  const actor = { employeeId: 'head-1', roles: ['MANAGER'] } as unknown as AuthenticatedPrincipal;
  const repo = { findById: jest.fn() };
  const organizationReads = {
    getEmployees: jest.fn(),
    getDepartmentBrief: jest.fn(),
    costCentersByIds: jest.fn(),
  };
  const catalog = { getPlanSummaries: jest.fn() };
  const pricing = {
    vendorChargeUntilRenewalOf: jest.fn(),
    view: jest.fn(),
    moneyView: jest.fn(),
  };
  const costs = { of: jest.fn() };
  const assessments = { findProposal: jest.fn() };
  const spendStatus = { of: jest.fn() };
  const readAccess = { accessOf: jest.fn() };
  const replies = { latestOf: jest.fn() };

  let service: AccessRequestQueryService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AccessRequestQueryService,
        { provide: AccessRequestRepo, useValue: repo },
        { provide: OrganizationReadApi, useValue: organizationReads },
        { provide: CatalogApi, useValue: catalog },
        { provide: PricingViewService, useValue: pricing },
        { provide: RequestCostViewService, useValue: costs },
        { provide: AssessmentReadRepo, useValue: assessments },
        { provide: SpendStatusService, useValue: spendStatus },
        { provide: RequestReadAccessService, useValue: readAccess },
        { provide: RequestReplyRepo, useValue: replies },
      ],
    }).compile();

    service = moduleRef.get(AccessRequestQueryService);

    organizationReads.getEmployees.mockResolvedValue([
      { id: 'emp-1', employeeCode: 'E1', fullName: 'Requester' },
      { id: 'head-1', employeeCode: 'H1', fullName: 'Head' },
    ]);
    organizationReads.getDepartmentBrief.mockResolvedValue({ id: 'dept-1', code: 'P-DES', name: 'Design' });
    organizationReads.costCentersByIds.mockResolvedValue([{ id: 'cc-1', code: 'CC-DES' }]);
    catalog.getPlanSummaries.mockResolvedValue([
      { planId: 'plan-1', planName: 'Miro Business', applicationId: 'app-1', applicationName: 'Miro' },
    ]);
    spendStatus.of.mockResolvedValue(null);
    pricing.vendorChargeUntilRenewalOf.mockResolvedValue(undefined);
    pricing.view.mockResolvedValue({ status: 'PRICED' });
    costs.of.mockResolvedValue(null);
  });

  it('returns ticketRef from record.ticket and latestReply from RequestReplyRepo.latestOf without tx', async () => {
    const ticket = { id: 'ticket-1', position: 2, itemCount: 3 };
    const latestReply = {
      kind: 'REQUESTER_RESUBMISSION' as const,
      note: 'dùng cho dự án X, 3 tháng',
      author: { id: 'emp-1', name: 'Requester' },
      createdAt: REPLY_TS,
    };
    const record = makeRecord({ ticket });
    repo.findById.mockResolvedValue(record);
    readAccess.accessOf.mockResolvedValue({ read: true, onlyLineOf: null });
    replies.latestOf.mockResolvedValue(latestReply);

    const result = await service.get(actor, 'req-1');

    expect(replies.latestOf).toHaveBeenCalledTimes(1);
    expect(replies.latestOf).toHaveBeenCalledWith('req-1');
    expect(result.ticketRef).toEqual(ticket);
    expect(result.latestReply).toEqual(latestReply);
  });

  it('returns ticketRef: null and latestReply: null for a standalone request without replies', async () => {
    const record = makeRecord({ ticket: null });
    repo.findById.mockResolvedValue(record);
    readAccess.accessOf.mockResolvedValue({ read: true, onlyLineOf: null });
    replies.latestOf.mockResolvedValue(null);

    const result = await service.get(actor, 'req-1');

    expect(result.ticketRef).toBeNull();
    expect(result.latestReply).toBeNull();
  });

  it('throws AccessRequestNotFoundError when caller has no read access', async () => {
    repo.findById.mockResolvedValue(makeRecord());
    readAccess.accessOf.mockResolvedValue({ read: false });

    await expect(service.get(actor, 'req-1')).rejects.toBeInstanceOf(AccessRequestNotFoundError);
    expect(replies.latestOf).not.toHaveBeenCalled();
  });
});
