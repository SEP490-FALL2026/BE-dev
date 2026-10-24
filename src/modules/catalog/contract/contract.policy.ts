import {
  ContractNameRequiredError,
  DocumentAlreadyAttachedError,
  DocumentFileInvalidError,
  DocumentNotReadyToAttachError,
  DocumentPurposeForbiddenError,
  DocumentPurposeNotAvailableError,
  DocumentTooLargeError,
  DocumentTypeNotAllowedError,
  DocumentUploadMismatchError,
} from './contract.errors';

export type DocumentPurpose =
  | 'CONTRACT_ATTACHMENT'
  | 'PURCHASE_DOCUMENT'
  | 'TAX_PAYMENT_PROOF'
  | 'SIGNATURE_RECORD'
  | 'IMPORT_SOURCE'
  | 'COST_STATEMENT';
export type DocumentStatus = 'AWAITING_UPLOAD' | 'PENDING_ATTACH' | 'READY' | 'QUARANTINED' | 'EXPIRED';

/** How long a link that opens a file lives (`US-04-04` AC-1, AC-2); it is never stored and a new request makes a new one. */
export const LINK_TTL_SECONDS = 300;
export const MAX_CONTRACT_NAME_LENGTH = 200;
export const MAX_FILE_NAME_LENGTH = 200;

/** Who may choose each purpose when a file is uploaded (`US-04-04` purpose table, `QĐ-43d`, `QĐ-66h`). */
const PURPOSE_ROLES: Record<DocumentPurpose, readonly string[]> = {
  CONTRACT_ATTACHMENT: ['IT_ADMIN', 'FINANCE'],
  PURCHASE_DOCUMENT: ['IT_ADMIN', 'FINANCE'],
  TAX_PAYMENT_PROOF: ['FINANCE'],
  SIGNATURE_RECORD: ['IT_ADMIN'],
  IMPORT_SOURCE: ['IT_ADMIN'],
  COST_STATEMENT: ['FINANCE'],
};

/** The purposes whose file is attached to a contract, the only record there is to attach to today. */
const ATTACHES_TO_CONTRACT: ReadonlySet<DocumentPurpose> = new Set(['CONTRACT_ATTACHMENT', 'PURCHASE_DOCUMENT']);

/** What is kept: each type with the extensions that go with it. A name that says otherwise is refused. */
const ALLOWED_TYPES: Record<string, readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
};

/** Throws DocumentPurposeForbiddenError when none of the roles may choose the purpose. */
export function assertMayChoosePurpose(purpose: DocumentPurpose, roles: readonly string[]): void {
  if (!roles.some((role) => PURPOSE_ROLES[purpose].includes(role))) throw new DocumentPurposeForbiddenError();
}

/** The purposes with nowhere to be attached yet are refused, after the role is checked. Throws DocumentPurposeNotAvailableError. */
export function assertPurposeAvailable(purpose: DocumentPurpose): void {
  if (!ATTACHES_TO_CONTRACT.has(purpose)) throw new DocumentPurposeNotAvailableError(purpose);
}

/**
 * Whether a file may be kept (`US-04-04` AC-10): a name that is a name, content, a type the system keeps with the
 * extension that goes with it, and no more than the largest size. The extension is checked as well as the declared type,
 * so an executable that says it is a PDF is refused. Throws DocumentFileInvalidError, DocumentTypeNotAllowedError and
 * DocumentTooLargeError.
 */
export function assertFileAllowed(input: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  maxBytes: number;
}): void {
  const name = input.fileName.trim();
  // eslint-disable-next-line no-control-regex
  if (name.length === 0 || name.length > MAX_FILE_NAME_LENGTH || /[\\/\u0000-\u001f\u007f]/.test(name)) {
    throw new DocumentFileInvalidError('NAME');
  }
  if (input.sizeBytes < 1) throw new DocumentFileInvalidError('EMPTY');

  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  const extensions = ALLOWED_TYPES[input.contentType];
  if (!extensions?.includes(extension)) throw new DocumentTypeNotAllowedError();
  if (input.sizeBytes > input.maxBytes) throw new DocumentTooLargeError(input.maxBytes);
}

/** What the storage reports of the object must be the size and the type that were declared. Throws DocumentUploadMismatchError. */
export function assertUploadMatches(
  declared: { contentType: string; sizeBytes: number },
  stored: { contentLength: number | undefined; contentType: string | undefined },
): void {
  if (stored.contentLength !== declared.sizeBytes || stored.contentType !== declared.contentType) {
    throw new DocumentUploadMismatchError();
  }
}

/** How the first bytes of each type the system keeps begin: a PDF, a PNG and a JPEG say what they are. */
const SIGNATURES: Readonly<Record<string, readonly number[]>> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
};

/** How many bytes from the start of an object are enough to tell what it is. */
export const SIGNATURE_PREFIX_BYTES = Math.max(...Object.values(SIGNATURES).map((signature) => signature.length));

/**
 * Whether the first bytes of an object are those of the type it was declared to be (`US-04-04` AC-10): a name or a type
 * that says PDF is not enough, the content must begin like one. A type the system does not keep has no signature.
 */
export function contentMatchesType(contentType: string, prefix: Uint8Array): boolean {
  const signature = SIGNATURES[contentType];

  return (
    signature !== undefined && prefix.length >= signature.length && signature.every((byte, at) => prefix[at] === byte)
  );
}

export type OpenDecision = 'OPEN' | 'HIDDEN' | 'FORBIDDEN';

/**
 * Whether a person opens a file, by what the file is and the roles they hold now (`US-04-04` AC-1, AC-3, AC-6). Anyone
 * but the IT Admin and Finance is refused whatever the file is. A file not yet attached is the uploader's alone and is
 * "not there" for everyone else; a file that is attached opens for the IT Admin and Finance; a file that is not uploaded, that was
 * quarantined or whose upload never came is for nobody. The role is the one held now, so a role taken away takes the right with it.
 */
export function mayOpen(input: {
  status: DocumentStatus;
  uploaderAppUserId: string;
  actorAppUserId: string;
  roles: readonly string[];
}): OpenDecision {
  if (!input.roles.some((role) => role === 'IT_ADMIN' || role === 'FINANCE')) return 'FORBIDDEN';
  if (input.status === 'READY') return 'OPEN';
  if (input.status === 'PENDING_ATTACH') return input.uploaderAppUserId === input.actorAppUserId ? 'OPEN' : 'HIDDEN';

  return 'HIDDEN';
}

/** A file waits for its owner only once it is uploaded; one that has an owner has it for good. Throws on any other state. */
export function assertAttachable(status: DocumentStatus): void {
  if (status === 'READY') throw new DocumentAlreadyAttachedError();
  if (status !== 'PENDING_ATTACH') throw new DocumentNotReadyToAttachError();
}

/** The name of a contract, trimmed. Throws ContractNameRequiredError when blank. */
export function cleanContractName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) throw new ContractNameRequiredError();

  return name;
}

/** The storage says the object was put again since it was looked at (S3 412 `PreconditionFailed`). */
export function isStorageObjectChanged(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };

  return candidate.name === 'PreconditionFailed' || candidate.$metadata?.httpStatusCode === 412;
}

/** The storage says there is no such object (S3 404 `NotFound` or `NoSuchKey`). */
export function isStorageObjectMissing(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };

  return candidate.name === 'NotFound' || candidate.name === 'NoSuchKey' || candidate.$metadata?.httpStatusCode === 404;
}
