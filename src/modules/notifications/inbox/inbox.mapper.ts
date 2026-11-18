import type { NotificationWire } from './inbox.dto';
import type { NotificationView } from './inbox-view.service';

/** The wire shape of one notice: the six fields it always had, then the words and the screen it opens. */
export function toNotificationWire({ record, title, message, target }: NotificationView): NotificationWire {
  return {
    id: record.id,
    code: record.code,
    subject:
      record.subjectType !== null && record.subjectId !== null
        ? { type: record.subjectType, id: record.subjectId }
        : null,
    params: record.params,
    title,
    message,
    target,
    createdAt: record.createdAt.toISOString(),
    readAt: record.readAt?.toISOString() ?? null,
  };
}
