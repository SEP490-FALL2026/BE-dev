import { Injectable, Logger } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { blockMomentReached, firstDayRefused } from './block-moment.policy';
import { BlockMomentEffects } from './block-moment-effects.service';
import { BlockMomentRepo, type DepartureRef } from './block-moment.repo';
import { DepartureDeadlineService } from './departure-deadline.service';

/** How many departures are read in one statement. */
const PAGE = 200;

/** What one pass did: the departures announced, and those it could not (each is tried again at the next pass). */
export interface AnnouncementPass {
  announced: number;
  failed: number;
}

/**
 * Announces, once for a departure, that the access of the person is blocked (`QĐ-110b`, `QĐ-110d`, SPEC MF2-E). The block itself needs no
 * pass: the sign-in and the guard refuse the person from the day after the last working day, or from the day of a departure blocked now.
 * This is what the system does around it, at that moment, once (`offboarding_cases.block_announced_at`): see `BlockMomentEffects`. A
 * departure cancelled before the moment is never announced and no request of the person is touched.
 *
 * Each case has a transaction of its own that takes the lock protocol of the commands on a case (the employee, then the case) and reads
 * the case again, so two instances, or a pass and a cancellation, never both act; one that fails is logged and tried again next time
 * without stopping the others. The deadline of revocation already on the case is never changed (D-47): it is written only when the case has none.
 */
@Injectable()
export class BlockAnnouncementService {
  private readonly logger = new Logger(BlockAnnouncementService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly cases: BlockMomentRepo,
    private readonly organization: OrganizationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly deadlines: DepartureDeadlineService,
    private readonly effects: BlockMomentEffects,
  ) {}

  async announce(now: Date = new Date()): Promise<AnnouncementPass> {
    const today = await this.organizationReads.businessToday(now);
    const pass: AnnouncementPass = { announced: 0, failed: 0 };
    let afterId: string | null = null;
    for (;;) {
      const page: DepartureRef[] = await this.cases.pageUnannounced(today, { afterId, take: PAGE });
      for (const ref of page) {
        try {
          if (await this.announceOne(ref, today, now)) pass.announced += 1;
        } catch (error) {
          pass.failed += 1;
          this.logger.error(
            `Block moment of departure ${ref.id} failed: ${describeForOperator(error)}`,
            traceForOperator(error),
          );
        }
      }
      if (page.length < PAGE) break;
      afterId = page[page.length - 1].id;
    }

    return pass;
  }

  private announceOne(ref: DepartureRef, today: BusinessDate, now: Date): Promise<boolean> {
    return this.runner.run(async (tx) => {
      await this.organization.lockEmployeeForUpdate(tx, ref.employeeId);
      const held = await this.cases.lockOpen(tx, ref.id);
      if (!held) return false;
      const block = await this.identity.findDepartureBlock(held.employeeId, tx);
      const refusedFrom = firstDayRefused(held, block?.sourceCaseId === held.id ? block : null);
      const announced = held.blockAnnouncedAt !== null;
      if (
        refusedFrom === null ||
        !blockMomentReached({ state: held.state, closed: false, announced, refusedFrom }, today)
      )
        return false;

      const revocationDueOn = held.revocationDueOn ?? (await this.deadlines.revocationDueOn(held.lastWorkingDay));
      if (!(await this.cases.markAnnounced(tx, held.id, now, revocationDueOn))) return false;
      await this.effects.apply(tx, held, { blockedOn: refusedFrom, revocationDueOn, at: now });

      return true;
    });
  }
}
