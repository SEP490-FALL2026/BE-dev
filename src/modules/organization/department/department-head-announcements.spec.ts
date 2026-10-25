import { Test } from '@nestjs/testing';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { OrganizationService } from '../organization.service';
import { DepartmentHeadService } from './department-head.service';
import { DepartmentRepo } from './department.repo';
import type { HeadPeriodChanges, HeadPeriodRecord } from './department.types';

const TODAY = '2026-10-24';
const TOMORROW = '2026-10-25';

const period = (employeeId: string, validFrom: string, validTo: string | null = null): HeadPeriodRecord => ({
  employeeId,
  employeeCode: employeeId.toUpperCase(),
  fullName: employeeId,
  validFrom,
  validTo,
});
const room = (changes: Partial<HeadPeriodChanges>): HeadPeriodChanges => ({
  cancelled: [],
  ended: [],
  endedPeriodIds: [],
  cancelledPeriodIds: [],
  ...changes,
});

/**
 * The head periods a department writes become changes of the organization that its listeners are told of in the same
 * transaction, but only when they take effect today (`FR-3.16`, `US-05-12` AC-2): a change for another day is the pass of
 * that day's to announce.
 */
describe('DepartmentHeadService announces the head periods that take effect today', () => {
  const tx = { name: 'tx' };
  const actor = {
    subject: 'a',
    appUserId: 'a',
    sessionId: 's',
    employeeId: 'actor',
    directRoles: ['IT_ADMIN'],
    derivedRoles: [],
    roles: ['IT_ADMIN'],
  } as AuthenticatedPrincipal;
  const organization = {
    getOrganization: jest.fn(),
    businessToday: jest.fn(),
    lockEmployeeForShare: jest.fn(),
    getEmployee: jest.fn(),
    getDepartmentHeadHistory: jest.fn(),
    endDepartmentHeadPeriodsFrom: jest.fn(),
    startDepartmentHeadPeriod: jest.fn(),
    emitChange: jest.fn(),
  };
  const departments = { lock: jest.fn(), placementOn: jest.fn() };

  async function service(): Promise<DepartmentHeadService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DepartmentHeadService,
        { provide: DepartmentRepo, useValue: departments },
        { provide: OrganizationService, useValue: organization },
        {
          provide: IdentityAccessService,
          useValue: { inspectEmployeeAccount: jest.fn().mockResolvedValue({ roles: [] }) },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
        {
          provide: TransactionRunner,
          useValue: { run: jest.fn((work: (transaction: unknown) => Promise<unknown>) => work(tx)) },
        },
      ],
    }).compile();

    return moduleRef.get(DepartmentHeadService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    organization.getOrganization.mockResolvedValue({ id: 'org-1' });
    organization.businessToday.mockResolvedValue(TODAY);
    organization.getEmployee.mockResolvedValue({ id: 'new', employeeCode: 'NEW', status: 'ACTIVE' });
    organization.getDepartmentHeadHistory.mockResolvedValue([]);
    organization.startDepartmentHeadPeriod.mockResolvedValue({ periodId: 'period-new' });
    departments.lock.mockResolvedValue({ id: 'dep-1', status: 'ACTIVE' });
    departments.placementOn.mockResolvedValue({ departmentId: 'dep-1', validTo: null });
  });

  const emitted = () => organization.emitChange.mock.calls.map(([, change]: [unknown, unknown]) => change);

  it('announces the end of the head who goes and the start of the head who comes, in that order, for a change of today', async () => {
    organization.getDepartmentHeadHistory.mockResolvedValue([period('old', '2026-01-01')]);
    organization.endDepartmentHeadPeriodsFrom.mockResolvedValue(
      room({ ended: [period('old', '2026-01-01', TODAY)], endedPeriodIds: ['period-old'] }),
    );

    await (await service()).assign(actor, 'dep-1', { employeeId: 'new', effectiveFrom: TODAY });

    expect(emitted()).toEqual([
      {
        kind: 'HEAD_PERIOD_END',
        periodId: 'period-old',
        departmentId: 'dep-1',
        headEmployeeId: 'old',
        effectiveOn: TODAY,
      },
      {
        kind: 'HEAD_PERIOD_START',
        periodId: 'period-new',
        departmentId: 'dep-1',
        headEmployeeId: 'new',
        previousHeadEmployeeId: 'old',
        effectiveOn: TODAY,
      },
    ]);
    expect(organization.emitChange.mock.calls.every(([given]: [unknown]) => given === tx)).toBe(true);
  });

  it('counts a period opened today and cancelled today as one that was in force, and not one that was to begin later', async () => {
    organization.endDepartmentHeadPeriodsFrom.mockResolvedValue(
      room({
        cancelled: [period('today', TODAY), period('later', TOMORROW)],
        cancelledPeriodIds: ['period-today', 'period-later'],
      }),
    );

    await (await service()).vacate(actor, 'dep-1', { effectiveFrom: TODAY });

    expect(emitted()).toEqual([
      {
        kind: 'HEAD_PERIOD_END',
        periodId: 'period-today',
        departmentId: 'dep-1',
        headEmployeeId: 'today',
        effectiveOn: TODAY,
      },
    ]);
  });

  it('announces nothing for a change dated after today, and nothing when there was nobody to end', async () => {
    organization.endDepartmentHeadPeriodsFrom.mockResolvedValue(
      room({ ended: [period('old', '2026-01-01', TOMORROW)], endedPeriodIds: ['period-old'] }),
    );
    const heads = await service();

    await heads.assign(actor, 'dep-1', { employeeId: 'new', effectiveFrom: TOMORROW });
    await heads.vacate(actor, 'dep-1', { effectiveFrom: TOMORROW });
    organization.endDepartmentHeadPeriodsFrom.mockResolvedValue(room({}));
    await heads.vacate(actor, 'dep-1', { effectiveFrom: TODAY });

    expect(organization.emitChange).not.toHaveBeenCalled();
  });

  it('lets the error of a listener reach the transaction, so the change is not written without it', async () => {
    organization.endDepartmentHeadPeriodsFrom.mockResolvedValue(room({}));
    organization.emitChange.mockRejectedValue(new Error('listener refused'));

    await expect((await service()).assign(actor, 'dep-1', { employeeId: 'new', effectiveFrom: TODAY })).rejects.toThrow(
      'listener refused',
    );
  });
});
