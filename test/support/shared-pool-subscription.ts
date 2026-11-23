import type { SeatHarness } from './seat-baseline-harness';

/**
 * Makes an owned subscription one of the shared pool (a K2 workspace or a K4 key no department owns). A subscription has no owner department any more,
 * so every one is of the pool and this changes nothing; kept so the specs read the same. No assertion lives here.
 */
export function takeOwnerOff(h: SeatHarness, subscriptionId: string): Promise<string> {
  void h;

  return Promise.resolve(subscriptionId);
}
