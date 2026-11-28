import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CredentialSessionService } from '../credential/session/credential-session.service';
import { InitialRecordQueryService } from '../initial-record/initial-record-query.service';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RegistrationEndService } from '../registry/registration-end.service';
import { RegistryQueryRepo } from '../registry/registry-query.repo';
import { RegistryRepo } from '../registry/registry.repo';
import { returnDueOn as computeReturnDueOn } from '../return-task/device-return-task.policy';
import { DeviceReturnTaskRepo } from '../return-task/device-return-task.repo';
import { DeviceReturnTaskService } from '../return-task/device-return-task.service';
import type {
  CancelReturnTasksOfCaseInput,
  DeviceCollectionState,
  DeviceInitialRecordProgress,
  DeviceIntakeContext,
  EndedRegistrations,
  EndRegistrationsOfHolderInput,
  MoveReturnTaskDueInput,
  OpenReturnTasksForDepartureInput,
  ReturnDueFacts,
  ReturnTaskCounts,
  ReturnTaskCountScope,
} from './devices.types';

/**
 * What other modules ask of the register of company machines: end the registrations of a person who left, manage
 * offboarding return tasks, and read whether a machine is in the register and who held it. Nothing of how the
 * register keeps it.
 */
@Injectable()
export class DevicesApi {
  constructor(
    private readonly ending: RegistrationEndService,
    private readonly repo: RegistryRepo,
    private readonly sessions: CredentialSessionService,
    private readonly queries: RegistryQueryRepo,
    private readonly returnTasks: DeviceReturnTaskService,
    private readonly returnTaskRepo: DeviceReturnTaskRepo,
    private readonly initialRecordQueries: InitialRecordQueryService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  initialRecordProgress(tx?: DbTx): Promise<DeviceInitialRecordProgress> {
    return this.initialRecordQueries.progress(tx);
  }

  returnDueOn(facts: ReturnDueFacts): BusinessDate {
    return computeReturnDueOn(facts);
  }

  openReturnTasksForDeparture(tx: DbTx, input: OpenReturnTasksForDepartureInput): Promise<{ taskIds: string[] }> {
    return this.returnTasks.openForDeparture(tx, input);
  }

  moveReturnTaskDue(tx: DbTx, input: MoveReturnTaskDueInput): Promise<{ updatedIds: string[] }> {
    return this.returnTasks.moveDue(tx, input);
  }

  cancelReturnTasksOfCase(tx: DbTx, input: CancelReturnTasksOfCaseInput): Promise<{ cancelledIds: string[] }> {
    return this.returnTasks.cancelOfCase(tx, input);
  }

  async countReturnTasks(scope: ReturnTaskCountScope, today: BusinessDate, tx?: DbTx): Promise<ReturnTaskCounts> {
    const includeTaskIds =
      scope.includeTaskIds ??
      (await this.organizationReads.findActiveUnplacedWorkIdsForDesignee(
        scope.excludeEmployeeId,
        'DEVICE_RETURN_TASK',
        tx,
      ));

    return this.returnTaskRepo.countForScope({ ...scope, includeTaskIds }, today, tx);
  }

  /**
   * Ends every open registration of a person in the transaction of the caller, as the system; asking again changes nothing
   * (`US-09-08`). The machines are locked before the registrations, the order a holder change takes them.
   */
  async endRegistrationsOfHolder(tx: DbTx, input: EndRegistrationsOfHolderInput): Promise<EndedRegistrations> {
    return {
      registrationIds: await this.ending.endForHolder(tx, {
        employeeId: input.employeeId,
        at: input.end.at,
        cause: input.cause,
      }),
    };
  }

  /** How many machines of the organization are in this state: the total `GET /devices?state=` answers (`US-09-01` AC-2 counts `AWAITING_ACKNOWLEDGEMENT`). */
  countByCollectionState(organizationId: string, state: DeviceCollectionState): Promise<number> {
    return this.queries.countByState(organizationId, state);
  }

  /** Whether the machine is in the register, retired or not. */
  deviceExists(deviceId: string, tx?: DbTx): Promise<boolean> {
    return this.repo.deviceExists(deviceId, tx);
  }

  /**
   * Every registration of the machine this person has held, the ended ones too (`FR-10.1`), oldest first; empty when they never
   * held it.
   */
  holderRegistrationIds(deviceId: string, employeeId: string, tx?: DbTx): Promise<readonly string[]> {
    return this.repo.registrationIdsHeldBy(deviceId, employeeId, tx);
  }

  /**
   * Every registration of the machine, the ended ones too, with the person who held it, oldest first; empty when the machine has none or does
   * not exist (ask `deviceExists` to tell them apart). The IT Admin reads the days of the registrations of the people of their departments only.
   */
  registrationsOfDevice(deviceId: string, tx?: DbTx): Promise<ReadonlyArray<{ id: string; holderEmployeeId: string }>> {
    return this.repo.registrationsOfDevice(deviceId, tx);
  }

  /**
   * Who held each of these registrations and from which day to which (the end day is exclusive; null while open): the days of usage a collector
   * sent are tied to the person who held the machine on that day. A registration that does not exist is absent.
   */
  registrationHolders(
    registrationIds: readonly string[],
    tx?: DbTx,
  ): Promise<Array<{ registrationId: string; employeeId: string; validFrom: Date; validUntil: Date | null }>> {
    return this.repo.holdersOf(registrationIds, tx);
  }

  /**
   * What a decision on data needs of the machine behind a credential — its state, the window of data accepted, whether the status of
   * tools is acknowledged, and the zone the days are told in — with its registration locked `FOR SHARE` until the caller's
   * transaction ends. Throws DeviceCredentialRevokedError when the credential was revoked or its registration ended since the guard.
   */
  getIntakeContext(tx: DbTx, credentialId: string): Promise<DeviceIntakeContext> {
    return this.sessions.intakeContext(tx, credentialId);
  }

  /** Notes that the server accepted data from this credential at `at` (the latest instant wins); the IT Admin sees it. */
  recordAccepted(tx: DbTx, credentialId: string, at: Date): Promise<void> {
    return this.sessions.recordAccepted(tx, credentialId, at);
  }
}
