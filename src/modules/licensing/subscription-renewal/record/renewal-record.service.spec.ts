import { HttpStatus } from '@nestjs/common';
import type { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { RenewalOutcomeService } from '../outcome/renewal-outcome.service';
import type { RenewalSeatsNeededService } from '../seats-needed/renewal-seats-needed.service';
import type { RenewalPartiesService } from '../subscription-renewal-parties.service';
import { RenewalError } from '../subscription-renewal.errors';
import { toRenewalApiException } from '../subscription-renewal.http-errors';
import type { SubscriptionRenewalRepo } from '../subscription-renewal.repo';
import type { RenewalRecordTrail } from './renewal-record-trail.service';
import { RenewalRecordService, type RecordRenewalInput } from './renewal-record.service';

const actor = {
  appUserId: 'u-it',
  employeeId: 'e-it',
  sessionId: 's-1',
  subject: 'u-it',
  roles: ['IT_ADMIN'],
  directRoles: ['IT_ADMIN'],
} as unknown as AuthenticatedPrincipal;

const baseInput: RecordRenewalInput = {
  subscriptionId: 'sub-1',
  choice: 'RENEW',
  outcome: 'AS_DECIDED',
};

describe('RenewalRecordService', () => {
  const build = (overrides: {
    period?: { subscriptionId: string; responsibleItAdminEmployeeId: string | null } | null;
    access?: { allowed: boolean; substitute: boolean; responsibleItAdminEmployeeId: string | null };
  }) => {
    const tx = {};
    const lockPeriod = jest
      .fn()
      .mockResolvedValue(
        overrides.period === undefined
          ? { subscriptionId: 'sub-1', responsibleItAdminEmployeeId: 'e-owner' }
          : overrides.period,
      );
    const recordingAccessOf = jest
      .fn()
      .mockResolvedValue(
        overrides.access ?? { allowed: false, substitute: false, responsibleItAdminEmployeeId: 'e-owner' },
      );
    const businessToday = jest.fn().mockResolvedValue('2026-11-23');
    const getOrganization = jest.fn().mockResolvedValue({ id: 'org-1' });
    const runner = {
      run: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as TransactionRunner;

    const service = new RenewalRecordService(
      { ofSubscriptions: jest.fn(), endingAmong: jest.fn() } as unknown as SubscriptionRenewalRepo,
      { lockPeriod } as unknown as SubscriptionPeriodApi,
      { recordingAccessOf } as unknown as RenewalPartiesService,
      { countFor: jest.fn() } as unknown as RenewalSeatsNeededService,
      { recordIn: jest.fn() } as unknown as RenewalOutcomeService,
      { businessToday, getOrganization } as unknown as OrganizationReadApi,
      { proposed: jest.fn(), told: jest.fn() } as unknown as RenewalRecordTrail,
      runner,
    );

    return { service, lockPeriod, recordingAccessOf, businessToday, tx };
  };

  it('throws RenewalError NOT_FOUND when the subscription period does not exist', async () => {
    const { service } = build({ period: null });

    const error = await service.record(actor, baseInput).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(RenewalError);
    expect((error as RenewalError).problem).toBe('NOT_FOUND');
    const apiErr = toRenewalApiException(error) as ApiException;
    expect(apiErr.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(apiErr.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_RENEWAL.NOT_FOUND' });
  });

  it('throws RenewalError NOT_RESPONSIBLE (403 SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE) when recordingAccessOf denies', async () => {
    const { service, lockPeriod, recordingAccessOf, businessToday, tx } = build({
      period: { subscriptionId: 'sub-1', responsibleItAdminEmployeeId: 'e-other' },
      access: { allowed: false, substitute: false, responsibleItAdminEmployeeId: 'e-other' },
    });

    const error = await service.record(actor, baseInput).catch((err: unknown) => err);
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
});
