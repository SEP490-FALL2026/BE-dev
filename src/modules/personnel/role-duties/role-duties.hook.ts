import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { personnelSystemAuditEvent } from '../mappers/personnel-audit-event';
import { PersonnelFileHooks, type PersonnelFileEvent } from '../personnel-file-hooks';
import { isHighPriority, sameFlags } from './role-duties.policy';
import { RoleDutiesRepo } from './role-duties.repo';
import { RoleDutiesService } from './role-duties.service';

type Stage = 'RECORDED' | 'DUE_CHANGED' | 'LEFT';

/**
 * Tells the Super Admin and the IT Admin which roles the person who leaves holds that someone must take over (`US-03-04` AC-11, AC-27,
 * AC-28): when the departure is recorded the audit event `OFFBOARDING_CASE.ROLE_HOLDER_FLAGGED` names the roles once, and the snapshot of
 * the flags is written to the case for the filter of the list. When the day moves the snapshot is written again, and the event again only
 * if the roles changed. When the person has left, a Super Admin role or a workspace that still has no one to take over is told again with
 * the highest priority (the workspace will lose its owner: change the owner or use the emergency account the plan names). It never holds
 * a record, a lock or a revocation back: nothing here changes a role, a step or an account, and no password or key is read or written.
 * The event is the point the notification channel takes the alert from (`g4-notification-delivery`).
 */
@Injectable()
export class RoleDutiesHook implements OnModuleInit {
  constructor(
    private readonly hooks: PersonnelFileHooks,
    private readonly repo: RoleDutiesRepo,
    private readonly roles: RoleDutiesService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.hooks.register({
      onRecorded: (tx, event) => this.settle(tx, event, 'RECORDED'),
      onDueChanged: (tx, event) => this.settle(tx, event, 'DUE_CHANGED'),
      onLeft: (tx, event) => this.settle(tx, event, 'LEFT'),
    });
  }

  private async settle(tx: DbTx, event: PersonnelFileEvent, stage: Stage): Promise<void> {
    if (event.fileKind !== 'OFFBOARDING') return;
    const found = await this.repo.findCase(event.fileId, tx);
    if (!found) return;
    const view = (
      await this.roles.rolesOf([{ employeeId: found.employeeId, headsDepartment: found.headSuccessor !== null }], tx)
    ).get(found.employeeId);
    if (!view) return;

    await this.repo.writeFlags(found.id, view.flags, tx);
    const tell =
      stage === 'RECORDED'
        ? view.flags.length > 0
        : stage === 'DUE_CHANGED'
          ? view.flags.length > 0 && !sameFlags(found.roleFlags, view.flags)
          : isHighPriority(view.flags);
    const organization = tell ? await this.organization.getOrganization(tx) : null;
    if (!tell || !organization) return;

    await this.audit.record(
      tx,
      personnelSystemAuditEvent(
        organization.id,
        'OFFBOARDING_CASE.ROLE_HOLDER_FLAGGED',
        'OffboardingCase',
        found.id,
        found.id,
        null,
        {
          employeeId: found.employeeId,
          stage,
          priority: isHighPriority(view.flags) ? 'HIGH' : 'NORMAL',
          audience: ['SUPER_ADMIN', 'IT_ADMIN'],
          flags: view.flags,
          lastWorkingDay: found.lastWorkingDay,
          dueOn: event.dueOn,
          itAdminDepartmentCodes: view.itAdminDepartmentCodes,
          departmentHeadSuccessor: found.headSuccessor,
          // At the departure: the workspace will lose its owner. Change the owner, or use the emergency account the plan names.
          workspacesLoseOwner: stage === 'LEFT' && view.workspaces.length > 0,
          workspaces: view.workspaces.map((duty) => ({
            planId: duty.planId,
            planName: duty.planName,
            applicationName: duty.applicationName,
            role: duty.role,
            emergencyAccountDeclared: duty.emergencyAccountDeclared,
          })),
        },
      ),
    );
  }
}
