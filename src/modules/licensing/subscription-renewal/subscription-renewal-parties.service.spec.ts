import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RenewalPartiesService } from './subscription-renewal-parties.service';

const principal = (roles: string[]): AuthenticatedPrincipal =>
  ({ appUserId: 'U1', employeeId: 'E1', roles, directRoles: roles }) as unknown as AuthenticatedPrincipal;

const service = (headed: { departmentId: string } | null) =>
  new RenewalPartiesService(
    { getHeadedDepartment: jest.fn().mockResolvedValue(headed) } as unknown as OrganizationReadApi,
    {} as unknown as IdentityAccessApi,
  );

describe('the read scope of the renewals', () => {
  it('lets the head of today read the cases of their department whatever role their account holds (A-M1)', async () => {
    for (const roles of [['MANAGER'], ['EMPLOYEE'], []]) {
      expect(await service({ departmentId: 'D1' }).readScopeOf(principal(roles), '2026-11-06')).toEqual({
        kind: 'DEPARTMENT',
        departmentId: 'D1',
      });
    }
  });

  it('gives nothing to someone who heads no department and is neither IT Admin nor Finance', async () => {
    expect(await service(null).readScopeOf(principal(['EMPLOYEE']), '2026-11-06')).toBeNull();
  });

  it('gives the IT Admin every case and Finance every case to read only', async () => {
    expect(await service(null).readScopeOf(principal(['IT_ADMIN']), '2026-11-06')).toEqual({
      kind: 'ALL',
      itAdmin: true,
    });
    expect(await service(null).readScopeOf(principal(['FINANCE']), '2026-11-06')).toEqual({
      kind: 'ALL',
      itAdmin: false,
    });
  });
});
