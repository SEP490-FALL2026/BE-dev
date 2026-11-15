import type { SeatHarness } from './seat-baseline-harness';

/**
 * Makes an owned subscription one of the shared pool (a K2 workspace or a K4 key no department owns). The owner never changes once it is set,
 * so the pool one is made by taking the owner off with the guard of the table lifted for the one statement. No assertion lives here.
 */
export async function takeOwnerOff(h: SeatHarness, subscriptionId: string): Promise<string> {
  await h.ctx.sql.query(`ALTER TABLE subscriptions DISABLE TRIGGER subscriptions_owner_immutable`);
  try {
    await h.ctx.sql.query(`UPDATE subscriptions SET owner_department_id = NULL WHERE id = $1`, [subscriptionId]);
  } finally {
    await h.ctx.sql.query(`ALTER TABLE subscriptions ENABLE TRIGGER subscriptions_owner_immutable`);
  }

  return subscriptionId;
}
