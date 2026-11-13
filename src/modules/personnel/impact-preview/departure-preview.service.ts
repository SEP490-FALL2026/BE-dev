import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DepartureImpactService } from '../departure-deadline/departure-impact.service';
import type { DepartureImpact } from '../departure-deadline/departure-impact.types';
import { OffboardingFrame } from '../offboarding/offboarding-frame.service';
import { OffboardingPreconditions } from '../offboarding/offboarding-preconditions.service';
import { OffboardingRefusedError } from '../offboarding/offboarding.errors';
import { blockNowDayIsTodayRefusal, lastWorkingDayOf } from '../offboarding/offboarding.policy';
import type { RecordOffboardingInput } from '../offboarding/offboarding.types';
import type { PersonnelActor } from '../public/personnel.types';
import { TransferGuardService } from '../transfer/transfer-guard.service';
import { ImpactPreviewFrame } from './impact-preview-frame.service';

/**
 * What recording the departure of a person would do, before anyone records it (`P23`, `QĐ-110` G2 (3)): the body is the one of `POST /offboarding-cases`
 * and is judged by the very checks of the record (the person, the placements, the last working day, the successor of a head, the basis), so a
 * refusal has the code of the write; then the impact is read by the very service the record reads it with (`DepartureImpactService`), so what the Super
 * Admin is shown is what the system then does. Nothing is written: the work runs in a transaction that is rolled back.
 */
@Injectable()
export class DeparturePreviewService {
  constructor(
    private readonly frame: ImpactPreviewFrame,
    private readonly offboardingFrame: OffboardingFrame,
    private readonly organizationReads: OrganizationReadApi,
    private readonly guard: TransferGuardService,
    private readonly preconditions: OffboardingPreconditions,
    private readonly impact: DepartureImpactService,
  ) {}

  /** Throws OffboardingRefusedError for everything the record would refuse, and PersonnelAccessRefusedError for the actor. */
  preview(actor: PersonnelActor, given: RecordOffboardingInput): Promise<DepartureImpact> {
    this.guard.requireWriter(actor, given.employeeId);

    return this.offboardingFrame.guarded(() =>
      this.frame.run(async (tx) => {
        await this.guard.requireOrganization();
        const today = await this.organizationReads.businessToday(new Date(), tx);
        const wrongDay = blockNowDayIsTodayRefusal(given.accessBlockMode, given.lastWorkingDay, today);
        if (wrongDay) throw new OffboardingRefusedError(wrongDay.code, wrongDay.details);
        const input = {
          ...given,
          lastWorkingDay: lastWorkingDayOf(given.accessBlockMode, given.lastWorkingDay, today),
        };
        const { seen } = await this.preconditions.require(tx, actor, input, today);

        return this.impact.impactOf(tx, {
          employeeId: input.employeeId,
          today,
          lastWorkingDay: input.lastWorkingDay as BusinessDate,
          headSuccessorRequired: seen.leavesAsHead,
        });
      }),
    );
  }
}
