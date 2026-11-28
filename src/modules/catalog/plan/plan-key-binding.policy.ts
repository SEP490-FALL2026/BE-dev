import {
  PlanAdminConsoleNotApplicableError,
  PlanKeyBindingNotApplicableError,
  PlanReferencePriceNotApplicableError,
} from './plan.errors';
import type { KeyBinding, ProvisioningType, ReferencePrice } from './plan.types';

/**
 * The binding a plan has after a declaration or a change. Only a K4 plan, bought once, has one: a plan that says nothing is bound to an account
 * when it is K4 (what every K4 plan was before bindings, and what a plan becoming K4 is, as `hasAdminConsole` follows the kind); it keeps the binding
 * it has while it stays K4; a plan of another kind has none. A binding named for a plan that is not K4 is refused, even in the change that makes it
 * leave K4. `current` is the plan before the change, or null for a declaration. Throws PlanKeyBindingNotApplicableError.
 */
export function keyBindingOf(
  type: ProvisioningType,
  given: KeyBinding | undefined,
  current: { provisioningType: ProvisioningType; keyBinding: KeyBinding | null } | null,
): KeyBinding | null {
  if (type !== 'K4') {
    if (given !== undefined) throw new PlanKeyBindingNotApplicableError();

    return null;
  }
  if (given !== undefined) return given;

  return current !== null && current.provisioningType === 'K4' && current.keyBinding !== null
    ? current.keyBinding
    : 'ACCOUNT';
}

/**
 * A plan bundled with the machine is not bought and has no console the company administers: it has no reference price and no admin console
 * (`plans_device_bundled_shape`). Judged on what the plan becomes, so a change to `DEVICE_BUNDLED` that leaves a price or the console behind is
 * refused and the IT Admin clears them in the same change. Throws PlanReferencePriceNotApplicableError, PlanAdminConsoleNotApplicableError.
 */
export function assertDeviceBundledShape(
  binding: KeyBinding | null,
  referencePrice: ReferencePrice | null,
  hasAdminConsole: boolean,
): void {
  if (binding !== 'DEVICE_BUNDLED') return;
  if (referencePrice !== null) throw new PlanReferencePriceNotApplicableError();
  if (hasAdminConsole) throw new PlanAdminConsoleNotApplicableError();
}
