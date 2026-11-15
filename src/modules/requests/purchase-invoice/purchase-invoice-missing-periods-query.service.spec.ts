import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { PaymentScheduleFacts } from '../../catalog/public/subscription-period.types';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { LicensingOpenGrantsApi } from '../../licensing/public/licensing-open-grants.api';
import type { GrantedSeatOfRequest } from '../../licensing/public/licensing-open-grants.types';
import type { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PurchaseInvoiceMissingPeriodsQueryService } from './purchase-invoice-missing-periods-query.service';
import type { OpenServiceMonths, PurchaseInvoiceRepo, TermGrantFacts } from './purchase-invoice.repo';

const actor = (roles: string[]): AuthenticatedPrincipal => ({
  subject: 'u1',
  appUserId: 'u1',
  sessionId: 's1',
  employeeId: 'it-1',
  directRoles: roles,
  roles,
});

const grant = (over: Partial<TermGrantFacts> = {}): TermGrantFacts => ({
  id: 'r-1',
  planId: 'plan-k1',
  departmentId: 'd-1',
  // 10/11/2026 at 17:00 in Ho Chi Minh City.
  grantCompletedAt: new Date('2026-11-10T10:00:00Z'),
  termMonths: 3,
  ...over,
});
const seat = (requestId: string, over: Partial<GrantedSeatOfRequest> = {}): GrantedSeatOfRequest => ({
  requestId,
  rootAssignmentId: 'a-1',
  laterAssignmentIds: [],
  assignmentId: 'a-1',
  employeeId: 'e-1',
  planId: 'plan-k1',
  owningDepartmentId: 'd-1',
  expectedEndDate: '2027-02-09',
  validUntil: null,
  ...over,
});
const schedule = (over: Partial<PaymentScheduleFacts> = {}): PaymentScheduleFacts => ({
  subscriptionId: 's-1',
  planId: 'plan-k2',
  ownerDepartmentId: 'd-1',
  billingCycle: 'MONTHLY',
  startDate: '2026-01-05',
  endDate: null,
  renewalDate: null,
  autoRenew: true,
  recordedAt: new Date('2026-10-01T03:00:00Z'),
  ...over,
});
const none = (): OpenServiceMonths => ({ byRequest: new Map(), bySubscription: new Map() });

interface World {
  today?: string;
  grants?: TermGrantFacts[];
  kinds?: Record<string, 'K1' | 'K2'>;
  seats?: GrantedSeatOfRequest[];
  schedules?: PaymentScheduleFacts[];
  months?: OpenServiceMonths;
  nonWorking?: string[];
  organization?: { timeZone: string } | null;
  scope?: string[];
}

function serviceIn(world: World) {
  const completedTermGrants = jest.fn().mockResolvedValue(world.grants ?? []);
  const openServiceMonths = jest.fn().mockResolvedValue(world.months ?? none());
  const findPlanSeatTargets = jest.fn((planIds: readonly string[]) =>
    Promise.resolve(planIds.map((planId) => ({ planId, provisioningType: world.kinds?.[planId] ?? 'K1' }))),
  );
  const getPlanSummariesWithLogo = jest.fn((ids: readonly string[]) =>
    Promise.resolve(
      ids.map((planId) => ({
        planId,
        planName: `Plan ${planId}`,
        applicationName: `App ${planId}`,
        applicationLogoUrl: null,
      })),
    ),
  );
  const listPaymentSchedules = jest.fn().mockResolvedValue(world.schedules ?? []);
  const listHeldSeatsOfRequests = jest.fn().mockResolvedValue(world.seats ?? []);
  const getNonWorkingDates = jest.fn().mockResolvedValue(new Set(world.nonWorking ?? []));
  const getItAdminScope = jest.fn().mockResolvedValue(world.scope ?? ['d-1']);
  const service = new PurchaseInvoiceMissingPeriodsQueryService(
    { completedTermGrants, openServiceMonths } as unknown as PurchaseInvoiceRepo,
    { findPlanSeatTargets, getPlanSummariesWithLogo } as unknown as CatalogApi,
    { listPaymentSchedules } as unknown as SubscriptionPeriodApi,
    { listHeldSeatsOfRequests } as unknown as LicensingOpenGrantsApi,
    {
      getOrganization: () =>
        Promise.resolve(world.organization === undefined ? { timeZone: 'Asia/Ho_Chi_Minh' } : world.organization),
      businessToday: () => Promise.resolve(world.today ?? '2026-11-18'),
      getItAdminScope,
      getDepartmentBriefs: (ids: readonly string[]) =>
        Promise.resolve(ids.map((id) => ({ id, name: `Department ${id}` }))),
    } as unknown as OrganizationReadApi,
    { findUsableItAdminEmployeeIds: jest.fn() } as unknown as IdentityAccessApi,
    { getNonWorkingDates } as unknown as OperatingParametersApi,
  );

  return {
    service,
    completedTermGrants,
    openServiceMonths,
    findPlanSeatTargets,
    listPaymentSchedules,
    listHeldSeatsOfRequests,
    getNonWorkingDates,
    getItAdminScope,
  };
}

