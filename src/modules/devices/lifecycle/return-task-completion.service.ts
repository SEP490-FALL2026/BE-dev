import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import type { DeviceCondition } from '../devices-custody.policy';
import { RegistryRepo, type RegistrationRecord } from '../registry/registry.repo';
import {
  DeviceReturnTaskAlreadyClosedError,
  DeviceReturnTaskNotFoundError,
  DeviceReturnTaskOutcomeFieldsInvalidError,
  DeviceReturnTaskSoftwareRemovalNoteRequiredError,
} from '../return-task/device-return-task.errors';
import { judgeReturnTaskCompletion } from '../return-task/device-return-task.policy';
import { DeviceReturnTaskRepo } from '../return-task/device-return-task.repo';
import type { ReturnTaskRecord } from '../return-task/device-return-task.types';
import { DeviceReceiptService } from './device-receipt.service';
import type { SoftwareRemovalInput } from './lifecycle.policy';
import { normalizeSoftwareRemoval, requireReturnTaskActor } from './lifecycle.mapper';
import { RetirementService } from './retirement.service';

export interface ReturnTaskCompletionInput {
  outcome: 'RECEIVED' | 'NOT_RECOVERED';
  condition?: DeviceCondition | undefined;
  conditionNote?: string | undefined;
  softwareRemoval?: SoftwareRemovalInput | undefined;
  reason?: string | undefined;
  activationDecisions?:
    Array<{ activationId: string; licenseRelease: 'RETURN_TO_LOT' | 'LOST_WITH_DEVICE' }> | undefined;
}

/**
 * Completes an open offboarding device return task as either received back into stock or lost (not recovered).
 *
 * Lock order: machine FOR UPDATE (tier 2b), open registration FOR UPDATE, return task FOR UPDATE, then
 * downstream activation close locks when retiring as lost.
 */
@Injectable()
export class ReturnTaskCompletionService {
  constructor(
    private readonly returnTasks: DeviceReturnTaskRepo,
    private readonly registry: RegistryRepo,
    private readonly receipts: DeviceReceiptService,
    private readonly retirements: RetirementService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  async complete(
    actor: AuthenticatedPrincipal,
    taskId: string,
    input: ReturnTaskCompletionInput,
    now: Date = new Date(),
  ): Promise<void> {
    this.assertPayloadValid(input);
    const head = await this.returnTasks.findById(taskId);
    if (!head) throw new DeviceReturnTaskNotFoundError();

    await this.runner.run((tx) => this.completeInTx(tx, actor, head.deviceId, taskId, input, now));
  }

  private async completeInTx(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    deviceId: string,
    taskId: string,
    input: ReturnTaskCompletionInput,
    now: Date,
  ): Promise<void> {
    await this.registry.lockDevice(tx, deviceId);
    const open = await this.registry.lockOpenRegistration(tx, deviceId);
    const task = await this.returnTasks.lockById(tx, taskId);
    if (!task) throw new DeviceReturnTaskNotFoundError();
    if (task.state !== 'OPEN') throw new DeviceReturnTaskAlreadyClosedError();

    const bySubstitute = await requireReturnTaskActor(
      tx,
      { organizationReads: this.organizationReads, identity: this.identity },
      { actorEmployeeId: actor.employeeId, departmentId: task.departmentId, taskEmployeeId: task.employeeId },
    );
    const today = await this.organizationReads.businessToday(now, tx);

    if (input.outcome === 'RECEIVED') {
      await this.completeReceived(tx, actor, task, open, input, now, bySubstitute);
      return;
    }

    await this.completeNotRecovered(tx, actor, task, open, input, today, now, bySubstitute);
  }

  private async completeReceived(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    task: ReturnTaskRecord,
    open: RegistrationRecord | null,
    input: ReturnTaskCompletionInput,
    now: Date,
    bySubstitute: boolean,
  ): Promise<void> {
    const removal = normalizeSoftwareRemoval(input.softwareRemoval!);
    const condition = input.condition!;
    await this.returnTasks.markReceived(tx, task.id, {
      conditionOnReceipt: condition,
      softwareRemoval: removal.outcome,
      softwareRemovalNote: removal.note,
      handledByAppUserId: actor.appUserId,
      handledAt: now,
    });
    await this.receipts.receive(tx, {
      organizationId: task.organizationId,
      actor,
      deviceId: task.deviceId,
      openRegistration: open,
      condition,
      conditionNote: input.conditionNote ?? null,
      softwareRemoval: removal,
      now,
      bySubstitute,
      returnTaskId: task.id,
      recordAudit: true,
    });
    await this.audit.record(
      tx,
      devicesEvent(
        byUser(actor),
        task.organizationId,
        'DEVICE_RETURN_TASK.COMPLETED',
        'DeviceReturnTask',
        task.id,
        null,
        {
          outcome: 'RECEIVED',
          deviceId: task.deviceId,
          condition,
          softwareRemoval: removal,
          ...(bySubstitute ? { bySubstitute: true } : {}),
        },
      ),
    );
  }

  private async completeNotRecovered(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    task: ReturnTaskRecord,
    open: RegistrationRecord | null,
    input: ReturnTaskCompletionInput,
    today: BusinessDate,
    now: Date,
    bySubstitute: boolean,
  ): Promise<void> {
    const reason = input.reason!.trim();
    await this.returnTasks.markNotRecovered(tx, task.id, {
      outcomeNote: reason,
      handledByAppUserId: actor.appUserId,
      handledAt: now,
    });
    await this.retirements.retireInTx(
      tx,
      actor,
      task.organizationId,
      task.deviceId,
      { retirementKind: 'LOST', reason, activationDecisions: input.activationDecisions },
      now,
      { preAuthorized: { open, today, bySubstitute } },
    );
    await this.audit.record(
      tx,
      devicesEvent(
        byUser(actor),
        task.organizationId,
        'DEVICE_RETURN_TASK.COMPLETED',
        'DeviceReturnTask',
        task.id,
        null,
        {
          outcome: 'NOT_RECOVERED',
          deviceId: task.deviceId,
          reason,
          ...(bySubstitute ? { bySubstitute: true } : {}),
        },
      ),
    );
  }

  private assertPayloadValid(input: ReturnTaskCompletionInput): void {
    const verdict = judgeReturnTaskCompletion({
      outcome: input.outcome,
      hasCondition: input.condition !== undefined,
      softwareRemoval: input.softwareRemoval ?? null,
      reason: input.reason ?? null,
      hasActivationDecisions: (input.activationDecisions?.length ?? 0) > 0,
    });
    if (verdict === 'OUTCOME_FIELDS_INVALID') throw new DeviceReturnTaskOutcomeFieldsInvalidError();
    if (verdict === 'SOFTWARE_REMOVAL_NOTE_REQUIRED') throw new DeviceReturnTaskSoftwareRemovalNoteRequiredError();
  }
}
