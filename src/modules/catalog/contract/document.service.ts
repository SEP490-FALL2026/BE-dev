import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { ObjectKeyFactory } from '../../../infrastructure/object-storage/object-key.factory';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
import { OrganizationService } from '../../organization/organization.service';
import { catalogAuditEvent } from '../mappers/catalog-audit-event';
import {
  ContractNotFoundError,
  DocumentAccessForbiddenError,
  DocumentNotAwaitingUploadError,
  DocumentNotFoundError,
  DocumentUploadMismatchError,
} from './contract.errors';
import {
  LINK_TTL_SECONDS,
  assertAttachable,
  assertFileAllowed,
  assertMayChoosePurpose,
  assertPurposeAvailable,
  assertUploadMatches,
  mayOpen,
  type DocumentPurpose,
} from './contract.policy';
import { ContractRepo } from './contract.repo';
import { DocumentRepo, type DocumentRecord } from './document.repo';

const UPLOAD_LINK_SECONDS = 900;
const MB = 1024 * 1024;

export interface UploadInstructions {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
}

/**
 * The files kept for contracts (`US-04-04`). A file is uploaded in three steps because the storage only signs links: the
 * request is declared and judged (role, purpose, type, size), the client puts the bytes in the storage, and the system
 * looks at what was stored before it keeps the file. A file belongs to the person who uploaded it until they attach it to
 * a contract, then to the IT Admin and Finance. A link that opens a file is made when it is asked for, lives five
 * minutes, and is stored nowhere. The role is the one held at the moment of each request.
 */
@Injectable()
export class DocumentService {
  constructor(
    private readonly documents: DocumentRepo,
    private readonly contracts: ContractRepo,
    private readonly organization: OrganizationService,
    private readonly parameters: OperatingParametersService,
    private readonly keys: ObjectKeyFactory,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  /**
   * Declares a file and gives the link to upload it to. Throws DocumentPurposeForbiddenError,
   * DocumentPurposeNotAvailableError, DocumentFileInvalidError, DocumentTypeNotAllowedError and DocumentTooLargeError;
   * nothing is made when any of them is thrown.
   */
  async create(
    actor: AuthenticatedPrincipal,
    input: { fileName: string; contentType: string; sizeBytes: number; purpose: DocumentPurpose },
  ): Promise<{ document: DocumentRecord; upload: UploadInstructions }> {
    assertMayChoosePurpose(input.purpose, actor.roles);
    assertPurposeAvailable(input.purpose);
    const maxBytes = Number(await this.parameters.getValue('DOCUMENT_MAX_SIZE_MB')) * MB;
    assertFileAllowed({ ...input, maxBytes });
    const organization = await this.requireOrganization();
    const objectKey = this.keys.create('documents');

    const document = await this.runner.run(async (tx) => {
      const created = await this.documents.insert(tx, {
        organizationId: organization.id,
        purpose: input.purpose,
        fileName: input.fileName.trim(),
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        objectKey,
        uploadedByAppUserId: actor.appUserId,
      });
      await this.audit.record(
        tx,
        catalogAuditEvent(actor, organization.id, 'DOCUMENT.CREATED', 'DocumentAttachment', created.id, null, {
          purpose: created.purpose,
          fileName: created.fileName,
          contentType: created.contentType,
          sizeBytes: created.sizeBytes,
        }),
      );

      return created;
    });
    const url = await this.storage.createUploadUrl({
      key: objectKey,
      contentType: input.contentType,
      expiresInSeconds: UPLOAD_LINK_SECONDS,
    });

    return {
      document,
      upload: {
        url,
        method: 'PUT',
        headers: { 'Content-Type': input.contentType },
        expiresAt: new Date(Date.now() + UPLOAD_LINK_SECONDS * 1000),
      },
    };
  }

  /**
   * Looks at what the storage holds for the file: if it is what was declared the file is uploaded and waits for its
   * owner, if not the object is deleted and the file is quarantined. Throws DocumentNotFoundError (not yours),
   * DocumentNotAwaitingUploadError and DocumentUploadMismatchError.
   */
  async complete(actor: AuthenticatedPrincipal, id: string): Promise<DocumentRecord> {
    const organization = await this.requireOrganization();
    const current = await this.ownedBy(actor, id);
    if (current.status !== 'AWAITING_UPLOAD') throw new DocumentNotAwaitingUploadError();
    const stored = await this.stored(current.objectKey);
    let matches = true;
    try {
      assertUploadMatches(current, stored);
    } catch (error) {
      if (!(error instanceof DocumentUploadMismatchError)) throw error;
      matches = false;
    }
    if (!matches) await this.storage.delete(current.objectKey);

    const result = await this.runner.run(async (tx) => {
      const locked = await this.documents.lock(tx, id);
      if (!locked) throw new DocumentNotFoundError();
      if (locked.status !== 'AWAITING_UPLOAD') throw new DocumentNotAwaitingUploadError();
      if (matches) await this.documents.markUploaded(tx, id);
      else await this.documents.markQuarantined(tx, id);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          matches ? 'DOCUMENT.UPLOADED' : 'DOCUMENT.QUARANTINED',
          'DocumentAttachment',
          id,
          { status: 'AWAITING_UPLOAD' },
          { status: matches ? 'PENDING_ATTACH' : 'QUARANTINED' },
        ),
      );

      return (await this.documents.find(id, tx)) ?? locked;
    });
    if (!matches) throw new DocumentUploadMismatchError();

