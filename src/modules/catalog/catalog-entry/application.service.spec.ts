import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { OrganizationApi } from '../../organization/public/organization.api';
import type { PlanLookupService } from '../plan/plan-lookup.service';
import { SeatOccupancyHook, type SeatOccupancyReader } from '../public/catalog.extension-points';
import type { FunctionalGroupLookupService } from '../functional-group/functional-group-lookup.service';
import type { VendorDictionaryLookupService } from '../vendor-dictionary/vendor-dictionary-lookup.service';
import type { VendorDirectoryService } from '../vendor/vendor-directory.service';
import { ApplicationNotFoundError } from './application.errors';
import type { ApplicationRepo } from './application.repo';
import { ApplicationService } from './application.service';
import type { ApplicationVendorLinkService } from './application-vendor-link.service';
import { ApplicationViewService } from './application-view.service';
import type { ApplicationRecord } from './application.types';

const TX = {} as DbTx;
const ACTOR: AuthenticatedPrincipal = {
  subject: 'app-user-1',
  appUserId: 'app-user-1',
  sessionId: 'session-1',
  employeeId: 'employee-actor',
  directRoles: ['IT_ADMIN'],
  derivedRoles: [],
  roles: ['IT_ADMIN'],
};
const TODAY = '2026-01-01';

