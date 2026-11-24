import { Injectable } from '@nestjs/common';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import type { AssetDeviceType } from '../asset-code/asset-code.policy';
import type { CollectionState } from '../devices-collection-state.policy';
import type { DeviceCondition } from '../devices-custody.policy';
import { DeviceNotFoundError } from '../public/devices.errors';
import { OPEN_RETURN_TASK_ACTING_IT_ADMINS_MAX } from './registry.dto';
import { RegistryQueryRepo, type DeviceExtras } from './registry-query.repo';
import {
  toDeviceDetail,
  toDeviceRegistration,
  toDeviceSummary,
  type DepartmentBriefView,
  type HolderBrief,
  type OpenReturnTaskDetailView,
} from './registry.mapper';

export interface DeviceListInput {
  page: number;
  pageSize: number;
  search?: string | undefined;
  holderEmployeeId?: string | undefined;
  state?: CollectionState | undefined;
  custody?: 'IN_STOCK' | 'ASSIGNED' | 'AWAITING_RETURN' | 'RETIRED' | undefined;
  condition?: DeviceCondition | undefined;
  deviceType?: AssetDeviceType | undefined;
  signatureMissing?: boolean | undefined;
}

/** What the IT Admin reads of the register: a page of machines and the detail of one. */
@Injectable()
export class RegistryQueryService {
  constructor(
    private readonly queries: RegistryQueryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  async list(input: DeviceListInput, now: Date = new Date()) {
    const organization = await this.requireOrganization();
    const { rows, total } = await this.queries.page(
      {
        organizationId: organization.id,
        search: input.search,
        holderEmployeeId: input.holderEmployeeId,
        state: input.state,
        custody: input.custody,
        condition: input.condition,
        deviceType: input.deviceType,
        signatureMissing: input.signatureMissing,
      },
      (input.page - 1) * input.pageSize,
      input.pageSize,
    );
    const holderIds = rows.map((row) => row.holderEmployeeId);
    const holders = await this.holdersOf(holderIds);
    const departments = await this.departmentsOf(holderIds, now);

    return {
      items: rows.map((row) => toDeviceSummary(row, holders, departments)),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }

  /** The registrations of a machine, the newest first: who held it, for which days and how each ended. Throws DeviceNotFoundError. */
  async registrations(deviceId: string, input: { page: number; pageSize: number }) {
    const organization = await this.requireOrganization();
    const found = await this.queries.registrationsPage(
      organization.id,
      deviceId,
      (input.page - 1) * input.pageSize,
      input.pageSize,
    );
    if (!found) throw new DeviceNotFoundError();
    const holders = await this.holdersOf(found.rows.map((row) => row.holderEmployeeId));

    return {
      items: found.rows.map((row) => toDeviceRegistration(row, holders)),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: found.total,
        totalPages: Math.ceil(found.total / input.pageSize),
      },
    };
  }

  /** Throws DeviceNotFoundError. */
  async get(id: string, now: Date = new Date()) {
    const organization = await this.requireOrganization();
    const row = await this.queries.one(organization.id, id);
    if (!row) throw new DeviceNotFoundError();
    const extras = await this.queries.extras(id, row.registrationId);
    const actingIds = await this.resolveOpenTaskActorIds(extras.openReturnTask);
    const holders = await this.holdersOf([
      row.holderEmployeeId,
      extras.lastEnd?.holderEmployeeId ?? null,
      ...actingIds,
    ]);
    const departments = await this.departmentsOf([row.holderEmployeeId], now);
    const openReturnTask: OpenReturnTaskDetailView | null = extras.openReturnTask
      ? {
          id: extras.openReturnTask.id,
          dueOn: extras.openReturnTask.dueOn,
          departmentId: extras.openReturnTask.departmentId,
          actingItAdmins: actingIds.map((actorId) => ({
            id: actorId,
            fullName: holders.get(actorId)?.fullName ?? '',
          })),
          waiting: actingIds.length === 0,
        }
      : null;

    return toDeviceDetail(row, extras, holders, departments, openReturnTask);
  }

  private async resolveOpenTaskActorIds(openTask: DeviceExtras['openReturnTask']): Promise<string[]> {
    if (!openTask) return [];
    if (!openTask.departmentId) {
      const resolved = await this.organizationReads.itAdminsActingForUnplacedWork(
        [{ workKind: 'DEVICE_RETURN_TASK', workId: openTask.id, employeeId: openTask.employeeId }],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids),
      );
      const designee = resolved.get(unplacedWorkKey('DEVICE_RETURN_TASK', openTask.id)) ?? null;

      return designee && designee !== openTask.employeeId ? [designee] : [];
    }
    const map = await this.organizationReads.itAdminsActingFor([openTask.departmentId], (ids) =>
      this.identity.findUsableItAdminEmployeeIds(ids),
    );
    const acting = map.get(openTask.departmentId);
    if (!acting) return [];

    return acting.actors
      .filter((actorId) => actorId !== openTask.employeeId)
      .slice(0, OPEN_RETURN_TASK_ACTING_IT_ADMINS_MAX);
  }

  /** Resolves the current owning department of each holder in two batch queries. */
  private async departmentsOf(ids: readonly (string | null)[], now: Date): Promise<Map<string, DepartmentBriefView>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();
    const today = await this.organizationReads.businessToday(now);
    const units = await this.organizationReads.getOwningUnits(wanted, today);
    const departmentIds = [...new Set([...units.values()].map((unit) => unit.departmentId))];
    if (departmentIds.length === 0) return new Map();
    const briefs = await this.organizationReads.getDepartmentBriefs(departmentIds);
    const byDepartmentId = new Map(briefs.map((brief) => [brief.id, { id: brief.id, name: brief.name }]));
    const result = new Map<string, DepartmentBriefView>();
    for (const [employeeId, unit] of units) {
      const dept = byDepartmentId.get(unit.departmentId);
      if (dept) result.set(employeeId, dept);
    }

    return result;
  }

  /** The people named on a page, read in one go whatever the number of rows. */
  private async holdersOf(ids: readonly (string | null)[]): Promise<Map<string, HolderBrief>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    const employees = wanted.length > 0 ? await this.organizationReads.getEmployees(wanted) : [];

    return new Map(
      employees.map((employee) => [
        employee.id,
        { id: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName },
      ]),
    );
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was read before installation');

    return organization;
  }
}
