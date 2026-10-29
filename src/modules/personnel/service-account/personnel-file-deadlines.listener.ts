import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  ResponsibleDeadlineHook,
  type ResponsibleDeadlineProvider,
} from '../../licensing/public/licensing.extension-points';
import type { PendingFileQuery, PendingPersonnelFile } from '../../licensing/public/licensing-service-account.types';
import { PersonnelFileDeadlinesRepo } from './personnel-file-deadlines.repo';

/**
 * Tells licensing which people have a transfer or a departure that is not closed and the day it takes effect (`US-03-08`): the day a
 * person answering for a service account has to be replaced by. It binds itself to licensing's `ResponsibleDeadlineHook` when the
 * module starts, so licensing never imports this module.
 */
@Injectable()
export class PersonnelFileDeadlines implements ResponsibleDeadlineProvider, OnModuleInit {
  constructor(
    private readonly repo: PersonnelFileDeadlinesRepo,
    private readonly hook: ResponsibleDeadlineHook,
  ) {}

  onModuleInit(): void {
    this.hook.bind(this);
  }

  listPending(query: PendingFileQuery, tx?: DbTx): Promise<PendingPersonnelFile[]> {
    return this.repo.pending(query, tx);
  }
}
