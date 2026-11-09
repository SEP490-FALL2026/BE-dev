import { Injectable } from '@nestjs/common';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { CollectionState } from '../devices-collection-state.policy';
import { DeviceNotFoundError } from '../public/devices.errors';
import { RegistryQueryRepo } from './registry-query.repo';
import { toDeviceDetail, toDeviceSummary, type HolderBrief } from './registry.mapper';

export interface DeviceListInput {
  page: number;
  pageSize: number;
  search?: string | undefined;
  holderEmployeeId?: string | undefined;
  state?: CollectionState | undefined;
}

/** What the IT Admin reads of the register: a page of machines and the detail of one. */
@Injectable()
export class RegistryQueryService {
  constructor(
    private readonly queries: RegistryQueryRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async list(input: DeviceListInput) {
    const organization = await this.requireOrganization();
    const { rows, total } = await this.queries.page(
      {
        organizationId: organization.id,
        search: input.search,
        holderEmployeeId: input.holderEmployeeId,
        state: input.state,
      },
      (input.page - 1) * input.pageSize,
      input.pageSize,
    );
    const holders = await this.holdersOf(rows.map((row) => row.holderEmployeeId));

    return {
      items: rows.map((row) => toDeviceSummary(row, holders)),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }

  /** Throws DeviceNotFoundError. */
  async get(id: string) {
    const organization = await this.requireOrganization();
    const row = await this.queries.one(organization.id, id);
    if (!row) throw new DeviceNotFoundError();
    const extras = await this.queries.extras(id, row.registrationId);
    const holders = await this.holdersOf([row.holderEmployeeId, extras.lastEnd?.holderEmployeeId ?? null]);

    return toDeviceDetail(row, extras, holders);
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
