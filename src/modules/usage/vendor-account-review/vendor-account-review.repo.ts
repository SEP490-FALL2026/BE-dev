import { Injectable } from '@nestjs/common';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  DiscrepancyFilter,
  DiscrepancyRecord,
  NewDiscrepancy,
  OutOfProcessCaseFilter,
  OutOfProcessCaseRecord,
  OutOfProcessOutcome,
  VendorAccountDecision,
} from './vendor-account-review.types';

type DiscrepancyRow = Prisma.VendorAccountDiscrepancyGetPayload<object>;
type CaseRow = Prisma.OutOfProcessCaseGetPayload<object>;

const toDiscrepancy = (row: DiscrepancyRow): DiscrepancyRecord => ({
  ...row,
  evidenceOn: fromDateColumn(row.evidenceOn),
});
const toCase = (row: CaseRow): OutOfProcessCaseRecord => ({ ...row });

/** The one writer of `vendor_account_discrepancies` and `out_of_process_cases` (`SBF-08`, `SBF-07a`, RC-2): all their SQL. */
@Injectable()
export class VendorAccountReviewRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes what was seen, one row for each thing; a thing seen again only moves its last time and the day of its evidence while it is open, and a
   * decided one is left as it is. Returns how many rows were new.
   */
  async upsertMany(tx: DbTx, rows: readonly NewDiscrepancy[]): Promise<number> {
    if (rows.length === 0) return 0;
    const col = <T>(pick: (row: NewDiscrepancy) => T) => rows.map(pick);
    const inserted = await tx.$queryRaw<{ inserted: boolean }[]>`
      INSERT INTO vendor_account_discrepancies (organization_id, source, source_ref, application_id, vendor_id, employee_id, identity,
        internal_value, vendor_value, evidence_on, first_seen_at, last_seen_at)
      SELECT t.org::uuid, t.source::"VendorAccountDiscrepancySource", t.ref, NULLIF(t.app, '')::uuid, NULLIF(t.vendor, '')::uuid,
        NULLIF(t.emp, '')::uuid, NULLIF(t.identity, ''), t.internal_value, t.vendor_value, t.evidence_on::date, t.seen::timestamptz, t.seen::timestamptz
      FROM unnest(${col((r) => r.organizationId)}::text[], ${col((r) => r.source)}::text[], ${col((r) => r.sourceRef)}::text[],
        ${col((r) => r.applicationId ?? '')}::text[], ${col((r) => r.vendorId ?? '')}::text[], ${col((r) => r.employeeId ?? '')}::text[],
        ${col((r) => r.identity ?? '')}::text[], ${col((r) => r.internalValue)}::text[], ${col((r) => r.vendorValue)}::text[],
        ${col((r) => r.evidenceOn)}::text[], ${col((r) => r.now.toISOString())}::text[])
        AS t(org, source, ref, app, vendor, emp, identity, internal_value, vendor_value, evidence_on, seen)
      ON CONFLICT (organization_id, source, source_ref) DO UPDATE
        SET last_seen_at = EXCLUDED.last_seen_at,
            evidence_on = GREATEST(vendor_account_discrepancies.evidence_on, EXCLUDED.evidence_on),
            internal_value = EXCLUDED.internal_value,
            vendor_value = EXCLUDED.vendor_value
        WHERE vendor_account_discrepancies.state = 'OPEN'
      RETURNING (xmax = 0) AS inserted`;

    return inserted.filter((row) => row.inserted).length;
  }

  /** Locks the difference for the decision and returns it; null when there is none. */
  async lockDiscrepancy(tx: DbTx, id: string): Promise<DiscrepancyRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM vendor_account_discrepancies WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await tx.vendorAccountDiscrepancy.findUniqueOrThrow({ where: { id } });

    return toDiscrepancy(row);
  }

  async decide(
    tx: DbTx,
    id: string,
    input: { decision: VendorAccountDecision; note: string; byEmployeeId: string; at: Date; caseId: string | null },
  ): Promise<DiscrepancyRecord> {
    const row = await tx.vendorAccountDiscrepancy.update({
      where: { id },
      data: {
        state: 'DECIDED',
        decision: input.decision,
        decisionNote: input.note,
        decidedByEmployeeId: input.byEmployeeId,
        decidedAt: input.at,
        outOfProcessCaseId: input.caseId,
      },
    });

    return toDiscrepancy(row);
  }

  /** One page of the differences, the newest first; the total is read in the same snapshot as the page. */
  async pageDiscrepancies(
    filter: DiscrepancyFilter,
    skip: number,
    take: number,
  ): Promise<{ rows: DiscrepancyRecord[]; total: number }> {
    const where: Prisma.VendorAccountDiscrepancyWhereInput = {
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.source ? { source: filter.source } : {}),
      ...(filter.applicationId ? { applicationId: filter.applicationId } : {}),
    };
    const page = await this.prisma.$transaction(
      async (tx) => ({
        rows: await tx.vendorAccountDiscrepancy.findMany({
          where,
          orderBy: [{ firstSeenAt: 'desc' }, { id: 'asc' }],
          skip,
          take,
        }),
        total: await tx.vendorAccountDiscrepancy.count({ where }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return { rows: page.rows.map(toDiscrepancy), total: page.total };
  }

  async insertCase(
    tx: DbTx,
    input: {
      organizationId: string;
      discrepancyId: string;
      applicationId: string | null;
      vendorId: string | null;
      at: Date;
    },
  ): Promise<OutOfProcessCaseRecord> {
    const row = await tx.outOfProcessCase.create({
      data: {
        organizationId: input.organizationId,
        discrepancyId: input.discrepancyId,
        applicationId: input.applicationId,
        vendorId: input.vendorId,
        openedAt: input.at,
      },
    });

    return toCase(row);
  }

  async lockCase(tx: DbTx, id: string): Promise<OutOfProcessCaseRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM out_of_process_cases WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return toCase(await tx.outOfProcessCase.findUniqueOrThrow({ where: { id } }));
  }

  async closeCase(
    tx: DbTx,
    id: string,
    input: {
      outcome: OutOfProcessOutcome;
      note: string;
      byEmployeeId: string;
      at: Date;
      amountMinor: bigint | null;
      costCenterId: string | null;
      documentIds: readonly string[];
    },
  ): Promise<OutOfProcessCaseRecord> {
    const row = await tx.outOfProcessCase.update({
      where: { id },
      data: {
        state: 'CLOSED',
        outcome: input.outcome,
        note: input.note,
        closedByEmployeeId: input.byEmployeeId,
        closedAt: input.at,
        amountMinor: input.amountMinor,
        costCenterId: input.costCenterId,
        documentIds: [...input.documentIds],
      },
    });

    return toCase(row);
  }

  async pageCases(
    filter: OutOfProcessCaseFilter,
    skip: number,
    take: number,
  ): Promise<{ rows: OutOfProcessCaseRecord[]; total: number }> {
    const where: Prisma.OutOfProcessCaseWhereInput = {
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.outcome ? { outcome: filter.outcome } : {}),
    };
    const page = await this.prisma.$transaction(
      async (tx) => ({
        rows: await tx.outOfProcessCase.findMany({ where, orderBy: [{ openedAt: 'desc' }, { id: 'asc' }], skip, take }),
        total: await tx.outOfProcessCase.count({ where }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return { rows: page.rows.map(toCase), total: page.total };
  }

  /** The findings and the identifiers of the application nobody has dealt with: what the review is made from (`usage` tables, same module). */
  async openFindingsOf(tx: DbTx, applicationId: string) {
    return tx.usageNoAssignmentFinding.findMany({ where: { applicationId, status: 'OPEN' }, orderBy: { id: 'asc' } });
  }

  async openUnmatchedOf(tx: DbTx, applicationId: string) {
    return tx.usageUnmatchedIdentity.findMany({ where: { applicationId, status: 'OPEN' }, orderBy: { id: 'asc' } });
  }

  /**
   * Deletes up to `limit` differences whose evidence is older than the cutoff, the oldest first, skipping a row another pass holds; returns the
   * organization of each row deleted (`US-14-04` AC-2).
   */
  async deleteOlderThan(tx: DbTx, cutoff: BusinessDate, limit: number): Promise<string[]> {
    const rows = await tx.$queryRaw<{ organization_id: string }[]>`
      DELETE FROM vendor_account_discrepancies WHERE id IN (
        SELECT id FROM vendor_account_discrepancies WHERE evidence_on < ${cutoff}::date
        ORDER BY evidence_on, id LIMIT ${limit} FOR UPDATE SKIP LOCKED)
      RETURNING organization_id`;

    return rows.map((row) => row.organization_id);
  }
}
