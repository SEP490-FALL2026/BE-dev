import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { AuditEventInput } from '../../audit/public/audit.types';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PlanQuotePriceService } from './plan-quote-price.service';
import type { PlanRepo } from './plan.repo';
import type { ReferencePrice } from './plan.types';

const ACTOR = { appUserId: 'it-admin', roles: ['IT_ADMIN'], sessionId: 'session' } as unknown as AuthenticatedPrincipal;
const TX = {} as DbTx;
const QUOTE: ReferencePrice = { amountMinor: 250_000n, currency: 'VND' };

const plan = (provisioningType: string, referencePrice: ReferencePrice | null = null) => ({
  id: 'plan',
  applicationId: 'app',
  name: 'Plan',
  provisioningType,
  pricingModel: 'PER_SEAT',
  controlLevel: 'FULL',
  revocationNote: null,
  dataLossOnRemoval: false,
  sharingPolicy: null,
  hasAdminConsole: false,
  referencePrice,
});

function setup(current: ReturnType<typeof plan> | null) {
  const update = jest.fn((_tx: DbTx, _id: string, changes: { referencePrice: ReferencePrice }) =>
    Promise.resolve({ ...(current as ReturnType<typeof plan>), ...changes }),
  );
  const record = jest.fn().mockResolvedValue(undefined);
  const service = new PlanQuotePriceService(
    { lock: jest.fn().mockResolvedValue(current), update } as unknown as PlanRepo,
    { getOrganization: jest.fn().mockResolvedValue({ id: 'org' }) } as unknown as OrganizationReadApi,
    { record } as unknown as AuditApi,
  );

  return { service, update, record };
}

describe('QĐ-113a the approved quote becomes the reference price of the plan a request is linked to', () => {
  it.each(['K1', 'K2'])(
    'is adopted by a %s plan that has no price, and audited as a change of the plan',
    async (kind) => {
      const { service, update, record } = setup(plan(kind));

      expect(await service.adopt(ACTOR, 'plan', QUOTE, TX)).toBe(true);
      expect(update).toHaveBeenCalledWith(TX, 'plan', { referencePrice: QUOTE });
      expect(record).toHaveBeenCalledTimes(1);
      expect((record.mock.calls[0] as [DbTx, AuditEventInput])[1]).toMatchObject({
        action: 'PLAN.UPDATED',
        resourceType: 'Plan',
        resourceId: 'plan',
        organizationId: 'org',
        actorAppUserId: 'it-admin',
        before: { referencePrice: null },
        after: { referencePrice: { amountMinor: '250000', currency: 'VND' } },
      });
    },
  );

  it.each([
    ['a K4 plan, which the IT Admin prices', plan('K4'), QUOTE],
    [
      'a plan that already has a price, which is never overwritten',
      plan('K2', { amountMinor: 1n, currency: 'VND' }),
      QUOTE,
    ],
    ['a K5 plan, which costs nothing', plan('K5'), QUOTE],
    ['a quote in another currency', plan('K2'), { amountMinor: 250_000n, currency: 'USD' }],
    ['a quote of 0', plan('K2'), { amountMinor: 0n, currency: 'VND' }],
    ['a plan that does not exist', null, QUOTE],
  ])('is not adopted by %s', async (_label, current, quote) => {
    const { service, update, record } = setup(current);

    expect(await service.adopt(ACTOR, 'plan', quote, TX)).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