const record = (overrides: Partial<ApplicationRecord> = {}): ApplicationRecord => ({
  id: 'application-1',
  name: 'Design Tool',
  kind: 'INTERNAL',
  vendor: null,
  dictionaryServiceLineId: null,
  domains: [],
  dataSensitivity: 'LOW',
  businessOwnerEmployeeId: 'owner-1',
  communication: {
    personToPersonMessaging: false,
    callsOrMeetings: false,
    mailbox: false,
    isCommunicationService: false,
    note: null,
  },
  functionalGroup: { id: 'group-1', name: 'Design' },
  status: 'APPROVED',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const employee = (id: string, status: 'ACTIVE' | 'TERMINATED') => ({
  id,
  employeeCode: `E-${id}`,
  fullName: `Person ${id}`,
  status,
  workEmail: null,
});

/**
 * The service over fakes of what it reads and writes: the plans of the application (`plans`, their provisioning type), the
 * people who hold seats on its K1 plans today (`k1Holders`) and the employees the organization knows.
 */
function serviceWith(input: {
  found?: ApplicationRecord | null;
  employees?: ReturnType<typeof employee>[];
  plans?: { id: string; provisioningType: string }[];
  k1Holders?: number;
}) {
  const applications = {
    find: jest.fn().mockResolvedValue(input.found ?? null),
    similarTo: jest.fn().mockResolvedValue({ items: [{ id: 'application-2', name: 'Other Design Tool' }], total: 1 }),
    count: jest.fn().mockResolvedValue(0),
    lock: jest.fn().mockResolvedValue(input.found ?? null),
    update: jest.fn((_tx: DbTx, id: string, changes: Partial<ApplicationRecord>) =>
      Promise.resolve({ ...(input.found as ApplicationRecord), ...changes, id }),
    ),
    insert: jest.fn(() => Promise.resolve(input.found as ApplicationRecord)),
    openOwnerPeriod: jest.fn().mockResolvedValue(undefined),
    closeOpenOwnerPeriod: jest.fn().mockResolvedValue(undefined),
  };
  const openHolderCount = jest.fn().mockResolvedValue(input.k1Holders ?? 0);
  const organization = {
    getEmployees: jest.fn((ids: string[]) =>
      Promise.resolve((input.employees ?? []).filter((candidate) => ids.includes(candidate.id))),
    ),
    getEmployee: jest.fn((id: string) =>
      Promise.resolve((input.employees ?? []).find((candidate) => candidate.id === id) ?? null),
    ),
    lockEmployeeForShare: jest.fn().mockResolvedValue(undefined),
    businessToday: jest.fn().mockResolvedValue(TODAY),
    getOrganization: jest.fn().mockResolvedValue({ id: 'organization-1' }),
  };
  const plans = { plansOfApplication: jest.fn().mockResolvedValue(input.plans ?? []) };
  const occupancy = new SeatOccupancyHook();
  occupancy.bind({ openHolderCount } as unknown as SeatOccupancyReader);
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const runner = { run: jest.fn(async (write: (tx: DbTx) => Promise<unknown>) => write(TX)) };
  const service = new ApplicationService(
    applications as unknown as ApplicationRepo,
    {} as VendorDirectoryService,
    { findActive: jest.fn() } as unknown as FunctionalGroupLookupService,
    {} as VendorDictionaryLookupService,
    {} as ApplicationVendorLinkService,
    organization as unknown as OrganizationApi,
    new ApplicationViewService(
      organization as unknown as OrganizationApi,
      plans as unknown as PlanLookupService,
      occupancy,
    ),
    audit as unknown as AuditApi,
    runner as unknown as TransactionRunner,
  );

  return { service, applications, organization, openHolderCount, audit };
}

const OWNER_VIEW = { employeeId: 'owner-1', employeeCode: 'E-owner-1', fullName: 'Person owner-1', status: 'ACTIVE' };

describe('ApplicationService.get (US-04-01, US-04-02 AC-9)', () => {
  it('shows the application with its Business Owner, the similar tools and no recommendation without K1 plans', async () => {
    const { service, organization, openHolderCount } = serviceWith({
      found: record(),
      employees: [employee('owner-1', 'ACTIVE')],
      plans: [{ id: 'plan-k2', provisioningType: 'K2' }],
    });

    await expect(service.get('application-1')).resolves.toEqual({
      application: { ...record(), businessOwner: OWNER_VIEW, businessOwnerReplacementRequired: false },
      similar: [{ id: 'application-2', name: 'Other Design Tool' }],
      similarTotal: 1,
      recommendations: [],
    });
    // No K1 plan: the day and the holders are not read.
    expect(organization.businessToday).not.toHaveBeenCalled();
    expect(openHolderCount).not.toHaveBeenCalled();
  });

  it('recommends K2 from three holders of its K1 plans, counted today, and flags a Business Owner who left', async () => {
    const { service, openHolderCount } = serviceWith({
      found: record(),
      employees: [employee('owner-1', 'TERMINATED')],
      plans: [
        { id: 'plan-k1-a', provisioningType: 'K1' },
        { id: 'plan-k2', provisioningType: 'K2' },
        { id: 'plan-k1-b', provisioningType: 'K1' },
      ],
      k1Holders: 3,
    });

    const detail = await service.get('application-1');

    expect(detail.recommendations).toEqual([{ code: 'CONSIDER_K2', k1Holders: 3, threshold: 3 }]);
    expect(openHolderCount).toHaveBeenCalledWith(['plan-k1-a', 'plan-k1-b'], TODAY);
    expect(detail.application.businessOwner).toEqual({ ...OWNER_VIEW, status: 'TERMINATED' });
    expect(detail.application.businessOwnerReplacementRequired).toBe(true);
  });

  it('recommends nothing under three holders, and reads no similar tool without a functional group', async () => {
    const { service, applications } = serviceWith({
      found: record({ functionalGroup: null }),
      employees: [employee('owner-1', 'ACTIVE')],
      plans: [{ id: 'plan-k1', provisioningType: 'K1' }],
      k1Holders: 2,
    });

    await expect(service.get('application-1')).resolves.toMatchObject({
      similar: [],
      similarTotal: 0,
      recommendations: [],
    });
    expect(applications.similarTo).not.toHaveBeenCalled();
  });

  it('refuses an application that does not exist, and a Business Owner who is not an employee', async () => {
    await expect(serviceWith({ found: null }).service.get('application-1')).rejects.toBeInstanceOf(
      ApplicationNotFoundError,
    );
    await expect(serviceWith({ found: record(), employees: [] }).service.get('application-1')).rejects.toThrow(
      'The Business Owner of an application is not an employee',
    );
  });
});

describe('ApplicationService writes answer with the Business Owner view', () => {
  it('declares an application and reports whether the software was outside the dictionary', async () => {
    const { service } = serviceWith({ found: record(), employees: [employee('owner-1', 'ACTIVE')] });

    await expect(
      service.declare(ACTOR, {
        name: 'Design Tool',
        kind: 'INTERNAL',
        dataSensitivity: 'LOW',
        businessOwnerEmployeeId: 'owner-1',
        communication: { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false },
      }),
    ).resolves.toEqual({
      application: { ...record(), businessOwner: OWNER_VIEW, businessOwnerReplacementRequired: false },
      proposed: false,
    });
  });

  it('changes the Business Owner in one transaction: the owner period moves and the view names the new owner', async () => {
    const { service, applications, audit } = serviceWith({
      found: record(),
      employees: [employee('owner-1', 'ACTIVE'), employee('owner-2', 'ACTIVE')],
    });

    const updated = await service.update(ACTOR, 'application-1', { businessOwnerEmployeeId: 'owner-2' });

    expect(updated.businessOwner).toEqual({
      employeeId: 'owner-2',
      employeeCode: 'E-owner-2',
      fullName: 'Person owner-2',
      status: 'ACTIVE',
    });
    expect(applications.closeOpenOwnerPeriod).toHaveBeenCalledWith(TX, 'application-1');
    expect(applications.openOwnerPeriod).toHaveBeenCalledWith(TX, {
      applicationId: 'application-1',
      employeeId: 'owner-2',
      assignedByAppUserId: 'app-user-1',
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('a change that changes nothing writes nothing and still answers with the owner view', async () => {
    const { service, applications, audit } = serviceWith({
      found: record(),
      employees: [employee('owner-1', 'ACTIVE')],
    });

    await expect(service.update(ACTOR, 'application-1', { name: 'Design Tool' })).resolves.toEqual({
      ...record(),
      businessOwner: OWNER_VIEW,
      businessOwnerReplacementRequired: false,
    });
    expect(applications.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
