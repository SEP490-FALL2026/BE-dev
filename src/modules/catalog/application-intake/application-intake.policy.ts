import type { ApplicationKind } from '../catalog-entry/application.types';
import type { ProvisioningType } from '../plan/plan.types';

/**
 * The kind of an application declared in one command, from the kind of provisioning of its plan (`QĐ-111d`): software the company built
 * is granted by hand (K5) and is `INTERNAL`; any other is `SAAS`. Nobody is asked whether it is SaaS or licensed; the stock of what a
 * licence is bought for is the plan's, not the application's.
 */
export function applicationKindOf(type: ProvisioningType): ApplicationKind {
  return type === 'K5' ? 'INTERNAL' : 'SAAS';
}
