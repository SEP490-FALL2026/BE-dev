import { Injectable } from '@nestjs/common';
import { EmailDispatcher } from '../email-dispatcher.service';
import { TokenUsability } from './notifications.types';

/**
 * The worker-side contract of the notifications module (ROOT.1, in a file of its own since ROOT-HARDEN.1): delivers the
 * outbox rows that are due, one batch per call. Its only consumer is the worker's mail loop at the composition root
 * (`worker/email-dispatch.job.ts`, ADR-0012), which supplies whether a link is still worth sending. The dispatcher, the
 * repository, the cipher and the transport stay private to the module.
 */
@Injectable()
export class EmailDeliveryApi {
  constructor(private readonly dispatcher: EmailDispatcher) {}

  /** Returns how many rows this call took (whether or not they were delivered). */
  dispatchDue(isUsable: TokenUsability): Promise<number> {
    return this.dispatcher.dispatchDue(isUsable);
  }
}
