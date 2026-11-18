import { Injectable } from '@nestjs/common';
import { Hook } from '../../../core/extension/hook';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/** One thing a collector may report: a tool and the key it names it by. */
export interface CollectorAllowlistItem {
  kind: 'AI_TOOL';
  key: string;
}

export interface CollectorAllowlistView {
  /** The version in force; null while none has been published. */
  version: number | null;
  entries: CollectorAllowlistItem[];
}

/** What the session of a collector tells it to report; the module that keeps the allowlist answers. */
export interface CollectorAllowlistReader {
  currentAllowlist(organizationId: string, tx?: DbTx): Promise<CollectorAllowlistView>;
}

/** Opened here, bound once by the usage module (`usage/allowlist/allowlist-session.listener.ts`). */
@Injectable()
export class CollectorAllowlistHook extends Hook<CollectorAllowlistReader> {
  constructor() {
    super('devices.collector-allowlist');
  }
}
