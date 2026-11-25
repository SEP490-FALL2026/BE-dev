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
      data: [{ ...input, month: toDateColumn(input.month) }],
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
}
