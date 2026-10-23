import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { ObjectKeyFactory } from '../../../infrastructure/object-storage/object-key.factory';
import { ObjectStorageUnavailableError } from '../../../infrastructure/object-storage/object-storage.errors';
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
  DocumentUploadExpiredError,
  DocumentUploadMismatchError,
  DocumentUploadPendingError,
} from './contract.errors';
import {
  LINK_TTL_SECONDS,
  assertAttachable,
  assertFileAllowed,
  assertMayChoosePurpose,
  assertPurposeAvailable,
  assertUploadMatches,
  contentMatchesType,
  SIGNATURE_PREFIX_BYTES,
  mayOpen,
  type DocumentPurpose,
} from './contract.policy';
import { ContractRepo } from './contract.repo';
import { DocumentRepo, type DocumentRecord } from './document.repo';

/** The upload link lives two minutes (`SEC-01`): long enough to put a file, too short to be kept for later. */
const UPLOAD_LINK_SECONDS = 120;
/** A file declared and not uploaded this long is given up (`DB-13`). */
export const UPLOAD_ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;
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
 *
 * What the person uploads goes to a key the upload link can still write to, so it is never what is kept: once the stored
 * object is judged, those very bytes are copied to a key of their own that no link reaches, and the link is of no use to
 * replace them (`SEC-01`). A file whose upload never came is not refused, only waiting; after a day it is given up (`DB-13`).
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
    const objectKey = this.keys.create('pending-documents');

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
      contentLength: input.sizeBytes,
      expiresInSeconds: UPLOAD_LINK_SECONDS,
    });

    return {
      document,
      upload: {
        url,
        method: 'PUT',
        headers: { 'Content-Type': input.contentType, 'Content-Length': String(input.sizeBytes) },
        expiresAt: new Date(Date.now() + UPLOAD_LINK_SECONDS * 1000),
      },
    };
  }

  /**
   * Looks at what the storage holds for the file: if it is what was declared, those bytes are copied to the key the file
   * is kept under and the file waits for its owner; if not, the object is deleted and the file is quarantined. An object
   * that has not arrived is not a refusal: the file keeps waiting. Throws DocumentNotFoundError (not yours),
   * DocumentNotAwaitingUploadError, DocumentUploadPendingError, DocumentUploadExpiredError and DocumentUploadMismatchError.
   */
  async complete(actor: AuthenticatedPrincipal, id: string): Promise<DocumentRecord> {
    const organization = await this.requireOrganization();
    const current = await this.ownedBy(actor, id);
    if (current.status !== 'AWAITING_UPLOAD') throw new DocumentNotAwaitingUploadError();
    if (Date.now() - current.createdAt.getTime() > UPLOAD_ABANDONED_AFTER_MS) {
      await this.expire(current.id, current.objectKey, actor);
      throw new DocumentUploadExpiredError();
    }
    const stored = await this.stored(current.objectKey);
    if (stored.etag === undefined) throw new DocumentUploadPendingError();
    let finalKey: string | null = null;
    try {
      assertUploadMatches(current, stored);
      // What it says it is, by its size and type, is not enough: the content must begin like the type it declares.
      if (!contentMatchesType(current.contentType, await this.prefixOf(current.objectKey, stored.etag))) {
        throw new DocumentUploadMismatchError();
      }
      // The bytes that were looked at are the ones kept: copied only if they are still those, to a key no link reaches.
      finalKey = this.keys.create('documents');
      await this.copyKept(current.objectKey, finalKey, stored.etag);
    } catch (error) {
      if (!(error instanceof DocumentUploadMismatchError)) throw error;
      finalKey = null;
    }
    // The upload link is no more use once the object is judged, whatever the answer; a failed delete leaves the object to the lifecycle of the bucket.
    await this.discard(current.objectKey);

    const result = await this.runner.run(async (tx) => {
      const locked = await this.documents.lock(tx, id);
      if (!locked) throw new DocumentNotFoundError();
      if (locked.status !== 'AWAITING_UPLOAD') throw new DocumentNotAwaitingUploadError();
      if (finalKey !== null) await this.documents.markUploaded(tx, id, finalKey);
      else await this.documents.markQuarantined(tx, id);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          finalKey !== null ? 'DOCUMENT.UPLOADED' : 'DOCUMENT.QUARANTINED',
          'DocumentAttachment',
          id,
          { status: 'AWAITING_UPLOAD' },
          { status: finalKey !== null ? 'PENDING_ATTACH' : 'QUARANTINED' },
        ),
      );

      return (await this.documents.find(id, tx)) ?? locked;
    });
    if (finalKey === null) throw new DocumentUploadMismatchError();

    return result;
  }

  /**
   * Gives up the files whose upload never came: each becomes EXPIRED, with an event in the audit trail, and its object, if
   * one arrived after all, is deleted. Run by the API on a timer; safe to run often and from several instances. Returns
   * how many were given up.
   */
  async expireAbandoned(now: Date = new Date(), limit = 100): Promise<number> {
    const abandoned = await this.documents.findAbandoned(new Date(now.getTime() - UPLOAD_ABANDONED_AFTER_MS), limit);
    let expired = 0;
    for (const file of abandoned) {
      if (await this.expire(file.id, file.objectKey)) expired += 1;
    }

    return expired;
  }

  /** One file given up, if it is still awaiting its upload when the row is locked; the object goes after the commit. */
  private async expire(id: string, objectKey: string, actor?: AuthenticatedPrincipal): Promise<boolean> {
    const organization = await this.requireOrganization();
    const done = await this.runner.run(async (tx) => {
      const locked = await this.documents.lock(tx, id);
      if (!locked || locked.status !== 'AWAITING_UPLOAD') return false;
      await this.documents.markExpired(tx, id);
      await this.audit.record(tx, {
        ...(actor
          ? catalogAuditEvent(actor, organization.id, 'DOCUMENT.EXPIRED', 'DocumentAttachment', id, null, null)
          : {
              organizationId: organization.id,
              actorKind: 'SYSTEM',
              actorAppUserId: null,
              actorRoles: [],
              action: 'DOCUMENT.EXPIRED',
              resourceType: 'DocumentAttachment',
              resourceId: id,
              correlationId: `document-expiry-${id}`,
            }),
        before: { status: 'AWAITING_UPLOAD' },
        after: { status: 'EXPIRED' },
      });

      return true;
    });
    if (done) await this.discard(objectKey);

    return done;
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
    const url = await this.storage.createDownloadUrl({
      // A file that was kept opens from the copy that was looked at, never from the key an upload link can still write to.
      key: document.finalObjectKey ?? document.objectKey,
      fileName: document.fileName,
      contentType: document.contentType,
      expiresInSeconds: LINK_TTL_SECONDS,
    });
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
  private async stored(
    key: string,
  ): Promise<{ contentLength: number | undefined; contentType: string | undefined; etag: string | undefined }> {
    try {
      const metadata = await this.storage.head(key);

      return { contentLength: metadata.contentLength, contentType: metadata.contentType, etag: metadata.etag };
    } catch (error) {
      if (isNotFound(error)) return { contentLength: undefined, contentType: undefined, etag: undefined };
      throw error;
    }
  }

  /** The first bytes of the object, enough to read its signature; an object that is not there has none. */
  private async prefixOf(key: string, etag: string): Promise<Uint8Array> {
    try {
      return await this.storage.readPrefix(key, SIGNATURE_PREFIX_BYTES, etag);
    } catch (error) {
      // An object that is gone, or put again since it was looked at, is not the file that was judged.
      if (isNotFound(error) || isChanged(error)) return new Uint8Array();
      throw error;
    }
  }

  /** The copy of the bytes that were looked at; if they changed meanwhile, they are not what was judged. */
  private async copyKept(fromKey: string, toKey: string, etag: string): Promise<void> {
    try {
      await this.storage.copyIfMatch(fromKey, toKey, etag);
    } catch (error) {
      if (isNotFound(error) || isChanged(error)) throw new DocumentUploadMismatchError();
      throw error;
    }
  }

  /** Deletes an object nobody can use any more; one that is not there, or cannot be deleted now, is left to the bucket's lifecycle. */
  private async discard(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      if (!(error instanceof ObjectStorageUnavailableError) && !isNotFound(error)) throw error;
    }
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A document was kept before installation');

    return organization;
  }
}

function isChanged(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };

  return candidate.name === 'PreconditionFailed' || candidate.$metadata?.httpStatusCode === 412;
}

function isNotFound(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };

  return candidate.name === 'NotFound' || candidate.name === 'NoSuchKey' || candidate.$metadata?.httpStatusCode === 404;
}
