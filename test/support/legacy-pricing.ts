/**
 * The pricing model of a plan follows its kind of provisioning (`B-5`): a request that names another one is refused. A suite that needs a plan the way
 * older releases made it (a K1 plan priced flat, a K4 plan priced per seat) makes it with the model the kind implies and writes the old model to the row,
 * as the data of an installation older than the rule has it. No assertion lives here.
 */
export function impliedPricing(type: string): 'PER_SEAT' | null {
  return type === 'K1' || type === 'K2' ? 'PER_SEAT' : null;
}

/** The pricing field a body of a new plan may carry: the model when it is the one the kind implies, nothing otherwise. */
export function pricingOfBody(type: string, pricing: string | undefined): { pricingModel?: string } {
  return pricing !== undefined && pricing === impliedPricing(type) ? { pricingModel: pricing } : {};
}

interface SqlRunner {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
}

/** Writes the older model to the row of a plan when it is not the one its kind implies. */
export async function writeLegacyPricing(
  sql: SqlRunner,
  planId: string,
  type: string,
  pricing: string | undefined,
): Promise<void> {
  if (type === 'K5' || pricing === undefined || pricing === impliedPricing(type)) return;
  await sql.query(`UPDATE plans SET pricing_model = $2::"PricingModel" WHERE id = $1`, [planId, pricing]);
}
