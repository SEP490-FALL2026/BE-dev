import { Injectable } from '@nestjs/common';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { DeviceNotFoundError } from '../public/devices.errors';
import { RegistryQueryRepo } from '../registry/registry-query.repo';
import type {
  DeviceActivationListQueryDto,
  DeviceHolderSoftwareQueryDto,
  MeDeviceSoftwareQueryDto,
} from './activation.dto';
import {
  toDeviceActivationListItemDto,
  toDeviceHolderSoftwareItemDto,
  toMeDeviceSoftwareItemDto,
} from './activation.mapper';

/** Lists and batch-enriches machine software activations and holder software views in constant query count. */
@Injectable()
export class ActivationQueryService {
  constructor(
    private readonly deviceActivations: LicensingDeviceActivationApi,
    private readonly licensing: LicensingApi,
    private readonly registryQueries: RegistryQueryRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async list(query: DeviceActivationListQueryDto) {
    const organization = await this.requireOrganization();
    const deviceIds = await this.resolveDeviceFilter(organization.id, query);
    const skip = (query.page - 1) * query.pageSize;
    const result = await this.deviceActivations.page(
      {
        organizationId: organization.id,
        deviceIds,
        planId: query.planId,
        licenseKeyId: query.licenseKeyId,
        state: query.state,
        needsKeyReplacement: query.needsKeyReplacement,
      },
      { skip, take: query.pageSize },
    );

    const uniqueDeviceIds = [...new Set(result.items.map((item) => item.deviceId))];
    const uniquePlanIds = [...new Set(result.items.map((item) => item.planId))];
    const [devicesById, planTargets] = await Promise.all([
      this.registryQueries.findDeviceSummariesByIds(uniqueDeviceIds),
      uniquePlanIds.length > 0 ? this.catalog.findPlanSeatTargets(uniquePlanIds) : Promise.resolve([]),
    ]);
    const plansById = new Map(planTargets.map((target) => [target.planId, target]));

    const items = result.items.map((item) => {
      const device = devicesById.get(item.deviceId);
      const plan = plansById.get(item.planId);
      if (!device || !plan) {
        throw new Error(`Missing device or plan summary for activation ${item.id}`);
      }

      return toDeviceActivationListItemDto(item, device, plan);
    });

    return {
      items,
      pagination: paginationOf(query.page, query.pageSize, result.total),
    };
  }

  async holderSoftware(deviceId: string, query: DeviceHolderSoftwareQueryDto) {
    const organization = await this.requireOrganization();
    const device = await this.registryQueries.one(organization.id, deviceId);
    if (!device) throw new DeviceNotFoundError();
    if (!device.holderEmployeeId) {
      return {
        holder: null,
        items: [],
        pagination: paginationOf(query.page, query.pageSize, 0),
      };
    }

    const [today, holder] = await Promise.all([
      this.organizationReads.businessToday(),
      this.organizationReads.getEmployee(device.holderEmployeeId),
    ]);
    if (!holder) throw new Error(`Missing holder employee ${device.holderEmployeeId} for device ${deviceId}`);

    const skip = (query.page - 1) * query.pageSize;
    const held = await this.licensing.pageHeldSoftwareOf(holder.id, today, { skip, take: query.pageSize });

    return {
      holder: {
        id: holder.id,
        employeeCode: holder.employeeCode,
        fullName: holder.fullName,
      },
      items: held.items.map(toDeviceHolderSoftwareItemDto),
      pagination: paginationOf(query.page, query.pageSize, held.total),
    };
  }

  async meDeviceSoftware(employeeId: string, query: MeDeviceSoftwareQueryDto) {
    const organization = await this.requireOrganization();
    const heldDevices = await this.registryQueries.findHeldDevicesByHolder(organization.id, employeeId);
    if (heldDevices.length === 0) {
      return {
        items: [],
        pagination: paginationOf(query.page, query.pageSize, 0),
      };
    }

    const skip = (query.page - 1) * query.pageSize;
    const result = await this.deviceActivations.page(
      {
        organizationId: organization.id,
        deviceIds: heldDevices.map((device) => device.id),
        state: 'OPEN',
      },
      { skip, take: query.pageSize },
    );

    const uniquePlanIds = [...new Set(result.items.map((item) => item.planId))];
    const planTargets = uniquePlanIds.length > 0 ? await this.catalog.findPlanSeatTargets(uniquePlanIds) : [];
    const devicesById = new Map(heldDevices.map((device) => [device.id, device]));
    const plansById = new Map(planTargets.map((target) => [target.planId, target]));

    const items = result.items.map((item) => {
      const device = devicesById.get(item.deviceId);
      const plan = plansById.get(item.planId);
      if (!device || !plan) {
        throw new Error(`Missing device or plan summary for activation ${item.id}`);
      }

      return toMeDeviceSoftwareItemDto(item, device, plan);
    });

    return {
      items,
      pagination: paginationOf(query.page, query.pageSize, result.total),
    };
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

    return organization;
  }

  private async resolveDeviceFilter(
    organizationId: string,
    query: DeviceActivationListQueryDto,
  ): Promise<string[] | undefined> {
    if (query.idleDevice === undefined) {
      return query.deviceId ? [query.deviceId] : undefined;
    }

    return this.registryQueries.findDeviceIdsByIdle(organizationId, query.idleDevice, query.deviceId);
  }
}

function paginationOf(page: number, pageSize: number, totalItems: number) {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}
