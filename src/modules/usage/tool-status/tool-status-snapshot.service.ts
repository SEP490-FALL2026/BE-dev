import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { DevicesApi } from '../../devices/public/devices.api';
import type { DeviceIntakeContext } from '../../devices/public/devices.types';
import { AllowlistFactsService } from '../allowlist/allowlist-facts.service';
import { businessDateAt } from '../../../core/business-date';
import { gateErrorOf } from '../ai-usage/ai-usage-batch.service';
import { judgeIntakeState, type GateReason } from '../intake-gate/intake-gate.policy';
import { IntakeRejectionRepo, type NewRejection } from '../intake-gate/intake-rejection.repo';
import { evaluateSnapshots, type SnapshotInput } from './tool-status.policy';
import { ToolStatusRepo } from './tool-status.repo';

export interface SnapshotResult {
  tool: SnapshotInput['tool'];
  observedAt: Date;
  outcome: 'ACCEPTED' | 'UNCHANGED' | 'REJECTED';
  reasonCode: 'OUTSIDE_WINDOW' | 'NOT_IN_ALLOWLIST' | 'FUTURE_OBSERVED_AT' | 'INVALID_QUOTA' | null;
}

type Outcome = { blocked: GateReason } | { results: SnapshotResult[] };

/**
 * The login and quota of each AI tool as the collector saw them (`US-09-05` AC-13, `US-09-09` AC-10). Accepted only once the holder has
 * acknowledged a notice that names the status of tools; a snapshot is kept once and never changes the counted days.
 */
@Injectable()
export class ToolStatusSnapshotService {
  constructor(
    private readonly devices: DevicesApi,
    private readonly allowlist: AllowlistFactsService,
    private readonly statuses: ToolStatusRepo,
    private readonly rejections: IntakeRejectionRepo,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws the errors of the gate (after the refusal is committed) and DeviceCredentialRevokedError. */
  async process(
    credentialId: string,
    snapshots: readonly SnapshotInput[],
    now: Date = new Date(),
  ): Promise<SnapshotResult[]> {
    const outcome = await this.runner.run<Outcome>(async (tx) => {
      const context = await this.devices.getIntakeContext(tx, credentialId);
      const base = {
        organizationId: context.organizationId,
        deviceId: context.deviceId,
        registrationId: context.registrationId,
        credentialId: context.credentialId,
        endpoint: 'AI_TOOL_STATUS_SNAPSHOT' as const,
        usageDate: null,
      };
      const blocked = judgeIntakeState(context, 'AI_TOOL_STATUS_SNAPSHOT');
      if (blocked) {
        await this.rejections.insertMany(tx, [{ ...base, reasonCode: blocked }]);

        return { blocked };
      }
      return { results: await this.judgeAndKeep(tx, context, base, snapshots, now) };
    });
    if ('blocked' in outcome) throw gateErrorOf(outcome.blocked);

    return outcome.results;
  }

  private async judgeAndKeep(
    tx: Parameters<IntakeRejectionRepo['insertMany']>[0],
    context: DeviceIntakeContext,
    base: Omit<NewRejection, 'reasonCode'>,
    snapshots: readonly SnapshotInput[],
    now: Date,
  ): Promise<SnapshotResult[]> {
    const dates = [...new Set(snapshots.map((snapshot) => businessDateAt(snapshot.observedAt, context.timeZone)))];
    const allowedByDay = await this.allowlist.allowedOn(context.organizationId, dates, context.timeZone, tx);
    const reasons = evaluateSnapshots({
      snapshots,
      now,
      acceptFromAt: context.acceptFromAt,
      acceptUntilAt: context.acceptUntilAt,
      timeZone: context.timeZone,
      allowedOn: (date) => allowedByDay.get(date) ?? new Map(),
    });
    const refused: NewRejection[] = [];
    const results: SnapshotResult[] = [];
    for (const [index, snapshot] of snapshots.entries()) {
      const reason = reasons[index];
      if (reason) {
        refused.push({
          ...base,
          usageDate: businessDateAt(snapshot.observedAt, context.timeZone),
          reasonCode: reason,
        });
        results.push({
          tool: snapshot.tool,
          observedAt: snapshot.observedAt,
          outcome: 'REJECTED',
          reasonCode: reason as SnapshotResult['reasonCode'],
        });
        continue;
      }
      const kept = await this.statuses.insertSnapshot(tx, context, snapshot);
      results.push({
        tool: snapshot.tool,
        observedAt: snapshot.observedAt,
        outcome: kept ? 'ACCEPTED' : 'UNCHANGED',
        reasonCode: null,
      });
    }
    await this.rejections.insertMany(tx, refused);
    if (results.some((result) => result.outcome === 'ACCEPTED'))
      await this.devices.recordAccepted(tx, context.credentialId, now);

    return results;
  }
}
