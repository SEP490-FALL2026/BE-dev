import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  PersonnelFileHookContributions,
  type PersonnelFileEvent,
  type PersonnelFileHook,
} from '../public/personnel.extension-points';

/**
 * Calls the hooks of the flows that follow a personnel file (`PersonnelFileHookContributions`) when the transfer or the departure is
 * recorded, moved, cancelled or takes effect, in the transaction of the write and after it, in the order they were added. A hook runs
 * as a part of the write, like an entry of `Listeners`: one that throws stops the rest and rolls the whole write back, and
 * its own error is what the caller sees. A hook that may fail without the write failing catches the error inside itself.
 */
@Injectable()
export class PersonnelFileHooks {
  constructor(private readonly hooks: PersonnelFileHookContributions) {}

  onRecorded(tx: DbTx, event: PersonnelFileEvent): Promise<void> {
    return this.each((hook) => hook.onRecorded?.(tx, event));
  }

  onDueChanged(tx: DbTx, event: PersonnelFileEvent & { previousDueOn: BusinessDate }): Promise<void> {
    return this.each((hook) => hook.onDueChanged?.(tx, event));
  }

  onCancelled(tx: DbTx, event: PersonnelFileEvent): Promise<void> {
    return this.each((hook) => hook.onCancelled?.(tx, event));
  }

  onLeft(tx: DbTx, event: PersonnelFileEvent): Promise<void> {
    return this.each((hook) => hook.onLeft?.(tx, event));
  }

  private async each(call: (hook: PersonnelFileHook) => Promise<void> | undefined): Promise<void> {
    for (const hook of this.hooks.all()) await call(hook);
  }
}
