import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
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

export interface SubscriptionInvoiceVariance {
  subscriptionId: string;
  varianceMinor: bigint;
  varianceInReviewMinor: bigint;
}

export interface MonthlyPoolSubscriptionFigure {
  subscriptionId: string;
  month: BusinessDate;
  invoicedMinor: bigint;
  allocatedMinor: bigint;
  withoutCostCenterMinor: bigint;
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

  async invoiceVariancesBySubscriptionMonth(
    organizationId: string,
    month: BusinessDate,
    tx?: DbTx,
  ): Promise<SubscriptionInvoiceVariance[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<
      { subscription_id: string; variance: string; variance_in_review: string }[]
    >`
      SELECT i.subscription_id,
             COALESCE(SUM(i.pool_variance_minor) FILTER (WHERE NOT (i.pool_variance_in_review AND r.invoice_id IS NULL)), 0)::text AS variance,
             COALESCE(SUM(i.pool_variance_minor) FILTER (WHERE i.pool_variance_in_review AND r.invoice_id IS NULL), 0)::text AS variance_in_review
        FROM invoices i
        LEFT JOIN invoice_pool_variance_resolutions r ON r.invoice_id = i.id
       WHERE i.organization_id = ${organizationId}::uuid
         AND i.pool_variance_month = ${month}::date
         AND i.pool_variance_minor IS NOT NULL
         AND i.subscription_id IS NOT NULL
       GROUP BY i.subscription_id
       ORDER BY i.subscription_id ASC`;

    return rows.map((row) => ({
      subscriptionId: row.subscription_id,
      varianceMinor: BigInt(row.variance),
      varianceInReviewMinor: BigInt(row.variance_in_review),
    }));
  }

  /** Monthly invoiced, allocated and without-cost-center totals per pool subscription. */
  async monthlyFigures(
    input: { from: BusinessDate; until: BusinessDate; invoicedIds: readonly string[]; only?: string },
    tx?: DbTx,
  ): Promise<MonthlyPoolSubscriptionFigure[]> {
    const only = (column: string) =>
      input.only ? Prisma.sql`AND ${Prisma.raw(column)} = ${input.only}::uuid` : Prisma.empty;
    const rows = await (tx ?? this.prisma).$queryRaw<
      {
        subscription_id: string;
        month: string;
        invoiced: string;
        allocated: string;
        without_cost_center: string;
      }[]
    >`
      SELECT COALESCE(i.subscription_id, a.subscription_id) AS subscription_id,
             to_char(COALESCE(i.month, a.month), 'YYYY-MM-DD') AS month,
             COALESCE(i.invoiced, 0)::text AS invoiced,
             COALESCE(a.allocated, 0)::text AS allocated,
             COALESCE(a.without_cost_center, 0)::text AS without_cost_center
        FROM (SELECT subscription_id, service_month AS month, SUM(actual_cost_minor) AS invoiced
                FROM invoices
               WHERE subscription_id = ANY(${[...input.invoicedIds]}::uuid[])
                 AND commitment_id IS NULL
                 AND cost_center_id IS NULL
                 AND service_month >= ${input.from}::date
                 AND service_month < ${input.until}::date ${only('subscription_id')}
               GROUP BY subscription_id, service_month) i
        FULL JOIN (SELECT subscription_id,
                          month,
                          SUM(amount_minor) AS allocated,
                          SUM(amount_minor) FILTER (WHERE cost_center_id IS NULL) AS without_cost_center
                     FROM seat_month_charges
                    WHERE month >= ${input.from}::date AND month < ${input.until}::date ${only('subscription_id')}
                    GROUP BY subscription_id, month) a
               ON a.subscription_id = i.subscription_id AND a.month = i.month
       ORDER BY 1, 2`;

    return rows.map((row) => ({
      subscriptionId: row.subscription_id,
      month: row.month,
      invoicedMinor: BigInt(row.invoiced),
      allocatedMinor: BigInt(row.allocated),
      withoutCostCenterMinor: BigInt(row.without_cost_center),
    }));
  }
}
