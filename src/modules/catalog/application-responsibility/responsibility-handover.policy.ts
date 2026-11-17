export type HandoverRefusal = 'SAME_EMPLOYEE' | 'TARGET_NOT_IT_ADMIN';

/**
 * Whether every subscription and application one IT Admin answers for may go to another (`QĐ-111g`, `R-8`, `R-26`): the one who takes them
 * is somebody else, and an IT Admin who works now (an employee who has not left, holds the role, on an account that can sign in, and whose access
 * a departure has not blocked yet).
 * `null` means it may; the caller judges who may hand over before it asks.
 */
export function handoverRefusal(input: {
  fromEmployeeId: string;
  toEmployeeId: string;
  toIsUsableItAdmin: boolean;
}): HandoverRefusal | null {
  if (input.toEmployeeId === input.fromEmployeeId) return 'SAME_EMPLOYEE';
  if (!input.toIsUsableItAdmin) return 'TARGET_NOT_IT_ADMIN';

  return null;
}
