import { Injectable, OnModuleInit } from '@nestjs/common';
import { DevicesApi } from '../../devices/public/devices.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelFileHookContributions } from '../public/personnel.extension-points';
import { OffboardingRepo } from './offboarding.repo';

/**
 * Syncs machine custody and return tasks with offboarding lifecycle events. Re-reads the case on recording and
 * due-date changes so return deadlines use the last working day rather than `departureEffectiveOn`. Cancelling
 * after the access block runs here after seat revocation withdrawal on account-bound plans; locking machines and
 * return tasks after those tiers is safe because device-key and account-bound subscription sets are disjoint.
 */
@Injectable()
export class DeviceRegistrationHook implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [PersonnelFileHookContributions] as const;

  constructor(
    private readonly hooks: PersonnelFileHookContributions,
    private readonly devices: DevicesApi,
    private readonly offboarding: OffboardingRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  onModuleInit(): void {
    this.hooks.add('personnel.device-registration', {
      onRecorded: async (tx, event) => {
        if (event.fileKind !== 'OFFBOARDING') return;
        const resolved = await this.resolveDueDate(tx, event.fileId);
        if (!resolved) return;
        await this.devices.openReturnTasksForDeparture(tx, {
          employeeId: resolved.record.employeeId,
          caseId: resolved.record.id,
          departmentId: resolved.record.departmentId,
          dueOn: resolved.dueOn,
        });
      },
      onDueChanged: async (tx, event) => {
        if (event.fileKind !== 'OFFBOARDING') return;
        const resolved = await this.resolveDueDate(tx, event.fileId);
        if (!resolved) return;
        await this.devices.moveReturnTaskDue(tx, { caseId: resolved.record.id, dueOn: resolved.dueOn });
      },
      onLeft: async (tx, event) => {
        if (event.fileKind !== 'OFFBOARDING') return;
        await this.devices.endRegistrationsOfHolder(tx, {
          employeeId: event.employeeId,
          end: { at: new Date() },
          cause: 'EMPLOYEE_LEFT',
        });
      },
      onCancelled: async (tx, event) => {
        if (event.fileKind !== 'OFFBOARDING') return;
        // Return task cancellation runs before accessBlockInForce registration ending, and after seat withdrawal
        // (tiers 3b-8) on account plans, which stays deadlock-free as device-key and account plans never intersect.
        await this.devices.cancelReturnTasksOfCase(tx, { caseId: event.fileId, at: new Date() });
        if (event.accessBlockInForce !== true) return;
        await this.devices.endRegistrationsOfHolder(tx, {
          employeeId: event.employeeId,
          end: { at: new Date() },
          cause: 'DEPARTURE_BLOCKED',
        });
      },
    });
  }

  private async resolveDueDate(tx: Parameters<OffboardingRepo['find']>[1], caseId: string) {
    const record = await this.offboarding.find(caseId, tx);
    if (!record) return null;
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const dueOn = this.devices.returnDueOn({
      accessBlockMode: record.accessBlockMode,
      lastWorkingDay: record.lastWorkingDay,
      today,
    });

    return { record, dueOn };
  }
}
