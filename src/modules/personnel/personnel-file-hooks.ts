import { Injectable, Logger } from '@nestjs/common';
import type { BusinessDate } from '../../core/business-date';
import type { DbTx } from '../../infrastructure/database/transaction-runner';

/** A file of the personnel context (a transfer now, the leaving of a person later) and the day its effect is due. */
export interface PersonnelFileEvent {
  fileKind: 'TRANSFER' | 'OFFBOARDING';
  fileId: string;
  employeeId: string;
  /** The day the file takes effect: the day of a transfer, the last day of a person who leaves. */
  dueOn: BusinessDate;
}

/**
 * What a flow that hangs on a personnel file does when the file is recorded, when its day moves and when it is cancelled
 * (`g6-service-account-handover` asks for a person to answer for the service accounts of the one who goes). Called in the
 * transaction of the write, after it; a hook that throws is logged and never changes the result of the write.
 */
export interface PersonnelFileHook {
  onRecorded?(tx: DbTx, event: PersonnelFileEvent): Promise<void>;
  onDueChanged?(tx: DbTx, event: PersonnelFileEvent & { previousDueOn: BusinessDate }): Promise<void>;
  onCancelled?(tx: DbTx, event: PersonnelFileEvent): Promise<void>;
  /** The person became `LEFT` (a departure only): the day it took effect is `dueOn`. */
  onLeft?(tx: DbTx, event: PersonnelFileEvent): Promise<void>;
}

/** The hooks registered by the flows that follow a personnel file, called in the order they registered; none at the start. */
@Injectable()
export class PersonnelFileHooks {
  private readonly logger = new Logger(PersonnelFileHooks.name);
  private readonly hooks: PersonnelFileHook[] = [];

  register(hook: PersonnelFileHook): void {
    this.hooks.push(hook);
  }

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
    for (const hook of this.hooks) {
      try {
        await call(hook);
      } catch (error) {
        this.logger.error(`A personnel file hook (${name}) failed: ${(error as Error).name}`);
      }
    }
  }
}
