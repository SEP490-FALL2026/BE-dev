import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { RevocationTaskStanding, RuleSeat } from '../public/licensing-ghost-seat.types';
import { RuleSeatsRepo } from './rule-seats.repo';

/** The open seats and the standing of revocation tasks that the rules of wasted seats judge: reads only. */
@Injectable()
export class RuleSeatsFactsService {
  constructor(private readonly seats: RuleSeatsRepo) {}

  listSeats(
    filter: { asOf: BusinessDate; applicationIds?: readonly string[]; employeeIds?: readonly string[] },
    tx?: DbTx,
  ): Promise<RuleSeat[]> {
    return this.seats.listOpen(filter, tx);
  }

  taskStandings(taskIds: readonly string[], tx?: DbTx): Promise<Map<string, RevocationTaskStanding>> {
    return this.seats.taskStandings(taskIds, tx);
  }
}
