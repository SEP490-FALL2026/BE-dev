import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { usageAuditEvent } from '../../usage-audit-event.mapper';
import { VendorSourceRepo } from '../../vendor-source/vendor-source.repo';
import {
  UsageImportAlreadyConfirmedError,
  UsageImportNotFoundError,
  UsageImportPreviewStaleError,
  UsageImportStateError,
} from '../vendor-import.errors';
import { VendorImportRepo } from '../vendor-import.repo';
import { toImportView } from '../vendor-import.service';
import type { ImportRecord, ImportView, NoticeMode } from '../vendor-import.types';
import { VendorImportWriteService } from './vendor-import-write.service';

export interface ConfirmInput {
  previewVersion: number;
  idempotencyKey: string;
  notice?: NoticeMode;
}

/**
 * Writing what a preview promised (`SBF-04a`): the source is locked first, so reports of one source take their turn (`DA6-12`), then the import,
 * and every row is judged again; a preview that no longer holds is refused and nothing is written. The holders of the application are told
 * before any day is written (`US-08-05` AC-3), the days are written in chunks, the days two reports share go to the one that covers later,
 * and the confirmation is told to whoever listens (`UsageImportListeners`) in the same transaction.
 */
@Injectable()
export class VendorImportConfirmationService {
  constructor(
    private readonly repo: VendorImportRepo,
    private readonly sources: VendorSourceRepo,
    private readonly writer: VendorImportWriteService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws UsageImportNotFoundError, UsageImportStateError (`NOT_OPEN`), UsageImportAlreadyConfirmedError, UsageImportPreviewStaleError,
   * UsageImportEventTypeUnmappedError, UsageTrackingNoticeRequiredError and UsageSourceRefusedError (the application became a
   * communication service since the preview).
   */
  async confirm(
    actor: AuthenticatedPrincipal,
    id: string,
    input: ConfirmInput,
  ): Promise<{ import: ImportView; replayed: boolean }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A usage report was confirmed before installation');
    const preview = await this.repo.find(id);
    if (!preview) throw new UsageImportNotFoundError();
    let replayed = false;

    await this.runner.run(async (tx) => {
      const source = await this.sources.lock(tx, preview.sourceId);
      const current = await this.repo.lock(tx, id);
      if (!source || !current) throw new UsageImportNotFoundError();
      replayed = this.requireOpen(current, input);
      if (replayed) return;
      const context = { actor, organizationId: organization.id, source, current, input };
      const result = await this.writer.write(tx, context, await this.writer.verify(tx, context));
      await this.audit.record(
        tx,
        usageAuditEvent(actor, organization.id, 'USAGE_IMPORT.CONFIRMED', 'UsageImport', id, null, {
          sourceId: source.id,
          previewVersion: current.previewVersion,
          noticeMode: input.notice ?? null,
          ...result,
        }),
      );
    });

    const record = await this.repo.find(id);
    if (!record) throw new UsageImportNotFoundError();

    return { import: toImportView(record), replayed };
  }

  /** Whether this is the same confirmation again (true: answer what was written); throws when the import cannot be confirmed now. */
  private requireOpen(current: ImportRecord, input: ConfirmInput): boolean {
    if (current.status === 'COMPLETED') {
      if (current.confirmKey === input.idempotencyKey) return true;
      throw new UsageImportAlreadyConfirmedError();
    }
    if (current.status === 'CANCELLED' || current.expiresAt <= new Date()) throw new UsageImportStateError('NOT_OPEN');
    if (current.previewVersion !== input.previewVersion) {
      throw new UsageImportPreviewStaleError(current.previewVersion, []);
    }

    return false;
  }
}
