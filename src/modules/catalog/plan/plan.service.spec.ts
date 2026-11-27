import { Prisma } from '../../../generated/prisma/client';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { FinanceApi } from '../../finance/public/finance.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { ApplicationFactsService } from '../catalog-entry/application-facts.service';
import {
  PlanInUseBlocksChangeError,
  PlanNotFoundError,
  PlanReferenceCommitmentNotApplicableError,
  PlanReferencePriceNotApplicableError,
  PlanReferencePriceNotPositiveError,
  PlanReferencePriceNotVndError,
} from './plan.errors';
import { toPlanApiException } from './plan.http-errors';
import type { PlanRepo } from './plan.repo';
import { PlanService } from './plan.service';
import type { PlanWorkspaceService } from './plan-workspace.service';

const ACTOR = { appUserId: 'it-admin', roles: ['IT_ADMIN'], sessionId: 'session' } as unknown as AuthenticatedPrincipal;
const TX = {} as DbTx;

function setup(
  current: {
    provisioningType: string;
    referenceCommitmentMonths?: 1 | 12 | null;
    applicationKind?: 'SAAS' | 'INTERNAL';
  } | null,
  applicationKind: 'SAAS' | 'INTERNAL' = 'SAAS',
) {
  const parseMoney = jest.fn((price: { amount: string; currency: string }) =>
    Promise.resolve({ amountMinor: BigInt(price.amount), currency: price.currency }),
  );
  const insert = jest.fn((_tx: DbTx, input: Record<string, unknown>) =>
    Promise.resolve({
      id: 'plan-1',
      applicationName: 'App',
      applicationLogoUrl: null,
      applicationKind,
      createdAt: new Date('2026-11-25T00:00:00.000Z'),
      updatedAt: new Date('2026-11-25T00:00:00.000Z'),
      ...input,
    }),
  );
  const update = jest.fn((_tx: DbTx, id: string, changes: Record<string, unknown>) =>
    Promise.resolve({
      id,
      applicationId: 'app',
      applicationName: 'App',
      applicationLogoUrl: null,
      applicationKind: current?.applicationKind ?? applicationKind,
      name: 'Plan',
      provisioningType: current?.provisioningType ?? 'K2',
      keyBinding: null,
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
      revocationNote: null,
      dataLossOnRemoval: false,
      sharingPolicy: null,
      hasAdminConsole: false,
      referencePrice: null,
      referenceCommitmentMonths: current?.referenceCommitmentMonths ?? null,
      createdAt: new Date('2026-11-25T00:00:00.000Z'),
      updatedAt: new Date('2026-11-25T00:00:01.000Z'),
      ...changes,
    }),
  );
  const service = new PlanService(
    {
      lock: jest.fn().mockResolvedValue(
        current && {
          id: 'plan-1',
          applicationId: 'app',
          applicationName: 'App',
          applicationLogoUrl: null,
          applicationKind: current.applicationKind ?? applicationKind,
          name: 'Plan',
          keyBinding: null,
          pricingModel: current.provisioningType === 'K1' || current.provisioningType === 'K2' ? 'PER_SEAT' : null,
          controlLevel: current.provisioningType === 'K5' ? null : 'FULL',
          revocationNote: null,
          dataLossOnRemoval: false,
          sharingPolicy: null,
          hasAdminConsole: false,
          referencePrice: null,
          referenceCommitmentMonths: null,
          ...current,
        },
      ),
      findProfile: jest.fn().mockResolvedValue(null),
      insert,
      update,
    } as unknown as PlanRepo,
    {} as PlanWorkspaceService,
    {
      lockShared: jest.fn().mockResolvedValue({ id: 'app', kind: applicationKind, status: 'ACTIVE' }),
    } as unknown as ApplicationFactsService,
    { getOrganization: jest.fn().mockResolvedValue({ id: 'org' }) } as unknown as OrganizationReadApi,
    { parseMoney } as unknown as FinanceApi,
    { record: jest.fn() } as unknown as AuditApi,
    { run: (work: (tx: DbTx) => unknown) => work(TX) } as unknown as TransactionRunner,
  );

  return { service, parseMoney, insert, update };
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

describe('W3-02: referenceCommitmentMonths on plan declare & update', () => {
  it.each(['K4', 'K5'] as const)(
    'refuses referenceCommitmentMonths on a %s plan with 422 PLAN.REFERENCE_COMMITMENT_NOT_APPLICABLE',
    async (kind) => {
      const appKind = kind === 'K5' ? 'INTERNAL' : 'SAAS';
      const { service } = setup({ provisioningType: kind, applicationKind: appKind }, appKind);

      const declareErr = await service
        .declare(ACTOR, {
          applicationId: 'app',
          name: 'Plan',
          provisioningType: kind,
          controlLevel: kind === 'K5' ? undefined : 'FULL',
          referenceCommitmentMonths: 12,
        })
        .catch((e: unknown) => e);
      expect(declareErr).toBeInstanceOf(PlanReferenceCommitmentNotApplicableError);
      const httpEx = toPlanApiException(declareErr);
      expect(httpEx).toMatchObject({ status: 422, response: { code: 'PLAN.REFERENCE_COMMITMENT_NOT_APPLICABLE' } });

      await expect(service.update(ACTOR, 'plan', { referenceCommitmentMonths: 1 })).rejects.toBeInstanceOf(
        PlanReferenceCommitmentNotApplicableError,
      );
    },
  );

  it('stores referenceCommitmentMonths on K1/K2 declare and clears it with null on update', async () => {
    const { service, insert, update } = setup({ provisioningType: 'K2', referenceCommitmentMonths: 12 });

    await service.declare(ACTOR, {
      applicationId: 'app',
      name: 'Team',
      provisioningType: 'K2',
      controlLevel: 'FULL',
      referenceCommitmentMonths: 12,
    });
    expect(insert).toHaveBeenCalledWith(TX, expect.objectContaining({ referenceCommitmentMonths: 12 }));

    await service.update(ACTOR, 'plan-1', { referenceCommitmentMonths: null });
    expect(update).toHaveBeenCalledWith(TX, 'plan-1', expect.objectContaining({ referenceCommitmentMonths: null }));
  });

  it('maps plan_change_blocked: LICENSE_LOTS to PlanInUseBlocksChangeError (409)', async () => {
    const { service, update } = setup({ provisioningType: 'K4' });
    update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('check failed', {
        code: 'P2004',
        clientVersion: 'test',
        meta: {
          driverAdapterError: {
            cause: { originalCode: '23514', originalMessage: 'plan_change_blocked: LICENSE_LOTS' },
          },
        },
      }),
    );

    const err = await service
      .update(ACTOR, 'plan-1', { provisioningType: 'K1', pricingModel: 'PER_SEAT', controlLevel: 'FULL' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlanInUseBlocksChangeError);
    expect(toPlanApiException(err)).toMatchObject({
      status: 409,
      response: { code: 'PLAN.IN_USE_BLOCKS_CHANGE', details: { reason: 'LICENSE_LOTS' } },
    });
  });
});
