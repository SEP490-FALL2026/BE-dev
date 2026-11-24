import { SubscriptionResponsibleNotItAdminError } from '../subscription.errors';

/**
 * What naming an IT Admin to answer for a subscription does (`QĐ-118f`, `QĐ-118l`): the one named must be an IT Admin who works now, judged
 * first; naming the one who already answers changes nothing. Throws SubscriptionResponsibleNotItAdminError.
 */
export function judgeResponsibleChange(input: {
  currentEmployeeId: string | null;
  toEmployeeId: string;
  toIsUsableItAdmin: boolean;
}): 'CHANGE' | 'UNCHANGED' {
  if (!input.toIsUsableItAdmin) throw new SubscriptionResponsibleNotItAdminError();

  return input.currentEmployeeId === input.toEmployeeId ? 'UNCHANGED' : 'CHANGE';
}
