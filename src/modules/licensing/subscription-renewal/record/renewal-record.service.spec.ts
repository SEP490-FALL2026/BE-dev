import { HttpStatus } from '@nestjs/common';
import type { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { SubscriptionPeriodApi } from '../../../catalog/public/subscription-period.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { SubscriptionRenewalLinesService } from '../lines/subscription-renewal-lines.service';
import type { RenewalOutcomeService } from '../outcome/renewal-outcome.service';
import type { RenewalSeatsNeededService } from '../seats-needed/renewal-seats-needed.service';
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
      { countFor: jest.fn() } as unknown as RenewalSeatsNeededService,
      { recordIn: jest.fn() } as unknown as RenewalOutcomeService,
      { businessToday, getOrganization } as unknown as OrganizationReadApi,
      { recordingAccessOf, proposed: jest.fn(), told: jest.fn() } as unknown as RenewalRecordTrail,
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

  describe('W3-21 per-line proposals, R-LATE, shortfall, and LINES_REQUIRED', () => {
    const linePeriod = {
      subscriptionId: 'sub-1',
      planId: 'plan-std',
      kind: 'TERM',
      applicationKind: 'SAAS',
      provisioningType: 'K2',
      status: 'ACTIVE',
      renewedById: null,
      seatCounting: 'FIXED',
      purchasedQuantity: 14,
      vendorMinimumSeats: null,
      minimumSeatsTotal: 5,
      isPrimaryForPlan: false,
      notice: { source: 'DECLARED', deadline: '2027-06-01', baseDate: '2027-06-01' },
      adjustment: {
        kind: 'NOTICE_DEADLINE',
        point: '2027-05-02',
        deadline: '2027-06-01',
        end: '2027-07-01',
        redAlertOn: '2027-05-25',
        commitment: 'ANNUAL',
      },
    };

    function buildMulti(
      today = '2027-05-02',
      lineTargets = [
        {
          subscriptionLineId: 'line-std',
          planId: 'plan-std',
          seatsToday: 12,
          seatsAtDeadline: 12,
          minimumSeats: null,
          need: 11,
          target: 11,
        },
        {
          subscriptionLineId: 'line-prm',
          planId: 'plan-prm',
          seatsToday: 2,
          seatsAtDeadline: 2,
          minimumSeats: null,
          need: 2,
          target: 2,
        },
      ],
      shortfall = 0,
    ) {
      const tx = {};
      const insert = jest.fn().mockResolvedValue({
        id: 'ren-1',
        organizationId: 'org-1',
        subscriptionId: 'sub-1',
        proposedChoice: 'REDUCE',
        proposedQuantity: 13,
      });
      const recordDecision = jest.fn().mockResolvedValue({
        id: 'ren-1',
        organizationId: 'org-1',
        subscriptionId: 'sub-1',
        decision: { choice: 'REDUCE', quantity: 13 },
      });
      const persistProposalTargets = jest.fn().mockResolvedValue(undefined);
      const recordIn = jest.fn().mockResolvedValue({
        recorded: { id: 'ren-1', organizationId: 'org-1' },
        next: { subscriptionId: 'sub-2' },
        carried: 11,
      });
      const linesSvc = {
        computeForPeriod: jest.fn().mockResolvedValue({
          servingLines: lineTargets.map((l) => ({ id: l.subscriptionLineId, planId: l.planId })),
          lines: lineTargets,
          shortfall,
        }),
        persistProposalTargets,
      } as unknown as SubscriptionRenewalLinesService;
      const recordingAccessOf = jest
        .fn()
        .mockResolvedValue({ allowed: true, substitute: false, responsibleItAdminEmployeeId: 'e-it' });
      const service = new RenewalRecordService(
        {
          ofSubscriptions: jest.fn().mockResolvedValue(new Map()),
          endingAmong: jest.fn().mockResolvedValue(new Set()),
          insert,
          recordDecision,
        } as unknown as SubscriptionRenewalRepo,
        { lockPeriod: jest.fn().mockResolvedValue(linePeriod) } as unknown as SubscriptionPeriodApi,
        {
          countFor: jest.fn().mockResolvedValue({
            seatsNeeded: 13,
            target: 13,
            heldPastRenewal: 13,
            activeSeatsToday: 14,
            openRequests: 0,
          }),
        } as unknown as RenewalSeatsNeededService,
        { recordIn } as unknown as RenewalOutcomeService,
        {
          businessToday: jest.fn().mockResolvedValue(today),
          getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
        } as unknown as OrganizationReadApi,
        { recordingAccessOf, proposed: jest.fn(), told: jest.fn() } as unknown as RenewalRecordTrail,
        { run: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)) } as unknown as TransactionRunner,
        linesSvc,
      );

      return { service, persistProposalTargets, recordIn };
    }

    it('2A-1: accepts matching lines (11, 2), persists targets with lockedBy IT_ADMIN, and delegates nextPeriod.lines', async () => {
      const { service, persistProposalTargets, recordIn } = buildMulti('2027-05-02');
      await service.record(actor, {
        subscriptionId: 'sub-1',
        lines: [
          { subscriptionLineId: 'line-std', quantity: 11 },
          { subscriptionLineId: 'line-prm', quantity: 2 },
        ],
        outcome: 'AS_DECIDED',
        nextPeriod: {
          billingCycle: 'ANNUAL',
          startDate: '2027-07-01',
          autoRenew: true,
          allowsMidTermReduction: false,
          lines: [
            { subscriptionLineId: 'line-std', quantity: 11 },
            { subscriptionLineId: 'line-prm', quantity: 2 },
          ],
        },
      });

      expect(persistProposalTargets).toHaveBeenCalledTimes(1);
      const calls = persistProposalTargets.mock.calls as [
        unknown,
        {
          renewalOn: string;
          renewalId: string;
          lockedBy: string;
          autoRecorded: boolean;
          decisions: { subscriptionLineId: string; recordedQuantity: number }[];
        },
      ][];
      const persistArg = calls[0][1];
      expect(persistArg).toMatchObject({
        renewalOn: '2027-07-01',
        renewalId: 'ren-1',
        lockedBy: 'IT_ADMIN',
        autoRecorded: false,
      });
      expect(persistArg.decisions).toEqual([
        expect.objectContaining({ subscriptionLineId: 'line-std', recordedQuantity: 11 }),
        expect.objectContaining({ subscriptionLineId: 'line-prm', recordedQuantity: 2 }),
      ]);
      expect(recordIn).toHaveBeenCalled();
    });

    it('rejects multi-line legacy body without lines[] with 422 LINES_REQUIRED', async () => {
      const { service } = buildMulti('2027-05-02');
      const err = await service
        .record(actor, { subscriptionId: 'sub-1', choice: 'RENEW', proposedQuantity: 13, outcome: 'AS_DECIDED' })
        .catch((e: unknown) => e);
      expect((err as RenewalError).problem).toBe('LINES_REQUIRED');
    });

    it('R-LATE: rejects (11, 2) after deadline with 422 REDUCTION_AFTER_DEADLINE minimum 12 and accepts (12, 2)', async () => {
      const late = buildMulti('2027-06-05');
      const refused = await late.service
        .record(actor, {
          subscriptionId: 'sub-1',
          lines: [
            { subscriptionLineId: 'line-std', quantity: 11 },
            { subscriptionLineId: 'line-prm', quantity: 2 },
          ],
          outcome: 'AS_DECIDED',
        })
        .catch((e: unknown) => e);
      expect((refused as RenewalError).problem).toBe('REDUCTION_AFTER_DEADLINE');
      expect((refused as RenewalError).details).toEqual({
        lines: [{ subscriptionLineId: 'line-std', minimum: 12 }],
      });

      const allowed = await late.service.record(actor, {
        subscriptionId: 'sub-1',
        lines: [
          { subscriptionLineId: 'line-std', quantity: 12 },
          { subscriptionLineId: 'line-prm', quantity: 2 },
        ],
        outcome: 'AS_DECIDED',
        nextPeriod: {
          billingCycle: 'ANNUAL',
          startDate: '2027-07-01',
          autoRenew: true,
          allowsMidTermReduction: false,
          lines: [
            { subscriptionLineId: 'line-std', quantity: 12 },
            { subscriptionLineId: 'line-prm', quantity: 2 },
          ],
        },
      });
      expect(allowed).toMatchObject({ id: 'ren-1' });
    });

    it('2D: accepts shortfall holder + note (Standard 5, Premium 0)', async () => {
      const d = buildMulti(
        '2027-05-02',
        [
          {
            subscriptionLineId: 'line-std',
            planId: 'plan-std',
            seatsToday: 10,
            seatsAtDeadline: 10,
            minimumSeats: null,
            need: 4,
            target: 4,
          },
          {
            subscriptionLineId: 'line-prm',
            planId: 'plan-prm',
            seatsToday: 2,
            seatsAtDeadline: 2,
            minimumSeats: null,
            need: 0,
            target: 0,
          },
        ],
        1,
      );
      await d.service.record(actor, {
        subscriptionId: 'sub-1',
        lines: [
          { subscriptionLineId: 'line-std', quantity: 5 },
          { subscriptionLineId: 'line-prm', quantity: 0 },
        ],
        minimumTotalHolderLineId: 'line-std',
        minimumTotalNote: 'Minimum total 5',
        outcome: 'AS_DECIDED',
        nextPeriod: {
          billingCycle: 'ANNUAL',
          startDate: '2027-07-01',
          autoRenew: true,
          allowsMidTermReduction: false,
          lines: [
            { subscriptionLineId: 'line-std', quantity: 5 },
            { subscriptionLineId: 'line-prm', quantity: 0 },
          ],
        },
      });
      expect(d.persistProposalTargets).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          minimumTotalHolderLineId: 'line-std',
          minimumTotalNote: 'Minimum total 5',
        }),
      );
    });

    it('F-10: rejects legacy body choice=CANCEL on 1-line annual period after deadline with 422 REDUCTION_AFTER_DEADLINE', async () => {
      const late = buildMulti('2027-06-05', [
        {
          subscriptionLineId: 'line-std',
          planId: 'plan-std',
          seatsToday: 12,
          seatsAtDeadline: 12,
          minimumSeats: null,
          need: 12,
          target: 12,
        },
      ]);

      const err = await late.service
        .record(actor, { subscriptionId: 'sub-1', choice: 'CANCEL', outcome: 'AS_DECIDED' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(RenewalError);
      expect((err as RenewalError).problem).toBe('REDUCTION_AFTER_DEADLINE');
      const apiErr = toRenewalApiException(err) as ApiException;
      expect(apiErr.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(apiErr.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_RENEWAL.REDUCTION_AFTER_DEADLINE' });
    });
  });
});
