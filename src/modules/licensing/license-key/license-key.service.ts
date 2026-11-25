import { Injectable, Logger } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { LicenseKeyStatus } from '../../../generated/prisma/client';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { LicenseKeyNotFoundError, LicenseKeyRevealLimitError } from '../public/licensing.errors';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { LicenseKeyCipher } from './license-key-cipher.service';
import { LicenseLotKeyImportService, type ImportResult } from './license-lot-key-import.service';
import { LicenseKeyStaleError, LicenseKeyStateError } from './license-key.errors';
import {
  activationsUsedOf,
  assertMaxActivationsRaised,
  assertWithdrawable,
  capReachedOf,
  vaultSummaryOf,
  type VaultSummary,
} from './license-key.policy';
import { LicenseKeyRevealQuotaRepo } from './license-key-reveal-quota.repo';
import { LicenseKeyRepo, type LicenseKeyActivationCounts, type LicenseKeyListed } from './license-key.repo';

/** A key as the routes answer it: the row of the vault and what its activations say. */
export interface LicenseKeyView extends LicenseKeyListed {
  /** The activations the key has used: those it had when it was entered and every operation on it since, closed or not. Never goes down. */
  activationsUsed: number;
  /** The activations open now, of every origin. */
  openActivations: number;
  /** Whether the key has used all the activations it allows. */
  capReached: boolean;
}

const NO_COUNTS: LicenseKeyActivationCounts = { operations: 0, open: 0 };

const viewOf = (key: LicenseKeyListed, counts: LicenseKeyActivationCounts = NO_COUNTS): LicenseKeyView => {
  const activationsUsed = activationsUsedOf(key.initialActivationsUsed, counts.operations);

  return {
    ...key,
    activationsUsed,
    openActivations: counts.open,
    capReached: capReachedOf(activationsUsed, key.maxActivations),
  };
};

/**
 * The vault of the license keys of K4 purchases (`US-04-12`, `QĐ-54b`). A key is judged, sealed with the cipher and kept
 * only as ciphertext and a fingerprint; a list shows it masked; a reveal opens it for the IT Admin and writes an audit
 * event in the same transaction, every time. The key, its fingerprint and the secrets never reach the audit trail, a
 * message or a list.
 *
 * Lock order of the routes that write: an import that tells the activations already used holds the state of the seat baseline first (tier 0b),
 * then the purchase `FOR UPDATE` (tier 6) and its plan `FOR SHARE`; a withdrawal or a raise of the cap takes the purchase, then the key (tier 6b).
 */
@Injectable()
export class LicenseKeyService {
  private readonly logger = new Logger(LicenseKeyService.name);

  constructor(
    private readonly repo: LicenseKeyRepo,
    private readonly quota: LicenseKeyRevealQuotaRepo,
    private readonly cipher: LicenseKeyCipher,
    private readonly catalog: CatalogApi,
    private readonly lotKeys: LicenseLotKeyImportService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Keeps every valid key of the batch in the lot born from this subscription and reports each line that was not kept (the route of wave 2, open to every IT Admin;
   * the route of the lot is `LicenseLotKeyImportService` too). Throws LicenseKeyLotNotFoundError for a purchase that is no lot, and the errors of
   * `LicenseLotKeyImportService.import`.
   */
  import(
    actor: AuthenticatedPrincipal,
    input: {
      subscriptionId: string;
      keys: readonly string[];
      maxActivations?: number;
      initialActivationsUsed?: number;
    },
  ): Promise<ImportResult> {
    return this.lotKeys.import(actor, input.subscriptionId, input, { responsibleOnly: false });
  }

  /** The keys of a purchase, masked, with the capacity they give and what their activations say. Throws SeatTargetNotFoundError. */
  async list(input: {
    subscriptionId: string;
    status?: LicenseKeyStatus;
    withdrawn?: boolean;
    page: number;
    pageSize: number;
  }): Promise<Page<LicenseKeyView> & { summary: VaultSummary }> {
    const target = await this.lotKeys.purchaseOf(input.subscriptionId);
    const { items, total, usable, assigned, deviceOccupied, counts } = await this.repo.page({
      subscriptionId: input.subscriptionId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.withdrawn === undefined ? {} : { withdrawn: input.withdrawn }),
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    });

    return {
      ...pageOf(
        items.map((item) => viewOf(item, counts.get(item.id))),
        total,
        input.page,
        input.pageSize,
      ),
      summary: vaultSummaryOf({
        purchased: target.purchased,
        usableKeys: usable,
        keyBinding: target.keyBinding,
        assignedKeys: assigned,
        deviceOccupied,
      }),
    };
  }

  /**
   * Opens a key for the IT Admin. The event of the audit trail and the opening are one transaction: a key is never
   * given without its trace. A key withdrawn from the store is not opened any more (`QĐ-103v`). Throws LicenseKeyNotFoundError and
   * LicenseKeyStateError (`WITHDRAWN`); a key that cannot be opened is a LicenseKeyDecryptionError whose message holds nothing of the key.
   */
  async reveal(actor: AuthenticatedPrincipal, id: string): Promise<{ id: string; value: string }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A license key was revealed before installation');

