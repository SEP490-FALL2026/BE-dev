import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { PricingRecord } from '../access-request/access-request.types';
import { PricingViewService } from './pricing-view.service';
import { RequestCostViewService } from './request-cost-view.service';

/**
 * The cost by the year of a request that was sent (`QĐ-111j`, `QĐ-111k`, R-38, R-39) is read from what the request keeps, never from the day it
 * is looked at: the months and the cut say the same today, next month and after 01/01, and agree with the amounts beside them.
 */
describe('RequestCostViewService', () => {
  const employees = new Map<string, { contractEndDate: string | null }>();
  const organization = {
    getEmployee: jest.fn((id: string) => Promise.resolve(employees.get(id) ?? null)),
    businessToday: jest.fn(),
  };
  const finance = { findCurrency: jest.fn(() => Promise.resolve({ minorUnit: 0 })) };
  const service = new RequestCostViewService(
    organization as unknown as OrganizationReadApi,
    new PricingViewService(finance as never, { getVendorChargeContext: jest.fn().mockResolvedValue(null) } as never),
  );

  const dong = (amountMinor: bigint) => ({ amountMinor, currency: 'VND' });
  /** 600.000 a month; K1 of 9 months worked out on 15/11/2026: 2 months this year (1.200.000) and 7 the next (4.200.000). */
  const priced = (over: Partial<PricingRecord> = {}): PricingRecord => ({
    status: 'PRICED',
    missingReason: null,
    kind: 'RECURRING',
    expectedEndDate: null,
    amountMonths: 2,
    budgetYear: 2026,
    amount: dong(1_200_000n),
    unitPrice: dong(600_000n),
    billingCycle: 'MONTHLY',
    nextYearAmount: dong(4_200_000n),
    ...over,
  });
  const one = { type: 'GRANT' as const, termMonths: 9, expectedEndDate: null, beneficiaryEmployeeIds: ['e-1'] };

  beforeEach(() => {
    employees.clear();
    employees.set('e-1', { contractEndDate: null });
    organization.businessToday.mockClear();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('T-RQ2: reads 9 months of K1 from what is kept: 2 this year, 7 the next, whatever day it is looked at', async () => {
    for (const day of ['2026-11-16', '2027-01-02', '2027-09-01']) {
      jest.setSystemTime(new Date(`${day}T03:00:00Z`));

      expect(await service.of(one, priced())).toEqual({
        currentYear: { year: 2026, months: 2, amount: { amount: '1200000', currency: 'VND' } },
        nextYear: { from: '2027-01-01', months: 7, amount: { amount: '4200000', currency: 'VND' }, estimate: true },
        termCutAt: null,
        months: 9,
      });
    }
    expect(organization.businessToday).not.toHaveBeenCalled();
  });

  it('T-R38: an intern whose contract ends 31/01/2027 has 3 months begun of the 9 asked, so the term was cut at the contract: 1.200.000 and 600.000', async () => {
    employees.set('e-1', { contractEndDate: '2027-01-31' });
    jest.setSystemTime(new Date('2027-06-01T03:00:00Z'));

    expect(await service.of(one, priced({ nextYearAmount: dong(600_000n) }))).toEqual({
      currentYear: { year: 2026, months: 2, amount: { amount: '1200000', currency: 'VND' } },
      nextYear: { from: '2027-01-01', months: 1, amount: { amount: '600000', currency: 'VND' }, estimate: true },
      termCutAt: '2027-01-31',
      months: 3,
    });
  });

  it('a term that was not cut shows no cut even when the person has a contract date: every month asked has begun', async () => {
    employees.set('e-1', { contractEndDate: '2028-12-31' });

    expect(await service.of(one, priced())).toMatchObject({ termCutAt: null, months: 9 });
  });

  it('R-46: a right with no end keeps twelve months of the next year and counts no months of the term', async () => {
    const view = await service.of(
      { ...one, termMonths: null },
      priced({ amount: dong(750_000n), unitPrice: dong(375_000n), nextYearAmount: dong(4_500_000n) }),
    );

    expect(view).toMatchObject({
      nextYear: { months: 12, amount: { amount: '4500000' } },
      termCutAt: null,
      months: null,
    });
  });

  it('counts the months of a yearly price from the amount kept, rounded up as the amount was: 240.000 a year, 7 months is 140.000', async () => {
    const view = await service.of(
      one,
      priced({
        billingCycle: 'ANNUAL',
        unitPrice: dong(240_000n),
        amount: dong(40_000n),
        amountMonths: 2,
        nextYearAmount: dong(140_000n),
      }),
    );

    expect(view).toMatchObject({ nextYear: { months: 7 }, months: 9 });
  });

  it('a group shows the amounts and no months or cut: each person has their own, so a count of months of the whole would sit beside money that was cut', async () => {
    employees.set('e-1', { contractEndDate: '2027-01-31' });

    expect(await service.of({ ...one, type: 'GROUP_GRANT' }, priced())).toEqual({
      currentYear: { year: 2026, months: null, amount: { amount: '1200000', currency: 'VND' } },
      nextYear: { from: '2027-01-01', months: null, amount: { amount: '4200000', currency: 'VND' }, estimate: true },
      termCutAt: null,
      months: null,
    });
  });

  it('a request of an older release that carries an end date shows the amounts and no run', async () => {
    const view = await service.of({ ...one, termMonths: null, expectedEndDate: '2027-03-31' }, priced());

    expect(view).toMatchObject({
      currentYear: { months: 2 },
      nextYear: { months: null },
      termCutAt: null,
      months: null,
    });
  });

  it('shows nothing for a price that is not by the month or is missing', async () => {
    expect(await service.of(one, priced({ kind: 'ONE_TIME' }))).toBeNull();
    expect(await service.of(one, priced({ status: 'MISSING', amount: null }))).toBeNull();
  });
});
