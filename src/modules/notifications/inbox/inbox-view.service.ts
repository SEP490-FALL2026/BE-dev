import { Injectable, Logger } from '@nestjs/common';
import type { RequestLocaleValue } from '../../../infrastructure/http/decorators/request-locale.decorator';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import {
  NotificationNameContributions,
  type NameKind,
  type NotificationNameSource,
} from '../public/notifications.extension-points';
import type { InAppNotificationRecord } from '../public/notifications.types';
import { canonicalSubjectType, notificationTarget, type NotificationTarget } from './notification-target.policy';
import {
  nameLookupKey,
  nameRefsOf,
  renderNotificationText,
  withRecipientIsSubject,
} from './notification-text/inbox-notification-text.policy';

/** One notice ready for the wire: the record with its subject type in `UPPER_SNAKE`, the words in the language asked and the screen it opens. */
export interface NotificationView {
  record: InAppNotificationRecord;
  title: string;
  message: string;
  target: NotificationTarget | null;
}

/**
 * Puts words on a page of notices (`SPEC-5B` A2, A5): for the language asked it finds the display names the sentences print, one
 * lookup per kind of entity for the whole page, renders each sentence and gives each notice the screen it opens. A name nobody can
 * give (no owner registered, the owner failed, the id is gone) becomes a generic phrase and one line in the log, never a failed route.
 * `recipientEmployeeId` is the employee reading: a notice about that same employee gets the sentence written for them (R-3).
 * `recipientRoles` are their effective roles: the screen a notice opens is one they may read (F1), or none.
 */
@Injectable()
export class InboxViewService {
  private readonly logger = new Logger(InboxViewService.name);

  constructor(private readonly nameSources: NotificationNameContributions) {}

  async view(
    records: readonly InAppNotificationRecord[],
    locale: RequestLocaleValue,
    recipientEmployeeId: string | null,
    recipientRoles: readonly string[],
  ): Promise<NotificationView[]> {
    if (records.length === 0) return [];
    const forRender = records.map((record) => withRecipientIsSubject(record.params, recipientEmployeeId));
    const names = await this.namesOf(records, forRender, locale);

    return records.map((record, index) => {
      const subject =
        record.subjectType !== null && record.subjectId !== null
          ? { type: canonicalSubjectType(record.subjectType), id: record.subjectId }
          : null;
      const { title, message } = renderNotificationText(record.code, forRender[index], locale, names);

      return {
        record: { ...record, subjectType: subject?.type ?? record.subjectType },
        title,
        message,
        target: notificationTarget(record.code, subject, forRender[index], recipientRoles),
      };
    });
  }

  /** The display names of the whole page, keyed by `nameLookupKey`: each kind is asked once, with the unique ids of that kind. */
  private async namesOf(
    records: readonly InAppNotificationRecord[],
    renderParams: readonly Readonly<Record<string, unknown>>[],
    locale: RequestLocaleValue,
  ): Promise<ReadonlyMap<string, string>> {
    const idsByKind = new Map<NameKind, Set<string>>();
    for (const [index, record] of records.entries()) {
      for (const ref of nameRefsOf(record.code, renderParams[index], locale)) {
        const ids = idsByKind.get(ref.kind) ?? new Set<string>();
        ids.add(ref.id);
        idsByKind.set(ref.kind, ids);
      }
    }

    const sources = this.nameSources.all();
    const names = new Map<string, string>();
    const asked = await Promise.all([...idsByKind].map(([kind, ids]) => this.namesOfKind(kind, [...ids], sources)));
    for (const [kind, found] of asked) {
      for (const [id, name] of found) {
        const key = nameLookupKey(kind, id);
        if (!names.has(key)) names.set(key, name);
      }
    }

    return names;
  }

  private async namesOfKind(
    kind: NameKind,
    ids: readonly string[],
    sources: readonly NotificationNameSource[],
  ): Promise<readonly [NameKind, ReadonlyMap<string, string>]> {
    const owners = sources.filter((source) => source.kinds.includes(kind));
    if (owners.length === 0) {
      this.logger.warn(`No source gives the names of kind ${kind}; ${ids.length} id(s) get the generic phrase`);

      return [kind, new Map()];
    }

    const found = new Map<string, string>();
    for (const owner of owners) {
      try {
        for (const [id, name] of await owner.names(kind, ids)) if (!found.has(id)) found.set(id, name);
      } catch (error) {
        this.logger.warn(
          `A source failed to give the names of kind ${kind} for ${ids.length} id(s): ${describeForOperator(error)}`,
        );
      }
    }

    return [kind, found];
  }
}
