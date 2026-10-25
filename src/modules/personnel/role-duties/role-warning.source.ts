import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OffboardingBlockerRegistry } from '../offboarding/offboarding-blocker.registry';
import { OFFBOARDING_ROLE_HOLDER } from '../personnel.types';
import { RoleDutiesRepo } from './role-duties.repo';
import { RoleDutiesService } from './role-duties.service';

/**
 * Shows beside the departure how many of the roles that need someone to take over the person still holds (`US-03-04` AC-11, AC-27): the
 * Super Admin, Finance, an approval role, the IT Admin in charge of a department, the head of a department, a workspace. It is a warning
 * and never a blocker: the record, the lock of the account and the revocations go on whether anyone has taken the roles over or not.
 */
@Injectable()
export class RoleWarningSource implements OnModuleInit {
  constructor(
    private readonly registry: OffboardingBlockerRegistry,
    private readonly repo: RoleDutiesRepo,
    private readonly roles: RoleDutiesService,
  ) {}

  onModuleInit(): void {
    this.registry.registerWarning({
      code: OFFBOARDING_ROLE_HOLDER,
      countFor: (employeeId: string, tx?: DbTx) => this.countOf(employeeId, tx),
    });
  }

  /** How many roles the person holds that need someone to take over, for the case of theirs that is not closed. */
  async countOf(employeeId: string, tx?: DbTx): Promise<number> {
    const found = await this.repo.findOpenOf(employeeId, tx);
    if (!found) return 0;
    const view = (await this.roles.rolesOf([{ employeeId, headsDepartment: found.headSuccessor !== null }], tx)).get(
      employeeId,
    );

    return view?.flags.length ?? 0;
  }
}
