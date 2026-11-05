import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { DevicesApi } from '../../devices/public/devices.api';
import type { DeviceIntakeContext } from '../../devices/public/devices.types';
import { AllowlistFactsService } from '../allowlist/allowlist-facts.service';
import {
  DeviceCollectionStoppedError,
  DeviceNotAcknowledgedError,
  DeviceToolStatusNotAcknowledgedError,
} from '../intake-gate/intake-gate.errors';
import { judgeIntakeState, type GateReason } from '../intake-gate/intake-gate.policy';
import { IntakeRejectionRepo, type NewRejection } from '../intake-gate/intake-rejection.repo';
import { evaluateDays, type UsageDayInput } from './ai-usage-day.policy';
import { AiUsageRepo } from './ai-usage.repo';

export interface DayResult {
  date: BusinessDate;
  outcome: 'ACCEPTED' | 'UNCHANGED' | 'REJECTED';
  reasonCode: 'OUTSIDE_WINDOW' | 'NOT_IN_ALLOWLIST' | 'FUTURE_GENERATED_AT' | 'INVALID_COVERAGE' | null;
}

/** The error a gate reason is told to the tool with, once the refusal has been written down. */
export function gateErrorOf(reason: GateReason): Error {
  switch (reason) {
    case 'NOT_ACKNOWLEDGED':
      return new DeviceNotAcknowledgedError();
    case 'COLLECTION_STOPPED':
      return new DeviceCollectionStoppedError();
    default:
      return new DeviceToolStatusNotAcknowledgedError();
  }
}

type Outcome = { blocked: GateReason } | { results: DayResult[] };

/**
 * A weekly batch of the days an AI tool was used on a company machine (`US-09-05`). One transaction: the registration is read and
 * locked `FOR SHARE`, the machine's window decides which days are believed, the allowlist of each day decides which tools, and the
 * accepted days are written in one statement — the build made last wins, so a batch sent again, or an older one arriving late, changes
 * nothing. A refusal is written down and committed before the tool is told.
 */
@Injectable()
export class AiUsageBatchService {
  constructor(
    private readonly devices: DevicesApi,
    private readonly allowlist: AllowlistFactsService,
    private readonly usage: AiUsageRepo,
    private readonly rejections: IntakeRejectionRepo,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws DeviceNotAcknowledgedError and DeviceCollectionStoppedError (each after the refusal is committed) and
   * DeviceCredentialRevokedError.
   */
  async process(
    credentialId: string,
    input: { generatedAt: Date; days: readonly UsageDayInput[] },
    now: Date = new Date(),
  ): Promise<DayResult[]> {
    const outcome = await this.runner.run<Outcome>(async (tx) => {
      const context = await this.devices.getIntakeContext(tx, credentialId);
      const blocked = judgeIntakeState(context, 'AI_USAGE_BATCH');
      if (blocked) {
        await this.rejections.insertMany(tx, [this.rejection(context, blocked, null)]);

        return { blocked };
      }
      const dates = input.days.map((day) => day.date);
      const allowedByDay = await this.allowlist.allowedOn(context.organizationId, dates, context.timeZone, tx);
      const verdicts = evaluateDays({
        generatedAt: input.generatedAt,
        now,
        acceptFromAt: context.acceptFromAt,
        acceptUntilAt: context.acceptUntilAt,
        timeZone: context.timeZone,
        days: input.days,
        allowedOn: (date) => allowedByDay.get(date) ?? new Map(),
      });
      await this.rejections.insertMany(
        tx,
        verdicts
          .filter((verdict) => verdict.reason)
          .map((verdict) => this.rejection(context, verdict.reason as GateReasonOrDay, verdict.date)),
      );
      const changed = await this.usage.upsertDays(
        tx,
        { ...context, generatedAt: input.generatedAt },
        verdicts.flatMap((verdict) => verdict.rows.map((row) => ({ ...row, date: verdict.date }))),
      );
      const results = verdicts.map<DayResult>((verdict) => {
        if (verdict.reason)
          return { date: verdict.date, outcome: 'REJECTED', reasonCode: verdict.reason as DayResult['reasonCode'] };
        const written = verdict.rows.some((row) => changed.has(`${row.tool}|${verdict.date}`));

        return { date: verdict.date, outcome: written ? 'ACCEPTED' : 'UNCHANGED', reasonCode: null };
      });
      if (results.some((result) => result.outcome === 'ACCEPTED'))
        await this.devices.recordAccepted(tx, credentialId, now);

      return { results };
    });
    if ('blocked' in outcome) throw gateErrorOf(outcome.blocked);

    return outcome.results;
  }

  private rejection(
    context: DeviceIntakeContext,
    reasonCode: NewRejection['reasonCode'],
    date: BusinessDate | null,
  ): NewRejection {
    return {
      organizationId: context.organizationId,
      deviceId: context.deviceId,
      registrationId: context.registrationId,
      credentialId: context.credentialId,
      endpoint: 'AI_USAGE_BATCH',
      usageDate: date,
      reasonCode,
    };
  }
}

type GateReasonOrDay = NewRejection['reasonCode'];