    return result;
  }

  /**
   * Attaches the file to a contract: only by the person who uploaded it, who still holds a role that chooses its purpose,
   * and only once. Throws DocumentNotFoundError, DocumentPurposeForbiddenError, ContractNotFoundError,
   * DocumentAlreadyAttachedError and DocumentNotReadyToAttachError.
   */
  async attach(actor: AuthenticatedPrincipal, id: string, input: { contractId: string }): Promise<DocumentRecord> {
    const organization = await this.requireOrganization();
    const current = await this.ownedBy(actor, id);
    assertMayChoosePurpose(current.purpose, actor.roles);
    if (!(await this.contracts.find(input.contractId))) throw new ContractNotFoundError();
    const now = new Date();

    return this.runner.run(async (tx) => {
      const locked = await this.documents.lock(tx, id);
      if (!locked) throw new DocumentNotFoundError();
      assertAttachable(locked.status);
      await this.documents.markAttached(tx, id, input.contractId, now);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'DOCUMENT.ATTACHED',
          'DocumentAttachment',
          id,
          { status: locked.status },
          { status: 'READY', contractId: input.contractId },
        ),
      );

      return (await this.documents.find(id, tx)) ?? locked;
    });
  }

  /** A file as the person may see it; one they may not see is as if it did not exist. Throws DocumentNotFoundError. */
  async get(actor: AuthenticatedPrincipal, id: string): Promise<DocumentRecord> {
    return this.visibleTo(actor, id);
  }

  /**
   * Issues a link that opens the file, valid for five minutes, kept nowhere; each request is one more link and one more
   * event of the audit trail. Throws DocumentNotFoundError and DocumentAccessForbiddenError.
   */
  async link(actor: AuthenticatedPrincipal, id: string): Promise<{ url: string; expiresAt: Date }> {
    const organization = await this.requireOrganization();
    const document = await this.visibleTo(actor, id);
    const expiresAt = new Date(Date.now() + LINK_TTL_SECONDS * 1000);
    const url = await this.storage.createDownloadUrl({ key: document.objectKey, expiresInSeconds: LINK_TTL_SECONDS });
    await this.runner.run((tx) =>
      this.audit.record(
        tx,
        catalogAuditEvent(actor, organization.id, 'DOCUMENT.LINK_ISSUED', 'DocumentAttachment', id, null, {
          expiresAt: expiresAt.toISOString(),
        }),
      ),
    );

    return { url, expiresAt };
  }

  /** The file, if the person who uploaded it is the one asking; anyone else is told it does not exist. */
  private async ownedBy(actor: AuthenticatedPrincipal, id: string): Promise<DocumentRecord> {
    const document = await this.documents.find(id);
    if (!document || document.uploadedByAppUserId !== actor.appUserId) throw new DocumentNotFoundError();

    return document;
  }

  private async visibleTo(actor: AuthenticatedPrincipal, id: string): Promise<DocumentRecord> {
    const document = await this.documents.find(id);
    if (!document) throw new DocumentNotFoundError();
    const decision = mayOpen({
      status: document.status,
      uploaderAppUserId: document.uploadedByAppUserId,
      actorAppUserId: actor.appUserId,
      roles: actor.roles,
    });
    if (decision === 'FORBIDDEN') throw new DocumentAccessForbiddenError();
    if (decision === 'HIDDEN') throw new DocumentNotFoundError();

    return document;
  }

  /** What the storage holds under the key; an object that is not there reports nothing, so it never matches. */
  private async stored(key: string): Promise<{ contentLength: number | undefined; contentType: string | undefined }> {
    try {
      const metadata = await this.storage.head(key);

      return { contentLength: metadata.contentLength, contentType: metadata.contentType };
    } catch (error) {
      if (isNotFound(error)) return { contentLength: undefined, contentType: undefined };
      throw error;
    }
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A document was kept before installation');

    return organization;
  }
}

function isNotFound(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };

  return candidate.name === 'NotFound' || candidate.$metadata?.httpStatusCode === 404;
}
