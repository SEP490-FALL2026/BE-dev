import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ToolsDepartmentNotFoundError, ToolsDepartmentOutOfScopeError } from '../public/licensing.errors';
import { DepartmentSoftwareAccessService } from './department-software-access.service';
import {
  DepartmentSoftwareNotInChargeError,
  DepartmentSoftwareProposalNotFoundError,
} from './department-software.errors';
import { toDepartmentSoftwareApiException } from './department-software.http-errors';

const TX = { marker: 'tx' } as unknown as DbTx;
const DEPARTMENT = 'dept-des';

const IT_IN_CHARGE: AuthenticatedPrincipal = {
  subject: 'u-ha',
  appUserId: 'user-ha',
  sessionId: 'sess-ha',
  employeeId: 'emp-ha',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
};

const IT_OTHER: AuthenticatedPrincipal = {
  subject: 'u-other',
  appUserId: 'user-other',
  sessionId: 'sess-other',
  employeeId: 'emp-other',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
};

const MANAGER: AuthenticatedPrincipal = {
  subject: 'u-mgr',
  appUserId: 'user-mgr',
  sessionId: 'sess-mgr',
  employeeId: 'emp-mgr',
  directRoles: ['MANAGER'],
  roles: ['MANAGER'],
};

function setup(options?: {
  departmentExists?: boolean;
  readScope?: string[];
  actingScope?: string[];
  acting?: { inCharge: string | null; substitute: string | null; defaultAssignee: string | null; actors: string[] };
}) {
  const usableIds = new Set<string>(['emp-ha', 'emp-other']);
  const identity = {
    findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(usableIds),
  };
  const organizationReads = {
    getDepartmentBrief: jest
      .fn()
      .mockResolvedValue(
        options?.departmentExists === false ? null : { id: DEPARTMENT, code: 'DES', name: 'Design', active: true },
      ),
    businessToday: jest.fn().mockResolvedValue('2026-11-24'),
    getHeadedDepartment: jest.fn().mockResolvedValue(null),
    getDepartmentMemberIds: jest.fn().mockResolvedValue([]),
    getItAdminScope: jest.fn(
      async (_employeeId: string, usableAmong: (ids: readonly string[]) => Promise<Set<string>>) => {
        await usableAmong(['emp-ha']);
        return options?.readScope ?? [DEPARTMENT];
      },
    ),
    getItAdminActingScope: jest.fn(
      async (_employeeId: string, usableAmong: (ids: readonly string[]) => Promise<Set<string>>) => {
        await usableAmong(['emp-ha']);
        return options?.actingScope ?? [];
      },
    ),
    itAdminsActingFor: jest.fn(
      async (_ids: readonly string[], usableAmong: (ids: readonly string[]) => Promise<Set<string>>) => {
        await usableAmong(['emp-ha']);
        return options?.acting ? new Map([[DEPARTMENT, options.acting]]) : new Map();
      },
    ),
  };
  const service = new DepartmentSoftwareAccessService(
    organizationReads as unknown as OrganizationReadApi,
    identity as unknown as IdentityAccessApi,
  );

  return { service, organizationReads, identity };
}

