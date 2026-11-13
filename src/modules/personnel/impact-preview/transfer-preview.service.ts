import { Injectable } from '@nestjs/common';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { PersonnelActor } from '../public/personnel.types';
import { TransferGuardService } from '../transfer/transfer-guard.service';
import { TransferPreconditions } from '../transfer/transfer-preconditions.service';
import type { RecordTransferInput } from '../transfer/transfer.types';
import type { TransferImpact } from '../transfer-grace/transfer-impact.types';
import { TransferImpactService } from '../transfer-grace/transfer-impact.service';
import { ImpactPreviewFrame } from './impact-preview-frame.service';

/**
 * What recording the transfer of a person would do, before anyone records it (`P23`, `QĐ-110` G2 (3)): the body is the one of `POST /department-transfers`
 * and is judged by the very checks of the record (the person, the placements, the destination, the day, the successor of a head, the basis), so a refusal
 * has the code of the write; then the impact is read by the very service the grace reads the old rights with (`TransferImpactService`: the picture of
 * the rights the day the transfer takes effect, and the rights the sweeper of the grace would then take back), so what the Super Admin is shown is what
 * the system then does. Nothing is written: the work runs in a transaction that is rolled back.
 */
@Injectable()
export class TransferPreviewService {
  constructor(
    private readonly frame: ImpactPreviewFrame,
    private readonly organizationReads: OrganizationReadApi,
    private readonly guard: TransferGuardService,
    private readonly preconditions: TransferPreconditions,
    private readonly impact: TransferImpactService,
  ) {}

  /** Throws TransferRefusedError for everything the record would refuse, and PersonnelAccessRefusedError for the actor. */
  preview(actor: PersonnelActor, input: RecordTransferInput): Promise<TransferImpact> {
    this.guard.requireWriter(actor, input.employeeId);

    return this.guard.guarded(() =>
      this.frame.run(async (tx) => {
        await this.guard.requireOrganization();
        const today = await this.organizationReads.businessToday(new Date(), tx);
        const { seen } = await this.preconditions.require(tx, actor, input, today);

        return this.impact.impactOf(tx, {
          employeeId: input.employeeId,
          fromDepartmentId: seen.before.departmentId,
          today,
          effectiveOn: input.effectiveOn,
          headSuccessorRequired: seen.leavesAsHead,
        });
      }),
    );
  }
}
