import { Injectable, OnModuleInit } from '@nestjs/common';
import { SeatBaselineClosedListeners } from '../../licensing/public/licensing.extension-points';
import { PostSetupReviewService } from './post-setup-review.service';

/**
 * Adds the review after the setup (F21, `QĐ-89e`) to the listeners of the closing of the seat baseline when the module starts, so
 * licensing never imports personnel: the reviews open in the transaction that closes the baseline.
 */
@Injectable()
export class PostSetupReviewListener implements OnModuleInit {
  constructor(
    private readonly closed: SeatBaselineClosedListeners,
    private readonly review: PostSetupReviewService,
  ) {}

  onModuleInit(): void {
    this.closed.add('personnel.post-setup-review', (tx, event) => this.review.baselineClosed(tx, event));
  }
}
