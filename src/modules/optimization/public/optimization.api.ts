import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BoardSummaryService } from '../board/board-summary.service';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import type { DepartmentGhostSeatCounts, OptimizationSummary } from './optimization.types';

/** The facade of the recommendations of wasted seats for the modules above it (`dashboards`). */
@Injectable()
export class OptimizationApi {
  constructor(
    private readonly summaries: BoardSummaryService,
    private readonly recommendations: GhostSeatRepo,
  ) {}

  /** How many recommendations of each group are not closed, and the figure the dashboard of the IT Admin counts (`G2` not closed plus `G1` open). */
  async getSummary(tx?: DbTx): Promise<OptimizationSummary> {
    const { groups, counted, limitation } = await this.summaries.summary(tx);

    const slim = ({
      unclosedCount,
      reclaimUnderWayCount,
    }: {
      unclosedCount: number;
      reclaimUnderWayCount: number;
    }) => ({
      unclosedCount,
      reclaimUnderWayCount,
    });

    return {
      groups: { G1: slim(groups.G1), G2: slim(groups.G2), G3: slim(groups.G3), G4: slim(groups.G4) },
      counted,
      limitation,
    };
  }

  /**
   * What waits in the queue of the head of a department (`US-12-15` dòng 20): the recommendations awaiting their decision plus the ones the
   * IT Admin returned to them, the figure their dashboard counts; the ones that wait for a head to be named or are paused are not theirs yet.
   */
  async departmentCounts(organizationId: string, departmentId: string, tx?: DbTx): Promise<DepartmentGhostSeatCounts> {
    return { queued: await this.recommendations.countQueue(organizationId, departmentId, tx) };
  }
}
