import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { UsageImportListeners } from '../../public/usage.extension-points';
import { UsageSourceRefusedError } from '../../vendor-source/vendor-source.errors';
import { judgeSourceApplication } from '../../vendor-source/vendor-source.policy';
import type { SourceRecord } from '../../vendor-source/vendor-source.types';
import { VendorImportPreviewService, sameJudgement } from '../preview/vendor-import-preview.service';
import {
  UsageImportEventTypeUnmappedError,
  UsageImportPreviewStaleError,
  UsageTrackingNoticeRequiredError,
} from '../vendor-import.errors';
import { VendorImportRepo } from '../vendor-import.repo';
import type { ImportRecord, ImportResult, NoticeMode, StoredRow } from '../vendor-import.types';
import {
  daysToWrite,
  planOverlaps,
  trackingNoticeIsMissing,
  unmappedEventTypesOf,
} from './vendor-import-confirmation.policy';
import { VendorImportPeopleService } from './vendor-import-people.service';
import { VendorImportTrackingNoticeService } from './vendor-import-tracking-notice.service';

export type JudgedRow = StoredRow & { candidates: string[] };

/** What the confirmation of one report needs: who confirms, which source and import (both locked) and what the caller sent. */
export interface WriteContext {
  actor: AuthenticatedPrincipal;
  organizationId: string;
  source: SourceRecord;
  current: ImportRecord;
  input: { previewVersion: number; idempotencyKey: string; notice?: NoticeMode };
}

/**
 * The steps of a confirmation under the locks of the source and the import: judge every row again and refuse what no longer holds, then
 * tell the holders, write the days, share them with the reports that overlap, tie the people and complete the import.
 */
@Injectable()
export class VendorImportWriteService {
  constructor(
    private readonly repo: VendorImportRepo,
    private readonly previews: VendorImportPreviewService,
    private readonly people: VendorImportPeopleService,
    private readonly notices: VendorImportTrackingNoticeService,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly listeners: UsageImportListeners,
  ) {}

  /** The rows judged again, or the reason the confirmation cannot go on: stale, event types nobody sorted, the holders not told. */
  async verify(tx: DbTx, context: WriteContext): Promise<JudgedRow[]> {
    const { source, current, input } = context;
    const [application] = await this.catalog.getCollectorApplications([source.applicationId], tx);
    const problem = judgeSourceApplication(application);
    if (problem) throw new UsageSourceRefusedError(problem);

    const stored = await this.repo.rows(tx, current.id);
    const fresh = await this.previews.rejudge(source, stored, tx);
    const changed = fresh.filter((row, index) => !sameJudgement(row, stored[index])).map((row) => row.lineNumber);
    if (changed.length > 0) throw new UsageImportPreviewStaleError(current.previewVersion, changed);
    const unmapped = unmappedEventTypesOf(fresh);
    if (unmapped.length > 0) throw new UsageImportEventTypeUnmappedError(unmapped);
    const firstReport = !(await this.repo.hasCompletedForApplication(source.applicationId, tx));
    if (trackingNoticeIsMissing(firstReport, input.notice)) throw new UsageTrackingNoticeRequiredError();

    return fresh;
  }

  /** Writes what the verified rows promise and completes the import; returns what was written. */
  async write(tx: DbTx, context: WriteContext, fresh: readonly JudgedRow[]): Promise<ImportResult> {
    const { actor, organizationId, source, current, input } = context;
    const today = await this.organizationReads.businessToday(undefined, tx);
    const noticesSent = await this.notices.tellHolders(tx, {
      organizationId,
      applicationId: source.applicationId,
      activityDefinition: source.activityDefinition,
      today,
    });
    await this.repo.markNotice(tx, current.id, input.notice ?? null);
    const daysWritten = await this.repo.writeDays(tx, {
      organizationId,
      sourceId: source.id,
      importId: current.id,
      applicationId: source.applicationId,
      identifierType: source.identifierType,
      days: daysToWrite(fresh),
    });
    const daysSuperseded = await this.shareDays(tx, current);
    const now = new Date();
    const people = await this.people.record(
      tx,
      {
        source,
        importId: current.id,
        actorAppUserId: actor.appUserId,
        now,
        window: { from: current.coverageFrom, to: current.coverageTo },
      },
      fresh,
    );
    const count = (outcome: string) => fresh.filter((row) => row.outcome === outcome).length;
    const result: ImportResult = {
      daysWritten,
      matched: count('MATCHED'),
      unmatched: count('UNMATCHED'),
      ambiguous: count('AMBIGUOUS'),
      notAPerson: count('NOT_A_PERSON'),
      invalid: count('INVALID'),
      mappingsCreated: people.mappingsCreated,
      daysSuperseded,
      findingsOpened: people.findingsOpened,
      findingsClosed: people.findingsClosed,
      noticesSent,
    };
    await this.repo.markCompleted(tx, current.id, {
      result,
      confirmKey: input.idempotencyKey,
      confirmedByAppUserId: actor.appUserId,
      now,
    });
    await this.listeners.emit(tx, {
      moment: 'CONFIRMED',
      importId: current.id,
      sourceId: source.id,
      applicationId: source.applicationId,
      coverageTo: current.coverageTo,
    });

    return result;
  }

  /** The days two reports of the source both cover go to the one that covers later; the other keeps them marked as given up (`US-08-07` AC-3). */
  private async shareDays(tx: DbTx, current: ImportRecord): Promise<number> {
    const others = await this.repo.completedOverlapping(tx, {
      sourceId: current.sourceId,
      from: current.coverageFrom,
      to: current.coverageTo,
      exceptId: current.id,
    });
    const decisions = planOverlaps(
      { id: current.id, from: current.coverageFrom, to: current.coverageTo },
      others.map((other) => ({ id: other.id, from: other.coverageFrom, to: other.coverageTo })),
    );
    let superseded = 0;
    for (const decision of decisions) {
      superseded += await this.repo.supersede(tx, {
        loserImportId: decision.winner === 'CURRENT' ? decision.otherImportId : current.id,
        winnerImportId: decision.winner === 'CURRENT' ? current.id : decision.otherImportId,
        from: decision.from,
        to: decision.to,
      });
    }

    return superseded;
  }
}
