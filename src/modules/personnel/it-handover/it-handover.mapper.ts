import type { ItHandoverWire } from './it-handover.dto';
import type { ItHandoverView } from './it-handover.types';

/** The `itHandover` section as the wire gives it. */
export function toItHandoverWire(view: ItHandoverView): ItHandoverWire {
  return {
    state: view.state,
    subscriptions: view.subscriptions,
    applications: view.applications,
    handedOver: view.handedOver && {
      at: view.handedOver.at.toISOString(),
      toItAdminEmployeeId: view.handedOver.toEmployeeId,
      subscriptions: view.handedOver.subscriptions,
      applications: view.handedOver.applications,
    },
  };
}