    return this.runner.run(async (tx) => {
      const sealed = await this.repo.findSealed(tx, id);
      if (!sealed) throw new LicenseKeyNotFoundError();
      if (sealed.withdrawnAt !== null) throw new LicenseKeyStateError('WITHDRAWN');
      await this.takeSlot(tx, actor);
      const value = this.cipher.decrypt(sealed.id, sealed.cipherKeyId, sealed.ciphertext);
      await this.audit.record(
        tx,
        licensingAuditEvent(actor, organization.id, 'LICENSE_KEY.REVEALED', 'LicenseKey', sealed.id, null, {
          licenseKeyId: sealed.id,
          subscriptionId: sealed.subscriptionId,
          // The seat the key is given to, when it is assigned: the trace says whose key was opened.
          assignmentId: sealed.assignmentId,
        }),
      );

      return { id: sealed.id, value };
    });
  }

  /**
   * Withdraws a free key from the store with its reason (`QĐ-103v`, Q-10 B): it stays in the vault, is no longer counted as usable and
   * is never given out again. The purchase is locked first and the key after it, the order of an import, so a withdrawal and the grant
   * that would give the same key are served one after the other. Throws LicenseKeyNotFoundError and LicenseKeyStateError (`ASSIGNED`,
   * `ALREADY_WITHDRAWN`).
   */
  async withdraw(actor: AuthenticatedPrincipal, id: string, input: { reason: string }): Promise<LicenseKeyView> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A license key was withdrawn before installation');

    return this.runner.run(async (tx) => {
      const subscriptionId = await this.repo.subscriptionOf(tx, id);
      if (subscriptionId === null) throw new LicenseKeyNotFoundError();
      await this.lotKeys.lockPurchase(tx, subscriptionId);
      const key = await this.repo.lock(tx, id);
      if (!key) throw new LicenseKeyNotFoundError();
      assertWithdrawable(key);
      const listed = await this.repo.withdraw(tx, id, {
        at: new Date(),
        byAppUserId: actor.appUserId,
        reason: input.reason.trim(),
      });
      // The reason is the IT Admin's note, never the key: the trace names the key and its purchase.
      await this.audit.record(
        tx,
        licensingAuditEvent(actor, organization.id, 'LICENSE_KEY.WITHDRAWN', 'LicenseKey', id, null, {
          licenseKeyId: id,
          subscriptionId,
          reason: listed.withdrawalReason,
        }),
      );

      return viewOf(listed, (await this.repo.activationCountsOf([id], tx)).get(id));
    });
  }

  /**
   * Raises the cap of activations of a key (`KHOA-08`): the cap only goes up, and the caller names the version of the key it read, so a raise
   * made on a stale picture is refused. The purchase is locked first and the key after it (tier 6, then 6b), as a withdrawal does. One event of
   * the audit trail says the old and the new cap and why. Throws LicenseKeyNotFoundError, LicenseKeyStaleError and
   * LicenseKeyMaxActivationsNotRaisedError.
   */
  async raiseMaxActivations(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { maxActivations: number; note: string; expectedUpdatedAt: Date },
  ): Promise<LicenseKeyView> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A license key was changed before installation');

    return this.runner.run(async (tx) => {
      const subscriptionId = await this.repo.subscriptionOf(tx, id);
      if (subscriptionId === null) throw new LicenseKeyNotFoundError();
      await this.lotKeys.lockPurchase(tx, subscriptionId);
      const key = await this.repo.lock(tx, id);
      if (!key) throw new LicenseKeyNotFoundError();
      if (key.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new LicenseKeyStaleError(key.updatedAt);
      assertMaxActivationsRaised(key.maxActivations, input.maxActivations);
      const listed = await this.repo.raiseMaxActivations(tx, id, input.maxActivations);
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          organization.id,
          'LICENSE_KEY.MAX_ACTIVATIONS_RAISED',
          'LicenseKey',
          id,
          { maxActivations: key.maxActivations },
          { maxActivations: input.maxActivations, note: input.note.trim() },
        ),
      );

      return viewOf(listed, (await this.repo.activationCountsOf([id], tx)).get(id));
    });
  }

  /**
   * One slot of the minute and one of the day of the account (`SEC-02`), taken in the transaction that opens the key and
   * writes its event: a refusal rolls both back, so a refused request costs the account nothing and two requests for the
   * last slot cannot both pass.
   */
  private async takeSlot(tx: DbTx, actor: AuthenticatedPrincipal): Promise<void> {
    // `Date.now()`, the one clock the windows are named by, so a test can set the instant of an opening.
    const now = new Date(Date.now());
    for (const window of ['MINUTE', 'DAY'] as const) {
      if (!(await this.quota.take(tx, actor.appUserId, window, now))) {
        // For the operator, never for the caller: which account tried, not which key.
        this.logger.warn(`License key reveal limit reached for account ${actor.appUserId} (${window})`);
        throw new LicenseKeyRevealLimitError(window);
      }
    }
    await this.quota.forgetOlderThan(tx, new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));
  }
}
