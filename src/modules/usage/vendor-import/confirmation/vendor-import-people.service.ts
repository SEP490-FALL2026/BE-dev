import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { LicensingUsageApi } from '../../../licensing/public/licensing-usage.api';
import { IdentityRepo } from '../../identity/identity.repo';
import { NoAssignmentFindingRepo } from '../../identity/no-assignment-finding.repo';
import type { SourceRecord } from '../../vendor-source/vendor-source.types';
import type { StoredRow } from '../vendor-import.types';
import { mappingToWrite, rangeCovered, uncoveredActivity } from './vendor-import-confirmation.policy';

type JudgedRow = StoredRow & { candidates: string[] };

export interface PeopleOutcome {
  mappingsCreated: number;
  findingsOpened: number;
  findingsClosed: number;
}

const confidenceOf = (method: string): 'HIGH' | 'MEDIUM' => (method === 'ALIAS_RULE' ? 'MEDIUM' : 'HIGH');

/**
 * What a confirmed report leaves about people, beside the days: the mappings a new match makes (with the identifier as the vendor wrote it), the
 * identifiers nobody could be tied to (in the queue, `INV-12`) and the people who were active with no seat to cover the day (`FR-4.8`, Q-84). It
 * never makes a seat.
 */
@Injectable()
export class VendorImportPeopleService {
  constructor(
    private readonly identities: IdentityRepo,
    private readonly findings: NoAssignmentFindingRepo,
    private readonly licensingUsage: LicensingUsageApi,
  ) {}

  async record(
    tx: DbTx,
    input: {
      source: SourceRecord;
      importId: string;
      actorAppUserId: string;
      now: Date;
      /** The window the report covers: activity with no seat is looked for in it only. */
      window: { from: BusinessDate; to: BusinessDate };
    },
    rows: readonly JudgedRow[],
  ): Promise<PeopleOutcome> {
    const mappingsCreated = await this.writeMappings(tx, input, rows);
    await this.queueUnmatched(tx, input, rows);
    const { opened, closed } = await this.judgeSeats(tx, input, rows);

    return { mappingsCreated, findingsOpened: opened, findingsClosed: closed };
  }

  private async writeMappings(
    tx: DbTx,
    input: { source: SourceRecord; actorAppUserId: string; now: Date },
    rows: readonly StoredRow[],
  ): Promise<number> {
    const { source } = input;
    const matched = [
      ...new Set(rows.filter((row) => row.outcome === 'MATCHED').map((row) => row.identifierNormalized)),
    ];
    const inForce = await this.identities.mappingsInForce(source.applicationId, source.identifierType, matched, tx);
    const methods = new Map([...inForce].map(([identifier, mapping]) => [identifier, mapping.method]));
    const wanted = new Map<string, Parameters<IdentityRepo['insertMappingsIfAbsent']>[1][number]>();
    for (const row of rows) {
      const method = mappingToWrite(row, methods);
      if (method === null || row.employeeId === null || wanted.has(row.identifierNormalized)) continue;
      wanted.set(row.identifierNormalized, {
        organizationId: source.organizationId,
        applicationId: source.applicationId,
        identifierType: source.identifierType,
        normalizedIdentifier: row.identifierNormalized,
        rawIdentifier: row.identifierRaw,
        employeeId: row.employeeId,
        method,
        confidence: confidenceOf(method),
      });
    }
    const created = await this.identities.insertMappingsIfAbsent(tx, [...wanted.values()], input.actorAppUserId);
    await this.identities.resolveByMappings(
      tx,
      {
        applicationId: source.applicationId,
        identifierType: source.identifierType,
        byAppUserId: input.actorAppUserId,
        at: input.now,
      },
      created,
    );

    return created.size;
  }

  private async queueUnmatched(
    tx: DbTx,
    input: { source: SourceRecord; importId: string },
    rows: readonly JudgedRow[],
  ): Promise<void> {
    const items = new Map<
      string,
      {
        normalizedIdentifier: string;
        rawIdentifier: string;
        reason: 'NOT_FOUND' | 'AMBIGUOUS';
        candidateEmployeeIds: string[];
      }
    >();
    for (const row of rows) {
      if (row.outcome !== 'UNMATCHED' && row.outcome !== 'AMBIGUOUS') continue;
      items.set(row.identifierNormalized, {
        normalizedIdentifier: row.identifierNormalized,
        rawIdentifier: row.identifierRaw,
        reason: row.outcome === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'NOT_FOUND',
        candidateEmployeeIds: row.candidates,
      });
    }
    const { source } = input;
    await this.identities.upsertUnmatchedMany(
      tx,
      {
        organizationId: source.organizationId,
        applicationId: source.applicationId,
        sourceId: source.id,
        identifierType: source.identifierType,
        importId: input.importId,
      },
      [...items.values()],
    );
  }

