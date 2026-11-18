import { Injectable } from '@nestjs/common';
import { toStopRequestWire } from './stop-request.mapper';
import type { StopRequestState } from './stop-request.policy';
import { StopRequestRepo } from './stop-request.repo';

export interface StopRequestListInput {
  state: StopRequestState;
  page: number;
  pageSize: number;
}

/** What the IT Admin reads of the requests to stop collection: a page in one state, those due first. */
@Injectable()
export class StopRequestQueryService {
  constructor(private readonly repo: StopRequestRepo) {}

  async list(input: StopRequestListInput, now: Date = new Date()) {
    const { rows, total } = await this.repo.page(input.state, (input.page - 1) * input.pageSize, input.pageSize);

    return {
      items: rows.map((row) => toStopRequestWire(row, now)),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }
}
