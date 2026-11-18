import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  CollectorAllowlistHook,
  type CollectorAllowlistReader,
  type CollectorAllowlistView,
} from '../../devices/public/devices.extension-points';
import { AllowlistRepo } from './allowlist.repo';

/**
 * Tells the session of a collector what to report (`US-09-02` AC-7): the tools of the version of the allowlist in force. It binds the
 * hook the devices module opens; a collector with no version published yet is told to report nothing.
 */
@Injectable()
export class AllowlistSessionListener implements OnModuleInit, CollectorAllowlistReader {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [CollectorAllowlistHook] as const;

  constructor(
    private readonly hook: CollectorAllowlistHook,
    private readonly repo: AllowlistRepo,
  ) {}

  onModuleInit(): void {
    this.hook.bind(this);
  }

  async currentAllowlist(organizationId: string, tx?: DbTx): Promise<CollectorAllowlistView> {
    const current = await this.repo.current(organizationId, tx);

    return {
      version: current ? current.versionNumber : null,
      entries: (current?.entries ?? []).map((entry) => ({ kind: entry.kind, key: entry.tool })),
    };
  }
}