  /**
   * Opens a finding for each matched person with activity in the window that no seat covers (`FR-4.8`), then closes each open finding of the
   * people of the report whose own days, first to last, a seat covers now: a finding is never closed for days it does not name.
   */
  private async judgeSeats(
    tx: DbTx,
    input: { source: SourceRecord; importId: string; now: Date; window: { from: BusinessDate; to: BusinessDate } },
    rows: readonly StoredRow[],
  ): Promise<{ opened: number; closed: number }> {
    const datesOf = new Map<string, Set<BusinessDate>>();
    const people = new Set<string>();
    for (const row of rows) {
      // A person found only by the rule of aliases is not sure enough to be told they used the tool without a seat (`FR-4.8`, `TC-2`).
      if (row.outcome !== 'MATCHED' || row.employeeId === null || row.matchMethod === 'ALIAS_RULE') continue;
      people.add(row.employeeId);
      for (const day of row.cells.days) {
        if (day.eventClass !== 'VALUE' && day.eventClass !== 'PASSIVE') continue;
        // A last activity long before the report (before any seat was recorded) is a fact of the past, not activity without a seat now.
        if (day.date < input.window.from || day.date > input.window.to) continue;
        datesOf.set(row.employeeId, (datesOf.get(row.employeeId) ?? new Set()).add(day.date));
      }
    }
    if (people.size === 0) return { opened: 0, closed: 0 };

    const opened = await this.openFindings(tx, input, datesOf);
    const closed = await this.closeFindings(tx, input, [...people]);

    return { opened, closed };
  }

  private async openFindings(
    tx: DbTx,
    input: { source: SourceRecord; importId: string },
    datesOf: ReadonlyMap<string, ReadonlySet<BusinessDate>>,
  ): Promise<number> {
    const all = [...datesOf.values()].flatMap((dates) => [...dates]).sort();
    if (all.length === 0) return 0;
    const seats = await this.licensingUsage.listAssignmentIntervals(
      {
        applicationId: input.source.applicationId,
        employeeIds: [...datesOf.keys()],
        from: all[0],
        to: all[all.length - 1],
      },
      tx,
    );
    let opened = 0;
    for (const [employeeId, dates] of datesOf) {
      const gap = uncoveredActivity(
        [...dates],
        seats.filter((seat) => seat.employeeId === employeeId),
      );
      if (gap === null) continue;
      const inserted = await this.findings.openOrWiden(tx, {
        organizationId: input.source.organizationId,
        applicationId: input.source.applicationId,
        employeeId,
        firstActivityDate: gap.first,
        lastActivityDate: gap.last,
        importId: input.importId,
      });
      if (inserted) opened += 1;
    }

    return opened;
  }

  private async closeFindings(
    tx: DbTx,
    input: { source: SourceRecord; now: Date },
    people: readonly string[],
  ): Promise<number> {
    const ranges = await this.findings.openRangesOf(input.source.applicationId, people, tx);
    if (ranges.size === 0) return 0;
    const days = [...ranges.values()].flatMap((range) => [range.first, range.last]).sort();
    const seats = await this.licensingUsage.listAssignmentIntervals(
      {
        applicationId: input.source.applicationId,
        employeeIds: [...ranges.keys()],
        from: days[0],
        to: days[days.length - 1],
      },
      tx,
    );
    const covered = [...ranges].flatMap(([employeeId, range]) =>
      rangeCovered(
        range,
        seats.filter((seat) => seat.employeeId === employeeId),
      )
        ? [employeeId]
        : [],
    );

    return this.findings.closeCovered(tx, {
      applicationId: input.source.applicationId,
      employeeIds: covered,
      at: input.now,
      reason: 'ASSIGNMENT_COVERS',
    });
  }
}
