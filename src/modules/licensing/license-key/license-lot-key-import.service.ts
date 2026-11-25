import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicenseLotApi } from '../../catalog/public/license-lot.api';
import type { LicenseLotView } from '../../catalog/public/license-lot.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { SeatTargetNotFoundError } from '../public/licensing.errors';
import { LicenseKeyCipher } from './license-key-cipher.service';
import { LicenseKeyImportSettingsService } from './license-key-import-settings.service';
import {
  LicenseKeyApplicationRetiredError,
  LicenseKeyLotKeysExceedLicensesError,
  LicenseKeyLotNotFoundError,
  LicenseKeyLotNotResponsibleError,
  LicenseKeyPlanHasNoKeysError,
} from './license-key.errors';
import {
  assertInitialActivationsAllowed,
  judgeBatch,
  maskKey,
  vaultSummaryOf,
  type BatchErrorCode,
  type KeyBinding,
  type VaultSummary,
} from './license-key.policy';
import { LicenseKeyRepo } from './license-key.repo';

export interface ImportResult {
  imported: number;
  errors: { line: number; code: BatchErrorCode | 'ALREADY_IN_STORE' }[];
  summary: VaultSummary;
}

/** What the keys of a purchase say of it: the licenses bought (null when not known) and how the plan binds them. */
export interface PurchaseOfKeys {
  purchased: number | null;
  keyBinding: KeyBinding;
}

/**
 * The keys a lot of licenses holds (W3-24): the batch of keys put in a lot, the purchase a key list is read for and the lock the routes of a key take first.
 * A purchase of wave 2 is named by the id of its subscription, which is the id of the lot born from it: the old route and the route of the lot are one path here.
 * A key of a plan bound to an account never passes the licenses of its lot (K-A6); the cost of a key is borne unless the lot was bought for a request.
 *
 * Lock order: an import that tells the activations already used holds the state of the seat baseline first (tier 0b), then the lot `FOR UPDATE` (6a) and its plan
 * `FOR SHARE` (7); a withdrawal or a raise of the cap takes the lot, then the key (7b).
 */
@Injectable()
export class LicenseLotKeyImportService {
  constructor(
    private readonly repo: LicenseKeyRepo,
    private readonly cipher: LicenseKeyCipher,
    private readonly lots: LicenseLotApi,
    private readonly catalog: CatalogApi,
    private readonly importSettings: LicenseKeyImportSettingsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Keeps every valid key of the batch in the lot and reports each line that was not kept; a wrong line never spoils the others. One cap of activations and
   * one count of activations already used for the whole batch. `responsibleOnly` is the route of the lot, which only the IT Admin who answers for it uses; the route
   * of wave 2 stays open to every IT Admin. Throws LicenseKeyLotNotFoundError, LicenseKeyLotNotResponsibleError, LicenseKeyLotKeysExceedLicensesError,
   * LicenseKeyPlanHasNoKeysError, LicenseKeyApplicationRetiredError, LicenseKeyInitializationClosedError, LicenseKeyInitialActivationsOnAccountPlanError and
   * LicenseKeyInitialActivationsExceedMaxError; nothing is kept then.
   */
  async import(
    actor: AuthenticatedPrincipal,
    lotId: string,
    input: { keys: readonly string[]; maxActivations?: number; initialActivationsUsed?: number },
    options: { responsibleOnly: boolean },
  ): Promise<ImportResult> {
    if (!(await this.lots.findLot(lotId))) throw new LicenseKeyLotNotFoundError();
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A license key was imported before installation');
    const { rows, errors } = judgeBatch(input.keys);
    const lines: ImportResult['errors'] = [...errors];
    // Fingerprint order is the order of the locks the unique index takes, so two batches with the same keys never wait for each other in a circle.
    const sealed = rows
      .map((row) => ({ line: row.line, id: randomUUID(), fingerprint: this.cipher.fingerprint(row.key), key: row.key }))
      .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));

