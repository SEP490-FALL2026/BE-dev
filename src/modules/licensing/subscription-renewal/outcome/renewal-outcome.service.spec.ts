import { HttpStatus } from '@nestjs/common';
import type { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { AssignmentService } from '../../assignment/assignment.service';
import type { SubscriptionRenewalSeatRepo } from '../subscription-renewal-seat.repo';
import type { RenewalPartiesService } from '../subscription-renewal-parties.service';
import { RenewalError } from '../subscription-renewal.errors';
import { toRenewalApiException } from '../subscription-renewal.http-errors';
import type { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import { RenewalOutcomeService } from './renewal-outcome.service';

const actor = {
  appUserId: 'u-it',
  employeeId: 'e-it',
  sessionId: 's-1',
  subject: 'u-it',
  roles: ['IT_ADMIN'],
  directRoles: ['IT_ADMIN'],
} as unknown as AuthenticatedPrincipal;

describe('RenewalOutcomeService', () => {
  const build = (overrides: {
    record?: { id: string; subscriptionId: string; state: string; decision: unknown } | null;
    period?: { subscriptionId: string; responsibleItAdminEmployeeId: string | null } | null;
    access?: { allowed: boolean; substitute: boolean; responsibleItAdminEmployeeId: string | null };
  }) => {
    const tx = {};
    const lock = jest
      .fn()
      .mockResolvedValue(
        overrides.record === undefined
          ? { id: 'ren-1', subscriptionId: 'sub-1', state: 'DECIDED', decision: { choice: 'RENEW' } }
          : overrides.record,
      );
    const lockPeriod = jest
      .fn()
      .mockResolvedValue(
        overrides.period === undefined
          ? { subscriptionId: 'sub-1', responsibleItAdminEmployeeId: 'e-other' }
          : overrides.period,
      );
    const recordingAccessOf = jest
      .fn()
      .mockResolvedValue(
        overrides.access ?? { allowed: false, substitute: false, responsibleItAdminEmployeeId: 'e-other' },
      );
    const businessToday = jest.fn().mockResolvedValue('2026-11-23');
    const runner = {
      run: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as TransactionRunner;

    const service = new RenewalOutcomeService(
      { lock } as unknown as SubscriptionRenewalRepo,
      {} as unknown as SubscriptionRenewalSeatRepo,
      {} as unknown as AssignmentService,
      { lockPeriod } as unknown as SubscriptionPeriodApi,
      { recordingAccessOf } as unknown as RenewalPartiesService,
      { businessToday } as unknown as OrganizationReadApi,
      {} as unknown as AuditApi,
      runner,
    );

    return { service, lock, lockPeriod, recordingAccessOf, businessToday, tx };
  };

  it('throws RenewalError NOT_FOUND when the renewal case does not exist', async () => {
    const { service } = build({ record: null });
    const error = await service.record(actor, 'ren-1', { outcome: 'UNCONFIRMED' }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(RenewalError);
    expect((error as RenewalError).problem).toBe('NOT_FOUND');
    const apiErr = toRenewalApiException(error) as ApiException;
    expect(apiErr.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(apiErr.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_RENEWAL.NOT_FOUND' });
  });

  it('throws RenewalError NOT_AWAITING_OUTCOME when the renewal case is not DECIDED', async () => {
    const { service } = build({
      record: { id: 'ren-1', subscriptionId: 'sub-1', state: 'OUTCOME_RECORDED', decision: { choice: 'RENEW' } },
    });
    const error = await service.record(actor, 'ren-1', { outcome: 'UNCONFIRMED' }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(RenewalError);
    expect((error as RenewalError).problem).toBe('NOT_AWAITING_OUTCOME');
    const apiErr = toRenewalApiException(error) as ApiException;
    expect(apiErr.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(apiErr.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_RENEWAL.NOT_AWAITING_OUTCOME' });
  });

  it('throws RenewalError NOT_RESPONSIBLE (403 SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE) when recordingAccessOf denies', async () => {
    const { service, lockPeriod, recordingAccessOf, businessToday, tx } = build({
      period: { subscriptionId: 'sub-1', responsibleItAdminEmployeeId: 'e-other' },
      access: { allowed: false, substitute: false, responsibleItAdminEmployeeId: 'e-other' },
    });

    const error = await service.record(actor, 'ren-1', { outcome: 'UNCONFIRMED' }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(RenewalError);
    expect((error as RenewalError).problem).toBe('NOT_RESPONSIBLE');
    const apiErr = toRenewalApiException(error) as ApiException;
    expect(apiErr.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(apiErr.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE' });

    expect(lockPeriod).toHaveBeenCalledWith(tx, 'sub-1');
    expect(recordingAccessOf).toHaveBeenCalledWith(
      actor,
      { subscriptionId: 'sub-1', responsibleItAdminEmployeeId: 'e-other' },
      tx,
    );
    expect(businessToday).not.toHaveBeenCalled();
  });

  it('W3-09: writes realisedSavings = null when IT Admin confirms AS_DECIDED outcome with a cheaper nextPeriod (deferred to invoice)', async () => {
    const tx = {};
    const recordOutcome = jest.fn().mockResolvedValue({
      id: 'ren-1',
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      decision: { choice: 'REDUCE' },
      outcome: {
        kind: 'AS_DECIDED',
        note: null,
        recordedByEmployeeId: 'e-it',
        recordedAt: new Date('2026-12-01T00:00:00Z'),
        vendorFollowUpOpen: false,
        nextSubscriptionId: 'sub-2',
        realisedSavings: null,
      },
      lateFlaggedAt: null,
    });
    const recordNextPeriod = jest.fn().mockResolvedValue({
      subscriptionId: 'sub-2',
      status: 'ACTIVE',
      purchasedQuantity: 11,
      unitPrice: { amountMinor: 6_000_000n, currency: 'VND' },
      billingCycle: 'ANNUAL',
      startDate: '2027-07-01',
      endDate: '2028-06-30',
    });
    const service = new RenewalOutcomeService(
      { recordOutcome } as unknown as SubscriptionRenewalRepo,
      { notEndedBy: jest.fn().mockResolvedValue([]) } as unknown as SubscriptionRenewalSeatRepo,
      { carry: jest.fn().mockResolvedValue(0) } as unknown as AssignmentService,
      { recordNextPeriod } as unknown as SubscriptionPeriodApi,
      {} as unknown as RenewalPartiesService,
      {} as unknown as OrganizationReadApi,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi,
      {} as unknown as TransactionRunner,
    );

    await service.recordIn(
      tx as never,
      actor,
      {
        record: { id: 'ren-1', subscriptionId: 'sub-1', state: 'DECIDED', decision: { choice: 'REDUCE' } } as never,
        decision: { choice: 'REDUCE', quantity: 11 } as never,
        period: {
          subscriptionId: 'sub-1',
          purchasedQuantity: 12,
          unitPrice: { amountMinor: 6_000_000n, currency: 'VND' },
          billingCycle: 'ANNUAL',
          startDate: '2026-07-01',
          endDate: '2027-06-30',
        } as never,
      },
      {
        outcome: 'AS_DECIDED',
        nextPeriod: { startDate: '2027-07-01', purchasedQuantity: 11 } as never,
      },
      { today: '2026-12-01', now: new Date('2026-12-01T00:00:00Z') },
    );

    expect(recordOutcome).toHaveBeenCalledWith(
      tx,
      'ren-1',
      expect.objectContaining({
        kind: 'AS_DECIDED',
        nextSubscriptionId: 'sub-2',
        realisedSavings: null,
      }),
    );
  });
});
