import { Injectable } from '@nestjs/common';
import { DevicesApi } from '../../devices/public/devices.api';
import { OptimizationApi } from '../../optimization/public/optimization.api';
import { RequestsDashboardApi } from '../../requests/public/requests-dashboard.api';
import { UsageEvidenceApi } from '../../usage/public/usage-evidence.api';
import { UsageOutOfProcessApi } from '../../usage/public/usage-out-of-process.api';

/** The counts of the overview of an IT Admin that each come from the facade of one other module and need no rule of the overview. */
export interface ItAdminDashboardFacts {
  /** The recommendations of wasted seats not closed: the `G2` not closed plus the `G1` open. */
  wastedSeats: number;
  /** The open findings of people active in a vendor with no seat to cover the day. */
  withoutSeat: number;
  /** The company machines whose holder has not acknowledged the monitoring notice; 0 before the installation. */
  unconfirmedDevices: number;
  /** The periods of a right paid by the month or the year whose invoice is five working days late, in the departments in scope (`PI-2`). */
  missingInvoicePeriods: number;
  /** The open cases outside the process on a company asset whose revocation is due now: nobody to wait for, or the ten working days passed (`US-13-05` AC-23). */
  outOfProcessRevocationsDue: number;
}

/**
 * Reads the counts of the overview of an IT Admin that are one call to another module each (`US-12-15` AC-4): the recommendations of wasted
 * seats, the findings of the vendor usage import, the machines to confirm and the periods that have no invoice. The overview keeps what it
 * decides itself (the scope, the sections, the calendar); this only gathers what the facades answer, so the overview does not take a ninth
 * dependency for every count.
 */
@Injectable()
export class ItAdminDashboardFactsService {
  constructor(
    private readonly optimization: OptimizationApi,
    private readonly usage: UsageEvidenceApi,
    private readonly devices: DevicesApi,
    private readonly requests: RequestsDashboardApi,
    private readonly outOfProcess: UsageOutOfProcessApi,
  ) {}

  /** `organizationId` is null before the installation. */
  async read(input: {
    organizationId: string | null;
    departmentIds: readonly string[];
  }): Promise<ItAdminDashboardFacts> {
    const wastedSeats = await this.optimization.getSummary();
    const withoutSeat = await this.usage.openFindingCount();
    // US-09-01 AC-2: the machines whose holder has not acknowledged the notice, the same number `GET /devices?state=AWAITING_ACKNOWLEDGEMENT` lists.
    const unconfirmedDevices = input.organizationId
      ? await this.devices.countByCollectionState(input.organizationId, 'AWAITING_ACKNOWLEDGEMENT')
      : 0;
    const missingInvoicePeriods = await this.requests.missingInvoicePeriods(input.departmentIds);

    const outOfProcessRevocationsDue = await this.outOfProcess.revocationsDue();

    return {
      wastedSeats: wastedSeats.counted,
      withoutSeat,
      unconfirmedDevices,
      missingInvoicePeriods,
      outOfProcessRevocationsDue,
    };
  }
}
