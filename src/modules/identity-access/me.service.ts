import { Injectable } from '@nestjs/common';
import { businessDateAt, toDateColumn } from '../../core/business-date';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationService } from '../organization/organization.service';
import { IdentityAccessRepo } from './identity-access.repo';

export interface MeView {
  appUserId: string;
  loginEmail: string;
  employee: {
    id: string;
    employeeCode: string;
    fullName: string;
    department: { code: string; name: string } | null;
    jobTitle: string | null;
  };
  roles: { direct: string[]; derived: string[]; effective: string[] };
  selfServiceOnly: boolean;
}

@Injectable()
export class MeService {
  constructor(
    private readonly repo: IdentityAccessRepo,
    private readonly organization: OrganizationService,
  ) {}

  /** The caller's own identity and effective roles. Roles come from the principal resolved this request. */
  async get(principal: AuthenticatedPrincipal): Promise<MeView> {
    const [loginEmail, organization] = await Promise.all([
      this.repo.findLoginEmail(principal.appUserId),
      this.organization.getOrganization(),
    ]);
    // The placement in force today, in the organization's own calendar.
    const today = toDateColumn(businessDateAt(new Date(), organization?.timeZone ?? 'UTC'));
    const profile = await this.organization.getEmployeeProfile(principal.employeeId, today);
    if (loginEmail === null || profile === null) {
      throw new Error('An authenticated principal lost its account or employee record');
    }

    return {
      appUserId: principal.appUserId,
      loginEmail,
      employee: profile,
      roles: {
        direct: [...principal.directRoles],
        derived: [...principal.derivedRoles],
        effective: [...principal.roles],
      },
      selfServiceOnly: principal.roles.length === 0,
    };
  }
}
