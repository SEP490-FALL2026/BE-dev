import { Injectable } from '@nestjs/common';
import { RuleRunRepo, type RuleRunRecord, type RuleSkipRecord, type SkipGate } from './rule-run.repo';

/** The runs of the rules, newest first, and why each left subjects out (`FR-4.12b`): both are pages. */
@Injectable()
export class RuleRunQueryService {
  constructor(private readonly runs: RuleRunRepo) {}

  page(
    organizationId: string,
    page: { skip: number; take: number },
  ): Promise<{ items: RuleRunRecord[]; total: number }> {
    return this.runs.page(organizationId, page);
  }

  /** The reasons kept for a run of the organization, or null when there is no such run. */
  async skipsOf(
    organizationId: string,
    runId: string,
    page: { skip: number; take: number },
  ): Promise<{ items: RuleSkipRecord[]; total: number } | null> {
    if (!(await this.runs.find(runId, organizationId))) return null;

    return this.runs.skipsPage(runId, page);
  }

  /** How many subjects a run left out, by gate. */
  skipCountsOf(runId: string): Promise<Partial<Record<SkipGate, number>>> {
    return this.runs.skipCountsByGate(runId);
  }
}
