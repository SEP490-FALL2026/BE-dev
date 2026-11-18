import { createZodDto } from '../../../infrastructure/http/dto/zod-dto';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

/** A boolean query value: `?unreadOnly=true`. `z.coerce.boolean()` would read the text "false" as true. */
const queryBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');

export const notificationListQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
  unreadOnly: queryBoolean.default(false),
});

export const notificationIdParamSchema = z.strictObject({ id: z.uuid() });

// Nullable union rather than a null member: the same values, rendered as `anyOf` + `nullable` like the document shows.
const paramValue = z.union([z.string(), z.number(), z.boolean()]).nullable();

/** The screen a notice opens: the `operationId` of the read route in this contract and the values of its path parameters. */
const notificationTargetSchema = z.strictObject({
  operationId: z.string(),
  pathParams: z.record(z.string(), z.string()),
});

/**
 * One notice as its recipient reads it: a code, what it is about by id, flat parameters, and the words made from them in the
 * language of `Accept-Language` (`vi` by default), so web and mobile show the same sentence. `target` says which read route to open,
 * `null` when no single screen is known.
 */
export const notificationSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  subject: z.strictObject({ type: z.string(), id: z.uuid() }).nullable(),
  params: z.record(z.string(), paramValue),
  title: z.string().min(1).describe('Plain text, never empty; the language of Accept-Language (vi by default).'),
  message: z
    .string()
    .describe('Plain text; may carry text a person typed, so show it as text. Empty only for an unknown code.'),
  target: notificationTargetSchema
    .nullable()
    .describe('The read route to open; null means open the list of notifications.'),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});

const pagination = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export class NotificationListQueryDto extends createZodDto(notificationListQuerySchema) {}
export class NotificationIdParamDto extends createZodDto(notificationIdParamSchema) {}
export class NotificationListResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ items: z.array(notificationSchema), pagination })),
) {}
export class NotificationUnreadCountResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ unread: z.number().int().nonnegative() })),
) {}
export class NotificationResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ notification: notificationSchema })),
) {}
export class NotificationsMarkedResponseDto extends createZodDto(
  successEnvelopeSchema(z.strictObject({ updated: z.number().int().nonnegative() })),
) {}

export type NotificationWire = z.infer<typeof notificationSchema>;
