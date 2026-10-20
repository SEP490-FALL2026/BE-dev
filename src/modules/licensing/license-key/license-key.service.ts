import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { LicenseKeyStatus } from '../../../generated/prisma/client';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import { LicenseKeyNotFoundError, LicenseKeyPlanNotK4Error, SeatTargetNotFoundError } from '../licensing.errors';
import { licensingAuditEvent } from '../mappers/licensing-audit-event';
import { LicenseKeyCipher } from './license-key-cipher';
import {
  capacityOf,
  judgeBatch,
  maskKey,
  warningOf,
  type BatchErrorCode,
  type CapacityWarning,
} from './license-key.policy';
import { LicenseKeyRepo, type LicenseKeyListed } from './license-key.repo';

export interface VaultSummary {
  purchased: number | null;
  usableKeys: number;
  capacity: number;
  warning: CapacityWarning | null;
}

export interface ImportResult {
  imported: number;
  errors: { line: number; code: BatchErrorCode | 'ALREADY_IN_STORE' }[];
  summary: VaultSummary;
}

/**
 * The vault of the license keys of K4 purchases (`US-04-12`, `QĐ-54b`). A key is judged, sealed with the cipher and kept
 * only as ciphertext and a fingerprint; a list shows it masked; a reveal opens it for the IT Admin and writes an audit
 * event in the same transaction, every time. The key, its fingerprint and the secrets never reach the audit trail, a
 * message or a list.
 */
@Injectable()
export class LicenseKeyService {
  constructor(
    private readonly repo: LicenseKeyRepo,
    private readonly cipher: LicenseKeyCipher,
    private readonly catalog: CatalogService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Keeps every valid key of the batch and reports each line that was not kept; a wrong line never spoils the others.
   * Throws SeatTargetNotFoundError (no such purchase) and LicenseKeyPlanNotK4Error; nothing is kept then.
   */
  async import(
    actor: AuthenticatedPrincipal,
    input: { subscriptionId: string; keys: readonly string[] },
  ): Promise<ImportResult> {
    const target = await this.requireK4Purchase(input.subscriptionId);
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A license key was imported before installation');
    const { rows, errors } = judgeBatch(input.keys);
    const lines: ImportResult['errors'] = [...errors];

    // Fingerprint order is the order of the locks the unique index takes, so two batches with the same keys never wait
    // for each other in a circle.
    const sealed = rows
      .map((row) => {
        const id = randomUUID();

        return { line: row.line, id, fingerprint: this.cipher.fingerprint(row.key), key: row.key };
      })
      .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));

    const stored = await this.runner.run(async (tx) => {
      let kept = 0;
      for (const row of sealed) {
        const { keyId, ciphertext } = this.cipher.encrypt(row.id, row.key);
        const isNew = await this.repo.insertIfNew(tx, {
          id: row.id,
          organizationId: organization.id,
          subscriptionId: input.subscriptionId,
          fingerprint: row.fingerprint,
          masked: maskKey(row.key),
          ciphertext,
          cipherKeyId: keyId,
          importedByAppUserId: actor.appUserId,
        });
        if (isNew) kept += 1;
        else lines.push({ line: row.line, code: 'ALREADY_IN_STORE' });
      }
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          organization.id,
          'LICENSE_KEY.IMPORTED',
          'Subscription',
          input.subscriptionId,
          null,
          {
            subscriptionId: input.subscriptionId,
            imported: kept,
            rejected: 0,
          },
        ),
      );

      return { kept, usable: await this.repo.countUsable(input.subscriptionId, tx) };
    });

    return {
      imported: stored.kept,
      errors: lines.sort((a, b) => a.line - b.line),
      summary: this.summary(target.purchasedQuantity, stored.usable),
    };
  }

  /** The keys of a purchase, masked, with the capacity they give. Throws SeatTargetNotFoundError. */
  async list(input: {
    subscriptionId: string;
    status?: LicenseKeyStatus;
    page: number;
    pageSize: number;
  }): Promise<Page<LicenseKeyListed> & { summary: VaultSummary }> {
    const target = await this.requireSubscription(input.subscriptionId);
    const { items, total } = await this.repo.page({
      subscriptionId: input.subscriptionId,
      ...(input.status ? { status: input.status } : {}),
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    });
    const usable = await this.repo.countUsable(input.subscriptionId);

    return {
      ...pageOf(items, total, input.page, input.pageSize),
      summary: this.summary(target.purchasedQuantity, usable),
    };
  }

  /**
   * Opens a key for the IT Admin. The event of the audit trail and the opening are one transaction: a key is never
   * given without its trace. Throws LicenseKeyNotFoundError; a key that cannot be opened is a LicenseKeyDecryptionError
   * whose message holds nothing of the key.
   */
  async reveal(actor: AuthenticatedPrincipal, id: string): Promise<{ id: string; value: string }> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A license key was revealed before installation');

    return this.runner.run(async (tx) => {
      const sealed = await this.repo.findSealed(tx, id);
      if (!sealed) throw new LicenseKeyNotFoundError();
      const value = this.cipher.decrypt(sealed.id, sealed.cipherKeyId, sealed.ciphertext);
      await this.audit.record(
        tx,
        licensingAuditEvent(actor, organization.id, 'LICENSE_KEY.REVEALED', 'LicenseKey', sealed.id, null, {
          licenseKeyId: sealed.id,
          subscriptionId: sealed.subscriptionId,
          // The key is not yet given to an assignment: the work of the company devices sets it.
          assignmentId: null,
        }),
      );

      return { id: sealed.id, value };
    });
  }

  private summary(purchased: number | null, usableKeys: number): VaultSummary {
    return {
      purchased,
      usableKeys,
      capacity: capacityOf({ purchased, usableKeys }),
      warning: warningOf({ purchased, usableKeys }),
    };
  }

  private async requireSubscription(subscriptionId: string) {
    const target = await this.catalog.findSeatTarget({ subscriptionId });
    if (!target) throw new SeatTargetNotFoundError('SUBSCRIPTION');

    return target;
  }

  private async requireK4Purchase(subscriptionId: string) {
    const target = await this.requireSubscription(subscriptionId);
    if (target.provisioningType !== 'K4') throw new LicenseKeyPlanNotK4Error(target.provisioningType);

    return target;
  }
}
