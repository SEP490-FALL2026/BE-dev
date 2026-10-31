import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { employeeRef, requestSchema, requestStateSchema } from '../access-request/access-request.dto';
import { isStateList } from './my-requests.policy';
import { MY_REQUEST_TYPES, MY_REQUEST_VIEWS } from './my-requests.types';

const instant = z.iso.datetime({ offset: true });

/**
 * Strict: a parameter that is not here (an `employeeId`, a `requesterId`) is refused rather than ignored, so a client can never
 * believe it read the requests of somebody else. The person is always the caller.
 */
export const myRequestsQuerySchema = z
  .strictObject({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    view: z.enum(MY_REQUEST_VIEWS).optional().meta({
      description:
        'open: the requests that are not over, one that waits for the IT Admin to close the task of a withdrawal included. ended: the requests nothing is left to do in (completed, refused, failed, withdrawn, cancelled). Left out: both.',
    }),
    state: z.string().max(400).refine(isStateList, 'A comma-separated list of states of a request.').optional().meta({
      description:
        'One or more states of a request, comma-separated and none twice (for example PENDING,AWAITING_BUDGET); a draft is not a state of a request. Narrows within view when both are given.',
    }),
    type: z.enum(MY_REQUEST_TYPES).optional(),
    from: instant.optional().meta({
      description:
        'The first moment the request was sent that is read (included). Must be earlier than to when both are given.',
    }),
    to: instant
      .optional()
      .meta({ description: 'The moment after the last one the request was sent that is read (excluded).' }),
  })
  .superRefine((query, context) => {
    if (query.from !== undefined && query.to !== undefined && new Date(query.from) >= new Date(query.to)) {
      context.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'from must be earlier than to (the window is half-open).',
      });
    }
  });

const needStepStates = requestSchema.shape.needStep.shape.state;
const waitingReasons = requestSchema.shape.needStep.shape.waitingReason;
const spendStages = requestSchema.shape.spend.unwrap().shape.stage;

/**
 * A request the caller sent, as a row of "my requests": what it is, where it stands and who it waits for, the reason when it did not
 * go on, and whether the sender may withdraw it. The rest (the people, the steps, the price, the reason of each stage) is the detail of
 * the request. It carries no figure of a budget, what is left, the result of a check or the cost of another person, and nothing of
 * whether the software belongs to a standard set.
 */
export const myRequestSummarySchema = z.strictObject({
  id: z.uuid(),
  type: requestSchema.shape.type,
  branch: requestSchema.shape.branch,
  state: requestStateSchema,
  /** The plan asked for; null for software that is not in the catalog until the IT Admin registers and links it. */
  plan: requestSchema.shape.plan,
  /** What the sender called software that is not in the catalog; null for any other request. */
  softwareName: z.string().nullable(),
  /** The person it is for, who is the caller unless a head sent it for them; null for a request for a group. */
  beneficiary: employeeRef.nullable(),
  /** How many people the request is for: 1 for any request but one for a group. */
  lineCount: z.number().int().positive(),
  termMonths: z.number().int().positive(),
  submittedAt: z.iso.datetime(),
  /** The last time the record of the request was changed. */
  updatedAt: z.iso.datetime(),
  /**
   * Who the request waits for at the need step: the person who holds it while it is held, and nobody once it is decided, closed or
   * waiting under control (the reason says why). Later steps are not named: they are the stage of the request.
   */
  needStep: z.strictObject({ state: needStepStates, assignee: employeeRef.nullable(), waitingReason: waitingReasons }),
  /** Where a request that costs money stands on its way to the spending approver; null for one that costs nothing. */
  spend: z.strictObject({ stage: spendStages }).nullable(),
  /** Why the request was refused (by the person who decides the need, the spending approver or the IT Admin); null if it was not. */
  outcome: z.strictObject({ reason: z.string().nullable() }).nullable(),
  /** When the request was withdrawn; null in `withdrawnAt` while it waits for the IT Admin to close the task, null if not withdrawn. */
  withdrawal: z.strictObject({ withdrawnAt: z.iso.datetime().nullable() }).nullable(),
  /** A hint for the screen from the policy of the withdrawal: the withdrawal itself judges again when it is asked. */
  canWithdraw: z.boolean(),
});

const pageSchema = z.strictObject({
  items: z.array(myRequestSummarySchema),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export type MyRequestSummaryWire = z.infer<typeof myRequestSummarySchema>;
export type MyRequestPageWire = z.infer<typeof pageSchema>;

export class MyRequestsQueryDto extends createZodDto(myRequestsQuerySchema) {}
export class MyRequestsPageResponseDto extends createZodDto(successEnvelopeSchema(pageSchema)) {}
