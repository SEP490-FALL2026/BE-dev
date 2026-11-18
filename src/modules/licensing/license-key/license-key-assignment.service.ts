import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicenseKeyNotFoundError } from '../public/licensing.errors';
import type { KeyDisposition } from '../public/licensing.types';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { assertAssignable } from './license-key.policy';
import { LicenseKeyRepo } from './license-key.repo';

/**
 * The keys of the K4 pool as seats take and give them back (`BR-MF1-09`, `QĐ-103d`): the grant of a K4 seat is completed by giving it a
 * free key of its purchase, and the revocation of the seat puts the key back in the store, or back and withdrawn from it at once. Both run
 * in the transaction of the task, with their audit event. Lock order: the subscription, then the key (the order of an import and of a
 * withdrawal), so the grant, the withdrawal and the import of the same purchase never wait for each other in a circle.
 */
@Injectable()
export class LicenseKeyAssignmentService {
  constructor(
    private readonly repo: LicenseKeyRepo,
    private readonly catalog: CatalogApi,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Gives the key to the seat of the grant: a free key of the store, not withdrawn, of the purchase the seat sits on. Two IT Admins who
   * give the same last key are served one after the other, and the second is refused. Throws LicenseKeyNotFoundError and
   * LicenseKeyStateError (`WITHDRAWN`, `NOT_IN_STORE`, `SUBSCRIPTION_MISMATCH`).
   */
  async assign(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { organizationId: string; licenseKeyId: string; assignmentId: string; subscriptionId: string | null },
  ): Promise<void> {
    if (input.subscriptionId !== null) await this.catalog.lockSeatTarget(tx, { subscriptionId: input.subscriptionId });
    const key = await this.repo.lock(tx, input.licenseKeyId);
    if (!key) throw new LicenseKeyNotFoundError();
    assertAssignable(key, input.subscriptionId);
    await this.repo.assign(tx, key.id, input.assignmentId);
    await this.audit.record(
      tx,
      licensingAuditEvent(actor, input.organizationId, 'LICENSE_KEY.ASSIGNED', 'LicenseKey', key.id, null, {
        licenseKeyId: key.id,
        subscriptionId: key.subscriptionId,
        assignmentId: input.assignmentId,
      }),
    );
  }

  /** Whether the seat holds a key, its row locked until commit; a seat granted before the key pool holds none. */
  async holdsKey(tx: DbTx, assignmentId: string): Promise<boolean> {
    return (await this.repo.lockOfAssignment(tx, assignmentId)) !== null;
  }

  /**
   * Takes the key back from the seat whose revocation is completed (`US-07-05` AC-6, AC-7): into the store as a free key, or into the store
   * and withdrawn at once with the reason the IT Admin gave, in one write so it is never free in between. The caller holds the subscription
   * and the assignment. A seat granted before the key pool holds no key: nothing moves and null is answered.
   */
  async takeBack(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      assignmentId: string;
      disposition: KeyDisposition;
      withdrawalReason: string | null;
      now: Date;
    },
  ): Promise<{ licenseKeyId: string } | null> {
    const key = await this.repo.lockOfAssignment(tx, input.assignmentId);
    if (!key) return null;
    const withdrawn = input.disposition === 'WITHDRAW' && input.withdrawalReason !== null;
    await this.repo.returnToStore(
      tx,
      key.id,
      withdrawn ? { at: input.now, byAppUserId: actor.appUserId, reason: input.withdrawalReason ?? '' } : null,
    );
    const facts = { licenseKeyId: key.id, subscriptionId: key.subscriptionId, assignmentId: input.assignmentId };
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        input.organizationId,
        'LICENSE_KEY.RETURNED_TO_STORE',
        'LicenseKey',
        key.id,
        null,
        facts,
      ),
    );
    if (withdrawn) {
      await this.audit.record(
        tx,
        licensingAuditEvent(actor, input.organizationId, 'LICENSE_KEY.WITHDRAWN', 'LicenseKey', key.id, null, {
          ...facts,
          reason: input.withdrawalReason,
        }),
      );
    }

    return { licenseKeyId: key.id };
  }
}
