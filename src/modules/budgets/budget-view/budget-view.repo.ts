import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

export interface BudgetViewFigures {
  costCenterId: string;
  year: number;
  currency: string;
  versionId: string | null;
  number: number | null;
  baseMinor: bigint | null;
  reserveMinor: bigint | null;
  totalMinor: bigint | null;
  /** What the approved adjustments added to (positive) or took from (negative) the base of the version; null with no version (`AD-1`). */
  adjustmentMinor: bigint | null;
}

/**
 * Reference budgets, commitment-only years and years that only have an expense with no commitment (an invoice booked to the Cost Center that bears it, a
 * case outside the process) share a row, so that what a Cost Center spent is never missing from the table for want of a budget; drafts never masquerade as a budget.
 */
const figuresQuery = (year?: number) => Prisma.sql`
  WITH reference AS (
    SELECT DISTINCT ON (cost_center_id, year) cost_center_id, year, currency, id, number, base_minor, reserve_minor, total_minor
      FROM budget_versions
     WHERE (state = 'APPROVED' OR (state = 'EXPIRED' AND NOT never_current))
     ORDER BY cost_center_id, year, number DESC
  ), adjusted AS (
    SELECT x.cost_center_id, x.year, SUM(x.delta)::bigint AS delta FROM (
      SELECT a.to_cost_center_id AS cost_center_id, a.year, a.amount_minor AS delta, a.created_version_id
        FROM budget_adjustments a WHERE a.state = 'APPROVED' AND a.to_cost_center_id IS NOT NULL
      UNION ALL
      SELECT a.from_cost_center_id, a.year, -a.amount_minor, NULL::uuid
        FROM budget_adjustments a WHERE a.state = 'APPROVED' AND a.from_cost_center_id IS NOT NULL
    ) x JOIN reference r ON r.cost_center_id = x.cost_center_id AND r.year = x.year
    WHERE x.created_version_id IS DISTINCT FROM r.id
    GROUP BY x.cost_center_id, x.year
  ), pairs AS (
    SELECT cost_center_id, year, currency FROM reference
    UNION
    SELECT c.cost_center_id, c.year, c.currency FROM budget_commitments c
     WHERE NOT EXISTS (SELECT 1 FROM reference v WHERE v.cost_center_id = c.cost_center_id AND v.year = c.year)
    UNION
    SELECT i.cost_center_id, EXTRACT(YEAR FROM i.service_month)::int, i.currency FROM invoices i
     WHERE i.commitment_id IS NULL AND i.cost_center_id IS NOT NULL AND i.service_month IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM reference v WHERE v.cost_center_id = i.cost_center_id AND v.year = EXTRACT(YEAR FROM i.service_month)::int)
    UNION
    SELECT s.cost_center_id, EXTRACT(YEAR FROM s.month)::int, 'VND'::char(3) FROM seat_month_charges s
     WHERE s.cost_center_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM reference v WHERE v.cost_center_id = s.cost_center_id AND v.year = EXTRACT(YEAR FROM s.month)::int)
    UNION
    SELECT l.cost_center_id, EXTRACT(YEAR FROM l.month)::int, 'VND'::char(3) FROM invoice_allocations l
     WHERE l.bucket = 'COST_CENTER' AND l.cost_center_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM reference v WHERE v.cost_center_id = l.cost_center_id AND v.year = EXTRACT(YEAR FROM l.month)::int)
    UNION
    SELECT lc.cost_center_id, EXTRACT(YEAR FROM lc.month)::int, 'VND'::char(3) FROM license_lot_charges lc
     WHERE NOT EXISTS (SELECT 1 FROM reference v WHERE v.cost_center_id = lc.cost_center_id AND v.year = EXTRACT(YEAR FROM lc.month)::int)
  )
  SELECT p.cost_center_id AS "costCenterId", p.year, p.currency,
         v.id AS "versionId", v.number, v.base_minor AS "baseMinor",
         v.reserve_minor AS "reserveMinor", v.total_minor AS "totalMinor",
         CASE WHEN v.id IS NULL THEN NULL ELSE COALESCE(j.delta, 0) END AS "adjustmentMinor"
    FROM pairs p LEFT JOIN reference v ON v.cost_center_id = p.cost_center_id AND v.year = p.year
    LEFT JOIN adjusted j ON j.cost_center_id = p.cost_center_id AND j.year = p.year
   WHERE ${year ?? null}::int IS NULL OR p.year = ${year ?? null}::int`;

/** Reads only tables owned by budgets. Page and count use one repeatable snapshot. */
@Injectable()
export class BudgetViewRepo {
  constructor(private readonly prisma: PrismaService) {}

  async rows(year: number): Promise<BudgetViewFigures[]> {
    return this.prisma.$queryRaw<BudgetViewFigures[]>`${figuresQuery(year)} ORDER BY p.year DESC, p.cost_center_id`;
  }

  async page(query: {
    year?: number;
    skip: number;
    take: number;
  }): Promise<{ items: BudgetViewFigures[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const items = await tx.$queryRaw<BudgetViewFigures[]>`
        ${figuresQuery(query.year)} ORDER BY p.year DESC, p.cost_center_id LIMIT ${query.take} OFFSET ${query.skip}`;
        const count = await tx.$queryRaw<{ total: bigint }[]>`
        SELECT count(*) AS total FROM (${figuresQuery(query.year)}) figures`;
        return { items, total: Number(count[0].total) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
