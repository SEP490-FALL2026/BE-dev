import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import {
  DESCRIPTION_MAX_LENGTH,
  SAAS_ISSUE_CATEGORIES,
  SAAS_ISSUE_IMPACTS,
  SAAS_ISSUE_STATES,
} from './saas-issue.policy';

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');
const pageQuery = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const state = z.enum(SAAS_ISSUE_STATES);
const category = z.enum(SAAS_ISSUE_CATEGORIES);
const impact = z.enum(SAAS_ISSUE_IMPACTS);
const text = z.string().max(DESCRIPTION_MAX_LENGTH);

const submitBodySchema = z.strictObject({
  assignmentId: z.uuid(),
  category,
  impact,
  description: text.refine((value) => value.trim() !== '', { message: 'The description is required.' }),
  occurredAt: z.iso.datetime({ offset: true }),
});
const messageBodySchema = z.strictObject({ body: text });
const reopenBodySchema = z.strictObject({ reason: z.string().max(1000) });
const linkedWorkBodySchema = z.strictObject({
  grantTaskId: z.uuid().optional(),
  discrepancyId: z.uuid().optional(),
  returnId: z.uuid().optional(),
  requestId: z.uuid().optional(),
});
const transitionBodySchema = z.strictObject({
  to: state,
  message: text.optional(),
  resolution: text.optional(),
  vendorTicketRef: z.string().max(100).optional(),
  linkedWork: linkedWorkBodySchema.optional(),
});
const duplicateBodySchema = z.strictObject({ ofIssueId: z.uuid(), reason: z.string().max(1000) });
const idParamSchema = z.strictObject({ id: z.uuid() });
const pageOnlyQuerySchema = z.strictObject(pageQuery);
const listQuerySchema = z.strictObject({
  scope: z.enum(['mine', 'assigned', 'all']).optional(),
  state: state.optional(),
  overdue: flag.optional(),
  reporterEmployeeId: z.uuid().optional(),
  ...pageQuery,
});

const employeeBrief = z.strictObject({ employeeId: z.uuid(), employeeCode: z.string(), fullName: z.string() });
const planBrief = z.strictObject({ planId: z.uuid(), planName: z.string(), applicationName: z.string() });

/** A report on a list: who sent it, for which right, in which state and by when it should be taken up. */
export const saasIssueSummarySchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  state,
  category,
  impact,
  assignmentId: z.uuid(),
  plan: planBrief,
  reporter: employeeBrief,
  assignedItAdmin: employeeBrief,
  responseDueOn: z.string(),
  overdue: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const linkedWorkSchema = z.strictObject({
  grantTaskId: z.uuid().nullable(),
  discrepancyId: z.uuid().nullable(),
  returnId: z.uuid().nullable(),
  requestId: z.uuid().nullable(),
});

/** A report with what was written, the result, the vendor ticket typed by hand and the pointers to other work. */
export const saasIssueSchema = saasIssueSummarySchema.extend({
  occurredAt: z.iso.datetime(),
  description: z.string(),
  grantTaskId: z.uuid().nullable(),
  assignedByFallback: z.boolean(),
  resolution: z.string().nullable(),
  vendorTicketRef: z.string().nullable(),
  linkedWork: linkedWorkSchema,
  duplicateOf: z.strictObject({ id: z.uuid(), code: z.string() }).nullable(),
  duplicateReason: z.string().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  reopenUntil: z.string().nullable(),
  closedAt: z.iso.datetime().nullable(),
  reopenCount: z.number().int().nonnegative(),
});

/** One line of the exchange on a report: what was said, or a change of its state. */
export const saasIssueEntrySchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['MESSAGE', 'TRANSITION']),
  authorRole: z.enum(['REPORTER', 'IT_ADMIN', 'SYSTEM']),
  author: employeeBrief.nullable(),
  body: z.string().nullable(),
  fromState: state.nullable(),
  toState: state.nullable(),
  onBehalfOf: employeeBrief.nullable(),
  createdAt: z.iso.datetime(),
});

/** A right the caller may report on, with the grant that is not finished for it. */
export const saasIssueEligibleSchema = z.strictObject({
  assignmentId: z.uuid(),
  plan: planBrief,
  grantTaskId: z.uuid().nullable(),
});

const optionsSchema = z.strictObject({
  secretWarning: z.strictObject({ code: z.string(), message: z.string() }),
  descriptionMaxLength: z.number().int().positive(),
  categories: z.record(z.string(), z.string()),
  impacts: z.record(z.string(), z.string()),
  items: z.array(saasIssueEligibleSchema),
  pagination,
});

export type SaasIssueSummaryWire = z.infer<typeof saasIssueSummarySchema>;
export type SaasIssueWire = z.infer<typeof saasIssueSchema>;
export type SaasIssueEntryWire = z.infer<typeof saasIssueEntrySchema>;
export type SaasIssueEligibleWire = z.infer<typeof saasIssueEligibleSchema>;
export type SaasIssueOptionsWire = z.infer<typeof optionsSchema>;

export class SubmitSaasIssueBodyDto extends createZodDto(submitBodySchema) {}
export class SaasIssueMessageBodyDto extends createZodDto(messageBodySchema) {}
export class SaasIssueReopenBodyDto extends createZodDto(reopenBodySchema) {}
export class SaasIssueTransitionBodyDto extends createZodDto(transitionBodySchema) {}
export class SaasIssueDuplicateBodyDto extends createZodDto(duplicateBodySchema) {}
export class SaasIssueIdParamDto extends createZodDto(idParamSchema) {}
export class SaasIssuePageQueryDto extends createZodDto(pageOnlyQuerySchema) {}
export class ListSaasIssuesQueryDto extends createZodDto(listQuerySchema) {}
export class SaasIssueResponseDto extends createZodDto(successEnvelopeSchema(saasIssueSchema)) {}
export class SaasIssueOptionsResponseDto extends createZodDto(successEnvelopeSchema(optionsSchema)) {}
export class SaasIssuePageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(saasIssueSummarySchema), pagination })),
) {}
export class SaasIssueEntryPageResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(saasIssueEntrySchema), pagination })),
) {}
