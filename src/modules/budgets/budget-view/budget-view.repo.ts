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
}

/** Reference budgets and commitment-only years share a row; drafts never masquerade as a budget. */
const figuresQuery = (year?: number) => Prisma.sql`
  WITH reference AS (
    SELECT DISTINCT ON (cost_center_id, year) cost_center_id, year, currency, id, number, base_minor, reserve_minor, total_minor
      FROM budget_versions
     WHERE (state = 'APPROVED' OR (state = 'EXPIRED' AND NOT never_current))
     ORDER BY cost_center_id, year, number DESC
  ), pairs AS (
    SELECT cost_center_id, year, currency FROM reference
    UNION
    SELECT c.cost_center_id, c.year, c.currency FROM budget_commitments c
     WHERE NOT EXISTS (SELECT 1 FROM reference v WHERE v.cost_center_id = c.cost_center_id AND v.year = c.year)
  )
  SELECT p.cost_center_id AS "costCenterId", p.year, p.currency,
         v.id AS "versionId", v.number, v.base_minor AS "baseMinor",
         v.reserve_minor AS "reserveMinor", v.total_minor AS "totalMinor"
    FROM pairs p LEFT JOIN reference v ON v.cost_center_id = p.cost_center_id AND v.year = p.year
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
