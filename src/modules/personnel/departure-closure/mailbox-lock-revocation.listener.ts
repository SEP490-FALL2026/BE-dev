import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RevocationListeners, type RevocationEvent } from '../../licensing/public/licensing.extension-points';
import { mailboxLockedByTask, systemMailboxLockDue } from './departure-closure.policy';
import { DepartureClosureRepo } from './departure-closure.repo';
import { MailboxLockService } from './mailbox-lock.service';

/** The name the departures take among the listeners of a revocation. */
const DEPARTURE_CLOSURE_LISTENER = 'personnel.departure-closure';

/**
 * What the end of a K1 revocation tells the departure of the person (`QĐ-110e`, `B-1`, SPEC P28): when the IT Admin completed the last K1
 * revocation of a person who leaves and ticked its last step, the lock of the mailbox for good, the system writes item (1b) of `BM-08` by itself
 * (no account wrote it). It adds itself to the `RevocationListeners` of `licensing` when the module starts, so `licensing` never imports it.
 * Only the end of the work of a completed task matters (the claim also announces `AFTER_WORK`, with the task still in progress).
 *
 * It runs in the transaction of the completion, which already holds the task, the subscription and the seat, so it takes the case `FOR UPDATE
 * SKIP LOCKED` and never waits for one that another command holds: the IT Admin then writes (1b) on the route (D-66).
 */
@Injectable()
export class MailboxLockRevocationListener implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [RevocationListeners] as const;

  constructor(
    private readonly revocation: RevocationListeners,
    private readonly cases: DepartureClosureRepo,
    private readonly locks: MailboxLockService,
  ) {}

  onModuleInit(): void {
    this.revocation.add(DEPARTURE_CLOSURE_LISTENER, (tx, event) => this.heard(tx, event));
  }

  private async heard(tx: DbTx, event: RevocationEvent): Promise<void> {
    if (event.moment !== 'AFTER_WORK' || event.task.status !== 'COMPLETED') return;
    const ticked = mailboxLockedByTask(event.task.completed?.k1Checklist ?? null);
    if (!ticked) return;
    const held = await this.cases.lockOpenOfEmployee(tx, event.task.employeeId);
    if (!held) return;
    if (
      systemMailboxLockDue({
        ticked,
        accountLocked: held.accountLockAt !== null,
        mailboxLocked: held.mailboxLockAt !== null,
      })
    )
      await this.locks.write(tx, held, { kind: 'SYSTEM' }, event.now);
  }
}
