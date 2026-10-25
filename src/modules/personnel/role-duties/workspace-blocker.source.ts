import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OffboardingBlockerRegistry } from '../offboarding/offboarding-blocker.registry';
import { WORKSPACE_OWNER_NOT_TRANSFERRED } from '../personnel.types';
import { RoleDutiesService } from './role-duties.service';

/**
 * Keeps the record of a departure open while the person who left still owns or administers the workspace of a K2 plan (`US-03-04` AC-28,
 * `QĐ-77d`): the count is how many such workspaces there are, read when the case is shown or closed. The departure is recorded and takes
 * effect all the same; only the closing waits, until the workspace profile of each plan names someone else (a step the catalog already has).
 * Nothing about a password or a key of the workspace is read or kept.
 */
@Injectable()
export class WorkspaceBlockerSource implements OnModuleInit {
  constructor(
    private readonly registry: OffboardingBlockerRegistry,
    private readonly roles: RoleDutiesService,
  ) {}

  onModuleInit(): void {
    this.registry.registerBlocker({
      code: WORKSPACE_OWNER_NOT_TRANSFERRED,
      countFor: (employeeId: string, tx?: DbTx) => this.roles.workspaceCountOf(employeeId, tx),
    });
  }
}
