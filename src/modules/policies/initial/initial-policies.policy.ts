import type { InitialPolicy } from './initial-policies.types';
import { POL_GEN } from './pol-gen.types';
import { POL_MF1 } from './pol-mf1.types';
import { POL_MF2 } from './pol-mf2.types';
import { POL_MF3 } from './pol-mf3.types';
import { POL_MF4 } from './pol-mf4.types';
import { POL_MF5 } from './pol-mf5.types';
import { POL_SAAS } from './pol-saas.types';
import { POL_USAGE } from './pol-usage.types';

/**
 * The fixed set of eight policies (`QĐ-112b`, R-42: the Super Admin publishes new versions of these and never makes or deletes one). Each
 * carries the steps whose decision asks a checklist (`QĐ-111ap`): seven steps in all, every one in the policy of its flow.
 */
export const INITIAL_POLICIES: readonly InitialPolicy[] = [
  POL_GEN,
  POL_MF1,
  POL_MF2,
  POL_MF3,
  POL_MF4,
  POL_MF5,
  POL_USAGE,
  POL_SAAS,
];

/**
 * The ground of the issue of version one on a real installation: the set is the template of the product, and the company publishes version
 * two with its own decision. The demo dataset writes its own ground when it installs the set.
 */
export const INITIAL_CHANGE_NOTE = 'Bộ mẫu SaaS-Sentry v1.9 — công ty xuất bản phiên bản 2 kèm quyết định của mình';
