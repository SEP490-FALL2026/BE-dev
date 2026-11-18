import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import { ACCESS_REQUEST_BRANCHES, CHAIN_STEPS, type RequestPolicy } from './access-request.policy';

/**
 * The JSON column of `access_requests` that is still read: `policy`. `payment_schedule` is no longer written or read (`QĐ-109`, RV-15: the
 * column stays, the model has one amount for one year).
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
