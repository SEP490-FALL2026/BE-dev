import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { estimateTax } from '../../../core/money/tax-estimate';
import { readSqlState, TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { financeAuditEvent } from '../mappers/finance-audit-event.mapper';
import { TaxProfileVendorNotFoundError } from '../public/finance.errors';
import {
  DEFAULT_TAX_PROFILE,
  cleanTaxLines,
  defaultProfileView,
  sameProfile,
  toProfileView,
} from './tax-profile.policy';
import { TaxProfileRepo } from './tax-profile.repo';
import type {
  DefaultTaxProfileView,
  TaxEstimateResult,
  TaxGroup,
  TaxLineInput,
  TaxProfileView,
} from '../public/finance.types';
import type { TaxProfileContent } from './tax-profile.types';

const snapshot = (profile: TaxProfileContent & { version: number }) => ({
  version: profile.version,
  group: profile.group,
  lines: profile.lines.map(
    (line) => `${line.taxType}|${line.rateBp}|${line.deductible ? 'deductible' : 'not deductible'}`,
  ),
});

function estimateFrom(current: TaxProfileContent | null, netMinor: bigint): TaxEstimateResult {
  const profile: TaxProfileContent = current ?? DEFAULT_TAX_PROFILE;

  return {
    ...estimateTax(netMinor, profile.lines),
    basis: current ? 'PROFILE' : 'DEFAULT_NO_PROFILE',
    group: profile.group,
  };
}

/**
 * The tax profile Finance declares for a vendor (`US-12-09`) and the estimate drawn from it. Every declaration that
 * changes something is a new version recorded with its author, in one transaction with its audit event; the previous
 * versions stay as they were. The system only estimates: nothing here computes a tax payable, files or decides a
 * deduction. The vendor is a catalog table: finance holds only its id, and a vendor that does not exist fails the foreign
 * key of the head row.
 */
@Injectable()
export class TaxProfileService {
  constructor(
    private readonly repo: TaxProfileRepo,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * The profile of the vendor as answered: `DECLARED` with the newest declaration, or `MISSING` with none and the
   * default profile its estimates fall back on (`QĐ-60b`), so Finance sees what is still to declare.
   */
  async view(vendorId: string): Promise<{
    status: 'DECLARED' | 'MISSING';
    profile: TaxProfileView | null;
    defaultProfile: DefaultTaxProfileView;
  }> {
    const current = await this.repo.readCurrent(vendorId);

    return {
      status: current ? 'DECLARED' : 'MISSING',
      profile: current ? toProfileView(current) : null,
      defaultProfile: defaultProfileView(),
    };
  }

  /** The declarations of a vendor, newest first. */
  async history(vendorId: string, query: { page: number; pageSize: number }): Promise<Page<TaxProfileView>> {
    const { items, total } = await this.repo.history(vendorId, (query.page - 1) * query.pageSize, query.pageSize);

    return pageOf(items.map(toProfileView), total, query.page, query.pageSize);
  }

  /**
   * Declares the profile of a vendor: `group` defaults to T2. Throws the line errors of `cleanTaxLines` and
   * TaxProfileVendorNotFoundError. A profile equal to the current one records nothing and answers `changed: false`.
   */
  async declare(
    actor: AuthenticatedPrincipal,
    vendorId: string,
    input: { group?: TaxGroup; lines: TaxLineInput[] },
  ): Promise<{ profile: TaxProfileView; changed: boolean }> {
    const content: TaxProfileContent = { group: input.group ?? 'T2', lines: cleanTaxLines(input.lines) };
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A tax profile was declared before installation');

    try {
      return await this.runner.run(async (tx) => {
        await this.repo.ensureHead(tx, vendorId, organization.id);
        const currentVersion = await this.repo.lockCurrentVersion(tx, vendorId);
        const current = currentVersion > 0 ? await this.repo.readVersion(vendorId, currentVersion, tx) : null;
        if (current && sameProfile(current, content)) return { profile: toProfileView(current), changed: false };

        const created = await this.repo.insertVersion(tx, {
          vendorId,
          version: currentVersion + 1,
          group: content.group,
          lines: content.lines,
          declaredByAppUserId: actor.appUserId,
        });
        await this.repo.setCurrentVersion(tx, vendorId, created.version);
        await this.audit.record(
          tx,
          financeAuditEvent(
            actor,
            organization.id,
            'VENDOR_TAX_PROFILE.DECLARED',
            'VendorTaxProfile',
            vendorId,
            current ? snapshot(current) : null,
            snapshot(created),
          ),
        );

        return { profile: toProfileView(created), changed: true };
      });
    } catch (error) {
      if (readSqlState(error) === '23503') throw new TaxProfileVendorNotFoundError();
      throw error;
    }
  }

  /**
   * What the tax on a price before tax is estimated to be for this vendor, from its newest declaration, or from the
   * default profile when it has none (`basis` says which, so the answer is never shown as more than an estimate).
   */
  async estimate(vendorId: string, netMinor: bigint, tx?: DbTx): Promise<TaxEstimateResult> {
    return estimateFrom(await this.repo.readCurrent(vendorId, tx), netMinor);
  }

  /**
   * The same estimate for many prices at once, in one read of the profiles of their vendors, in the order given (`LD-01`):
   * a page of subscriptions does not read a profile per row, and every row of one vendor reads the same declaration.
   */
  async estimateMany(
    items: readonly { vendorId: string; netMinor: bigint }[],
    tx?: DbTx,
  ): Promise<TaxEstimateResult[]> {
    const profiles = await this.repo.readCurrentMany([...new Set(items.map((item) => item.vendorId))], tx);

    return items.map((item) => estimateFrom(profiles.get(item.vendorId) ?? null, item.netMinor));
  }

  /** For each of these vendors, the group and version of its newest declaration; those with none are absent. */
  currentGroups(vendorIds: readonly string[]): Promise<Map<string, { group: TaxGroup; version: number }>> {
    return this.repo.currentGroups(vendorIds);
  }

  /** The vendors that have a declaration. */
  declaredVendorIds(): Promise<string[]> {
    return this.repo.declaredVendorIds();
  }
}
