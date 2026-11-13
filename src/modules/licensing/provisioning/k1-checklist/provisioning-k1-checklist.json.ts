import { z } from 'zod';
import { nullableJsonColumn } from '../../../../infrastructure/database/json-column';
import { K1_CHECKLIST_CODES, K1_CHECKLIST_VARIANTS } from '../../public/licensing.types';
import type { StoredK1Checklist } from './provisioning-k1-checklist.policy';

/** The most steps a checklist holds (the longest, the one of a departure, has six). */
const MAX_ITEMS = 10;

const schema = z.strictObject({
  variant: z.enum(K1_CHECKLIST_VARIANTS),
  items: z
    .array(
      z.strictObject({
        code: z.enum(K1_CHECKLIST_CODES),
        order: z.number().int().positive(),
        doneAt: z.iso.datetime(),
      }),
    )
    .min(1)
    .max(MAX_ITEMS),
}) satisfies z.ZodType<StoredK1Checklist>;

/**
 * `provisioning_tasks.k1_checklist`: the checklist the IT Admin ticked to complete the revocation of a K1 seat (`QĐ-111az`), written once with
 * the completion. NULL for a task that is not a K1 revocation, that is not completed, or that was completed before the checklist existed. The
 * evidence the checklist stands on is the `evidence` column of the task, not kept here twice.
 */
export const k1ChecklistJson = nullableJsonColumn({
  table: 'provisioning_tasks',
  column: 'k1_checklist',
  schema,
  encode: (checklist) => ({
    variant: checklist.variant,
    items: checklist.items.map((item) => ({ code: item.code, order: item.order, doneAt: item.doneAt })),
  }),
});
