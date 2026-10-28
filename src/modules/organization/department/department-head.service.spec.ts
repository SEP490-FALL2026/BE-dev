import { Test } from '@nestjs/testing';
import { HR_BASIS } from '../../../../test/support/hr-basis';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { EmployeeNotFoundError } from '../organization.errors';
import { OrganizationService } from '../organization.service';
import { DepartmentForbiddenError, HeadAssignmentError } from './department.errors';
import { DepartmentHeadService } from './department-head.service';
import { DepartmentRepo } from './department.repo';
import type { HeadPeriodRecord } from './department.types';

const TODAY = '2026-10-19';
const LATER = '2026-11-01';

/** An asymmetric matcher typed `unknown`, so it can sit inside another matcher without an `any` leaking in. */
const containing = (fields: object): unknown => expect.objectContaining(fields);

const period = (employeeId: string, validFrom: string, validTo: string | null = null): HeadPeriodRecord => ({
  employeeId,
  employeeCode: employeeId.toUpperCase(),
  fullName: employeeId,
  validFrom,
  validTo,
});

/**
 * Who may name a head and a successor (`F13`, `QĐ-87a`), the employee look-up behind the head check (H4.1, F-12) and the successor
 * rules (`QĐ-87` `D-5`). Driven through the public service methods with in-memory collaborators, never through a controller.
 */