    const stored = await this.runner.run(async (tx) => {
      const initialActivationsUsed = await this.importSettings.initialActivationsUsed(tx, input.initialActivationsUsed);
      const held = await this.lots.lockLot(tx, lotId);
      if (!held) throw new LicenseKeyLotNotFoundError();
      await this.assertImportable(tx, held, actor, options, sealed.length);
      const maxActivations = await this.importSettings.maxActivations(tx, held.planId, input.maxActivations);
      assertInitialActivationsAllowed({ initial: initialActivationsUsed, maxActivations, keyBinding: held.keyBinding });

      // One statement for the whole batch (a thousand round trips outlasted the transaction on a busy server).
      const keptIds = await this.repo.insertManyIfNew(
        tx,
        sealed.map((row) => {
          const { keyId, ciphertext } = this.cipher.encrypt(row.id, row.key);

          return {
            id: row.id,
            organizationId: organization.id,
            subscriptionId: held.legacySubscriptionId,
            licenseLotId: held.id,
            costBorne: held.purpose !== 'REQUEST',
            fingerprint: row.fingerprint,
            masked: maskKey(row.key),
            ciphertext,
            cipherKeyId: keyId,
            importedByAppUserId: actor.appUserId,
            maxActivations,
            initialActivationsUsed,
          };
        }),
      );
      let kept = 0;
      for (const row of sealed) {
        if (keptIds.has(row.id)) kept += 1;
        else lines.push({ line: row.line, code: 'ALREADY_IN_STORE' });
      }
      await this.audit.record(
        tx,
        licensingAuditEvent(actor, organization.id, 'LICENSE_KEY.IMPORTED', 'LicenseLot', lotId, null, {
          licenseLotId: lotId,
          imported: kept,
          rejected: lines.length,
          maxActivations,
          initialActivationsUsed,
        }),
      );

      return { kept, summary: await this.summaryOf(held, tx) };
    });

    return { imported: stored.kept, errors: lines.sort((a, b) => a.line - b.line), summary: stored.summary };
  }

  /** The purchase a list of keys is read for: its lot when it is one, else the subscription of wave 2. Throws SeatTargetNotFoundError. */
  async purchaseOf(purchaseId: string): Promise<PurchaseOfKeys> {
    const lot = await this.lots.findLot(purchaseId);
    if (lot) return { purchased: lot.licenseCount, keyBinding: lot.keyBinding };
    const target = await this.catalog.findSeatTarget({ subscriptionId: purchaseId });
    if (!target) throw new SeatTargetNotFoundError('SUBSCRIPTION');

    return { purchased: target.purchasedQuantity, keyBinding: target.keyBinding };
  }

  /** Locks the purchase of a key before the key: its lot (6a, then the plan), or the subscription of wave 2 when it has no lot. */
  async lockPurchase(tx: DbTx, purchaseId: string): Promise<void> {
    if (await this.lots.lockLot(tx, purchaseId)) return;
    await this.catalog.lockSeatTarget(tx, { subscriptionId: purchaseId });
  }

  private async assertImportable(
    tx: DbTx,
    held: LicenseLotView,
    actor: AuthenticatedPrincipal,
    options: { responsibleOnly: boolean },
    adding: number,
  ): Promise<void> {
    if (options.responsibleOnly && held.responsibleItAdminEmployeeId !== actor.employeeId) {
      throw new LicenseKeyLotNotResponsibleError();
    }
    if (held.keyBinding === 'DEVICE_BUNDLED') throw new LicenseKeyPlanHasNoKeysError();
    if (held.applicationStatus === 'RETIRED') throw new LicenseKeyApplicationRetiredError();
    if (held.keyBinding !== 'DEVICE_KEY') {
      const usable = await this.repo.countUsable(held.id, tx);
      if (usable + adding > held.licenseCount)
        throw new LicenseKeyLotKeysExceedLicensesError(held.licenseCount, usable);
    }
  }

  private async summaryOf(held: LicenseLotView, tx: DbTx): Promise<VaultSummary> {
    return vaultSummaryOf({
      purchased: held.licenseCount,
      usableKeys: await this.repo.countUsable(held.id, tx),
      keyBinding: held.keyBinding,
      assignedKeys: await this.repo.countAssigned(held.id, tx),
      deviceOccupied: await this.repo.deviceOccupiedOf(held.id, tx),
    });
  }
}
