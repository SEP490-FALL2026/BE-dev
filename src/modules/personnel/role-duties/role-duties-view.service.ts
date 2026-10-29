import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import type { DepartureNoticeWire, SuperAdminWatchWire } from './role-duties.dto';
import { assessSuperAdmin, departureLevel, flagMap } from './role-duties.policy';
import { RoleDutiesRepo } from './role-duties.repo';
import { RoleDutiesService } from './role-duties.service';

/**
 * What is read of the roles of a person who leaves, apart from the case itself (`US-03-04` AC-12, AC-13): the departure of the person
 * who asks, and the state of the Super Admin role. Reads only: no role, step or account is changed, and nobody loses anything by the day.
 */
@Injectable()
export class RoleDutiesViewService {
  constructor(
    private readonly repo: RoleDutiesRepo,
    private readonly roles: RoleDutiesService,
    private readonly identity: IdentityAccessApi,
    private readonly organization: OrganizationApi,
  ) {}

  /** The open departure of the person who asks, or null when there is none: never the departure of anyone else. */
  async noticeOf(principal: AuthenticatedPrincipal): Promise<DepartureNoticeWire | null> {
    const found = await this.repo.findOpenOf(principal.employeeId);
    if (!found || found.state === 'CANCELLED') return null;
    const today = await this.organization.businessToday();
    const view = (
      await this.roles.rolesOf([{ employeeId: found.employeeId, headsDepartment: found.headSuccessor !== null }])
    ).get(found.employeeId);

    return {
      lastWorkingDay: found.lastWorkingDay,
      state: found.state,
      level: departureLevel({ state: found.state, lastWorkingDay: found.lastWorkingDay }, today),
      roleFlags: flagMap(view?.flags ?? []),
    };
  }

  /** The four states of the Super Admin role, from the one person who holds it. */
  async superAdminWatch(): Promise<SuperAdminWatchWire> {
    const holder = await this.identity.getSuperAdminHolder();
    const today = await this.organization.businessToday();
    const handover = holder?.workState === 'HANDING_OVER' ? await this.repo.findOpenOf(holder.employeeId) : null;
    const assessed = assessSuperAdmin(
      holder && {
        locked: holder.status === 'LOCKED',
        activated: holder.activationState === 'ACTIVATED',
        awaitingCredentialReset: holder.awaitingCredentialReset,
        employeeTerminated: holder.employeeStatus === 'TERMINATED',
        workState: holder.workState,
      },
      handover && { lastWorkingDay: handover.lastWorkingDay },
      today,
    );
    const person = holder ? (await this.organization.getEmployees([holder.employeeId]))[0] : undefined;

    return {
      ...assessed,
      holder:
        holder && person
          ? {
              id: person.id,
              employeeCode: person.employeeCode,
              fullName: person.fullName,
              workState: holder.workState,
              lastWorkingDay: handover?.lastWorkingDay ?? null,
            }
          : null,
    };
  }
}
