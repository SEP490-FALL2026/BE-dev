import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { groupBodySchema } from '../group-request/group-request.dto';
import { requestIdParamSchema, requestSchema, submitBodySchema } from '../access-request/access-request.dto';

/** The kinds of request that can be kept as a draft: the two a person sends for themselves or for a group of the department. */
export const DRAFT_KINDS = ['INDIVIDUAL', 'GROUP'] as const;

/**
 * What is saved as a draft: exactly the body of the operation that sends it, with the kind that says which operation that
 * is, validated by the same schema (`accessRequestSubmit`, `groupRequestSubmit`). Saving runs no
 * gate; sending the draft runs all of them again, on this content, with the department of the sender on the day.
 */
export const draftSaveBodySchema = z.discriminatedUnion('kind', [
  submitBodySchema.extend({ kind: z.literal('INDIVIDUAL') }),
  groupBodySchema.extend({ kind: z.literal('GROUP') }),
]);

/** A page of the drafts of the caller: `page` from 1, `pageSize` 1 to 100 (20 when left out). */
export const draftListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Sending a draft takes no content: the saved content is what is sent. */
export const draftSubmitBodySchema = z.strictObject({});

const draftSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(DRAFT_KINDS),
  /** The department of the sender on the day the draft was saved; sending it uses the one of the day it is sent. */
  departmentId: z.uuid(),
  planId: z.uuid(),
  /** How many people it is for: 1 for any kind but a group. */
  beneficiaryCount: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/**
 * The body of saving a draft is a union of two bodies, which a class cannot extend: the DTO is the class `createZodDto` makes, kept as
 * a value, and the same name is the type of what it validates, so the route reads `body: DraftSaveBodyDto` as for any other.
 */
export const DraftSaveBodyDto = createZodDto(draftSaveBodySchema);
export type DraftSaveBodyDto = z.infer<typeof draftSaveBodySchema>;
export class DraftListQueryDto extends createZodDto(draftListQuerySchema) {}
export class DraftSubmitBodyDto extends createZodDto(draftSubmitBodySchema) {}
export class DraftParamDto extends createZodDto(requestIdParamSchema) {}
export class AccessRequestDraftResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ draft: draftSchema })),
) {}
export class AccessRequestDraftPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(draftSchema), pagination })),
) {}
/**
 * What reading a request answers (`accessRequestGet`): the request, as always, or — to the person who saved it — the draft,
 * which is not a request yet and so has no price, step or Cost Center to show: only what the list of drafts shows of it.
 */
export class AccessRequestOrDraftResponseDto extends createZodDto(
  successEnvelopeSchema(z.union([z.strictObject({ request: requestSchema }), z.strictObject({ draft: draftSchema })])),
) {}
/** What sending a draft answers: the request that was made, as the operation that sends that kind of request answers it. */
export class DraftSubmitResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ request: requestSchema })),
) {}

export type DraftSaveBody = DraftSaveBodyDto;
export type AccessRequestDraftWire = z.infer<typeof draftSchema>;
