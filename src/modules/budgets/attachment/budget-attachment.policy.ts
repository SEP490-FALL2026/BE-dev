import type { SupportedFileFormat } from '../../../infrastructure/object-storage/file-signature';
import {
  BudgetAttachmentFileInvalidError,
  BudgetAttachmentTooLargeError,
  BudgetAttachmentTypeNotAllowedError,
} from './budget-attachment.errors';
import type { BudgetAttachmentStatus } from './budget-attachment.types';

export const ALLOWED_EXTENSIONS = ['pdf', 'xlsx', 'docx', 'csv', 'png', 'jpg', 'jpeg'] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const EXTENSION_MIME_MAP: Record<AllowedExtension, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export const MIME_FORMAT_MAP: Record<string, SupportedFileFormat> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'ZIP',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'ZIP',
  'text/csv': 'UTF8_TEXT',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
};

export const MAX_RECORD_ATTACHMENTS = 20;
export const MAX_SUBMIT_ATTACHMENT_IDS = 20;
export const MAX_USER_UNATTACHED_ATTACHMENTS = 20;

export const UPLOAD_LINK_SECONDS = 120;
export const UPLOAD_ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;
export const PROPOSAL_UNATTACHED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export const DOWNLOAD_LINK_SECONDS = 300;

/** Where an upload waits (the bucket's lifecycle rule clears it) and where the bytes that were looked at are kept. */
export const PENDING_SCOPE = 'pending-documents';
export const FINAL_SCOPE = 'budget-documents';

export function expiresAt(status: 'AWAITING_UPLOAD' | 'UPLOADED', createdAt: Date): Date {
  return status === 'AWAITING_UPLOAD'
    ? new Date(createdAt.getTime() + UPLOAD_ABANDONED_AFTER_MS)
    : new Date(createdAt.getTime() + PROPOSAL_UNATTACHED_AFTER_MS);
}

export function extensionOf(fileName: string): string {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) return '';
  return trimmed.slice(dotIndex + 1).toLowerCase();
}

export function formatForContentType(contentType: string): SupportedFileFormat | null {
  return MIME_FORMAT_MAP[contentType.toLowerCase()] ?? null;
}

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Throws the refusal for a name, size or type that is not allowed; otherwise returns the trimmed name and the canonical
 * MIME type of its extension, which is what is stored and signed (a client's `Application/PDF` is kept as `application/pdf`).
 */
export function assertFileAllowed(input: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  maxBytes: number;
}): { fileName: string; contentType: string } {
  const trimmedName = input.fileName.trim();
  if (
    trimmedName.length < 1 ||
    trimmedName.length > 200 ||
    trimmedName.includes('/') ||
    trimmedName.includes('\\') ||
    hasControlCharacters(trimmedName)
  ) {
    throw new BudgetAttachmentFileInvalidError('NAME');
  }

  if (input.sizeBytes < 1) {
    throw new BudgetAttachmentFileInvalidError('EMPTY');
  }

  if (input.sizeBytes > input.maxBytes) {
    throw new BudgetAttachmentTooLargeError(input.maxBytes);
  }

  const ext = extensionOf(trimmedName) as AllowedExtension;
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new BudgetAttachmentTypeNotAllowedError(ALLOWED_EXTENSIONS);
  }

  const expectedMime = EXTENSION_MIME_MAP[ext];
  if (input.contentType.toLowerCase() !== expectedMime) {
    throw new BudgetAttachmentTypeNotAllowedError(ALLOWED_EXTENSIONS);
  }

  return { fileName: trimmedName, contentType: expectedMime };
}

export const VALID_TRANSITIONS: Record<BudgetAttachmentStatus, readonly BudgetAttachmentStatus[]> = {
  AWAITING_UPLOAD: ['UPLOADED', 'ATTACHED', 'QUARANTINED', 'EXPIRED', 'DISCARDED'],
  UPLOADED: ['ATTACHED', 'EXPIRED', 'DISCARDED'],
  ATTACHED: ['REMOVED'],
  REMOVED: [],
  QUARANTINED: [],
  EXPIRED: [],
  DISCARDED: [],
};

export type BudgetRecordView = 'FULL' | 'AS_LAST_SENT' | 'NONE';

export function budgetRecordView(params: {
  isFinance: boolean;
  isDecider: boolean;
  headedCostCenterIds: readonly string[];
  recordCostCenterId: string;
  versionSentAt?: Date | null;
}): BudgetRecordView {
  if (params.isFinance || params.isDecider) {
    return 'FULL';
  }

  if (params.headedCostCenterIds.includes(params.recordCostCenterId)) {
    if (params.versionSentAt === undefined) {
      return 'FULL';
    }
    if (params.versionSentAt !== null) {
      return 'AS_LAST_SENT';
    }
    return 'NONE';
  }

  return 'NONE';
}
