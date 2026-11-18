import { createActivatedAccount, type ApiAccount } from './api-accounts';
import type { RequestHarness } from './request-harness';

const made = new WeakMap<RequestHarness, ApiAccount>();

/**
 * F12 (spec B): an IT Admin reads and handles the departments they are named in charge of AND the active ones nobody usable is named in
 * charge of. A suite that asserts what lies OUTSIDE the charge of `it1` therefore needs those departments to have a usable IT Admin of
 * their own. This makes a second IT Admin (an account that can act, once per installation) and names them in charge of every active
 * department `it1` is not named in charge of at this moment; a department made afterwards stays as it is made. No assertion lives here.
 */
export async function handOthersToSecondItAdmin(h: RequestHarness): Promise<ApiAccount> {
  let account = made.get(h);
  if (!account) {
    account = await createActivatedAccount(h.ctx, h.seed, {
      code: 'E-IT2',
      email: 'it2@acme.vn',
      role: 'IT_ADMIN',
      admin: h.admin,
    });
    made.set(h, account);
  }
  await h.ctx.sql.query(
    `UPDATE departments SET it_admin_employee_id = $1
      WHERE status = 'ACTIVE' AND it_admin_employee_id IS DISTINCT FROM $2 AND it_admin_employee_id IS DISTINCT FROM $1`,
    [account.employeeId, h.it1.employeeId],
  );

  return account;
}
