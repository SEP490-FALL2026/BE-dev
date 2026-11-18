import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import type { ItHandoverWire } from './it-handover.dto';
import { toItHandoverWire } from './it-handover.mapper';
import { handoverState } from './it-handover.policy';
import { ItHandoverRepo } from './it-handover.repo';
import type { HandoverSource, ItHandoverView } from './it-handover.types';

/**
 * The `itHandover` section of a departure or a transfer (SPEC P3, `R-8`): what the person still answers for in the catalog now, whether the
 * hand-over of all of it is pending or done, and the hand-over when an IT Admin made it. A file for a person who answered for nothing when
 * it was recorded and answers for nothing now has none. Read only, in the transaction of the caller when it has one.
 */
@Injectable()
export class ItHandoverViewService {
  constructor(
    private readonly items: ItHandoverRepo,
    private readonly catalog: CatalogResponsibilityApi,
  ) {}

  async viewOf(source: HandoverSource, employeeId: string, tx?: DbTx): Promise<ItHandoverView | null> {
    const item = await this.items.findItem(source, tx);
    const left = (await this.catalog.countResponsibilitiesOf([employeeId], tx)).get(employeeId) ?? {
      subscriptions: 0,
      applications: 0,
    };
    const remaining = left.subscriptions + left.applications;
    if (!item && remaining === 0) return null;

    return {
      state: handoverState({ remaining }),
      subscriptions: left.subscriptions,
      applications: left.applications,
      handedOver: item?.done ?? null,
    };
  }

  /** The same as the wire gives it. */
  async wireOf(source: HandoverSource, employeeId: string, tx?: DbTx): Promise<ItHandoverWire | null> {
    const view = await this.viewOf(source, employeeId, tx);

    return view && toItHandoverWire(view);
  }
}
