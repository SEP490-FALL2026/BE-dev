import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { RevocationContext, RevocationHook, RevocationReasonFacts, RevocationTaskFacts } from '../licensing.types';

/** The slot a hook that names none takes: registering again under the same name replaces the hook of that name. */
const DEFAULT_NAME = 'default';

/**
 * The hooks that extend a revocation, registered with the facade (the handover confirmation of `g6-handover-confirmation`, the
 * return of a seat of `g5-return-and-renewal-requests`): each opens its step when a revocation opens, may refuse to let the work
 * start or end, and learns how it ended. Registering rather than importing keeps licensing from knowing the modules of those
 * steps, the way the gate of requests is registered. Every hook is asked in the order it was registered, and the first to
 * refuse stops the rest. Until one is registered none of the points runs.
 */
@Injectable()
export class RegisteredRevocationHook implements RevocationHook {
  private readonly hooks = new Map<string, RevocationHook>();

  /** A hook of the same name is replaced, so a module that starts twice leaves one. */
  register(hook: RevocationHook, name: string = DEFAULT_NAME): void {
    this.hooks.set(name, hook);
  }

  async onOpened(
    tx: DbTx,
    task: RevocationTaskFacts,
    reasons: readonly RevocationReasonFacts[],
    context: RevocationContext,
    actor: AuthenticatedPrincipal,
    now: Date,
  ): Promise<void> {
    for (const hook of this.hooks.values()) await hook.onOpened(tx, task, reasons, context, actor, now);
  }

  async beforeWork(tx: DbTx, task: RevocationTaskFacts, now: Date): Promise<void> {
    for (const hook of this.hooks.values()) await hook.beforeWork(tx, task, now);
  }

  async afterWork(tx: DbTx, task: RevocationTaskFacts, now: Date, actor: AuthenticatedPrincipal): Promise<void> {
    for (const hook of this.hooks.values()) await hook.afterWork(tx, task, now, actor);
  }

  async afterClosedFailed(
    tx: DbTx,
    task: RevocationTaskFacts,
    closeReason: string,
    now: Date,
    actor: AuthenticatedPrincipal,
  ): Promise<void> {
    for (const hook of this.hooks.values()) await hook.afterClosedFailed?.(tx, task, closeReason, now, actor);
  }
}