describe('DepartmentSoftwareAccessService (read scope vs acting scope)', () => {
  describe('itAdminScope and itAdminActingScope', () => {
    it('itAdminScope reads getItAdminScope (including departments without an acting IT Admin) and passes tx', async () => {
      const { service, organizationReads, identity } = setup({ readScope: [DEPARTMENT], actingScope: [] });

      const scope = await service.itAdminScope(IT_OTHER, TX);

      expect([...scope]).toEqual([DEPARTMENT]);
      expect(organizationReads.getItAdminScope).toHaveBeenCalledWith('emp-other', expect.any(Function), TX);
      expect(identity.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['emp-ha'], TX);
    });

    it('itAdminActingScope reads getItAdminActingScope (excluding common queue) and passes tx', async () => {
      const { service, organizationReads, identity } = setup({ readScope: [DEPARTMENT], actingScope: [DEPARTMENT] });

      const scope = await service.itAdminActingScope(IT_IN_CHARGE, TX);

      expect([...scope]).toEqual([DEPARTMENT]);
      expect(organizationReads.getItAdminActingScope).toHaveBeenCalledWith('emp-ha', expect.any(Function), TX);
      expect(identity.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['emp-ha'], TX);
    });

    it('returns empty sets for non-IT Admin callers without calling organizationReads', async () => {
      const { service, organizationReads } = setup();

      expect([...(await service.itAdminScope(MANAGER))]).toEqual([]);
      expect([...(await service.itAdminActingScope(MANAGER))]).toEqual([]);
      expect(organizationReads.getItAdminScope).not.toHaveBeenCalled();
      expect(organizationReads.getItAdminActingScope).not.toHaveBeenCalled();
    });
  });

  describe('assertMayRead', () => {
    it('allows any IT Admin to read the department software list even when outside acting scope', async () => {
      const { service } = setup({ readScope: [DEPARTMENT], actingScope: [] });

      await expect(service.assertMayRead(IT_OTHER, DEPARTMENT)).resolves.toBeUndefined();
    });

    it('refuses a missing department with 404 DEPARTMENT.NOT_FOUND', async () => {
      const { service } = setup({ departmentExists: false });

      const caught = await service.assertMayRead(IT_OTHER, DEPARTMENT).catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(ToolsDepartmentNotFoundError);
      const apiEx = toDepartmentSoftwareApiException(caught) as ApiException;
      expect(apiEx.getStatus()).toBe(404);
      expect(apiEx.getResponse()).toMatchObject({ code: 'DEPARTMENT.NOT_FOUND' });
    });
  });

  describe('assertMayChange', () => {
    it('refuses a missing department with 404 DEPARTMENT.NOT_FOUND', async () => {
      const { service } = setup({ departmentExists: false });

      const caught = await service.assertMayChange(IT_OTHER, DEPARTMENT, TX).catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(ToolsDepartmentNotFoundError);
      const apiEx = toDepartmentSoftwareApiException(caught) as ApiException;
      expect(apiEx.getStatus()).toBe(404);
      expect(apiEx.getResponse()).toMatchObject({ code: 'DEPARTMENT.NOT_FOUND' });
    });

    it('refuses an IT Admin when department has no acting IT Admin (in read scope, not in acting scope) with 403 DEPARTMENT.OUT_OF_SCOPE', async () => {
      const { service, organizationReads } = setup({ readScope: [DEPARTMENT], actingScope: [] });

      const caught = await service.assertMayChange(IT_OTHER, DEPARTMENT, TX).catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(ToolsDepartmentOutOfScopeError);
      const apiEx = toDepartmentSoftwareApiException(caught) as ApiException;
      expect(apiEx.getStatus()).toBe(403);
      expect(apiEx.getResponse()).toMatchObject({ code: 'DEPARTMENT.OUT_OF_SCOPE' });
      expect(organizationReads.getItAdminActingScope).toHaveBeenCalledWith('emp-other', expect.any(Function), TX);
      expect(organizationReads.getItAdminScope).not.toHaveBeenCalled();
    });

    it('refuses a non-IT Admin with 403 DEPARTMENT.OUT_OF_SCOPE', async () => {
      const { service } = setup({ readScope: [DEPARTMENT], actingScope: [DEPARTMENT] });

      const caught = await service.assertMayChange(MANAGER, DEPARTMENT, TX).catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(ToolsDepartmentOutOfScopeError);
      const apiEx = toDepartmentSoftwareApiException(caught) as ApiException;
      expect(apiEx.getStatus()).toBe(403);
      expect(apiEx.getResponse()).toMatchObject({ code: 'DEPARTMENT.OUT_OF_SCOPE' });
    });

    it('allows the usable IT Admin in charge with bySubstitute: false', async () => {
      const { service, organizationReads } = setup({
        actingScope: [DEPARTMENT],
        acting: { inCharge: 'emp-ha', substitute: null, defaultAssignee: 'emp-ha', actors: ['emp-ha'] },
      });

      const decision = await service.assertMayChange(IT_IN_CHARGE, DEPARTMENT, TX);

      expect(decision).toEqual({ bySubstitute: false });
      expect(organizationReads.getDepartmentBrief).toHaveBeenCalledWith(DEPARTMENT, TX);
      expect(organizationReads.itAdminsActingFor).toHaveBeenCalledWith([DEPARTMENT], expect.any(Function), TX);
    });

    it('allows an appointed usable substitute IT Admin with bySubstitute: true', async () => {
      const { service } = setup({
        actingScope: [DEPARTMENT],
        acting: { inCharge: null, substitute: 'emp-other', defaultAssignee: 'emp-other', actors: ['emp-other'] },
      });

      const decision = await service.assertMayChange(IT_OTHER, DEPARTMENT, TX);

      expect(decision).toEqual({ bySubstitute: true });
    });
  });

  describe('assertMayDecideProposal', () => {
    it('hides proposals outside read scope with 404 DEPARTMENT_SOFTWARE.PROPOSAL_NOT_FOUND', async () => {
      const { service, organizationReads } = setup({ readScope: [], actingScope: [] });

      const caught = await service.assertMayDecideProposal(IT_OTHER, DEPARTMENT).catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(DepartmentSoftwareProposalNotFoundError);
      const apiEx = toDepartmentSoftwareApiException(caught) as ApiException;
      expect(apiEx.getStatus()).toBe(404);
      expect(apiEx.getResponse()).toMatchObject({ code: 'DEPARTMENT_SOFTWARE.PROPOSAL_NOT_FOUND' });
      expect(organizationReads.getItAdminActingScope).not.toHaveBeenCalled();
    });

    it('refuses proposals in read scope but outside acting scope with 403 DEPARTMENT_SOFTWARE.NOT_IN_CHARGE', async () => {
      const { service } = setup({ readScope: [DEPARTMENT], actingScope: [] });

      const caught = await service.assertMayDecideProposal(IT_OTHER, DEPARTMENT, TX).catch((error: unknown) => error);

      expect(caught).toBeInstanceOf(DepartmentSoftwareNotInChargeError);
      const apiEx = toDepartmentSoftwareApiException(caught) as ApiException;
      expect(apiEx.getStatus()).toBe(403);
      expect(apiEx.getResponse()).toMatchObject({ code: 'DEPARTMENT_SOFTWARE.NOT_IN_CHARGE' });
    });

    it('allows the usable IT Admin in charge with bySubstitute: false', async () => {
      const { service } = setup({
        readScope: [DEPARTMENT],
        actingScope: [DEPARTMENT],
        acting: { inCharge: 'emp-ha', substitute: null, defaultAssignee: 'emp-ha', actors: ['emp-ha'] },
      });

      await expect(service.assertMayDecideProposal(IT_IN_CHARGE, DEPARTMENT, TX)).resolves.toEqual({
        bySubstitute: false,
      });
    });

    it('allows an appointed usable substitute IT Admin with bySubstitute: true', async () => {
      const { service } = setup({
        readScope: [DEPARTMENT],
        actingScope: [DEPARTMENT],
        acting: { inCharge: null, substitute: 'emp-other', defaultAssignee: 'emp-other', actors: ['emp-other'] },
      });

      await expect(service.assertMayDecideProposal(IT_OTHER, DEPARTMENT, TX)).resolves.toEqual({
        bySubstitute: true,
      });
    });
  });
});
