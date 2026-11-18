import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RuleSeatsFactsService } from '../assignment/rule-seats-facts.service';
import { SharedPoolVacancyService } from '../shared-pool/shared-pool-vacancy.service';
import type { RevocationTaskStanding, RuleSeat, SharedPoolVacancy } from './licensing-ghost-seat.types';

/** The licensing facade for the rules of wasted seats (`G1`, `G2`): what they read of the seats and the subscriptions, never what they change. */
@Injectable()
export class LicensingGhostSeatApi {
  constructor(
    private readonly vacancies: SharedPoolVacancyService,
    private readonly seats: RuleSeatsFactsService,
  ) {}

  /**
   * Every subscription that grants seats on `asOf` (active, not taken over by a later period that runs, not ended) with the seats bought
   * and taken, counted as the shared pool counts them (`INV-01`): a fixed number of statements however many there are.
   */
  listSharedPoolVacancies(asOf: BusinessDate, tx?: DbTx): Promise<SharedPoolVacancy[]> {
    return this.vacancies.vacanciesOn(asOf, tx);
  }

  /** The seats (personal or service account) that hold a seat on `asOf`, each with the revocation under way: a fixed number of statements. */
  listSeatsForRules(
    filter: { asOf: BusinessDate; applicationIds?: readonly string[]; employeeIds?: readonly string[] },
    tx?: DbTx,
  ): Promise<RuleSeat[]> {
    return this.seats.listSeats(filter, tx);
  }

  /** How each of these revocation tasks stands and which sources asked for it (a task that is not a revocation is absent). */
  getRevocationTaskStatuses(taskIds: readonly string[], tx?: DbTx): Promise<Map<string, RevocationTaskStanding>> {
    return this.seats.taskStandings(taskIds, tx);
  }
}
