import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  PendingFileQuery,
  PendingPersonnelFile,
  ResponsibleDeadlineProvider,
} from '../licensing-service-account.types';

/**
 * The provider the module of personnel registers with the facade when it starts (`US-03-08`): which people have a transfer or a
 * departure that is not closed, and the day it takes effect. Until one is registered nobody has any, so no deadline binds a change.
 */
@Injectable()
export class RegisteredResponsibleDeadline implements ResponsibleDeadlineProvider {
  private delegate: ResponsibleDeadlineProvider | null = null;

  register(provider: ResponsibleDeadlineProvider): void {
    this.delegate = provider;
  }

  async listPending(query: PendingFileQuery, tx?: DbTx): Promise<PendingPersonnelFile[]> {
    return (await this.delegate?.listPending(query, tx)) ?? [];
  }
}
