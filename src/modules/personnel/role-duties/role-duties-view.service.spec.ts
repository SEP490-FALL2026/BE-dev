import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RoleDutiesViewService } from './role-duties-view.service';
import type { RoleDutiesRepo, RoleDutyCase } from './role-duties.repo';
import type { RoleDutiesService } from './role-duties.service';

const PRINCIPAL: AuthenticatedPrincipal = {
  subject: 'app-1',
  appUserId: 'app-1',
  sessionId: 'sess-1',
  employeeId: 'emp-1',
  directRoles: ['EMPLOYEE'],
  roles: ['EMPLOYEE'],
};

const CASE: RoleDutyCase = {
  id: '00000000-0000-4000-8000-000000000099',
  employeeId: 'emp-1',
  state: 'HANDING_OVER',
  lastWorkingDay: '2026-11-10',
  headSuccessor: null,
  departmentId: 'dep-1',
  closed: false,
  roleFlags: [],
};

describe('RoleDutiesViewService', () => {
  it('returns offboardingCaseId on noticeOf for the signed-in leaver', async () => {
    const repo = { findOpenOf: jest.fn().mockResolvedValue(CASE) } as unknown as RoleDutiesRepo;
    const roles = { rolesOf: jest.fn().mockResolvedValue(new Map()) } as unknown as RoleDutiesService;
    const identity = {} as IdentityAccessApi;
    const org = { businessToday: jest.fn().mockResolvedValue('2026-11-01') } as unknown as OrganizationReadApi;

    const service = new RoleDutiesViewService(repo, roles, identity, org);

    await expect(service.noticeOf(PRINCIPAL)).resolves.toMatchObject({
      offboardingCaseId: CASE.id,
      state: 'HANDING_OVER',
      lastWorkingDay: '2026-11-10',
    });
  });
});
