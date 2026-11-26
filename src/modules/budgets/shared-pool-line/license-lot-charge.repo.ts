import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/** What a lot cost that no invoice carries: a license left over in the store, given for the first time to a request (W3-25). */
export interface LicenseLotChargeRecord {
  id: string;
  organizationId: string;
  licenseLotId: string;
  licenseKeyId: string;
  commitmentId: string | null;
  costCenterId: string;
  /** The first day of the month the cost belongs to. */
  month: BusinessDate;
  amountMinor: bigint;
  createdAt: Date;
}

export interface NewLicenseLotCharge {
  organizationId: string;
  licenseLotId: string;
  licenseKeyId: string;
  commitmentId: string | null;
  costCenterId: string;
  month: BusinessDate;
  amountMinor: bigint;
  createdAt?: Date;
}

export interface LotInvoiceSummary {
  invoiceId: string;
  recordedAt: Date;
  costCenterAllocatedMinor: bigint;
}

export interface LotPoolTotals {
  lotIdleNetMinor: bigint;
  deviceLotPurchasesMinor: bigint;
  replacementKeysMinor: bigint;
}

type Row = Prisma.LicenseLotChargeGetPayload<object>;

const toRecord = (row: Row): LicenseLotChargeRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  licenseLotId: row.licenseLotId,
  licenseKeyId: row.licenseKeyId,
  commitmentId: row.commitmentId,
  costCenterId: row.costCenterId,
  month: fromDateColumn(row.month),
  amountMinor: row.amountMinor,
  createdAt: row.createdAt,
});

/**
 * The one writer of `license_lot_charges`: a charge is written once for a key and never changed (a trigger). A second charge of the same key
 * writes nothing: the first stands.
 */
