import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationService } from '../../organization/organization.service';
import type { OrganizationChange, OrganizationChangeListener } from '../../organization/organization.types';
import { TransferReviewService } from './transfer-review.service';

/**
 * Listens to the changes of the organization for the one that moves a person to another department (`FR-3.8`): their head of the
 * department they came to reviews the tools outside its standard toolset, and the one that tells a person has left ends the review still open for them. Registered when the module starts, after the listener
 * that marks the transfer effective, and idempotent: the review is made once for a placement.
 */
@Injectable()
export class TransferReviewListener implements OrganizationChangeListener, OnModuleInit {
  constructor(
    private readonly organization: OrganizationService,
    private readonly reviews: TransferReviewService,
  ) {}

  onModuleInit(): void {
    this.organization.registerChangeListener(this);
  }

  onChange(tx: DbTx, change: OrganizationChange): Promise<void> {
    return change.kind === 'EMPLOYEE_LEFT'
      ? this.reviews.supersedeForLeaver(tx, change)
      : this.reviews.openFor(tx, change);
  }
}
