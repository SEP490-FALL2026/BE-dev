import { z } from 'zod';
import { jsonColumn } from '../../../infrastructure/database/json-column';
import type { InAppParamValue } from '../public/notifications.types';

/**
 * The parameters of a notice: flat, so the interface can put them into a sentence and no structure can smuggle in a record. The
 * policy refuses anything else when a notice is written, and the table checks that the column is an object; this is the read.
 */
const schema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) satisfies z.ZodType<
  Record<string, InAppParamValue>
>;

const encode = (params: z.output<typeof schema>) => params;

/** `in_app_notifications.params`. */
export const inAppNotificationParamsJson = jsonColumn({
  table: 'in_app_notifications',
  column: 'params',
  schema,
  encode,
});

/** `held_department_notifications.params`. */
export const heldNotificationParamsJson = jsonColumn({
  table: 'held_department_notifications',
  column: 'params',
  schema,
  encode,
});
