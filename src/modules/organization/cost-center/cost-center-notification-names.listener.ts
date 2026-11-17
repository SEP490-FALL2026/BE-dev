import { Injectable, OnModuleInit } from '@nestjs/common';
import { distinctUuids } from '../../../core/uuid';
import {
  NotificationNameContributions,
  type NameKind,
  type NotificationNameSource,
} from '../../notifications/public/notifications.extension-points';
import { CostCenterRepo } from './cost-center.repo';

/**
 * The display name of a Cost Center in a notification sentence is its code and its name (`CC-001 · Name`), the way the code is the handle people use for it.
 * It hands itself to the notification inbox when the module starts, so `notifications` never imports the organization: one read for the ids of a page, an id that does not exist or is not a uuid is simply absent.
 */
@Injectable()
export class CostCenterNotificationNamesListener implements NotificationNameSource, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [NotificationNameContributions] as const;

  readonly kinds: readonly NameKind[] = ['COST_CENTER'];

  constructor(
    private readonly repo: CostCenterRepo,
    private readonly nameSources: NotificationNameContributions,
  ) {}

  onModuleInit(): void {
    this.nameSources.add('organization.cost-center-names', this);
  }

  async names(kind: NameKind, ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const wanted = distinctUuids(ids);
    if (kind !== 'COST_CENTER' || wanted.length === 0) return new Map();

    return this.repo.namesOf(wanted);
  }
}