@Injectable()
export class LicenseLotChargeRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the charge of a key; false when the key already has one. */
  async insertOnce(tx: DbTx, input: NewLicenseLotCharge): Promise<boolean> {
    const inserted = await tx.licenseLotCharge.createMany({
      data: [
        {
          organizationId: input.organizationId,
          licenseLotId: input.licenseLotId,
          licenseKeyId: input.licenseKeyId,
          commitmentId: input.commitmentId,
          costCenterId: input.costCenterId,
          month: toDateColumn(input.month),
          amountMinor: input.amountMinor,
          ...(input.createdAt ? { createdAt: input.createdAt } : {}),
        },
      ],
      skipDuplicates: true,
    });

    return inserted.count === 1;
  }

  async findOfKey(licenseKeyId: string, tx?: DbTx): Promise<LicenseLotChargeRecord | null> {
    const row = await (tx ?? this.prisma).licenseLotCharge.findUnique({ where: { licenseKeyId } });

    return row ? toRecord(row) : null;
  }

  /** The charges of a lot, oldest first. */
  async ofLot(licenseLotId: string, tx?: DbTx): Promise<LicenseLotChargeRecord[]> {
    const rows = await (tx ?? this.prisma).licenseLotCharge.findMany({
      where: { licenseLotId },
      orderBy: [{ month: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** The charges of a Cost Center for a range of months (the first days of them, both ends included). */
  async ofCostCenter(
    costCenterId: string,
    fromMonth: BusinessDate,
    toMonth: BusinessDate,
    tx?: DbTx,
  ): Promise<LicenseLotChargeRecord[]> {
    const rows = await (tx ?? this.prisma).licenseLotCharge.findMany({
      where: { costCenterId, month: { gte: toDateColumn(fromMonth), lte: toDateColumn(toMonth) } },
      orderBy: [{ month: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** All charges across a batch of lots, oldest first. */
  async ofLots(licenseLotIds: readonly string[], tx?: DbTx): Promise<LicenseLotChargeRecord[]> {
    if (licenseLotIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).licenseLotCharge.findMany({
      where: { licenseLotId: { in: [...licenseLotIds] } },
      orderBy: [{ month: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** Confirmed invoice metadata and net `COST_CENTER` allocation sum for `lotId`, from budget-owned tables only. */
  async lotInvoiceSummary(tx: DbTx, lotId: string): Promise<LotInvoiceSummary | null> {
    const rows = await tx.$queryRaw<{ invoiceId: string; recordedAt: Date; ccSum: string }[]>`
      SELECT i.id AS "invoiceId",
             i.recorded_at AS "recordedAt",
             COALESCE(SUM(a.amount_minor) FILTER (WHERE a.bucket = 'COST_CENTER'), 0)::text AS "ccSum"
        FROM invoices i
        JOIN invoice_allocations a ON a.invoice_id = i.id
       WHERE i.subscription_id = ${lotId}::uuid
       GROUP BY i.id, i.recorded_at
       ORDER BY i.recorded_at DESC
       LIMIT 1`;
    const row = rows[0];

    return row
      ? { invoiceId: row.invoiceId, recordedAt: row.recordedAt, costCenterAllocatedMinor: BigInt(row.ccSum) }
      : null;
  }

  /** Shared-pool lot allocations (`POOL_IDLE`, `POOL_LOT_DIFFERENCE`, `POOL_DEVICE_LOT`, `POOL_REPLACEMENT`) less post-invoice excess charges in `[from, until)`. */
  async poolTotalsInRange(
    input: { organizationId: string; from: BusinessDate; until: BusinessDate },
    tx?: DbTx,
  ): Promise<LotPoolTotals> {
    const rows = await (tx ?? this.prisma).$queryRaw<
      { lotIdleNetMinor: string; deviceLotPurchasesMinor: string; replacementKeysMinor: string }[]
    >`
      WITH lot_allocs AS (
        SELECT COALESCE(SUM(a.amount_minor) FILTER (WHERE a.bucket IN ('POOL_IDLE', 'POOL_LOT_DIFFERENCE')), 0) AS lot_idle_gross,
               COALESCE(SUM(a.amount_minor) FILTER (WHERE a.bucket = 'POOL_DEVICE_LOT'), 0) AS device_lot_purchases,
               COALESCE(SUM(a.amount_minor) FILTER (WHERE a.bucket = 'POOL_REPLACEMENT'), 0) AS replacement_keys
          FROM invoice_allocations a
          JOIN invoices i ON i.id = a.invoice_id
         WHERE i.organization_id = ${input.organizationId}::uuid
           AND a.month >= ${input.from}::date
           AND a.month < ${input.until}::date
      ),
      post_charges AS (
        SELECT COALESCE(SUM(c.amount_minor), 0) AS total
          FROM license_lot_charges c
         WHERE c.organization_id = ${input.organizationId}::uuid
           AND c.month >= ${input.from}::date
           AND c.month < ${input.until}::date
           AND EXISTS (
             SELECT 1 FROM invoices i
              JOIN invoice_allocations a ON a.invoice_id = i.id
             WHERE i.subscription_id = c.license_lot_id
               AND c.created_at > i.recorded_at
           )
      )
      SELECT (lot_allocs.lot_idle_gross - post_charges.total)::text AS "lotIdleNetMinor",
             lot_allocs.device_lot_purchases::text AS "deviceLotPurchasesMinor",
             lot_allocs.replacement_keys::text AS "replacementKeysMinor"
        FROM lot_allocs, post_charges`;
    const row = rows[0];

    return {
      lotIdleNetMinor: BigInt(row?.lotIdleNetMinor ?? '0'),
      deviceLotPurchasesMinor: BigInt(row?.deviceLotPurchasesMinor ?? '0'),
      replacementKeysMinor: BigInt(row?.replacementKeysMinor ?? '0'),
    };
  }

  /** Distinct lot ids whose confirmed lot invoice pays for `month`. */
  async invoicedLotIdsInMonth(organizationId: string, month: BusinessDate, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ lotId: string }[]>`
      SELECT DISTINCT i.subscription_id AS "lotId"
        FROM invoices i
        JOIN invoice_allocations a ON a.invoice_id = i.id
       WHERE i.organization_id = ${organizationId}::uuid
         AND i.service_month = ${month}::date
         AND i.subscription_id IS NOT NULL
         AND a.bucket IN ('COST_CENTER', 'POOL_IDLE', 'POOL_LOT_DIFFERENCE')
       ORDER BY i.subscription_id ASC`;

    return rows.map((row) => row.lotId);
  }
}
