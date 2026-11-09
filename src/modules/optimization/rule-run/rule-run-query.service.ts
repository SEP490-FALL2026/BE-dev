import { Injectable } from '@nestjs/common';
import { RuleRunRepo, type RuleRunRecord, type RuleSkipRecord } from './rule-run.repo';

export interface RuleRunWithSkips extends RuleRunRecord {
  skips: { items: RuleSkipRecord[]; total: number };
}

/** The runs of the rules, newest first, each with the first page of why subjects were left out (`FR-4.12b`). */
@Injectable()
export class RuleRunQueryService {
  constructor(private readonly runs: RuleRunRepo) {}

  async page(
    organizationId: string,
    page: { skip: number; take: number },
    skipsTake: number,
  ): Promise<{ items: RuleRunWithSkips[]; total: number }> {
    const { items, total } = await this.runs.page(organizationId, page);
    const skips = await this.runs.skipsOfRuns(
      items.map((run) => run.id),
      skipsTake,
    );
    const withSkips = items.map((run) => ({ ...run, skips: skips.get(run.id) ?? { items: [], total: 0 } }));

    return { items: withSkips, total };
  }
}
