import { Injectable } from '@nestjs/common';
import { businessDateAt } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { StopRequestRecord } from './stop-request.repo';

/** The organization a request belongs to and the time zone its day is read in. */
export interface StopRequestNoticeContext {
  organizationId: string;
  timeZone: string;
}

/**
 * Tells the IT Admin of a request of a holder to stop the collection of their machine (`US-09-04` AC-5): when it is made and open, and
 * once more when its deadline passed without anybody handling it. Both are written in the transaction of the change, so they exist
 * exactly when it commits, and once for each recipient and request. They carry ids, the deadline and its day, and nothing else.
 */
@Injectable()
export class StopRequestNotifier {
  constructor(
    private readonly notifications: NotificationsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** The request just made; an invalid one (a duplicate, a machine already stopped) asks for nothing and tells nobody. */
  async requested(tx: DbTx, context: StopRequestNoticeContext, request: StopRequestRecord): Promise<void> {
    if (request.state !== 'OPEN') return;
    await this.tell(tx, context, request, 'DEVICE_STOP_REQUESTED');
  }

  /** The request still open after its deadline, to the same people; the pass marks it as told in the same transaction. */
  async overdue(tx: DbTx, context: StopRequestNoticeContext, request: StopRequestRecord): Promise<void> {
    await this.tell(tx, context, request, 'DEVICE_STOP_REQUEST_OVERDUE');
  }

  /**
   * Acting IT Admins of the holder's work department, excluding the holder. Falls back to the usable Super Admin
   * (unless they are the holder) when no acting IT Admin exists or the holder has no work department.
   */
  private async recipients(tx: DbTx, holderEmployeeId: string): Promise<string[]> {
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const deptId =
      (await this.organizationReads.workDepartmentsOf([holderEmployeeId], today, tx)).get(holderEmployeeId) ?? null;
    if (deptId !== null) {
      const acting = (
        await this.organizationReads.itAdminsActingFor(
          [deptId],
          (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
          tx,
        )
      ).get(deptId);
      const actors = (acting?.actors ?? []).filter((id) => id !== holderEmployeeId);
      if (actors.length > 0) return actors;
    }

    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);
    return superAdmin !== null && superAdmin !== holderEmployeeId ? [superAdmin] : [];
  }

  private async tell(
    tx: DbTx,
    context: StopRequestNoticeContext,
    request: StopRequestRecord,
    code: 'DEVICE_STOP_REQUESTED' | 'DEVICE_STOP_REQUEST_OVERDUE',
  ): Promise<void> {
    if (request.dueAt === null) throw new Error('A request to stop collection was told of without a deadline');
    const params = {
      stopRequestId: request.id,
      registrationId: request.registrationId,
      deviceId: request.deviceId,
      holderEmployeeId: request.holderEmployeeId,
      dueAt: request.dueAt.toISOString(),
      dueOn: businessDateAt(request.dueAt, context.timeZone),
    };
    for (const recipientEmployeeId of await this.recipients(tx, request.holderEmployeeId)) {
      await this.notifications.notifyInApp(tx, {
        organizationId: context.organizationId,
        recipientEmployeeId,
        code,
        subject: { type: 'DEVICE_STOP_REQUEST', id: request.id },
        params,
        eventKey: `${code}:${request.id}`,
      });
    }
  }
}
