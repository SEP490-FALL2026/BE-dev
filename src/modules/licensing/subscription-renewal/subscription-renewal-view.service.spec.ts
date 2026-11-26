import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { FinanceApi } from '../../finance/public/finance.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { SubscriptionRenewalKpiService } from './kpi/subscription-renewal-kpi.service';
import type { RenewalSeatsNeededService } from './seats-needed/renewal-seats-needed.service';
import { RenewalPartiesService } from './subscription-renewal-parties.service';
import type { RenewalRankingService } from './subscription-renewal-ranking.service';
import { RenewalViewService } from './subscription-renewal-view.service';
import { RenewalError } from './subscription-renewal.errors';
import type { SubscriptionRenewalRepo } from './subscription-renewal.repo';

describe('RenewalViewService.missedAdjustmentKpiOf (W3-22 KPI-4)', () => {
  const actor = (roles: AuthenticatedPrincipal['roles']): AuthenticatedPrincipal =>
    ({ employeeId: 'emp-1', appUserId: 'user-1', roles, sessionId: 's-1' }) as AuthenticatedPrincipal;

  const build = () => {
    const kpiMissed = {
      kpi4ForSubscription: jest.fn().mockResolvedValue({
        subscriptionId: 'sub-1',
        totalSeatMonths: 2.5,
        totalAmountMinor: 1_250_000n,
        lines: [],
      }),
    };
    const service = new RenewalViewService(
      {} as SubscriptionRenewalRepo,
      {} as SubscriptionPeriodApi,
      new RenewalPartiesService({} as IdentityAccessApi),
      {} as RenewalRankingService,
      {} as RenewalSeatsNeededService,
      {} as FinanceApi,
      undefined,
      kpiMissed as unknown as SubscriptionRenewalKpiService,
    );

    return { service, kpiMissed };
  };

  it('delegates incremental KPI-4 reads for IT_ADMIN and FINANCE', async () => {
    const { service, kpiMissed } = build();
    const res = await service.missedAdjustmentKpiOf(actor(['FINANCE']), 'sub-1', [
      '2027-07-01',
      '2027-08-01',
      '2027-09-01',
    ]);

    expect(kpiMissed.kpi4ForSubscription).toHaveBeenCalledWith('sub-1', ['2027-07-01', '2027-08-01', '2027-09-01']);
    expect(res.totalSeatMonths).toBe(2.5);
    expect(res.totalAmountMinor).toBe(1_250_000n);
  });

  it('refuses callers outside IT_ADMIN / FINANCE with READ_FORBIDDEN', async () => {
    const { service } = build();
    const err = await service
      .missedAdjustmentKpiOf(actor(['EMPLOYEE']), 'sub-1', ['2027-07-01'])
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RenewalError);
    expect((err as RenewalError).problem).toBe('READ_FORBIDDEN');
  });
});
