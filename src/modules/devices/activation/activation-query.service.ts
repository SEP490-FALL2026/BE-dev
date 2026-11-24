import { Injectable } from '@nestjs/common';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RegistryQueryRepo } from '../registry/registry-query.repo';
import type { DeviceActivationListQueryDto } from './activation.dto';
import { toDeviceActivationListItemDto } from './activation.mapper';

/** Lists and batch-enriches machine software activations in constant query count. */
@Injectable()
export class ActivationQueryService {
  constructor(
    private readonly deviceActivations: LicensingDeviceActivationApi,
    private readonly registryQueries: RegistryQueryRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async list(query: DeviceActivationListQueryDto) {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

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
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
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
