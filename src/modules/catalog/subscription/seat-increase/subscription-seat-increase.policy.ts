import type { ProvisioningType } from '../subscription.types';

/**
 * Whether the seats bought of a subscription rose in a way the IT Admin who answers for it is told of (`QĐ-110v`, `S-4`): only the shared pool of a
 * `K2` or `K4` plan, and only a rise from a known number. A `K1` purchase buys one seat for one person each time and has no pool to count, so it
 * is never told; a fall, no change, or a quantity that was not known before is not a rise.
 */
export function seatIncreaseNoticeOwed(input: {
  planProvisioningType: ProvisioningType;
  from: number | null;
  to: number | null;
}): boolean {
  const pooled = input.planProvisioningType === 'K2' || input.planProvisioningType === 'K4';

  return pooled && input.from !== null && input.to !== null && input.to > input.from;
}

/**
 * Who is told of a rise (`QĐ-110v`, SPEC P24): the IT Admin who answers for the subscription while they still work as one, unless they are the one who
 * bought the seat; when nobody usable answers for it, every IT Admin who works but the buyer (the common queue). Only a notice, never a step to approve.
 */
export function seatIncreaseRecipients(input: {
  responsible: string | null;
  usable: ReadonlySet<string>;
  actor: string;
}): string[] {
  if (input.responsible !== null && input.usable.has(input.responsible)) {
    return input.responsible === input.actor ? [] : [input.responsible];
  }

  return [...input.usable].filter((employeeId) => employeeId !== input.actor).sort();
}
