import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  FirstPlacementUseContributions,
  type FirstPlacementUseReader,
} from '../../organization/public/organization.extension-points';
import { FirstPlacementPersonnelRepo } from './first-placement-personnel.repo';

/**
 * A transfer or a departure of the person, whatever its state, refers to their first placement and keeps it from being corrected (`QĐ-113e`):
 * both are written against the placement the person is in. It hands itself to the organization when the module starts, so the organization
 * never imports personnel.
 */
@Injectable()
export class FirstPlacementPersonnelReader implements FirstPlacementUseReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [FirstPlacementUseContributions] as const;

  constructor(
    private readonly repo: FirstPlacementPersonnelRepo,
    private readonly firstPlacementUse: FirstPlacementUseContributions,
  ) {}

  onModuleInit(): void {
    this.firstPlacementUse.add('personnel.transfers-and-departures', this);
  }

  read(employeeId: string, tx: DbTx): Promise<'TRANSFER' | 'OFFBOARDING' | null> {
    return this.repo.referenceOf(employeeId, tx);
  }
}
