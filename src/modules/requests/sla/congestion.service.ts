import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import { type BusinessDate } from '../../../core/business-date';
import { wallClockAt, workingDaysBetween, type NonWorkingDates } from '../../../core/working-days';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { EmployeeRecord } from '../../organization/public/organization.types';
import { CongestionHolderNotFoundError } from './congestion.errors';
import { CongestionRepo, type IncidentRecord } from './congestion.repo';
import type { CongestionIncidentWire, CongestionRowWire, CongestionStepWire } from './congestion.dto';
import { standingOf, type SlaCalendar, isBacklog } from './step-sla.policy';

interface Paging {
  page: number;
  pageSize: number;
}

const skipOf = (query: Paging): number => (query.page - 1) * query.pageSize;

const personOf = (employee: EmployeeRecord | undefined) =>
  employee ? { employeeId: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName } : null;

/**
 * The board of the Super Admin for steps that wait too long (`US-05-10` AC-2 to AC-4): how many steps wait on each person, how
 * many were reminded, how old the oldest is, and the incident the Super Admin records about one of them. The Super Admin sees and
 * writes down; nothing here moves a step, takes one over or decides it (`SoD-1`). A page is a fixed number of statements however
 * many rows it has.
 */
@Injectable()
export class CongestionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly congestion: CongestionRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
    private readonly audit: AuditApi,
  ) {}

  async board(query: Paging, now: Date = new Date()): Promise<Page<CongestionRowWire>> {
    const { timeZone } = await this.requireOrganization();
    const { rows, total } = await this.congestion.boardPage(skipOf(query), query.pageSize);
    const threshold = Number(await this.parameters.getValueAt('BACKLOG_ALERT_THRESHOLD', now));
    const nonWorking = await this.calendarSince(
      rows.map((row) => row.oldestCreatedAt),
      now,
      timeZone,
    );
    const people = await this.peopleOf(rows.map((row) => row.holderEmployeeId));
    const items = rows.map((row): CongestionRowWire => {
      const holder = row.holderEmployeeId === null ? null : personOf(people.get(row.holderEmployeeId));
      if (row.holderEmployeeId !== null && holder === null) {
        throw new Error(`The steps of ${row.holderEmployeeId} point at a missing person.`);
      }

      return {
        holder,
        openSteps: row.openSteps,
        remindedSteps: row.remindedSteps,
        oldestAgeWorkingDays: ageOf(row.oldestCreatedAt, now, nonWorking, timeZone),
        totalReminders: row.totalReminders,
        lastRemindedOn: row.lastRemindedOn,
        overThreshold: row.holderEmployeeId !== null && isBacklog(row.openSteps, threshold),
      };
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /** The open steps of one holder, or of the steps nobody holds when no holder is named. */
  async steps(
    query: Paging & { holderEmployeeId?: string },
    now: Date = new Date(),
  ): Promise<Page<CongestionStepWire>> {
    const { timeZone } = await this.requireOrganization();
    const { rows, total } = await this.congestion.stepsPage(
      query.holderEmployeeId ?? null,
      skipOf(query),
      query.pageSize,
    );
    const calendar: SlaCalendar = {
      nonWorkingDates: await this.calendarSince(
        rows.map((row) => row.createdAt),
        now,
        timeZone,
      ),
      timeZone,
    };
    const items = rows.map((row): CongestionStepWire => {
      const standing = standingOf(row, now, calendar);

      return {
        requestId: row.requestId,
        stepId: row.stepId,
        stepKind: row.kind,
        state: row.state,
        createdAt: row.createdAt.toISOString(),
        dueAt: standing.dueAt.toISOString(),
        ageWorkingDays: standing.ageWorkingDays,
        reminders: row.reminders,
        lastRemindedOn: row.lastRemindedOn,
      };
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /**
   * Writes the incident down with how many steps wait on the person and how old the oldest is at this moment. It changes no step and
   * decides nothing. Throws CongestionHolderNotFoundError when the person is not an employee of the organization.
   */
  async recordIncident(
    actor: AuthenticatedPrincipal,
    input: { holderEmployeeId: string | null; description: string },
    now: Date = new Date(),
  ): Promise<CongestionIncidentWire> {
    const organization = await this.requireOrganization();
    const holder =
      input.holderEmployeeId === null ? null : await this.organizationReads.getEmployee(input.holderEmployeeId);
    if (input.holderEmployeeId !== null && holder === null) throw new CongestionHolderNotFoundError();

    const record = await this.runner.run(async (tx) => {
      const snapshot = await this.congestion.snapshotOf(tx, input.holderEmployeeId);
      const nonWorking = await this.calendarSince(
        snapshot.oldestCreatedAt ? [snapshot.oldestCreatedAt] : [],
        now,
        organization.timeZone,
      );
      const oldestAgeWorkingDays = snapshot.oldestCreatedAt
        ? ageOf(snapshot.oldestCreatedAt, now, nonWorking, organization.timeZone)
        : 0;
      const incident = await this.congestion.insertIncident(tx, {
        organizationId: organization.id,
        holderEmployeeId: input.holderEmployeeId,
        description: input.description,
        openSteps: snapshot.openSteps,
        oldestAgeWorkingDays,
        recordedByAppUserId: actor.appUserId,
      });
      await this.audit.record(tx, {
        organizationId: organization.id,
        actorKind: 'USER',
        actorAppUserId: actor.appUserId,
        actorRoles: actor.roles,
        action: 'STEP_CONGESTION.INCIDENT_RECORDED',
        resourceType: 'CONGESTION_INCIDENT',
        resourceId: incident.id,
        before: null,
        after: {
          holderEmployeeId: input.holderEmployeeId,
          openSteps: incident.openSteps,
          oldestAgeWorkingDays: incident.oldestAgeWorkingDays,
        },
        correlationId: actor.sessionId,
      });

      return incident;
    });

    return this.incidentWire(record, holder ? new Map([[holder.id, holder]]) : new Map<string, EmployeeRecord>());
  }

  async incidents(query: Paging): Promise<Page<CongestionIncidentWire>> {
    const { rows, total } = await this.congestion.incidentsPage(skipOf(query), query.pageSize);
    const people = await this.peopleOf(rows.map((row) => row.holderEmployeeId));

    return pageOf(
      rows.map((row) => this.incidentWire(row, people)),
      total,
      query.page,
      query.pageSize,
    );
  }

  private incidentWire(row: IncidentRecord, people: Map<string, EmployeeRecord>): CongestionIncidentWire {
    return {
      id: row.id,
      holder: row.holderEmployeeId === null ? null : personOf(people.get(row.holderEmployeeId)),
      description: row.description,
      openSteps: row.openSteps,
      oldestAgeWorkingDays: row.oldestAgeWorkingDays,
      recordedAt: row.recordedAt.toISOString(),
    };
  }

  private async peopleOf(ids: readonly (string | null)[]): Promise<Map<string, EmployeeRecord>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();

    return new Map((await this.organizationReads.getEmployees(wanted)).map((employee) => [employee.id, employee]));
  }

  /** The days nobody works from the day the oldest of these began to today. */
  private async calendarSince(began: readonly Date[], now: Date, timeZone: string): Promise<NonWorkingDates> {
    if (began.length === 0) return new Set();
    const today: BusinessDate = wallClockAt(now, timeZone).date;
    const oldest = began.reduce((first, at) => (at < first ? at : first), began[0]);
    const from = wallClockAt(oldest, timeZone).date;

    return this.parameters.getNonWorkingDates(from < today ? from : today, today);
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The congestion board was used before installation');

    return organization;
  }
}

/** Working days lived through since `began`, up to and including today. */
function ageOf(began: Date, now: Date, nonWorkingDates: NonWorkingDates, timeZone: string): number {
  return workingDaysBetween(wallClockAt(began, timeZone).date, wallClockAt(now, timeZone).date, nonWorkingDates);
}
