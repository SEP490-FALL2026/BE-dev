import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';
import { MAX_CONTRACT_NAME_LENGTH, MAX_FILE_NAME_LENGTH } from './contract.policy';

/**
 * Only the shape and a generous bound are checked here, and the body names no uploader and no organization: both come
 * from the signed-in person, so a request that tries to say otherwise is refused. Whether the purpose, the type and the
 * size are acceptable is judged by the policy and answers with its own `DOCUMENT.*` code.
 */
export const createContractBodySchema = z.strictObject({ name: z.string().max(MAX_CONTRACT_NAME_LENGTH).default('') });
export const createDocumentBodySchema = z.strictObject({
  fileName: z
    .string()
    .min(1)
    .max(MAX_FILE_NAME_LENGTH * 2),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().nonnegative().max(1_000_000_000),
  purpose: z.enum([
    'CONTRACT_ATTACHMENT',
    'PURCHASE_DOCUMENT',
    'TAX_PAYMENT_PROOF',
    'SIGNATURE_RECORD',
    'IMPORT_SOURCE',
    'COST_STATEMENT',
  ]),
});
export const attachDocumentBodySchema = z.strictObject({ contractId: z.uuid() });
export const idParamSchema = z.strictObject({ id: z.uuid() });

const contractSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
const documentSchema = z.strictObject({
  id: z.uuid(),
  purpose: z.enum([
    'CONTRACT_ATTACHMENT',
    'PURCHASE_DOCUMENT',
    'TAX_PAYMENT_PROOF',
    'SIGNATURE_RECORD',
    'IMPORT_SOURCE',
    'COST_STATEMENT',
  ]),
  status: z.enum(['AWAITING_UPLOAD', 'PENDING_ATTACH', 'READY', 'QUARANTINED']),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  uploadedBy: z.uuid(),
  createdAt: z.iso.datetime(),
  contractId: z.uuid().nullable(),
  attachedAt: z.iso.datetime().nullable(),
});

export class CreateContractBodyDto extends createZodDto(createContractBodySchema) {}
export class CreateDocumentBodyDto extends createZodDto(createDocumentBodySchema) {}
export class AttachDocumentBodyDto extends createZodDto(attachDocumentBodySchema) {}
export class IdParamDto extends createZodDto(idParamSchema) {}
export class ContractResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ contract: contractSchema })),
) {}
export class DocumentResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ document: documentSchema })),
) {}
export class CreateDocumentResponseDto extends createZodDto(
  successEnvelopeSchema(
    z.strictObject({
      document: documentSchema,
      upload: z.strictObject({
        url: z.string(),
        method: z.enum(['PUT']),
        headers: z.record(z.string(), z.string()),
        expiresAt: z.iso.datetime(),
      }),
    }),
  ),
) {}
export class DocumentLinkResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ url: z.string(), expiresAt: z.iso.datetime() })),
) {}
