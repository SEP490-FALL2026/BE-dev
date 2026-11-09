import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BoardSummaryService } from '../board/board-summary.service';
import type { OptimizationSummary } from './optimization.types';

/** The facade of the recommendations of wasted seats for the modules above it (`dashboards`). */
@Injectable()
export class OptimizationApi {
  constructor(private readonly summaries: BoardSummaryService) {}

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
}
