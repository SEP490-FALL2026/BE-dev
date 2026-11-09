import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { LicensingUsageApi } from '../../../licensing/public/licensing-usage.api';
import { detectableGroups } from '../../vendor-source/vendor-source.policy';
import type { SourceRecord } from '../../vendor-source/vendor-source.types';
import { VendorImportMatchService, type RowJudgement } from '../match/vendor-import-match.service';
import type { ParsedReport } from '../parse/vendor-import-parse.types';
import type { ImportSummary, ReportRow, StoredRow } from '../vendor-import.types';

const toStored = (row: ReportRow, judgement: RowJudgement): StoredRow => ({
  lineNumber: row.lineNumber,
  identifierRaw: row.identifierRaw,
  identifierNormalized: row.identifierNormalized,
  cells: { days: row.days },
  outcome: row.errors.length > 0 ? 'INVALID' : judgement.outcome,
  employeeId: judgement.employeeId,
  matchMethod: judgement.method,
  errors: row.errors,
});

/** Whether a row was judged the same when the preview is made again: the same outcome, the same person, the same way. */
export function sameJudgement(
  before: Pick<StoredRow, 'outcome' | 'employeeId' | 'matchMethod'>,
  after: Pick<StoredRow, 'outcome' | 'employeeId' | 'matchMethod'>,
): boolean {
  return (
    before.outcome === after.outcome &&
    before.employeeId === after.employeeId &&
    before.matchMethod === after.matchMethod
  );
}

/**
 * The preview of a report (`US-08-02` AC-1): every row judged against the people and the seats as they are, and what the report says as a
 * whole. Nothing is written. The confirmation makes the same judgement again under its locks and refuses when any row would now be judged
 * differently.
 */
@Injectable()
export class VendorImportPreviewService {
  constructor(
    private readonly matches: VendorImportMatchService,
    private readonly licensingUsage: LicensingUsageApi,
  ) {}

  /** The rows of a report as they will be kept, with the summary. */
  async preview(
    input: { source: SourceRecord; parsed: ParsedReport; today: BusinessDate; trackingNoticeRequired: boolean },
    tx?: DbTx,
  ): Promise<{ rows: StoredRow[]; summary: ImportSummary }> {
    const { source, parsed } = input;
    const judgements = await this.matches.judge(
      { applicationId: source.applicationId, identifierType: source.identifierType },
      parsed.rows.map((row) => ({
        identifierNormalized: row.identifierNormalized,
        notAPerson: row.notAPerson,
        invalid: row.errors.length > 0,
      })),
      tx,
    );
    const rows = parsed.rows.map((row, index) => toStored(row, judgements[index]));

    return {
      rows,
      summary: await this.summarize({ ...input, rows }, tx),
    };
  }

  /** The judgement of rows already kept, made now: what the confirmation compares with what the preview said. */
  async rejudge(source: SourceRecord, stored: readonly StoredRow[], tx?: DbTx): Promise<StoredRow[]> {
    const judgements = await this.matches.judge(
      { applicationId: source.applicationId, identifierType: source.identifierType },
      stored.map((row) => ({
        identifierNormalized: row.identifierNormalized,
        notAPerson: row.outcome === 'NOT_A_PERSON',
        invalid: row.outcome === 'INVALID',
      })),
      tx,
    );

    return stored.map((row, index) => ({
      ...row,
      outcome: judgements[index].outcome,
      employeeId: judgements[index].employeeId,
      matchMethod: judgements[index].method,
    }));
  }

  private async summarize(
    input: {
      source: SourceRecord;
      parsed: ParsedReport;
      today: BusinessDate;
      trackingNoticeRequired: boolean;
      rows: StoredRow[];
    },
    tx?: DbTx,
  ): Promise<ImportSummary> {
    const { source, parsed, rows } = input;
    const count = (outcome: StoredRow['outcome']) => rows.filter((row) => row.outcome === outcome).length;
    const byCode: Record<string, number> = {};
    for (const row of rows) for (const error of row.errors) byCode[error.code] = (byCode[error.code] ?? 0) + 1;
    const matchedPeople = [
      ...new Set(rows.flatMap((row) => (row.outcome === 'MATCHED' && row.employeeId ? [row.employeeId] : []))),
    ];
    const seats =
      matchedPeople.length === 0
        ? []
        : await this.licensingUsage.listAssignmentIntervals(
            {
              applicationId: source.applicationId,
              employeeIds: matchedPeople,
              from: parsed.window.from,
              to: parsed.window.to,
            },
            tx,
          );

    return {
      window: parsed.window,
      totalRows: rows.length,
      matched: count('MATCHED'),
      unmatched: count('UNMATCHED'),
      ambiguous: count('AMBIGUOUS'),
      notAPerson: count('NOT_A_PERSON'),
      invalid: count('INVALID'),
      byCode,
      distinctIdentifiers: new Set(
        rows.filter((row) => row.outcome !== 'INVALID').map((row) => row.identifierNormalized),
      ).size,
      affectedSeats: new Set(seats.map((seat) => seat.chainRootId)).size,
      detectableGroups: detectableGroups(source.capabilities),
      activityDefinition: source.activityDefinition,
      warnings: parsed.warnings,
      unmappedEventTypes: parsed.unmappedEventTypes,
      trackingNoticeRequired: input.trackingNoticeRequired,
      recordedOn: input.today,
    };
  }
}
