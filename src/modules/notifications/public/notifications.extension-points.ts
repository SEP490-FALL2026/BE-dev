import { Injectable } from '@nestjs/common';
import { Contributions } from '../../../core/extension/contributions';

/**
 * What `notifications` opens to other modules. A notification sentence names an entity by a display name that
 * the owning module supplies at read time (`NotificationNameSource`); the kinds a sentence can name are fixed here, once.
 */
export type NameKind =
  | 'REQUEST'
  | 'EMPLOYEE'
  | 'DEPARTMENT'
  | 'COST_CENTER'
  | 'APPLICATION'
  | 'PLAN'
  | 'SUBSCRIPTION'
  | 'WORKSPACE'
  | 'LICENSE_LOT';

/** The module that owns the table of some kinds answers for their display names, in one query per kind. */
export interface NotificationNameSource {
  readonly kinds: readonly NameKind[];
  /** Display names of the ids that exist; a missing id is simply absent. Never throws for an unknown id. */
  names(kind: NameKind, ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

/**
 * Who can name an entity of each `NameKind`, added by the owning modules from a `*.listener.ts` when they start; the inbox view
 * asks them once per kind for a page. One instance per application, provided and exported by `NotificationsModule` so that
 * every graph (API, worker, CLI) can resolve it.
 */
@Injectable()
export class NotificationNameContributions extends Contributions<NotificationNameSource> {
  constructor() {
    super('notifications.name-sources');
  }
}
