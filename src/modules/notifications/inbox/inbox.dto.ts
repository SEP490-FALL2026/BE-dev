import { createZodDto } from 'nestjs-zod';
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

const paramValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * One notice as its recipient reads it: a code, what it is about by id, and flat parameters. It has no text: web and mobile
 * turn the code and the parameters into the same words, so nothing in it depends on the client that asked.
 */
export const notificationSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  subject: z.strictObject({ type: z.string(), id: z.uuid() }).nullable(),
  params: z.record(z.string(), paramValue),
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
