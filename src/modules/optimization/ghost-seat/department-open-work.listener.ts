import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  DepartmentUseContributions,
  type DepartmentUseReader,
} from '../../organization/public/organization.extension-points';
import type { UseGroup } from '../../organization/public/organization-use.types';
import { GhostSeatRepo } from './ghost-seat.repo';

/**
 * Unclosed ghost seat recommendations/decisions that keep a department in use (`OPEN_WORK`): a department with
 * an unclosed recommendation owned by or routed to it cannot be retired. Registers with `DepartmentUseContributions`
 * so `organization` never imports `optimization`.
 */
@Injectable()
export class GhostSeatOpenWorkReader implements DepartmentUseReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [DepartmentUseContributions] as const;

  readonly group = 'OPEN_WORK' as const;

  constructor(
    private readonly repo: GhostSeatRepo,
    private readonly departmentUse: DepartmentUseContributions,
  ) {}

  onModuleInit(): void {
    this.departmentUse.add('optimization.ghost-seats-open-work', this);
  }

  async read(departmentId: string, _day: BusinessDate, limit: number, tx?: DbTx): Promise<UseGroup> {
    const { items, total } = await this.repo.openOfDepartment(departmentId, limit, tx);

    return {
      total,
      items: items.map((item) => ({
        kind: 'GHOST_SEAT_RECOMMENDATION',
        id: item.id,
        label: item.group,
      })),
    };
  }
}
