import { Injectable, OnModuleInit } from '@nestjs/common';
import { DevicesApi } from '../../devices/public/devices.api';
import { PersonnelFileHookContributions } from '../public/personnel.extension-points';

/**
 * A person who has left holds no company machine (`US-09-08`): when the departure is marked `LEFT`, in the same transaction, every
 * open registration of theirs ends with the cause `EMPLOYEE_LEFT`. It covers an abrupt departure as well as one marked after the last
 * day. A handover cancelled after the block took effect ends them too, with the cause `DEPARTURE_BLOCKED`, so the unlock that lifts the
 * block never revives a credential (`QĐ-100z`, A3 `D09`); one cancelled before the last working day takes nothing back. A transfer to
 * another department changes nothing here: the machine stays with its holder.
 */
@Injectable()
export class DeviceRegistrationHook implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [PersonnelFileHookContributions] as const;

  constructor(
    private readonly hooks: PersonnelFileHookContributions,
    private readonly devices: DevicesApi,
  ) {}

  onModuleInit(): void {
    this.hooks.add('personnel.device-registration', {
      onLeft: async (tx, event) => {
        if (event.fileKind !== 'OFFBOARDING') return;
        await this.devices.endRegistrationsOfHolder(tx, {
          employeeId: event.employeeId,
          end: { at: new Date() },
          cause: 'EMPLOYEE_LEFT',
        });
      },
      onCancelled: async (tx, event) => {
        if (event.fileKind !== 'OFFBOARDING' || event.accessBlockInForce !== true) return;
        await this.devices.endRegistrationsOfHolder(tx, {
          employeeId: event.employeeId,
          end: { at: new Date() },
          cause: 'DEPARTURE_BLOCKED',
        });
      },
    });
  }
}