const finance = actor(['FINANCE']);
const itAdmin = actor(['IT_ADMIN']);
const all = { page: 1, pageSize: 100 };
const monthsOf = async (world: World, who = finance) =>
  (await serviceIn(world).service.pageFor(who, all)).items.map((row) => row.servicePeriodMonth);

describe('PurchaseInvoiceMissingPeriodsQueryService (PI-2, QĐ-111x, R-30)', () => {
  describe('the right a request granted', () => {
    const running: World = { grants: [grant()], seats: [seat('r-1')] };

    it('is marked on 18/11/2026 for a payment on Tuesday 10/11/2026 and not on 17/11 (T-PI)', async () => {
      expect(await monthsOf({ ...running, today: '2026-11-17' })).toEqual([]);
      expect(await monthsOf({ ...running, today: '2026-11-18' })).toEqual(['2026-11']);
    });

    it('gives the period what the IT Admin needs to find it: the request, the month, the days, the plan and the department', async () => {
      const { service } = serviceIn(running);

      const { items } = await service.pageFor(finance, all);

      expect(items).toEqual([
        {
          linkKind: 'REQUEST',
          requestId: 'r-1',
          subscriptionId: null,
          label: 'NEW_PURCHASE',
          servicePeriodMonth: '2026-11',
          periodIndex: 1,
          periodCount: 3,
          paymentDate: '2026-11-10',
          dueDate: '2026-11-17',
          plan: { planId: 'plan-k1', planName: 'Plan plan-k1', applicationName: 'App plan-k1', logoUrl: null },
          department: { id: 'd-1', name: 'Department d-1' },
        },
      ]);
    });

    it('counts the days nobody works: with 12/11 a holiday the same payment is on time on 18/11', async () => {
      expect(await monthsOf({ ...running, nonWorking: ['2026-11-12'] })).toEqual([]);
      expect(await monthsOf({ ...running, nonWorking: ['2026-11-12'], today: '2026-11-19' })).toEqual(['2026-11']);
    });

    it('reads the days nobody works from the earliest payment to today, once', async () => {
      const world = serviceIn(running);

      await world.service.pageFor(finance, all);

      expect(world.getNonWorkingDates).toHaveBeenCalledTimes(1);
      expect(world.getNonWorkingDates).toHaveBeenCalledWith('2026-11-10', '2026-11-18');
    });

    it('is marked for each month that came and passed its due day, and not for the months to come', async () => {
      expect(await monthsOf({ ...running, today: '2026-12-18' })).toEqual(['2026-11', '2026-12']);
      expect(await monthsOf({ ...running, today: '2026-12-17' })).toEqual(['2026-11']);
    });

    it('is not marked for a month that has an invoice that was not returned, and is for one that has none', async () => {
      const months = none();
      months.byRequest.set('r-1', new Set(['2026-11']));

      expect(await monthsOf({ ...running, months, today: '2026-12-18' })).toEqual(['2026-12']);
    });

    it('is called a period, not a new purchase, once the request has another invoice', async () => {
      const months = none();
      months.byRequest.set('r-1', new Set(['2026-12']));
      const { service } = serviceIn({ ...running, months, today: '2026-12-18' });

      const [row] = (await service.pageFor(finance, all)).items;

      expect(row).toMatchObject({ servicePeriodMonth: '2026-11', label: 'PERIOD', periodIndex: 1, periodCount: 3 });
    });

    it('stops where the seat stops: a seat that ends on 09/12 pays no month on the 10th', async () => {
      const world = { ...running, seats: [seat('r-1', { expectedEndDate: '2026-12-09' })], today: '2026-12-30' };

      expect(await monthsOf(world)).toEqual(['2026-11']);
    });

    it('is not a right that is paying once no seat of the request is held: nothing is marked', async () => {
      expect(await monthsOf({ ...running, seats: [] })).toEqual([]);
    });

    it('is not asked about a plan that is not paid by the month: a request for a K2 seat has no month', async () => {
      const { service, listHeldSeatsOfRequests } = serviceIn({ ...running, kinds: { 'plan-k1': 'K2' } });

      expect((await service.pageFor(finance, all)).items).toEqual([]);
      expect(listHeldSeatsOfRequests).not.toHaveBeenCalled();
    });

    it('asks for the seats of the requests of the plans paid by the month, on the day the organization is on', async () => {
      const { service, listHeldSeatsOfRequests } = serviceIn({
        grants: [grant(), grant({ id: 'r-2', planId: 'plan-k2' })],
        kinds: { 'plan-k1': 'K1', 'plan-k2': 'K2' },
        seats: [seat('r-1')],
      });

      await service.pageFor(finance, all);

      expect(listHeldSeatsOfRequests).toHaveBeenCalledWith({ grantRequestIds: ['r-1'], namedRoots: [] }, '2026-11-18');
    });

    it('reads the grant day in the calendar of the organization, not in UTC: 18:00 UTC on 09/11 is already 10/11 in Ho Chi Minh City', async () => {
      const world = { ...running, grants: [grant({ grantCompletedAt: new Date('2026-11-09T18:00:00Z') })] };

      expect((await serviceIn(world).service.pageFor(finance, all)).items[0].paymentDate).toBe('2026-11-10');
    });
  });

  describe('the subscription a department owns', () => {
    const owned: World = { schedules: [schedule()], today: '2026-12-14' };

    it('is marked for each payment day from the day the system knew it, with the due day of each', async () => {
      const { service } = serviceIn(owned);

      const { items } = await service.pageFor(finance, all);

      expect(items.map((row) => [row.servicePeriodMonth, row.paymentDate, row.dueDate, row.label])).toEqual([
        ['2026-10', '2026-10-05', '2026-10-12', 'RENEWAL'],
        ['2026-11', '2026-11-05', '2026-11-12', 'RENEWAL'],
        ['2026-12', '2026-12-05', '2026-12-11', 'RENEWAL'],
      ]);
      expect(items[0]).toMatchObject({ linkKind: 'SUBSCRIPTION', requestId: null, subscriptionId: 's-1' });
    });

    it('is not marked for a month an invoice of the subscription names', async () => {
      const months = none();
      months.bySubscription.set('s-1', new Set(['2026-11']));

      expect(await monthsOf({ ...owned, months })).toEqual(['2026-10', '2026-12']);
    });

    it('is paid once for the months of its cycle: an invoice of any of the three months of a quarter pays the quarter', async () => {
      const quarterly = schedule({
        billingCycle: 'QUARTERLY',
        startDate: '2026-10-05',
        recordedAt: new Date('2026-10-01T03:00:00Z'),
      });
      const months = none();

      expect(await monthsOf({ schedules: [quarterly], today: '2026-12-14', months })).toEqual(['2026-10']);
      months.bySubscription.set('s-1', new Set(['2026-12']));
      expect(await monthsOf({ schedules: [quarterly], today: '2026-12-14', months })).toEqual([]);
    });
  });

  describe('the subscription of the shared pool, which no department owns (PI-1c)', () => {
    const pooled: World = { schedules: [schedule({ ownerDepartmentId: null })], today: '2026-12-14' };

    it('is marked like any other, with no department on the period, for Finance and for an IT Admin of any department', async () => {
      const forFinance = await serviceIn(pooled).service.pageFor(finance, all);
      const forItAdmin = await serviceIn({ ...pooled, scope: ['d-9'] }).service.pageFor(itAdmin, all);

      expect(forFinance.items.map((row) => row.servicePeriodMonth)).toEqual(['2026-10', '2026-11', '2026-12']);
      expect(forFinance.items.map((row) => row.department)).toEqual([null, null, null]);
      expect(forItAdmin.items).toEqual(forFinance.items);
    });

    it('reads no department name when no period of the page has a department, and the departments of the others', async () => {
      const mixed: World = {
        schedules: [schedule({ ownerDepartmentId: null }), schedule({ subscriptionId: 's-2' })],
        today: '2026-12-14',
      };
      const { items } = await serviceIn(mixed).service.pageFor(finance, all);

      expect(items.filter((row) => row.subscriptionId === 's-1').map((row) => row.department)).toEqual([
        null,
        null,
        null,
      ]);
      expect(items.filter((row) => row.subscriptionId === 's-2').map((row) => row.department)).toEqual([
        { id: 'd-1', name: 'Department d-1' },
        { id: 'd-1', name: 'Department d-1' },
        { id: 'd-1', name: 'Department d-1' },
      ]);
    });
  });

  describe('whose periods are read, how they are ordered and paged', () => {
    it('reads the departments the IT Admin works and every owner for Finance', async () => {
      const forIt = serviceIn({ scope: ['d-1', 'd-2'] });
      const forFinance = serviceIn({});

      await forIt.service.pageFor(itAdmin, all);
      await forFinance.service.pageFor(finance, all);

      expect(forIt.getItAdminScope).toHaveBeenCalledWith('it-1', expect.any(Function));
      expect(forIt.completedTermGrants).toHaveBeenCalledWith(
        expect.objectContaining({ departmentIds: ['d-1', 'd-2'] }),
      );
      expect(forIt.listPaymentSchedules).toHaveBeenCalledWith(['d-1', 'd-2']);
      expect(forFinance.getItAdminScope).not.toHaveBeenCalled();
      expect(forFinance.completedTermGrants).toHaveBeenCalledWith(expect.objectContaining({ departmentIds: null }));
      expect(forFinance.listPaymentSchedules).toHaveBeenCalledWith(null);
    });

    it('counts the periods of the departments it is given: the total the list answers for them', async () => {
      const world = serviceIn({
        grants: [grant()],
        seats: [seat('r-1')],
        schedules: [schedule()],
        today: '2026-12-14',
      });

      expect(await world.service.countOf({ kind: 'DEPARTMENTS', departmentIds: ['d-1'] })).toBe(4);
      expect(world.listPaymentSchedules).toHaveBeenCalledWith(['d-1']);
    });

    it('puts the oldest due day first, then the link and the month, and pages after the count', async () => {
      const world = {
        grants: [grant({ id: 'r-2', grantCompletedAt: new Date('2026-11-12T10:00:00Z') }), grant({ id: 'r-1' })],
        seats: [seat('r-1'), seat('r-2')],
        schedules: [schedule()],
        today: '2026-11-30',
      };

      const first = await serviceIn(world).service.pageFor(finance, { page: 1, pageSize: 2 });
      const second = await serviceIn(world).service.pageFor(finance, { page: 2, pageSize: 2 });

      expect(first.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 4, totalPages: 2 });
      expect(first.items.map((row) => [row.requestId ?? row.subscriptionId, row.dueDate])).toEqual([
        ['s-1', '2026-10-12'],
        ['s-1', '2026-11-12'],
      ]);
      expect(second.items.map((row) => [row.requestId ?? row.subscriptionId, row.dueDate])).toEqual([
        ['r-1', '2026-11-17'],
        ['r-2', '2026-11-19'],
      ]);
    });

    it('answers nothing before the installation, and reads no names for an empty page', async () => {
      expect(await monthsOf({ organization: null, grants: [grant()], seats: [seat('r-1')] })).toEqual([]);
      const empty = serviceIn({ today: '2026-11-17', grants: [grant()], seats: [seat('r-1')] });

      expect((await empty.service.pageFor(finance, all)).pagination.totalItems).toBe(0);
    });
  });
});
