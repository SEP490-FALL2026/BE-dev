import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export interface MonthlyInvoiceVariance {
  month: BusinessDate;
  varianceMinor: bigint;
  varianceInReviewMinor: bigint;
}

export interface InvoiceVarianceTotals {
  varianceMinor: bigint;
  varianceInReviewMinor: bigint;
}

export interface SubscriptionMonthRunKey {
  subscriptionId: string;
  month: BusinessDate;
}

export interface SubscriptionMonthSeatTotal {
  subscriptionId: string;
  month: BusinessDate;
  amountMinor: bigint;
  appliedMinor: bigint;
}

/**
 * Budget-owned reader for monthly shared-pool warehouse figures: invoice pool variances
 * (resolved and still-in-review) and `seat_month_runs` / `seat_month_charges` aggregates.
 * Queries strictly `budgets` tables (`invoices`, `seat_month_runs`, `seat_month_charges`).
 */
@Injectable()
export class SharedPoolLineRepo {
  constructor(private readonly prisma: PrismaService) {}

  async invoiceVariancesByMonth(
    input: { organizationId: string; from: BusinessDate; until: BusinessDate },
    tx?: DbTx,
  ): Promise<MonthlyInvoiceVariance[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ month: string; variance: string; variance_in_review: string }[]>`
      SELECT to_char(i.pool_variance_month, 'YYYY-MM-DD') AS month,
             COALESCE(SUM(i.pool_variance_minor) FILTER (WHERE NOT (i.pool_variance_in_review AND r.invoice_id IS NULL)), 0)::text AS variance,
             COALESCE(SUM(i.pool_variance_minor) FILTER (WHERE i.pool_variance_in_review AND r.invoice_id IS NULL), 0)::text AS variance_in_review
        FROM invoices i
        LEFT JOIN invoice_pool_variance_resolutions r ON r.invoice_id = i.id
       WHERE i.organization_id = ${input.organizationId}::uuid
         AND i.pool_variance_month >= ${input.from}::date
         AND i.pool_variance_month < ${input.until}::date
         AND i.pool_variance_minor IS NOT NULL
       GROUP BY i.pool_variance_month
       ORDER BY i.pool_variance_month ASC`;

    return rows.map((row) => ({
      month: row.month,
      varianceMinor: BigInt(row.variance),
      varianceInReviewMinor: BigInt(row.variance_in_review),
    }));
  }

  async invoiceVariancesTotals(
    input: { organizationId: string; from: BusinessDate; until: BusinessDate },
    tx?: DbTx,
  ): Promise<InvoiceVarianceTotals> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ variance: string; variance_in_review: string }[]>`
      SELECT COALESCE(SUM(i.pool_variance_minor) FILTER (WHERE NOT (i.pool_variance_in_review AND r.invoice_id IS NULL)), 0)::text AS variance,
             COALESCE(SUM(i.pool_variance_minor) FILTER (WHERE i.pool_variance_in_review AND r.invoice_id IS NULL), 0)::text AS variance_in_review
        FROM invoices i
        LEFT JOIN invoice_pool_variance_resolutions r ON r.invoice_id = i.id
       WHERE i.organization_id = ${input.organizationId}::uuid
         AND i.pool_variance_month >= ${input.from}::date
         AND i.pool_variance_month < ${input.until}::date
         AND i.pool_variance_minor IS NOT NULL`;
    const row = rows[0];

    return {
      varianceMinor: BigInt(row?.variance ?? '0'),
      varianceInReviewMinor: BigInt(row?.variance_in_review ?? '0'),
    };
  }

  async subscriptionIdsWithRunsForMonth(organizationId: string, month: BusinessDate, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).seatMonthRun.findMany({
      where: { organizationId, month: toDateColumn(month) },
      select: { subscriptionId: true },
      orderBy: { subscriptionId: 'asc' },
    });

    return rows.map((row) => row.subscriptionId);
  }

  async subscriptionIdsWithRunsByMonth(
    input: { organizationId: string; from: BusinessDate; until: BusinessDate },
    tx?: DbTx,
  ): Promise<SubscriptionMonthRunKey[]> {
    const rows = await (tx ?? this.prisma).seatMonthRun.findMany({
      where: {
        organizationId: input.organizationId,
        month: { gte: toDateColumn(input.from), lt: toDateColumn(input.until) },
      },
      select: { subscriptionId: true, month: true },
      orderBy: [{ month: 'asc' }, { subscriptionId: 'asc' }],
    });

    return rows.map((row) => ({
      subscriptionId: row.subscriptionId,
      month: fromDateColumn(row.month),
    }));
  }

  async seatMonthTotalsBySubscriptionMonth(
    input: { organizationId: string; from: BusinessDate; until: BusinessDate },
    tx?: DbTx,
  ): Promise<SubscriptionMonthSeatTotal[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<
      { subscription_id: string; month: string; amount_minor: string; applied_minor: string }[]
    >`
      SELECT subscription_id,
             to_char(month, 'YYYY-MM-DD') AS month,
             COALESCE(SUM(amount_minor), 0)::text AS amount_minor,
             COALESCE(SUM(applied_minor), 0)::text AS applied_minor
        FROM seat_month_charges
       WHERE organization_id = ${input.organizationId}::uuid
         AND month >= ${input.from}::date
         AND month < ${input.until}::date
       GROUP BY subscription_id, month
       ORDER BY month ASC, subscription_id ASC`;

    return rows.map((row) => ({
      subscriptionId: row.subscription_id,
      month: row.month,
      amountMinor: BigInt(row.amount_minor),
      appliedMinor: BigInt(row.applied_minor),
    }));
  }
}
