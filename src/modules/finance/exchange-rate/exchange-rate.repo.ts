import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { formatRate, parseRate, type ScaledRate } from '../../../core/money/rate';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ExchangeRateListFilter, ExchangeRateRecord } from '../public/finance.types';

interface RateRow {
  id: string;
  currency: string;
  rate_date: string;
  rate: string;
  created_at: Date;
}

/** The rate leaves PostgreSQL as text and enters as text: it never passes through a JavaScript number (ADR-0007). */
const toRecord = (row: RateRow): ExchangeRateRecord => ({
  id: row.id,
  currency: row.currency,
  rateDate: row.rate_date,
  rate: parseRate(row.rate),
  createdAt: row.created_at,
});

/** The one writer of `exchange_rates`. */
@Injectable()
export class ExchangeRateRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: { organizationId: string; currency: string; rateDate: BusinessDate; rate: ScaledRate },
  ): Promise<ExchangeRateRecord> {
    const rows = await tx.$queryRaw<RateRow[]>`
      INSERT INTO exchange_rates (id, organization_id, currency, rate_date, rate)
      VALUES (gen_random_uuid(), ${input.organizationId}::uuid, ${input.currency}, ${input.rateDate}::date,
              ${formatRate(input.rate)}::numeric)
      RETURNING id, currency, to_char(rate_date, 'YYYY-MM-DD') AS rate_date, rate::text AS rate, created_at`;

    return toRecord(rows[0]);
  }

  /** The rate for exactly this currency and day, or null. */
  async find(
    organizationId: string,
    currency: string,
    rateDate: BusinessDate,
    tx?: DbTx,
  ): Promise<ExchangeRateRecord | null> {
    const rows = await (tx ?? this.prisma).$queryRaw<RateRow[]>`
      SELECT id, currency, to_char(rate_date, 'YYYY-MM-DD') AS rate_date, rate::text AS rate, created_at
        FROM exchange_rates
       WHERE organization_id = ${organizationId}::uuid AND currency = ${currency} AND rate_date = ${rateDate}::date`;

    return rows.length === 0 ? null : toRecord(rows[0]);
  }

  /** One page, newest day first, and the total for the same filter, from one snapshot (RepeatableRead). */
  async list(
    organizationId: string,
    filter: ExchangeRateListFilter,
  ): Promise<{ items: ExchangeRateRecord[]; total: number }> {
    const conditions = [
      Prisma.sql`organization_id = ${organizationId}::uuid`,
      ...(filter.currency ? [Prisma.sql`currency = ${filter.currency}`] : []),
      ...(filter.from ? [Prisma.sql`rate_date >= ${filter.from}::date`] : []),
      ...(filter.to ? [Prisma.sql`rate_date <= ${filter.to}::date`] : []),
    ];
    const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<RateRow[]>`
          SELECT id, currency, to_char(rate_date, 'YYYY-MM-DD') AS rate_date, rate::text AS rate, created_at
            FROM exchange_rates ${where}
           ORDER BY rate_date DESC, currency, id LIMIT ${filter.take} OFFSET ${filter.skip}`;
        const counted = await tx.$queryRaw<
          { total: number }[]
        >`SELECT count(*)::int AS total FROM exchange_rates ${where}`;

        return { items: rows.map(toRecord), total: counted[0].total };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
