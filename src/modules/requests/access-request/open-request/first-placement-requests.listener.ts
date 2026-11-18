import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import {
  FirstPlacementUseContributions,
  type FirstPlacementUseReader,
} from '../../../organization/public/organization.extension-points';
import { RequestUseRepo } from './request-use.repo';

/**
 * A Request the person made or is the beneficiary of, whatever its state (a draft too), refers to their first placement and keeps it from being
 * corrected (`QĐ-113e`): the placement fixes the department the Request is sent from. It hands itself to the organization when the module starts,
 * so the organization never imports requests.
 */
@Injectable()
export class FirstPlacementRequestsReader implements FirstPlacementUseReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [FirstPlacementUseContributions] as const;

  constructor(
    private readonly repo: RequestUseRepo,
    private readonly firstPlacementUse: FirstPlacementUseContributions,
  ) {}

  onModuleInit(): void {
    this.firstPlacementUse.add('requests.requests-of-person', this);
  }

  async read(employeeId: string, tx: DbTx): Promise<'REQUEST' | null> {
    return (await this.repo.involvesEmployee(employeeId, tx)) ? 'REQUEST' : null;
  }
}
