import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  OrganizationChangeListeners,
  type OrganizationChangeListener,
} from '../../organization/public/organization.extension-points';
import type { OrganizationChange } from '../../organization/public/organization.types';
import { TransferReviewService } from './transfer-review.service';

/**
 * Listens to the changes of the organization for the one that moves a person to another department (`FR-3.8`): the head of the
 * department they came to reviews every personal seat the person holds, and the one that tells a person has left ends the review
 * still open for them. Added when the module starts, after the listener that marks the transfer effective, and idempotent: the
 * review is made once for a placement.
 */
@Injectable()
export class TransferReviewListener implements OrganizationChangeListener, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [OrganizationChangeListeners] as const;

  constructor(
    private readonly changes: OrganizationChangeListeners,
    private readonly reviews: TransferReviewService,
  ) {}

  onModuleInit(): void {
    this.changes.add('personnel.transfer-review', (tx, change) => this.onChange(tx, change));
  }

  onChange(tx: DbTx, change: OrganizationChange): Promise<void> {
    return change.kind === 'EMPLOYEE_LEFT'
      ? this.reviews.supersedeForLeaver(tx, change)
      : this.reviews.openFor(tx, change);
  }
}