describe('DepartmentHeadService', () => {
  const tx = { name: 'tx' };
  const principal = (role: string): AuthenticatedPrincipal => ({
    subject: 'app-user-1',
    appUserId: 'app-user-1',
    sessionId: 'session-1',
    employeeId: 'emp-actor',
    directRoles: [role],
    derivedRoles: [],
    roles: [role],
  });
  const superAdmin = principal('SUPER_ADMIN');

  const organization = {
    getOrganization: jest.fn(),
    businessToday: jest.fn(),
    lockEmployeeForShare: jest.fn(),
    getEmployee: jest.fn(),
    getDepartmentHeadHistory: jest.fn(),
    endDepartmentHeadPeriodsFrom: jest.fn(),
    startDepartmentHeadPeriod: jest.fn(),
    clearDepartmentHeadSuccessor: jest.fn(),
    emitChange: jest.fn(),
  };
  const departments = { lock: jest.fn(), placementOn: jest.fn() };
  const audit = { record: jest.fn() };
  const runner = { run: jest.fn((work: (transaction: unknown) => Promise<unknown>) => work(tx)) };

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
        { provide: AuditService, useValue: audit },
        { provide: TransactionRunner, useValue: runner },
      ],
    }).compile();

    return moduleRef.get(DepartmentHeadService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    organization.getOrganization.mockResolvedValue({ id: 'org-1' });
    organization.businessToday.mockResolvedValue(TODAY);
    organization.getEmployee.mockResolvedValue({ id: 'emp-next', employeeCode: 'NEXT', status: 'ACTIVE' });
    organization.getDepartmentHeadHistory.mockResolvedValue([period('emp-head', '2026-01-01')]);
    organization.endDepartmentHeadPeriodsFrom.mockResolvedValue({
      cancelled: [],
      ended: [],
      endedPeriodIds: [],
      cancelledPeriodIds: [],
    });
    organization.startDepartmentHeadPeriod.mockResolvedValue({ periodId: 'period-next' });
    departments.lock.mockResolvedValue({ id: 'dep-1', status: 'ACTIVE' });
    departments.placementOn.mockResolvedValue({ departmentId: 'dep-1', validTo: null });
  });

  describe('who may (F13): the Super Admin alone, whatever the route let through', () => {
    it.each([['IT_ADMIN'], ['FINANCE'], ['MANAGER'], ['EMPLOYEE']])(
      'refuses every head operation to the %s before it reads or writes anything',
      async (role) => {
        const heads = await service();
        const actor = principal(role);
        const calls = [
          () => heads.assign(actor, 'dep-1', { employeeId: 'emp-next', effectiveFrom: TODAY, hrBasis: HR_BASIS }),
          () => heads.vacate(actor, 'dep-1', { effectiveFrom: TODAY, hrBasis: HR_BASIS }),
          () =>
            heads.designateSuccessor(actor, 'dep-1', {
              employeeId: 'emp-next',
              effectiveFrom: LATER,
              hrBasis: HR_BASIS,
            }),
          () => heads.clearSuccessor(actor, 'dep-1', { hrBasis: HR_BASIS }),
        ];

        for (const call of calls) await expect(call()).rejects.toBeInstanceOf(DepartmentForbiddenError);
        expect(organization.getOrganization).not.toHaveBeenCalled();
        expect(runner.run).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      },
    );
  });

  describe('naming a head', () => {
    it('answers EMPLOYEE_NOT_FOUND when the person named head is not an employee', async () => {
      organization.lockEmployeeForShare.mockRejectedValue(new EmployeeNotFoundError('emp-missing'));
      const headService = await service();

      const refusal: unknown = await headService
        .assign(superAdmin, 'dep-1', { employeeId: 'emp-missing', effectiveFrom: TODAY, hrBasis: HR_BASIS })
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(HeadAssignmentError);
      expect((refusal as HeadAssignmentError).problem).toBe('EMPLOYEE_NOT_FOUND');
      expect(departments.lock).toHaveBeenCalledWith(tx, 'dep-1', 'UPDATE');
      expect(organization.getEmployee).not.toHaveBeenCalled();
    });

    it('records the HR basis it was named on with the change', async () => {
      organization.getDepartmentHeadHistory.mockResolvedValue([]);

      await (
        await service()
      ).assign(superAdmin, 'dep-1', { employeeId: 'emp-next', effectiveFrom: TODAY, hrBasis: HR_BASIS });

      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'DEPARTMENT.HEAD_ASSIGNED',
          after: containing({ head: 'NEXT', hrBasis: HR_BASIS }),
        }),
      );
    });
  });

  describe('naming the successor of the head (QĐ-87 D-5)', () => {
    const designate = async (overrides: Partial<{ employeeId: string; effectiveFrom: string }> = {}) =>
      (await service()).designateSuccessor(superAdmin, 'dep-1', {
        employeeId: 'emp-next',
        effectiveFrom: LATER,
        hrBasis: HR_BASIS,
        ...overrides,
      });

    it('ends the head the day before and starts the successor, written ahead, and audits it with the basis', async () => {
      await designate();

      expect(organization.endDepartmentHeadPeriodsFrom).toHaveBeenCalledWith(tx, 'dep-1', LATER);
      expect(organization.startDepartmentHeadPeriod).toHaveBeenCalledWith(tx, {
        organizationId: 'org-1',
        departmentId: 'dep-1',
        employeeId: 'emp-next',
        validFrom: LATER,
      });
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'DEPARTMENT.SUCCESSOR_DESIGNATED',
          before: { head: 'EMP-HEAD', successor: null },
          after: { head: 'EMP-HEAD', successor: 'NEXT', effectiveFrom: LATER, hrBasis: HR_BASIS },
        }),
      );
      // The day has not come: no listener is told.
      expect(organization.emitChange).not.toHaveBeenCalled();
    });

    it.each<[string, () => Promise<unknown>, string]>([
      ['today', () => designate({ effectiveFrom: TODAY }), 'SUCCESSOR_DATE_NOT_FUTURE'],
      ['a day in the past', () => designate({ effectiveFrom: '2026-10-01' }), 'SUCCESSOR_DATE_NOT_FUTURE'],
      ['the head themself', () => designate({ employeeId: 'emp-head' }), 'SUCCESSOR_IS_THE_HEAD'],
    ])('refuses %s, writing nothing', async (_name, call, problem) => {
      await expect(call()).rejects.toMatchObject({ problem });

      expect(organization.startDepartmentHeadPeriod).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refuses when nobody heads the department today: the person is named its head instead', async () => {
      organization.getDepartmentHeadHistory.mockResolvedValue([]);

      await expect(designate()).rejects.toMatchObject({ problem: 'SUCCESSOR_NEEDS_A_HEAD' });
      expect(organization.startDepartmentHeadPeriod).not.toHaveBeenCalled();
    });

    it('refuses when a successor is already named, so one cannot silently replace another', async () => {
      organization.getDepartmentHeadHistory.mockResolvedValue([
        period('emp-other', LATER),
        period('emp-head', '2026-01-01', LATER),
      ]);

      await expect(designate()).rejects.toMatchObject({ problem: 'SUCCESSOR_ALREADY_NAMED' });
      expect(organization.startDepartmentHeadPeriod).not.toHaveBeenCalled();
    });

    it('judges the person like any head: not a Super Admin, working, a member that day', async () => {
      departments.placementOn.mockResolvedValue({ departmentId: 'dep-other', validTo: null });
      await expect(designate()).rejects.toMatchObject({ problem: 'NOT_A_MEMBER_ON_DATE' });

      departments.placementOn.mockResolvedValue({ departmentId: 'dep-1', validTo: null });
      organization.getEmployee.mockResolvedValue({ id: 'emp-next', employeeCode: 'NEXT', status: 'TERMINATED' });
      await expect(designate()).rejects.toMatchObject({ problem: 'EMPLOYEE_NOT_ACTIVE' });
      expect(organization.startDepartmentHeadPeriod).not.toHaveBeenCalled();
    });
  });

  describe('taking the successor back', () => {
    it('reopens the head period and audits who was named and who keeps the department, with the basis', async () => {
      organization.clearDepartmentHeadSuccessor.mockResolvedValue({
        successor: period('emp-next', LATER),
        restoredHead: period('emp-head', '2026-01-01'),
      });

      await (await service()).clearSuccessor(superAdmin, 'dep-1', { hrBasis: HR_BASIS });

      expect(organization.clearDepartmentHeadSuccessor).toHaveBeenCalledWith(tx, 'dep-1', TODAY);
      expect(audit.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'DEPARTMENT.SUCCESSOR_CLEARED',
          before: { successor: 'EMP-NEXT', effectiveFrom: LATER },
          after: { successor: null, head: 'EMP-HEAD', hrBasis: HR_BASIS },
        }),
      );
    });

    it('changes and records nothing when nobody is named', async () => {
      organization.clearDepartmentHeadSuccessor.mockResolvedValue(null);

      await (await service()).clearSuccessor(superAdmin, 'dep-1', { hrBasis: HR_BASIS });

      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
