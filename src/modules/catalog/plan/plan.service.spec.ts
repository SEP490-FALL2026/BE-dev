import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { FinanceApi } from '../../finance/public/finance.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { ApplicationFactsService } from '../catalog-entry/application-facts.service';
import {
  PlanNotFoundError,
  PlanReferencePriceNotApplicableError,
  PlanReferencePriceNotPositiveError,
  PlanReferencePriceNotVndError,
} from './plan.errors';
import type { PlanRepo } from './plan.repo';
import { PlanService } from './plan.service';
import type { PlanWorkspaceService } from './plan-workspace.service';

const ACTOR = { appUserId: 'it-admin', roles: ['IT_ADMIN'], sessionId: 'session' } as unknown as AuthenticatedPrincipal;
const TX = {} as DbTx;

function setup(current: { provisioningType: string } | null) {
  const parseMoney = jest.fn((price: { amount: string; currency: string }) =>
    Promise.resolve({ amountMinor: BigInt(price.amount), currency: price.currency }),
  );
  const service = new PlanService(
    {
      lock: jest.fn().mockResolvedValue(current && { ...current, applicationKind: 'SAAS', referencePrice: null }),
    } as unknown as PlanRepo,
    {} as PlanWorkspaceService,
    {
      lockShared: jest.fn().mockResolvedValue({ id: 'app', kind: 'SAAS', status: 'ACTIVE' }),
    } as unknown as ApplicationFactsService,
    { getOrganization: jest.fn().mockResolvedValue({ id: 'org' }) } as unknown as OrganizationReadApi,
    { parseMoney } as unknown as FinanceApi,
    {} as AuditApi,
    { run: (work: (tx: DbTx) => unknown) => work(TX) } as unknown as TransactionRunner,
  );

  return { service, parseMoney };
}

const dollars = { amount: '20', currency: 'USD' };

describe('QĐ-113a the reference price of a plan is judged kind first, then currency, then amount', () => {
  it('answers a missing plan with not found, not with a currency error', async () => {
    const { service, parseMoney } = setup(null);

    await expect(service.update(ACTOR, 'plan', { referencePrice: dollars })).rejects.toBeInstanceOf(PlanNotFoundError);
    expect(parseMoney).not.toHaveBeenCalled();
  });

  it('answers a K5 plan given a price in dollars with not applicable, not with a currency error', async () => {
    const { service } = setup({ provisioningType: 'K5' });

    await expect(service.update(ACTOR, 'plan', { referencePrice: dollars })).rejects.toBeInstanceOf(
      PlanReferencePriceNotApplicableError,
    );
    await expect(
      service.declare(ACTOR, {
        applicationId: 'app',
        name: 'Plan',
        provisioningType: 'K5',
        referencePrice: dollars,
      }),
    ).rejects.toBeInstanceOf(PlanReferencePriceNotApplicableError);
  });

  it('refuses a K2 plan given a price in dollars as not in dong', async () => {
    const { service } = setup({ provisioningType: 'K2' });

    await expect(service.update(ACTOR, 'plan', { referencePrice: dollars })).rejects.toBeInstanceOf(
      PlanReferencePriceNotVndError,
    );
  });

  it.each(['0', '-1'])('refuses a price of %s in dong: zero or less is no price', async (amount) => {
    const { service } = setup({ provisioningType: 'K2' });

    await expect(service.update(ACTOR, 'plan', { referencePrice: { amount, currency: 'VND' } })).rejects.toBeInstanceOf(
      PlanReferencePriceNotPositiveError,
    );
  });
});
