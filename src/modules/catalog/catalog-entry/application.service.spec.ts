import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SeatOccupancyHook, type SeatOccupancyReader } from '../public/catalog.extension-points';
import type { FunctionalGroupFactsService } from '../functional-group/functional-group-facts.service';
import type { VendorDictionaryFactsService } from '../vendor-dictionary/vendor-dictionary-facts.service';
import type { VendorRecordService } from '../vendor/vendor-record.service';
import { ApplicationNotFoundError } from './application.errors';
import type { ApplicationRepo } from './application.repo';
import { ApplicationService } from './application.service';
import { ApplicationWriteGuards } from './application-write-guards.service';
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
  responsibleItAdminEmployeeId: 'owner-1',
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
  /** The employees that are usable IT Admins now. */
  usableItAdmins?: string[];
}) {
  const applications = {
    find: jest.fn().mockResolvedValue(input.found ?? null),
    similarTo: jest.fn().mockResolvedValue({ items: [{ id: 'application-2', name: 'Other Design Tool' }], total: 1 }),
    count: jest.fn().mockResolvedValue(0),
    lock: jest.fn().mockResolvedValue(input.found ?? null),
    update: jest.fn((_tx: DbTx, id: string, changes: Partial<ApplicationRecord>) =>
      Promise.resolve({ ...(input.found as ApplicationRecord), ...changes, id }),
    ),
    insert: jest
      .fn<Promise<ApplicationRecord>, [DbTx, Record<string, unknown>]>()
      .mockImplementation(() => Promise.resolve(input.found as ApplicationRecord)),
  };
  const openHolderCount = jest.fn().mockResolvedValue(input.k1Holders ?? 0);
  const organization = {
    getEmployees: jest.fn((ids: string[]) =>
      Promise.resolve((input.employees ?? []).filter((candidate) => ids.includes(candidate.id))),
    ),
    getEmployee: jest.fn((id: string) =>
      Promise.resolve((input.employees ?? []).find((candidate) => candidate.id === id) ?? null),
    ),
    businessToday: jest.fn().mockResolvedValue(TODAY),
    getOrganization: jest.fn().mockResolvedValue({ id: 'organization-1' }),
  };
  const identity = {
    findUsableItAdminEmployeeIds: jest.fn((ids: string[]) =>
      Promise.resolve(new Set(ids.filter((id) => (input.usableItAdmins ?? ['owner-1']).includes(id)))),
    ),
  };
  const plans = { plansOfApplication: jest.fn().mockResolvedValue(input.plans ?? []) };
  const occupancy = new SeatOccupancyHook();
  occupancy.bind({ openHolderCount } as unknown as SeatOccupancyReader);
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const runner = { run: jest.fn(async (write: (tx: DbTx) => Promise<unknown>) => write(TX)) };
  const service = new ApplicationService(
    applications as unknown as ApplicationRepo,
    {} as VendorRecordService,
    {} as VendorDictionaryFactsService,
    {} as ApplicationVendorLinkService,
    new ApplicationViewService(
      organization as unknown as OrganizationReadApi,
      identity as unknown as IdentityAccessApi,
      plans,
      occupancy,
    ),
    audit as unknown as AuditApi,
    runner as unknown as TransactionRunner,
    new ApplicationWriteGuards(
      organization as unknown as OrganizationReadApi,
      { findActive: jest.fn() } as unknown as FunctionalGroupFactsService,
    ),
  );

  return { service, applications, organization, openHolderCount, audit, identity };
}

const RESPONSIBLE = { employeeId: 'owner-1', employeeCode: 'E-owner-1', fullName: 'Person owner-1' };

describe('ApplicationService.get (US-04-01, US-04-02 AC-9)', () => {
  it('shows the application with its responsible IT Admin, the similar tools and no recommendation without K1 plans', async () => {
    const { service, organization, openHolderCount } = serviceWith({
      found: record(),
      employees: [employee('owner-1', 'ACTIVE')],
      plans: [{ id: 'plan-k2', provisioningType: 'K2' }],
    });

    await expect(service.get('application-1')).resolves.toEqual({
      application: { ...record(), responsibleItAdmin: RESPONSIBLE, needsResponsible: false },
      similar: [{ id: 'application-2', name: 'Other Design Tool' }],
      similarTotal: 1,
      recommendations: [],
    });
    // No K1 plan: the day and the holders are not read.
    expect(organization.businessToday).not.toHaveBeenCalled();
    expect(openHolderCount).not.toHaveBeenCalled();
  });

  it('recommends K2 from three holders of its K1 plans, counted today, and flags that it needs a responsible IT Admin when the one named is no longer usable', async () => {
    const { service, openHolderCount } = serviceWith({
      found: record(),
      employees: [employee('owner-1', 'TERMINATED')],
      usableItAdmins: [],
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
    expect(detail.application.responsibleItAdmin).toEqual(RESPONSIBLE);
    expect(detail.application.needsResponsible).toBe(true);
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

  it('refuses an application that does not exist, and a responsible IT Admin who is not an employee', async () => {
    await expect(serviceWith({ found: null }).service.get('application-1')).rejects.toBeInstanceOf(
      ApplicationNotFoundError,
    );
    await expect(serviceWith({ found: record(), employees: [] }).service.get('application-1')).rejects.toThrow(
      'The IT Admin responsible for an application is not an employee',
    );
  });
});

describe('ApplicationService writes answer with the responsible IT Admin (QĐ-111g)', () => {
  it('declares an application and reports whether the software was outside the dictionary', async () => {
    const { service } = serviceWith({ found: record(), employees: [employee('owner-1', 'ACTIVE')] });

    await expect(
      service.declare(ACTOR, {
        name: 'Design Tool',
        kind: 'INTERNAL',
        dataSensitivity: 'LOW',
        communication: { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false },
      }),
    ).resolves.toEqual({
      application: { ...record(), responsibleItAdmin: RESPONSIBLE, needsResponsible: false },
      proposed: false,
    });
  });

  it('makes the IT Admin who declares it the one responsible, with no field to choose another', async () => {
    const { service, applications } = serviceWith({ found: record(), employees: [employee('owner-1', 'ACTIVE')] });

    await service.declare(ACTOR, {
      name: 'Design Tool',
      kind: 'INTERNAL',
      dataSensitivity: 'LOW',
      communication: { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false },
    });

    expect(applications.insert).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ responsibleItAdminEmployeeId: ACTOR.employeeId }),
    );
  });

  it('a change that changes nothing writes nothing and still answers with the responsible IT Admin', async () => {
    const { service, applications, audit } = serviceWith({
      found: record(),
      employees: [employee('owner-1', 'ACTIVE')],
    });

    await expect(service.update(ACTOR, 'application-1', { name: 'Design Tool' })).resolves.toEqual({
      ...record(),
      responsibleItAdmin: RESPONSIBLE,
      needsResponsible: false,
    });
    expect(applications.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
