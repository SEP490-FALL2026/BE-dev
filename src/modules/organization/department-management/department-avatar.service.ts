import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import { judgePicture } from '../../../infrastructure/object-storage/picture-image';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { organizationAuditEvent } from '../organization-audit-event.mapper';
import { OrganizationContextService } from '../organization-context.service';
import { departmentAvatarObjectKey } from '../department/department-avatar.policy';
import {
  DepartmentAvatarFileRequiredError,
  DepartmentAvatarInvalidError,
  DepartmentAvatarTooLargeError,
  DepartmentAvatarTypeUnsupportedError,
  DepartmentInactiveError,
  DepartmentNotFoundError,
} from '../department/department.errors';
import { assertMayChangeOrganization } from '../department/department.policy';
import { DepartmentRepo } from '../department/department.repo';
import { requireOrganization } from './department-facts.service';

export interface UploadedDepartmentPicture {
  bytes: Buffer;
  declaredContentType: string;
}

/**
 * The picture of a department (`QĐ-113c`), set, replaced or removed by the Super Admin while the department is active. The file is judged by its
 * signature, written to the storage under a key of its own, and only then does the department point at it, in one transaction with its audit. The
 * object it stopped pointing at is deleted after the commit, never inside the transaction, which could still roll back; a failed delete is logged and
 * leaves an unreachable object, which is cheaper than a purge table of its own for one picture per department (known limitation, D-1: a crash between the
 * write and the commit, or a failed delete, leaves such an object; no purge table until it is seen to matter).
 */
@Injectable()
export class DepartmentAvatarService {
  private readonly logger = new Logger(DepartmentAvatarService.name);

  constructor(
    private readonly repo: DepartmentRepo,
    private readonly context: OrganizationContextService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws DepartmentForbiddenError, DepartmentAvatarFileRequiredError, DepartmentAvatarTooLargeError, DepartmentAvatarTypeUnsupportedError,
   * DepartmentAvatarInvalidError, DepartmentNotFoundError and DepartmentInactiveError.
   */
  async upload(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    file: UploadedDepartmentPicture | undefined,
    now: Date = new Date(),
  ): Promise<void> {
    assertMayChangeOrganization(actor.roles);
    if (!file) throw new DepartmentAvatarFileRequiredError();
    const judged = judgePicture(file);
    if (!judged.ok) {
      if (judged.reason === 'TOO_LARGE') throw new DepartmentAvatarTooLargeError();
      if (judged.reason === 'UNSUPPORTED_TYPE') throw new DepartmentAvatarTypeUnsupportedError();
      throw new DepartmentAvatarInvalidError(judged.reason);
    }
    const organization = await requireOrganization(this.context);
    // Without a lock: only to refuse a missing or retired department before anything is written; the locked check below decides.
    const existing = await this.repo.findById(departmentId);
    if (!existing) throw new DepartmentNotFoundError();
    if (existing.status !== 'ACTIVE') throw new DepartmentInactiveError();
    const key = departmentAvatarObjectKey(organization.id, departmentId, randomUUID(), judged.kind.extension);
    await this.storage.putObject({ key, body: file.bytes, contentType: judged.kind.contentType });

    let previousKey: string | null = null;
    try {
      await this.runner.run(async (tx) => {
        const current = await this.repo.lock(tx, departmentId, 'UPDATE');
        if (!current) throw new DepartmentNotFoundError();
        if (current.status !== 'ACTIVE') throw new DepartmentInactiveError();
        await this.repo.setAvatar(tx, departmentId, { key, contentType: judged.kind.contentType, at: now });
        previousKey = current.avatarObjectKey;
        await this.audit.record(
          tx,
          organizationAuditEvent(
            actor,
            organization.id,
            'DEPARTMENT.AVATAR_CHANGED',
            'Department',
            departmentId,
            { hadAvatar: current.avatarObjectKey !== null },
            { contentType: judged.kind.contentType, bytes: file.bytes.length },
          ),
        );
      });
    } catch (error) {
      // The department never pointed at the new object: nothing else will ever delete it.
      await this.storage.delete(key).catch((failure: unknown) => this.logOrphan(key, failure));
      throw error;
    }
    if (previousKey) await this.deleteQuietly(previousKey);
  }

  /** Removes the picture; with none, nothing changes and nothing is recorded. Throws DepartmentForbiddenError, DepartmentNotFoundError and DepartmentInactiveError. */
  async remove(actor: AuthenticatedPrincipal, departmentId: string): Promise<void> {
    assertMayChangeOrganization(actor.roles);
    const organization = await requireOrganization(this.context);
    let removedKey: string | null = null;

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, departmentId, 'UPDATE');
      if (!current) throw new DepartmentNotFoundError();
      if (current.status !== 'ACTIVE') throw new DepartmentInactiveError();
      if (!current.avatarObjectKey) return;
      await this.repo.clearAvatar(tx, departmentId, new Date());
      removedKey = current.avatarObjectKey;
      await this.audit.record(
        tx,
        organizationAuditEvent(
          actor,
          organization.id,
          'DEPARTMENT.AVATAR_REMOVED',
          'Department',
          departmentId,
          { hadAvatar: true },
          { hadAvatar: false },
        ),
      );
    });
    if (removedKey) await this.deleteQuietly(removedKey);
  }

  private async deleteQuietly(key: string): Promise<void> {
    await this.storage.delete(key).catch((failure: unknown) => this.logOrphan(key, failure));
  }

  private logOrphan(key: string, failure: unknown): void {
    this.logger.warn(
      `Could not delete the object ${key} of a department picture: ${failure instanceof Error ? failure.message : String(failure)}`,
    );
  }
}
