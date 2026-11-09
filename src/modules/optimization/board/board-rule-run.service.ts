import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { InternalRulesService } from '../internal-rules/internal-rules.service';
import { RuleRunQueryService } from '../rule-run/rule-run-query.service';
import type { RuleRunRecord, RuleSetCode, SkipGate } from '../rule-run/rule-run.repo';
import { UsageRulesService } from '../usage-rules/usage-rules.service';
import { GhostSeatRuleRunBusyError } from './board.errors';
import { toRuleRunWire } from './board.mapper';

export type RuleRunRequestSet = 'G1G2' | 'G3G4';

const RULE_SET_OF: Record<RuleRunRequestSet, RuleSetCode> = { G1G2: 'G1_G2', G3G4: 'G3_G4' };

/**
 * A run of the rules of wasted seats asked for by hand by the IT Admin or the Super Admin (`FR-4.12b`; AF-01: a demo cannot wait for
 * the hourly tick nor the ISO week). It runs the very services the schedule runs (`InternalRulesService`, `UsageRulesService`), under
 * the same advisory lock, on a key of its own so a period already run does not stop it; a recommendation is never made twice because an
 * open one is unique per subscription (`G1`) or seat chain (`G2`-`G4`) and the rules update it instead. Each run is audited
 * (`GHOST_SEAT.RULE_RUN_REQUESTED`) with who asked and what it counted. It changes no seat (`SoD-6`).
 */
@Injectable()
export class BoardRuleRunService {
  constructor(
    private readonly internalRules: InternalRulesService,
    private readonly usageRules: UsageRulesService,
    private readonly queries: RuleRunQueryService,
    private readonly runner: TransactionRunner,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Runs `G1`/`G2` then `G3`/`G4` (or the one named), each to its end. Throws GhostSeatRuleRunBusyError when a run of a set is under way;
   * a set run before it in the same call stays run and is named in the error.
   */
  async runNow(actor: AuthenticatedPrincipal, rules: readonly RuleRunRequestSet[] = ['G1G2', 'G3G4']) {
    const sets = (['G1G2', 'G3G4'] as const).filter((set) => rules.includes(set));
    const done: RuleRunRecord[] = [];
    for (const set of sets) {
      const now = new Date();
      const run = set === 'G1G2' ? await this.internalRules.runNow(now) : await this.usageRules.runNow(now);
      if (!run) {
        throw new GhostSeatRuleRunBusyError(
          RULE_SET_OF[set],
          done.map((one) => one.id),
        );
      }
      done.push(run);
    }
    const runs = [];
    for (const run of done) {
      const skippedByGate = skippedByGateOf(await this.queries.skipCountsOf(run.id));
      await this.runner.run((tx) =>
        this.audit.record(tx, {
          organizationId: run.organizationId,
          actorKind: 'USER',
          actorAppUserId: actor.appUserId,
          actorRoles: actor.roles,
          action: 'GHOST_SEAT.RULE_RUN_REQUESTED',
          resourceType: 'GHOST_SEAT_RULE_RUN',
          resourceId: run.id,
          before: null,
          after: {
            ruleSet: run.ruleSet,
            periodKey: run.periodKey,
            status: run.status,
            createdCount: run.createdCount,
            updatedCount: run.updatedCount,
            closedCount: run.closedCount,
            skippedCount: run.skippedCount,
            failedCount: run.failedCount,
          },
          correlationId: actor.sessionId,
        }),
      );
      runs.push({ ...toRuleRunWire(run), skippedByGate });
    }

    return { runs };
  }
}

/** The counts by gate as a list in a stable order (the gate's name). */
function skippedByGateOf(counts: Partial<Record<SkipGate, number>>): { gate: SkipGate; count: number }[] {
  return (Object.entries(counts) as [SkipGate, number][])
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([gate, count]) => ({ gate, count }));
}
