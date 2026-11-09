import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { LicensingGhostSeatApi } from '../../licensing/public/licensing-ghost-seat.api';
import type { SharedPoolVacancy } from '../../licensing/public/licensing-ghost-seat.types';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { decideG1, type G1Decision } from './internal-rules.policy';
import type { RulePass } from './internal-rules.types';

const SYSTEM = { kind: 'SYSTEM' } as const;

/**
 * `G1` (`US-10-01` AC-1, AC-7, AC-8, AC-9; `R-E02`): one pass over the subscriptions that grant seats and the `G1` that are open: a
 * `G1` is made, follows the free seats, or closes. Each subscription is judged in a transaction of its own, so one that fails is
 * counted and the others go on. A `G1` belongs to no department and tells nobody.
 */
@Injectable()
export class InternalRulesG1Service {
  private readonly logger = new Logger(InternalRulesG1Service.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly licensing: LicensingGhostSeatApi,
    private readonly repo: GhostSeatRepo,
    private readonly ghostSeats: GhostSeatService,
  ) {}

  async pass(pass: RulePass): Promise<void> {
    const vacancies = new Map<string, SharedPoolVacancy>(
      (await this.licensing.listSharedPoolVacancies(pass.today)).map((vacancy) => [vacancy.subscriptionId, vacancy]),
    );
    const open = new Map<string, GhostSeatRecord>(
      (await this.repo.unclosedG1(pass.organizationId)).flatMap((record) =>
        record.subscriptionId ? [[record.subscriptionId, record] as const] : [],
      ),
    );

    for (const subscriptionId of new Set([...vacancies.keys(), ...open.keys()])) {
      const vacancy = vacancies.get(subscriptionId) ?? null;
      const record = open.get(subscriptionId) ?? null;
      try {
        const decision = decideG1(vacancy, record);
        if (decision.skip) {
          pass.tally.skip({ subjectType: 'SUBSCRIPTION', subjectId: subscriptionId, ...decision.skip });
        }
        await this.runner.run((tx) => this.apply(tx, pass, subscriptionId, vacancy, record, decision));
      } catch (error) {
        pass.tally.failed();
        this.logger.error(`G1 of subscription ${subscriptionId} failed: ${describeForOperator(error)}`);
      }
    }
  }

  private async apply(
    tx: DbTx,
    pass: RulePass,
    subscriptionId: string,
    vacancy: SharedPoolVacancy | null,
    record: GhostSeatRecord | null,
    { step }: G1Decision,
  ): Promise<void> {
    if (step.kind === 'CREATE' && vacancy) {
      await this.ghostSeats.create(
        tx,
        {
          organizationId: pass.organizationId,
          group: 'G1',
          state: 'OPEN',
          tier: null,
          applicationId: vacancy.applicationId,
          planId: vacancy.planId,
          subscriptionId,
          assignmentId: null,
          seatChainId: null,
          employeeId: null,
          departmentId: null,
          freeSeats: step.freeSeats,
          countsTowardVacantCost: step.countsTowardVacantCost,
          revocationTaskId: null,
          evidence: {
            group: 'G1',
            purchased: vacancy.purchased ?? 0,
            occupied: vacancy.occupied,
            free: step.freeSeats,
            asOf: pass.today,
            action: step.action,
          },
          createdRunId: pass.tally.run.id,
        },
        SYSTEM,
      );
      pass.tally.created();
    } else if (step.kind === 'UPDATE' && record) {
      await this.ghostSeats.updateFreeSeats(tx, record, step.freeSeats, SYSTEM);
      pass.tally.updated();
    } else if (step.kind === 'CLOSE' && record) {
      await this.ghostSeats.close(tx, record, step.reason, SYSTEM, pass.now);
      pass.tally.closed();
    }
  }
}
