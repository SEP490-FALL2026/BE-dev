import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { AuditEventInput } from '../../audit/public/audit.types';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import {
  AccessRequestPlanBoundToDeviceError,
  AccessRequestPlanNotFoundError,
} from '../access-request/access-request.errors';
import { CatalogLinkRefusedError } from '../assessment/assessment.errors';
import type { AssessmentTermFitService } from '../assessment/assessment-term-fit.service';
import { CatalogLinkService } from './catalog-link.service';
import type { CatalogLinkDepartmentListService } from './catalog-link-department-list.service';

const ACTOR = { appUserId: 'it-admin', roles: ['IT_ADMIN'], sessionId: 'session' } as unknown as AuthenticatedPrincipal;
const TX = {} as DbTx;
const LINKABLE = {
  id: 'request',
  organizationId: 'org',
  branch: 'NEW_SOFTWARE',
  state: 'AWAITING_EXECUTION',
  planId: null,
  departmentId: 'dept',
};
const QUOTE = { unitPrice: { amountMinor: 3_000_000n, currency: 'VND' }, billingCycle: 'QUARTERLY' };

function setup(request: object, adopted = true) {
  const adoptPlanQuotePrice = jest.fn().mockResolvedValue(adopted);
  const setPlan = jest.fn();
  const record = jest.fn();
  const service = new CatalogLinkService(
    { run: (work: (tx: DbTx) => unknown) => work(TX) } as unknown as TransactionRunner,
    {
      lockById: jest.fn().mockResolvedValue(request),
      setPlan,
      findById: jest.fn().mockResolvedValue({ ...request, planId: 'plan' }),
    } as unknown as AccessRequestRepo,
    {
      findAssessment: jest.fn().mockResolvedValue({ quote: QUOTE }),
      findProposal: jest.fn().mockResolvedValue(null),
    } as unknown as AssessmentReadRepo,
    {
      findPlanSeatTargets: jest
        .fn()
        .mockResolvedValue([
          { planId: 'plan', applicationId: 'app', applicationStatus: 'ACTIVE', provisioningType: 'K2' },
        ]),
      getPlanResponsibleItAdminId: jest.fn().mockResolvedValue(null),
      adoptPlanQuotePrice,
    } as unknown as CatalogApi,
    { record } as unknown as AuditApi,
    {} as unknown as CatalogLinkDepartmentListService,
    {
      fitToLinkedPlan: jest.fn().mockResolvedValue({ request: { termMonths: 6 }, termMonthsCleared: false }),
    } as unknown as AssessmentTermFitService,
  );

  return { service, adoptPlanQuotePrice, setPlan, record };
}

describe('QĐ-113a linking a case B request to a plan', () => {
  it.each([true, false])(
    'offers the monthly price of the quote and records whether it was adopted (%s)',
    async (adopted) => {
      const { service, adoptPlanQuotePrice, record } = setup(LINKABLE, adopted);

      await service.link(ACTOR, 'request', { planId: 'plan' });

      // A quarterly price of 3 000 000 is 1 000 000 a month.
      expect(adoptPlanQuotePrice).toHaveBeenCalledWith(ACTOR, 'plan', { amountMinor: 1_000_000n, currency: 'VND' }, TX);
      expect((record.mock.calls[0] as [DbTx, AuditEventInput])[1]).toMatchObject({
        action: 'ACCESS_REQUEST.CATALOG_LINKED',
        after: { planId: 'plan', referencePriceAdopted: adopted },
      });
    },
  );

  it('refuses a second link of a request that already has its plan, and offers no price', async () => {
    const { service, adoptPlanQuotePrice, setPlan } = setup({ ...LINKABLE, planId: 'plan' });

    await expect(service.link(ACTOR, 'request', { planId: 'other' })).rejects.toBeInstanceOf(CatalogLinkRefusedError);
    expect(adoptPlanQuotePrice).not.toHaveBeenCalled();
    expect(setPlan).not.toHaveBeenCalled();
  });

  it.each(['DEVICE_KEY', 'DEVICE_BUNDLED'] as const)(
    'refuses linking case B to a %s plan with AccessRequestPlanBoundToDeviceError (W2-18)',
    async (keyBinding) => {
      const { service, adoptPlanQuotePrice, setPlan, catalog } = setupWithCatalog(LINKABLE, keyBinding);

      await expect(service.link(ACTOR, 'request', { planId: 'plan' })).rejects.toBeInstanceOf(
        AccessRequestPlanBoundToDeviceError,
      );
      expect(catalog.findPlanSeatTargets).toHaveBeenCalledWith(['plan'], TX);
      expect(setPlan).not.toHaveBeenCalled();
      expect(adoptPlanQuotePrice).not.toHaveBeenCalled();
    },
  );
});

function setupWithCatalog(request: object, keyBinding: 'ACCOUNT' | 'DEVICE_KEY' | 'DEVICE_BUNDLED') {
  const adoptPlanQuotePrice = jest.fn();
  const setPlan = jest.fn();
  const findPlanSeatTargets = jest
    .fn()
    .mockResolvedValue([
      { planId: 'plan', applicationId: 'app', applicationStatus: 'APPROVED', provisioningType: 'K4', keyBinding },
    ]);
  const service = new CatalogLinkService(
    { run: (work: (tx: DbTx) => unknown) => work(TX) } as unknown as TransactionRunner,
    {
      lockById: jest.fn().mockResolvedValue(request),
      setPlan,
      findById: jest.fn().mockResolvedValue(request),
    } as unknown as AccessRequestRepo,
    { findAssessment: jest.fn(), findProposal: jest.fn().mockResolvedValue(null) } as unknown as AssessmentReadRepo,
    { findPlanSeatTargets, adoptPlanQuotePrice } as unknown as CatalogApi,
    { record: jest.fn() } as unknown as AuditApi,
    {} as unknown as CatalogLinkDepartmentListService,
    {} as unknown as AssessmentTermFitService,
  );

  expect(AccessRequestPlanNotFoundError).toBeDefined();

  return { service, adoptPlanQuotePrice, setPlan, catalog: { findPlanSeatTargets } };
}
