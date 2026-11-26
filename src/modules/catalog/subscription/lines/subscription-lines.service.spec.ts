import { HttpStatus } from '@nestjs/common';
import type { DbTx, TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { LockedPlan, PlanFactsService } from '../../plan/plan-facts.service';
import type { SubscriptionPeriodLinesService } from '../../subscription-line/subscription-period-lines.service';
import type { SubscriptionPoolService } from '../pool/subscription-pool.service';
import { SubscriptionStillDraftError } from '../subscription.errors';
import { toSubscriptionApiException } from '../subscription.http-errors';
import type { SubscriptionPricingService } from '../subscription-pricing.service';
import type { SubscriptionRepo } from '../subscription.repo';
import { SubscriptionMultiLineService } from './subscription-lines.service';

const actor = {
  appUserId: 'user-1',
  employeeId: 'emp-khoa',
  roles: ['IT_ADMIN'],
  sessionId: 'sess-1',
} as unknown as AuthenticatedPrincipal;

const planA: LockedPlan = {
  id: 'plan-a',
  name: 'Figma Design',
  applicationId: 'app-1',
  applicationName: 'Figma',
  applicationKind: 'SAAS',
  applicationStatus: 'APPROVED',
  pricingModel: 'PER_SEAT',
  provisioningType: 'K2',
  keyBinding: null,
  sharingPolicy: null,
  hasAdminConsole: true,
  referenceCommitmentMonths: null,
};

const planB: LockedPlan = { ...planA, id: 'plan-b', name: 'FigJam' };

describe('SubscriptionMultiLineService (F-3)', () => {
  it('F-3: refuses declaring a multi-line DRAFT with 422 SUBSCRIPTION.STILL_DRAFT', async () => {
    const tx = {} as DbTx;
    const runner = { run: (work: (t: DbTx) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
    const insert = jest.fn();
    const createForPeriod = jest.fn();
    const periodLines = {
      requireOrganizationId: jest.fn().mockResolvedValue('org-1'),
      hasLiveLine: jest.fn().mockResolvedValue(null),
      hasLines: jest.fn().mockResolvedValue(false),
      hasPricedLines: jest.fn().mockResolvedValue(false),
      createForPeriod,
      activatePeriod: jest.fn(),
    } as unknown as SubscriptionPeriodLinesService;

    const multiLine = new SubscriptionMultiLineService(
      { insert } as unknown as SubscriptionRepo,
      {
        lookups: jest.fn().mockResolvedValue([planA, planB]),
        vendorIdsOf: jest.fn().mockResolvedValue(
          new Map([
            ['plan-a', 'ven-1'],
            ['plan-b', 'ven-1'],
          ]),
        ),
        lockExclusive: jest.fn((_tx: DbTx, id: string) => Promise.resolve(id === 'plan-a' ? planA : planB)),
      } as unknown as PlanFactsService,
      {
        read: jest.fn((m: { amount: string }) => Promise.resolve({ amountMinor: BigInt(m.amount), currency: 'VND' })),
        readOriginal: jest.fn(),
        priceToday: jest.fn().mockResolvedValue({ unitPrice: null, priceSnapshot: null }),
      } as unknown as SubscriptionPricingService,
      periodLines,
      {
        workspaceFor: jest.fn().mockResolvedValue('ws-1'),
        assertNoLiveDuplicate: jest.fn(),
        responsibleOfDeclaration: jest.fn().mockResolvedValue('emp-khoa'),
        assert: jest.fn(),
        assertVendorAdmins: jest.fn(),
        requireItAdmin: jest.fn(),
      } as unknown as SubscriptionPoolService,
      { record: jest.fn() } as unknown as AuditApi,
      runner,
    );

    const err = await multiLine
      .declare(
        actor,
        {
          kind: 'TERM',
          billingCycle: 'MONTHLY',
          commitmentTermMonths: 1,
          lines: [
            { planId: 'plan-a', monthlyUnitPrice: { amount: '500000', currency: 'VND' }, quantity: 10 },
            { planId: 'plan-b', monthlyUnitPrice: { amount: '375000', currency: 'VND' }, quantity: 2 },
          ],
        },
        [
          { planId: 'plan-a', monthlyUnitPrice: { amount: '500000', currency: 'VND' }, quantity: 10 },
          { planId: 'plan-b', monthlyUnitPrice: { amount: '375000', currency: 'VND' }, quantity: 2 },
        ],
      )
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SubscriptionStillDraftError);
    const httpErr = toSubscriptionApiException(err) as {
      getStatus: () => number;
      getResponse: () => { code: string; details?: { missing?: string[] } };
    };
    expect(httpErr.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(httpErr.getResponse()).toMatchObject({
      code: 'SUBSCRIPTION.STILL_DRAFT',
      details: { missing: ['START_DATE'] },
    });
    expect(insert).not.toHaveBeenCalled();
    expect(createForPeriod).not.toHaveBeenCalled();
  });
});
