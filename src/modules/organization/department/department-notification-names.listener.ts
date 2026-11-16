import { Injectable, OnModuleInit } from '@nestjs/common';
import { distinctUuids } from '../../../core/uuid';
import {
  NotificationNameContributions,
  type NameKind,
  type NotificationNameSource,
} from '../../notifications/public/notifications.extension-points';
import { DepartmentRepo } from './department.repo';

/**
 * The display name of a department in a notification sentence is its name. It hands itself to the notification inbox when the module starts, so `notifications` never imports the organization: one read
 * for the ids of a page, an id that does not exist or is not a uuid is simply absent.
 */
@Injectable()
export class DepartmentNotificationNamesListener implements NotificationNameSource, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [NotificationNameContributions] as const;

  readonly kinds: readonly NameKind[] = ['DEPARTMENT'];

  constructor(
    private readonly repo: DepartmentRepo,
    private readonly nameSources: NotificationNameContributions,
  ) {}

  onModuleInit(): void {
    this.nameSources.add('organization.department-names', this);
  }

  async names(kind: NameKind, ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const wanted = distinctUuids(ids);
    if (kind !== 'DEPARTMENT' || wanted.length === 0) return new Map();

    return this.repo.namesOf(wanted);
  }
}
