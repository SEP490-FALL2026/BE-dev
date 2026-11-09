import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { LicensingUsageApi } from '../../../licensing/public/licensing-usage.api';
import { IdentityRepo } from '../../identity/identity.repo';
import { NoAssignmentFindingRepo } from '../../identity/no-assignment-finding.repo';
import type { SourceRecord } from '../../vendor-source/vendor-source.types';
import type { StoredRow } from '../vendor-import.types';
import { mappingToWrite, uncoveredActivity } from './vendor-import-confirmation.policy';

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
    input: { source: SourceRecord; importId: string; actorAppUserId: string; now: Date },
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
    const created = await this.identities.insertMappingsIfAbsent(tx, [...wanted.values()]);
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

  /** Opens a finding for each matched person with activity no seat covers, and closes the one of a person whose days are all covered now. */
  private async judgeSeats(
    tx: DbTx,
    input: { source: SourceRecord; importId: string; now: Date },
    rows: readonly StoredRow[],
  ): Promise<{ opened: number; closed: number }> {
    const datesOf = new Map<string, Set<BusinessDate>>();
    for (const row of rows) {
      if (row.outcome !== 'MATCHED' || row.employeeId === null) continue;
      for (const day of row.cells.days) {
        if (day.eventClass !== 'VALUE' && day.eventClass !== 'PASSIVE') continue;
        datesOf.set(row.employeeId, (datesOf.get(row.employeeId) ?? new Set()).add(day.date));
      }
    }
    if (datesOf.size === 0) return { opened: 0, closed: 0 };

    const all = [...datesOf.values()].flatMap((dates) => [...dates]).sort();
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
    const covered: string[] = [];
    for (const [employeeId, dates] of datesOf) {
      const gap = uncoveredActivity(
        [...dates],
        seats.filter((seat) => seat.employeeId === employeeId),
      );
      if (gap === null) {
        covered.push(employeeId);
        continue;
      }
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
    const closed = await this.findings.closeCovered(tx, {
      applicationId: input.source.applicationId,
      employeeIds: covered,
      at: input.now,
      reason: 'ASSIGNMENT_COVERS',
    });

    return { opened, closed };
  }
}
