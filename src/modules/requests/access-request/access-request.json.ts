import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { jsonColumn, nullableJsonColumn } from '../../../infrastructure/database/json-column';
import { ACCESS_REQUEST_BRANCHES, CHAIN_STEPS, type RequestPolicy } from './access-request.policy';
import type { PaymentPeriod } from './pricing.policy';

/**
 * The two JSON columns of `access_requests`, one codec each. They share a file because the folder is at its cap of files (spec
 * files count): a third column or a longer codec starts a group of its own.
 */

/** The shape of the `policy` of a request that has been sent, as `policyFor` and `proposalPolicy` write it. A draft keeps its content there instead and is never read through this. */
const policySchema = z.object({
  version: z.number().int(),
  branch: z.enum(ACCESS_REQUEST_BRANCHES),
  chain: z.array(z.enum(CHAIN_STEPS)),
  slaWorkingDays: z.number(),
}) satisfies z.ZodType<RequestPolicy>;

/** `access_requests.policy`: read through `decode`, written through `encode`. */
export const requestPolicyJson = jsonColumn({
  table: 'access_requests',
  column: 'policy',
  schema: policySchema,
  encode: (policy) => ({
    version: policy.version,
    branch: policy.branch,
    chain: [...policy.chain],
    slaWorkingDays: policy.slaWorkingDays,
  }),
});

/**
 * The payments of a priced request. The amounts are kept as text because JSON has no big integers; `binding` is absent from a
 * schedule written before quotes existed, and every payment of such a schedule binds, so the default lives here and nowhere else.
 */
const scheduleSchema = z.array(
  z.object({
    dueOn: z.string().refine(isBusinessDate),
    amountMinor: z
      .string()
      .regex(/^-?\d+$/)
      .transform((text) => BigInt(text)),
    budgetYear: z.number().int(),
    binding: z.boolean().default(true),
  }),
) satisfies z.ZodType<PaymentPeriod[]>;

/** `access_requests.payment_schedule`: NULL for a request with no schedule. */
export const paymentScheduleJson = nullableJsonColumn({
  table: 'access_requests',
  column: 'payment_schedule',
  schema: scheduleSchema,
  encode: (schedule) =>
    schedule.map((period) => ({
      dueOn: period.dueOn,
      amountMinor: period.amountMinor.toString(),
      budgetYear: period.budgetYear,
      binding: period.binding,
    })),
});
