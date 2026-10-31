import { Injectable, OnModuleInit } from '@nestjs/common';
import { RequestOutcomeListeners } from '../../requests/public/requests.extension-points';
import { TransferReviewReplacementService } from './transfer-review-replacement.service';

/**
 * Adds the replacement of the old seat of a tool still needed to the listeners of the outcome of a request when the module
 * starts, so requests never imports personnel: it is told in the transaction in which the request ended.
 */
@Injectable()
export class TransferReviewOutcomeListener implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [RequestOutcomeListeners] as const;

  constructor(
    private readonly outcomes: RequestOutcomeListeners,
    private readonly replacement: TransferReviewReplacementService,
  ) {}

  onModuleInit(): void {
    this.outcomes.add('personnel.transfer-review-replacement', (tx, event) =>
      this.replacement.requestOutcome(tx, event),
    );
  }
}
