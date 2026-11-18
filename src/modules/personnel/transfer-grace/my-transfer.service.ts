import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { MyTransferWire } from './transfer-grace.dto';
import { TransferGraceRepo } from './transfer-grace.repo';
import { TransferOldRightsService } from './transfer-old-rights.service';

/**
 * The transfer of the person who asks, told to them while the grace lasts (P8, `QĐ-110p`): from where to where, until when they keep the rights of
 * the old department, and which of them are still theirs. Open to every signed-in account and only ever about the account that asks. After the
 * last day of the grace the rights are being taken back and there is nothing to decide, so the answer is no data.
 */
@Injectable()
export class MyTransferService {
  constructor(
    private readonly graces: TransferGraceRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly oldRights: TransferOldRightsService,
  ) {}

  async of(principal: AuthenticatedPrincipal): Promise<MyTransferWire> {
    const today = await this.organizationReads.businessToday();
    const found = await this.graces.findInGraceOf(principal.employeeId, today);
    if (found === null) return null;
    const places = new Map(
      (await this.organizationReads.getDepartmentBriefs([found.fromDepartmentId, found.toDepartmentId])).map(
        (department) => [department.id, department],
      ),
    );
    const place = (id: string) => ({
      department: { id, code: places.get(id)?.code ?? '', name: places.get(id)?.name ?? '' },
    });
    const rights = await this.oldRights.of({
      employeeId: principal.employeeId,
      effectiveOn: found.effectiveOn,
      closed: false,
      snapshot: found.snapshotBefore,
      today,
    });

    return {
      id: found.id,
      from: place(found.fromDepartmentId),
      to: place(found.toDepartmentId),
      effectiveOn: found.effectiveOn,
      grace: { endsOn: found.graceEndsOn, reminderOn: found.graceReminderOn },
      rights: rights.filter((right) => right.state !== 'ENDED'),
    };
  }
}
