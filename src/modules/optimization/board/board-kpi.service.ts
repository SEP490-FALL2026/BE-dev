import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { GhostSeatGroup } from '../ghost-seat/ghost-seat.types';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import { kpi5Of } from '../ghost-seat/ghost-seat-state.policy';
import { GhostSeatPeriodInvalidError } from './board.errors';
import { confidenceLabelOf, isValidKpi5Period } from './board.policy';

/** The instant a business day begins (`TẠM CHỌN`: the day is read in UTC, so the edges of a period move by the offset of the calendar). */
const startOf = (day: BusinessDate): Date => new Date(`${day}T00:00:00.000Z`);

/**
 * `KPI-5` (`FR-0.3`, `DA6-39`): the share of recommendations made in a period that were right, among those the IT Admin was asked to
 * look at, cut by group and by confidence label (`QĐ-35b`). The Super Admin reads it; what counts as _right_ is the policy of the state.
 * Throws GhostSeatPeriodInvalidError.
 */
@Injectable()
export class BoardKpiService {
  constructor(
    private readonly repo: GhostSeatRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async kpi5(from: BusinessDate, to: BusinessDate) {
    if (!isValidKpi5Period(from, to)) throw new GhostSeatPeriodInvalidError();
    const organization = await this.organizationReads.getOrganization();
    const rows = organization
      ? await this.repo.madeBetween(organization.id, startOf(from), startOf(addDays(to, 1)))
      : [];
    const { byGroup, ...total } = kpi5Of(rows);
    const of = (group: GhostSeatGroup) => ({
      confidenceLabel: confidenceLabelOf(group),
      ...(byGroup[group] ?? { denominator: 0, numerator: 0, ratePercent: null }),
    });

    return { from, to, ...total, byGroup: { G1: of('G1'), G2: of('G2'), G3: of('G3'), G4: of('G4') } };
  }
}
