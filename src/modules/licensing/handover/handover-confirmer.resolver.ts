import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationHistoryService } from '../../organization/organization-history.service';
import { confirmerOf, type Confirmer } from './handover-confirmer.policy';
import type { DutyRecord } from './handover.repo';

/** Who a duty falls to now, and who heads its department today (a successor not yet in office is told apart by it). */
export interface ResolvedConfirmer {
  confirmer: Confirmer;
  headTodayId: string | null;
}

type DutyToResolve = Pick<
  DutyRecord,
  'id' | 'confirmerRole' | 'confirmerEmployeeId' | 'leaverIsHead' | 'employeeId' | 'departmentId' | 'resolveOn'
>;

/**
 * Reads the organization for the people duties fall to, in one statement for any number of duties (`US-07-09` AC-18): the head of
 * the department today, and for a head who leaves the head of the day after their last day. The answer is never kept, so a head who
 * changes before the deadline changes who is asked without any duty being touched.
 */
@Injectable()
export class HandoverConfirmerResolver {
  constructor(private readonly history: OrganizationHistoryService) {}

  async resolve(
    duties: readonly DutyToResolve[],
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, ResolvedConfirmer>> {
    const looked = duties.filter(
      (duty) =>
        duty.confirmerRole === 'DEPARTMENT_HEAD' && duty.confirmerEmployeeId === null && duty.departmentId !== null,
    );
    const queries = new Map<string, { departmentId: string; onDate: BusinessDate }>();
    for (const duty of looked) {
      const departmentId = duty.departmentId as string;
      queries.set(`${departmentId}|${today}`, { departmentId, onDate: today });
      if (duty.leaverIsHead) {
        const onDate = duty.resolveOn ?? today;
        queries.set(`${departmentId}|${onDate}`, { departmentId, onDate });
      }
    }
    const heads = await this.history.getHeadsOnDates([...queries.values()], tx);

    return new Map(
      duties.map((duty) => {
        const department = duty.departmentId;
        const headTodayId = department ? (heads.get(`${department}|${today}`) ?? null) : null;
        const headOnResolveDayId = department ? (heads.get(`${department}|${duty.resolveOn ?? today}`) ?? null) : null;

        return [duty.id, { confirmer: confirmerOf(duty, { headTodayId, headOnResolveDayId }), headTodayId }];
      }),
    );
  }
}
