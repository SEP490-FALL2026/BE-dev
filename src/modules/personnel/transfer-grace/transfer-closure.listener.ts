import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RevocationListeners, type RevocationEvent } from '../../licensing/public/licensing.extension-points';
import { PersonnelFileHookContributions } from '../public/personnel.extension-points';
import { TransferClosureService } from './transfer-closure.service';
import { TransferGraceRepo } from './transfer-grace.repo';

/** The name the transfers take among the listeners of a revocation. */
const TRANSFER_CLOSURE_LISTENER = 'personnel.transfer-closure';

/**
 * Two moments that close the transfer of a person who moved (`QĐ-110r`, SPEC MF3-C.2), both added to an extension point when the module starts so
 * `licensing` never imports `personnel`:
 *
 * - the end of a task of revocation of the person (`RevocationListeners`, `AFTER_WORK` with the status `COMPLETED`): this may be the last right of the
 *   old department, so the transfer is asked to close (`TransferClosureService.closeIfDue`). It runs in the transaction of the completion, which
 *   already holds the task, the subscription and the seat, so it takes the transfer `FOR UPDATE SKIP LOCKED` and never waits for one that another
 *   command holds: the hourly pass of the sweep then closes it.
 * - the record of a departure (`PersonnelFileHookContributions`, `onRecorded` of an `OFFBOARDING` file): a transfer still in its grace is closed as
 *   superseded by that case, and the departure's own revocations take the old rights back (`TransferClosureService.supersede`).
 */
@Injectable()
export class TransferClosureListener implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [RevocationListeners, PersonnelFileHookContributions] as const;

  constructor(
    private readonly revocation: RevocationListeners,
    private readonly hooks: PersonnelFileHookContributions,
    private readonly graces: TransferGraceRepo,
    private readonly closing: TransferClosureService,
  ) {}

  onModuleInit(): void {
    this.revocation.add(TRANSFER_CLOSURE_LISTENER, (tx, event) => this.revoked(tx, event));
    this.hooks.add(TRANSFER_CLOSURE_LISTENER, {
      onRecorded: async (tx, event) => {
        if (event.fileKind !== 'OFFBOARDING') return;
        await this.closing.supersede(tx, { employeeId: event.employeeId, caseId: event.fileId });
      },
    });
  }

  private async revoked(tx: DbTx, event: RevocationEvent): Promise<void> {
    if (event.moment !== 'AFTER_WORK' || event.task.status !== 'COMPLETED') return;
    const held = await this.graces.lockUnclosedOf(tx, event.task.employeeId, { skipLocked: true });
    if (held) await this.closing.closeIfDue(tx, held, event.now);
  }
}
