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
const toCase = (row: CaseRow): OutOfProcessCaseRecord => ({
  ...row,
  concludedOn: row.concludedOn === null ? null : fromDateColumn(row.concludedOn),
});

/** The one writer of `vendor_account_discrepancies` and `out_of_process_cases` (`SBF-08`, `SBF-07a`, RC-2): all their SQL. */
@Injectable()
export class VendorAccountReviewRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes what was seen, one row open for each thing: a thing seen again moves its last time and the day of its evidence while it is open. A thing
   * that was decided is opened again as a new row, linked to the decided one, when it is seen with evidence newer than that of the decision; with the
   * same day or an older one nothing is written (`QĐ-106j`, `US-13-05` AC-26). A decided row is never changed. Returns how many rows were new.
   */
  async upsertMany(tx: DbTx, rows: readonly NewDiscrepancy[]): Promise<number> {
    if (rows.length === 0) return 0;
    const col = <T>(pick: (row: NewDiscrepancy) => T) => rows.map(pick);
    const inserted = await tx.$queryRaw<{ inserted: boolean }[]>`
      INSERT INTO vendor_account_discrepancies (organization_id, source, source_ref, application_id, vendor_id, employee_id, identity,
        internal_value, vendor_value, evidence_on, first_seen_at, last_seen_at, reopened_from_id)
      SELECT t.org::uuid, t.source::"VendorAccountDiscrepancySource", t.ref, NULLIF(t.app, '')::uuid, NULLIF(t.vendor, '')::uuid,
        NULLIF(t.emp, '')::uuid, NULLIF(t.identity, ''), t.internal_value, t.vendor_value, t.evidence_on::date, t.seen::timestamptz, t.seen::timestamptz,
        (SELECT d.id FROM vendor_account_discrepancies d
          WHERE d.organization_id = t.org::uuid AND d.source = t.source::"VendorAccountDiscrepancySource" AND d.source_ref = t.ref AND d.state = 'DECIDED'
          ORDER BY d.decided_at DESC, d.id LIMIT 1)
      FROM unnest(${col((r) => r.organizationId)}::text[], ${col((r) => r.source)}::text[], ${col((r) => r.sourceRef)}::text[],
        ${col((r) => r.applicationId ?? '')}::text[], ${col((r) => r.vendorId ?? '')}::text[], ${col((r) => r.employeeId ?? '')}::text[],
        ${col((r) => r.identity ?? '')}::text[], ${col((r) => r.internalValue)}::text[], ${col((r) => r.vendorValue)}::text[],
        ${col((r) => r.evidenceOn)}::text[], ${col((r) => r.now.toISOString())}::text[])
        AS t(org, source, ref, app, vendor, emp, identity, internal_value, vendor_value, evidence_on, seen)
      WHERE NOT EXISTS (
        SELECT 1 FROM vendor_account_discrepancies d
         WHERE d.organization_id = t.org::uuid AND d.source = t.source::"VendorAccountDiscrepancySource" AND d.source_ref = t.ref
           AND d.state = 'DECIDED' AND d.evidence_on >= t.evidence_on::date)
      ON CONFLICT (organization_id, source, source_ref) WHERE state = 'OPEN' DO UPDATE
        SET last_seen_at = EXCLUDED.last_seen_at,
            evidence_on = GREATEST(vendor_account_discrepancies.evidence_on, EXCLUDED.evidence_on),
            internal_value = EXCLUDED.internal_value,
            vendor_value = EXCLUDED.vendor_value
      RETURNING (xmax = 0) AS inserted`;

    return inserted.filter((row) => row.inserted).length;
  }

  /**
   * The identifier at the vendor of the account a difference is about, as the usage module normalized it, whichever source saw the account: the
   * identifier nobody owns is named by its own row, an account with activity and no seat by the identifier the person is tied to at that vendor
   * (the newest tie still in force). Null when nothing names it (the row of the identifier is gone, or the person has no tie); the key then falls back
   * to what the difference holds (`openCaseKeyOf`). FX3-03.
   */
  async accountIdentifierOf(tx: DbTx, discrepancyId: string): Promise<string | null> {
    const rows = await tx.$queryRaw<{ identifier: string | null }[]>`
      SELECT CASE d.source::text
        WHEN 'UNMATCHED_IDENTITY' THEN (
          SELECT u.normalized_identifier FROM usage_unmatched_identities u WHERE u.id::text = d.source_ref)
        WHEN 'NO_ASSIGNMENT' THEN (
          SELECT m.normalized_identifier FROM usage_identity_mappings m
           WHERE m.application_id = d.application_id AND m.employee_id = d.employee_id AND m.ended_at IS NULL
           ORDER BY m.created_at DESC, m.id LIMIT 1)
      END AS identifier
        FROM vendor_account_discrepancies d WHERE d.id = ${discrepancyId}::uuid`;

    return rows[0]?.identifier ?? null;
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

  /**
   * The case open for the account a difference is about (`QĐ-98h`): the one that is open already, which the difference then joins, or a new one. One
   * statement decides, so two differences of one account decided together get the same case.
   */
  async openOrJoinCase(
    tx: DbTx,
    input: {
      organizationId: string;
      discrepancyId: string;
      applicationId: string | null;
      vendorId: string | null;
      identityKey: string;
      companyAsset: boolean;
      concludedOn: BusinessDate;
      at: Date;
    },
  ): Promise<{ record: OutOfProcessCaseRecord; joined: boolean }> {
    const created = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO out_of_process_cases (organization_id, discrepancy_id, application_id, vendor_id, opened_at, identity_key, company_asset, concluded_on)
      VALUES (${input.organizationId}::uuid, ${input.discrepancyId}::uuid, ${input.applicationId}::uuid, ${input.vendorId}::uuid,
        ${input.at}::timestamptz, ${input.identityKey}, ${input.companyAsset}, ${input.concludedOn}::date)
      ON CONFLICT (organization_id, identity_key) WHERE state = 'OPEN' AND identity_key IS NOT NULL DO NOTHING
      RETURNING id`;
    if (created.length > 0) {
      return {
        record: toCase(await tx.outOfProcessCase.findUniqueOrThrow({ where: { id: created[0].id } })),
        joined: false,
      };
    }
    const open = await tx.outOfProcessCase.findFirstOrThrow({
      where: { organizationId: input.organizationId, identityKey: input.identityKey, state: 'OPEN' },
    });

    return { record: toCase(open), joined: true };
  }

  async lockCase(tx: DbTx, id: string): Promise<OutOfProcessCaseRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM out_of_process_cases WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return toCase(await tx.outOfProcessCase.findUniqueOrThrow({ where: { id } }));
  }

  /** The money of an open case on a company asset, recorded by Finance while the case stays open (`US-13-05` AC-20). */
  async recordSpend(
    tx: DbTx,
    id: string,
    input: { amountMinor: bigint; costCenterId: string | null; documentIds: readonly string[] },
  ): Promise<OutOfProcessCaseRecord> {
    const row = await tx.outOfProcessCase.update({
      where: { id },
      data: { amountMinor: input.amountMinor, costCenterId: input.costCenterId, documentIds: [...input.documentIds] },
    });

    return toCase(row);
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
      renewalCancelled: boolean;
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
        renewalCancelled: input.renewalCancelled,
      },
    });

    return toCase(row);
  }

  /** The person each of the cases is about, from the difference it came from; null where the difference names none (an identifier nobody owns). One statement. */
  async employeeIdsOfCases(caseIds: readonly string[]): Promise<Map<string, string | null>> {
    if (caseIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ case_id: string; employee_id: string | null }[]>`
      SELECT c.id AS case_id, d.employee_id
        FROM out_of_process_cases c JOIN vendor_account_discrepancies d ON d.id = c.discrepancy_id
       WHERE c.id = ANY(${[...caseIds]}::uuid[])`;

    return new Map(rows.map((row) => [row.case_id, row.employee_id]));
  }

  /** Every case still open on a company asset that was concluded: the ones that may ask the IT Admin to revoke (a short list, the cases of an account at a time). */
  async openCompanyAssetCases(): Promise<OutOfProcessCaseRecord[]> {
    const rows = await this.prisma.outOfProcessCase.findMany({
      where: { state: 'OPEN', companyAsset: true, concludedOn: { not: null } },
      orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toCase);
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

  /**
   * The findings and the identifiers of the application nobody has dealt with that the report just confirmed contains: what the review is made from
   * (`usage` tables, same module). One that an older report held and this one did not is not seen again, so its day of evidence does not move.
   */
  async openFindingsOf(tx: DbTx, applicationId: string, importId: string) {
    return tx.usageNoAssignmentFinding.findMany({
      where: { applicationId, status: 'OPEN', lastImportId: importId },
      orderBy: { id: 'asc' },
    });
  }

  async openUnmatchedOf(tx: DbTx, applicationId: string, importId: string) {
    return tx.usageUnmatchedIdentity.findMany({
      where: { applicationId, status: 'OPEN', lastImportId: importId },
      orderBy: { id: 'asc' },
    });
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
