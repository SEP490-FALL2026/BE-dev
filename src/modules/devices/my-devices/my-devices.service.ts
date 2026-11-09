import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../core/business-date';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { acknowledgementBlock, acknowledgementStateOf } from '../acknowledgement/acknowledgement.policy';
import { NoticeRepo } from '../notice/notice.repo';
import { MyDevicesRepo } from './my-devices.repo';

/** The machines registered to the signed-in person, and whether they can acknowledge each one now (`US-09-01` AC-12). */
@Injectable()
export class MyDevicesService {
  constructor(
    private readonly repo: MyDevicesRepo,
    private readonly notices: NoticeRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async list(employeeId: string, input: { page: number; pageSize: number }) {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The machines of a holder were read before installation');
    const current = await this.notices.current(organization.id);
    const { rows, total } = await this.repo.page(employeeId, (input.page - 1) * input.pageSize, input.pageSize);

    return {
      items: rows.map((row) => {
        const state = acknowledgementStateOf(row);
        const blockedReason = acknowledgementBlock({
          registrationEnded: row.endedAt !== null,
          signatureRecorded: row.signatureRecorded,
          currentNoticeId: current?.id ?? null,
          offeredNoticeId: null,
          alreadyActive: state === 'ACKNOWLEDGED',
        });

        return {
          registrationId: row.registrationId,
          deviceId: row.deviceId,
          assetCode: row.assetCode,
          hostname: row.hostname,
          os: row.os,
          validFrom: fromDateColumn(row.validFrom),
          endedAt: row.endedAt ? row.endedAt.toISOString() : null,
          acknowledgementState: state,
          acknowledgedVersionNumber: row.acknowledgedVersionNumber,
          signatureRecorded: row.signatureRecorded,
          canAcknowledge: blockedReason === null,
          blockedReason,
        };
      }),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }
}
