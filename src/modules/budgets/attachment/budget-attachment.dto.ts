import { z } from 'zod';
import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { employeeRef, page, pageQuery } from '../budget/budget.dto';

export const createBudgetAttachmentBodySchema = z.strictObject({
  fileName: z.string().min(1).max(400),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().min(0).max(1_000_000_000),
});

export const uploadInstructionsSchema = z.strictObject({
  url: z.string(),
  method: z.literal('PUT'),
  headers: z.strictObject({
    'Content-Type': z.string(),
    'Content-Length': z.string(),
  }),
  expiresAt: z.iso.datetime(),
});

export const budgetAttachmentSchema = z.strictObject({
  id: z.uuid(),
  target: z.enum(['PROPOSAL', 'VERSION']),
  status: z.enum(['AWAITING_UPLOAD', 'UPLOADED', 'ATTACHED', 'REMOVED', 'QUARANTINED', 'EXPIRED', 'DISCARDED']),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  uploadedBy: employeeRef.nullable(),
  createdAt: z.iso.datetime(),
  proposalId: z.uuid().nullable(),
  versionId: z.uuid().nullable(),
  attachedAt: z.iso.datetime().nullable(),
  removedAt: z.iso.datetime().nullable(),
  removedBy: employeeRef.nullable(),
});

export const budgetAttachmentSummarySchema = z.strictObject({
  id: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  status: z.enum(['ATTACHED', 'REMOVED']),
  uploadedBy: employeeRef.nullable(),
  attachedAt: z.iso.datetime(),
  removedAt: z.iso.datetime().nullable(),
});

export const budgetUploadSummarySchema = z.strictObject({
  id: z.uuid(),
  target: z.enum(['PROPOSAL', 'VERSION']),
  status: z.enum(['AWAITING_UPLOAD', 'UPLOADED']),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  versionId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export const budgetAttachmentLinkSchema = z.strictObject({
  url: z.string(),
  expiresAt: z.iso.datetime(),
});

export const budgetAttachmentListQuerySchema = z.strictObject(pageQuery);

export const versionAttachmentParamSchema = z.strictObject({
  id: z.uuid(),
  attachmentId: z.uuid(),
});

export class CreateBudgetAttachmentDto extends createZodDto(createBudgetAttachmentBodySchema) {}
export class BudgetAttachmentListQueryDto extends createZodDto(budgetAttachmentListQuerySchema) {}
export class VersionAttachmentParamDto extends createZodDto(versionAttachmentParamSchema) {}

export class BudgetAttachmentResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ attachment: budgetAttachmentSchema, upload: uploadInstructionsSchema })),
) {}

export class BudgetAttachmentCompletedResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ attachment: budgetAttachmentSchema })),
) {}

export class BudgetAttachmentPageResponseDto extends createZodDto(page(budgetAttachmentSummarySchema)) {}
export class BudgetAttachmentMinePageResponseDto extends createZodDto(page(budgetUploadSummarySchema)) {}

export class BudgetAttachmentLinkResponseDto extends createZodDto(successEnvelopeSchema(budgetAttachmentLinkSchema)) {}

export type BudgetAttachmentWire = z.infer<typeof budgetAttachmentSchema>;
export type BudgetAttachmentSummaryWire = z.infer<typeof budgetAttachmentSummarySchema>;
export type BudgetUploadSummaryWire = z.infer<typeof budgetUploadSummarySchema>;
