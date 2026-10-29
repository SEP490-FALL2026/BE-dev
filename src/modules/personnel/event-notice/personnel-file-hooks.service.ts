import { Injectable, Logger } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  PersonnelFileHookContributions,
  type PersonnelFileEvent,
  type PersonnelFileHook,
} from '../public/personnel.extension-points';

/**
 * Calls the hooks of the flows that follow a personnel file (`PersonnelFileHookContributions`) when the transfer or the departure is
 * recorded, moved, cancelled or takes effect, in the transaction of the write and after it: in the order they were added, each in its
 * own try, so a hook that throws is logged, the next one is still called, and the result of the write never changes.
 */
@Injectable()
export class PersonnelFileHooks {
  private readonly logger = new Logger(PersonnelFileHooks.name);

  constructor(private readonly hooks: PersonnelFileHookContributions) {}

  onRecorded(tx: DbTx, event: PersonnelFileEvent): Promise<void> {
    return this.each('onRecorded', (hook) => hook.onRecorded?.(tx, event));
  }

  onDueChanged(tx: DbTx, event: PersonnelFileEvent & { previousDueOn: BusinessDate }): Promise<void> {
    return this.each('onDueChanged', (hook) => hook.onDueChanged?.(tx, event));
  }

  onCancelled(tx: DbTx, event: PersonnelFileEvent): Promise<void> {
    return this.each('onCancelled', (hook) => hook.onCancelled?.(tx, event));
  }

  onLeft(tx: DbTx, event: PersonnelFileEvent): Promise<void> {
    return this.each('onLeft', (hook) => hook.onLeft?.(tx, event));
  }

  private async each(name: string, call: (hook: PersonnelFileHook) => Promise<void> | undefined): Promise<void> {
    for (const hook of this.hooks.all()) {
      try {
        await call(hook);
      } catch (error) {
        this.logger.error(`A personnel file hook (${name}) failed: ${(error as Error).name}`);
      }
    }
  }
}
