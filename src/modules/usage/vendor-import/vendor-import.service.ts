import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { usageAuditEvent } from '../usage-audit-event.mapper';
import { UsageSourceRefusedError } from '../vendor-source/vendor-source.errors';
import { judgeSourceApplication } from '../vendor-source/vendor-source.policy';
import { VendorSourceRepo } from '../vendor-source/vendor-source.repo';
import type { SourceRecord } from '../vendor-source/vendor-source.types';
import { VendorImportPreviewService } from './preview/vendor-import-preview.service';
import { parseReport } from './parse/vendor-import-parse.policy';
import type { ParsedReport } from './parse/vendor-import-parse.types';
import { UsageImportFileError, UsageImportNotFoundError, UsageImportStateError } from './vendor-import.errors';
import { VendorImportRepo } from './vendor-import.repo';
import { MAX_REPORT_BYTES, type ImportFormat, type ImportRecord, type ImportView } from './vendor-import.types';

/** A preview that is not confirmed goes stale on its own after this long. */
export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

export const toImportView = (record: ImportRecord): ImportView => ({
  id: record.id,
  sourceId: record.sourceId,
  format: record.format,
  status: record.status,
  previewVersion: record.previewVersion,
  summary: record.summary,
  result: record.result,
  noticeMode: record.noticeMode,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  confirmedAt: record.confirmedAt,
  cancelledAt: record.cancelledAt,
});

/** The text of the file, or why it cannot be one: UTF-8 with or without a BOM, nothing else (`US-08-02`). */
function textOf(bytes: Buffer): string {
  if (bytes.length === 0) throw new UsageImportFileError('FILE_EMPTY');
  if (bytes.length > MAX_REPORT_BYTES) throw new UsageImportFileError('FILE_NOT_TEXT', { reason: 'TOO_LARGE' });
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new UsageImportFileError('FILE_NOT_TEXT');
  }
  // eslint-disable-next-line no-control-regex
  if (/\u0000/.test(text)) throw new UsageImportFileError('FILE_NOT_TEXT');
  if (text.trim() === '') throw new UsageImportFileError('FILE_EMPTY');

  return text;
}

/**
 * Taking in a vendor report (`SBF-04a`): upload reads the file by the template of its source, judges every row against the people and the
 * seats as they are, and keeps the preview for a day; nothing of the usage is written until a confirmation (`US-08-02`). Cancelling a
 * preview throws it away.
 */
@Injectable()
export class VendorImportService {
  constructor(
    private readonly repo: VendorImportRepo,
    private readonly sources: VendorSourceRepo,
    private readonly previews: VendorImportPreviewService,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws UsageSourceRefusedError (the source does not exist, or its application is internal, retired or a communication service) and
   * UsageImportFileError (the file as a whole).
   */
  async upload(
    actor: AuthenticatedPrincipal,
    input: { sourceId: string; bytes: Buffer; coverageFrom?: string; coverageTo?: string },
  ): Promise<ImportView> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A usage report was imported before installation');
    const source = await this.sources.find(input.sourceId);
    if (!source) throw new UsageSourceRefusedError('NOT_FOUND');
    const [application] = await this.catalog.getCollectorApplications([source.applicationId]);
    const problem = judgeSourceApplication(application);
    if (problem) throw new UsageSourceRefusedError(problem);

    const today = await this.organizationReads.businessToday();
    const { parsed, format } = this.read(input, source, application.name, today, organization.timeZone);

    const trackingNoticeRequired = !(await this.repo.hasCompletedForApplication(source.applicationId));
    const { rows, summary } = await this.previews.preview({ source, parsed, today, trackingNoticeRequired });
    const contentHash = createHash('sha256').update(input.bytes).digest('hex');

    const id = await this.runner.run(async (tx) => {
      const createdId = await this.repo.create(tx, {
        organizationId: organization.id,
        sourceId: source.id,
        format,
        window: parsed.window,
        contentHash,
        summary,
        expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
        uploadedByAppUserId: actor.appUserId,
        rows,
      });
      await this.audit.record(
        tx,
        usageAuditEvent(actor, organization.id, 'USAGE_IMPORT.UPLOADED', 'UsageImport', createdId, null, {
          sourceId: source.id,
          format,
          fileFingerprint: contentHash,
          coverageFrom: parsed.window.from,
          coverageTo: parsed.window.to,
          coverageBasis: parsed.window.basis,
          totalRows: summary.totalRows,
          matched: summary.matched,
          unmatched: summary.unmatched,
          ambiguous: summary.ambiguous,
          invalid: summary.invalid,
        }),
      );

      return createdId;
    });

    const record = await this.repo.find(id);
    if (!record) throw new UsageImportNotFoundError();

    return toImportView(record);
  }

  /** The report of the file by the template of its source, and the format it was in. Throws UsageImportFileError. */
  private read(
    input: { bytes: Buffer; coverageFrom?: string; coverageTo?: string },
    source: SourceRecord,
    applicationName: string,
    today: BusinessDate,
    organizationTimeZone: string,
  ): { parsed: ParsedReport; format: ImportFormat } {
    const text = textOf(input.bytes);
    const format: ImportFormat = text.trimStart().startsWith('{') ? 'JSON' : 'CSV';
    const parsed = parseReport({
      format,
      text,
      source,
      declared: {
        ...(input.coverageFrom ? { from: input.coverageFrom } : {}),
        ...(input.coverageTo ? { to: input.coverageTo } : {}),
      },
      today,
      organizationTimeZone,
    });
    const said = parsed.application;
    if (said !== null && said !== source.applicationId && said.toLowerCase() !== applicationName.toLowerCase()) {
      throw new UsageImportFileError('SOURCE_MISMATCH');
    }

    return { parsed, format };
  }

  /** Throws the preview away: nothing was written and nothing will be. Cancelling twice is the same. */
  async cancel(actor: AuthenticatedPrincipal, id: string): Promise<ImportView> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A usage report was cancelled before installation');

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id);
      if (!current) throw new UsageImportNotFoundError();
      if (current.status === 'CANCELLED') return;
      if (current.status === 'COMPLETED') throw new UsageImportStateError('NOT_PREVIEW');
      await this.repo.markCancelled(tx, id, new Date());
      await this.audit.record(
        tx,
        usageAuditEvent(actor, organization.id, 'USAGE_IMPORT.CANCELLED', 'UsageImport', id, null, {
          sourceId: current.sourceId,
        }),
      );
    });
    const record = await this.repo.find(id);
    if (!record) throw new UsageImportNotFoundError();

    return toImportView(record);
  }
}
