import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../core/business-date';
import { DevicesApi } from '../../devices/public/devices.api';
import { LicensingUsageApi } from '../../licensing/public/licensing-usage.api';
import { UsageOverviewRepo, type SeriesFilter } from './usage-overview.repo';
import type { ScopedPerson } from './usage-overview-scope.service';
import type { UsageRange } from './usage-overview.types';

/**
 * What ties the days of the usage to the people read: who held the machines a collector sent days for, and which software each department's
 * people hold a seat of. Both come through the facades of the devices and of the licensing, each in one read for all the people at once.
 */
@Injectable()
export class UsageOverviewPeopleService {
  constructor(
    private readonly repo: UsageOverviewRepo,
    private readonly devices: DevicesApi,
    private readonly licensing: LicensingUsageApi,
  ) {}

  /** Who held each machine a collector sent days for in the range (of one application when given), among the people read. */
  async holdersAmong(
    people: readonly ScopedPerson[],
    range: UsageRange,
    applicationId?: string,
  ): Promise<SeriesFilter['holders']> {
    const read = new Set(people.map((person) => person.employeeId));
    const holders = await this.devices.registrationHolders(
      await this.repo.collectorRegistrations(range, applicationId),
    );

    return holders
      .filter((holder) => read.has(holder.employeeId))
      .map((holder) => ({
        registrationId: holder.registrationId,
        employeeId: holder.employeeId,
        validFrom: fromDateColumn(holder.validFrom),
        validUntil: holder.validUntil ? fromDateColumn(holder.validUntil) : null,
      }));
  }

  /** The software each department's people hold a seat of that can be used in the range: where there may be nothing to read yet. */
  async entitledOf(
    people: readonly ScopedPerson[],
    range: UsageRange,
    applicationId?: string,
  ): Promise<SeriesFilter['entitled']> {
    const departmentOf = new Map(people.map((person) => [person.employeeId, person.departmentId]));
    const intervals = await this.licensing.listAssignmentIntervals({
      employeeIds: [...departmentOf.keys()],
      from: range.from,
      to: range.effectiveTo,
      ...(applicationId ? { applicationId } : {}),
    });
    const pairs = new Map<string, { departmentId: string; applicationId: string }>();
    for (const interval of intervals) {
      const departmentId = departmentOf.get(interval.employeeId);
      if (!departmentId || interval.usableOn === null || interval.usableOn > range.effectiveTo) continue;
      pairs.set(`${departmentId}|${interval.applicationId}`, { departmentId, applicationId: interval.applicationId });
    }

    return [...pairs.values()];
  }
}
