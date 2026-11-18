import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import type { RenewalFinancialSnapshot } from '../public/licensing-subscription-renewal.types';
import type { DecisionSnapshot } from './subscription-renewal.types';

/** The figures of the budget the decider saw: decimal strings of one currency, null where the source could not give one. */
const financialSchema = z.object({
  status: z.enum(['BUDGET', 'NO_BUDGET', 'NO_COST_CENTER']),
  costCenterId: z.string().nullable(),
  fiscalYear: z.number().int().nullable(),
  currency: z.string().nullable(),
  budget: z.string().nullable(),
  spent: z.string().nullable(),
  committed: z.string().nullable(),
  remaining: z.string().nullable(),
  pendingRequests: z.string().nullable(),
  periodEffectiveCost: z.string().nullable(),
  periodDeductibleTax: z.string().nullable(),
  asOf: z.string(),
}) satisfies z.ZodType<RenewalFinancialSnapshot>;

/** What was frozen with a decision: the money the decider saw, or that no source of money was connected. */
const snapshotSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('CONNECTED'), financial: financialSchema }),
  z.object({ source: z.literal('NOT_CONNECTED'), takenAt: z.string() }),
]) satisfies z.ZodType<DecisionSnapshot>;

/**
 * `subscription_renewals.decision_snapshot`: read through `decode`, written through `encode`. The column is NULL exactly while the
 * case has no decision (a CHECK keeps `decided_choice` and it in step), so a decision always has one and a NULL under one is a fault.
 */
export const renewalDecisionSnapshotJson = jsonColumn({
  table: 'subscription_renewals',
  column: 'decision_snapshot',
  schema: snapshotSchema,
  encode: (snapshot) =>
    snapshot.source === 'NOT_CONNECTED'
      ? { source: snapshot.source, takenAt: snapshot.takenAt }
      : {
          source: snapshot.source,
          financial: {
            status: snapshot.financial.status,
            costCenterId: snapshot.financial.costCenterId,
            fiscalYear: snapshot.financial.fiscalYear,
            currency: snapshot.financial.currency,
            budget: snapshot.financial.budget,
            spent: snapshot.financial.spent,
            committed: snapshot.financial.committed,
            remaining: snapshot.financial.remaining,
            pendingRequests: snapshot.financial.pendingRequests,
            periodEffectiveCost: snapshot.financial.periodEffectiveCost,
            periodDeductibleTax: snapshot.financial.periodDeductibleTax,
            asOf: snapshot.financial.asOf,
          },
        },
});
