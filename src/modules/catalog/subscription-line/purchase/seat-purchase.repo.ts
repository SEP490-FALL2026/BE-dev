import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn } from '../../../../core/business-date';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type {
  NewSeatPurchase,
  SeatInvoiceObligation,
  SeatPurchaseKind,
  SeatPurchaseRecord,
} from './seat-purchase.types';

type Row = Prisma.SeatPurchaseGetPayload<object>;

const toRecord = (row: Row): SeatPurchaseRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  subscriptionLineId: row.subscriptionLineId,
  code: row.code,
  kind: row.kind as SeatPurchaseKind,
  purchasedOn: fromDateColumn(row.purchasedOn),
  quantity: row.quantity,
  invoiceObligation: row.invoiceObligation as SeatInvoiceObligation,
  invoiceDueOn: row.invoiceDueOn ? fromDateColumn(row.invoiceDueOn) : null,
  recordedByEmployeeId: row.recordedByEmployeeId,
  recordedAt: row.recordedAt,
});

/** The code of a purchase: `MUA-` and the number drawn, six digits. */
export const seatPurchaseCodeOf = (drawn: number): string => `MUA-${String(drawn).padStart(6, '0')}`;

/**
 * The one writer of `seat_purchases`: a purchase of seats is written once and never changed (a trigger). The code is drawn from the
 * sequence `seat_purchase_code_seq` in the same transaction, so a rolled-back purchase leaves a gap, never a repeat.
 */
@Injectable()
export class SeatPurchaseRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes a purchase and gives it the next code. */
  async insert(tx: DbTx, input: NewSeatPurchase): Promise<SeatPurchaseRecord> {
    const [{ drawn }] = await tx.$queryRaw<{ drawn: number }[]>`SELECT nextval('seat_purchase_code_seq')::int AS drawn`;
    const row = await tx.seatPurchase.create({
      data: {
        organizationId: input.organizationId,
        subscriptionLineId: input.subscriptionLineId,
        code: seatPurchaseCodeOf(drawn),
        kind: input.kind,
        purchasedOn: toDateColumn(input.purchasedOn),
        quantity: input.quantity,
        invoiceObligation: input.invoiceObligation,
        invoiceDueOn: input.invoiceDueOn ? toDateColumn(input.invoiceDueOn) : null,
        recordedByEmployeeId: input.recordedByEmployeeId,
      },
    });

    return toRecord(row);
  }

  async find(id: string, tx?: DbTx): Promise<SeatPurchaseRecord | null> {
    const row = await (tx ?? this.prisma).seatPurchase.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  /** The purchases of a line, oldest first. */
  async ofLine(lineId: string, tx?: DbTx): Promise<SeatPurchaseRecord[]> {
    const rows = await (tx ?? this.prisma).seatPurchase.findMany({
      where: { subscriptionLineId: lineId },
      orderBy: [{ purchasedOn: 'asc' }, { recordedAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** The purchases that still owe an invoice and have none open (not returned): the ones the invoice reminders chase. */
  async awaitingInvoice(organizationId: string, tx?: DbTx): Promise<SeatPurchaseRecord[]> {
    const rows = await (tx ?? this.prisma).seatPurchase.findMany({
      where: {
        organizationId,
        invoiceObligation: { not: 'NONE' },
        purchaseInvoices: { none: { state: { not: 'RETURNED' } } },
      },
      orderBy: [{ invoiceDueOn: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }
}
