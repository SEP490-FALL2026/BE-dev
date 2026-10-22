import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { catalogAuditEvent } from '../mappers/catalog-audit-event';
import {
  VendorProposalAlreadyResolvedError,
  VendorProposalNotFoundError,
  VendorProposalResolutionInvalidError,
  VendorServiceLineNotFoundError,
} from './vendor-dictionary.errors';
import { VendorDictionaryRepo } from './vendor-dictionary.repo';
import type { VendorProposalRecord, VendorProposalStatus } from './vendor-dictionary.types';
import { VendorProposalRepo } from './vendor-proposal.repo';

/**
 * The proposals to add a vendor that application declarations raised (`US-04-07`, alternative flow). The IT Admin
 * accepts one by naming the service line it became (created first by the ordinary dictionary routes) or dismisses it.
 */
@Injectable()
export class VendorProposalService {
  constructor(
    private readonly proposals: VendorProposalRepo,
    private readonly dictionary: VendorDictionaryRepo,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  async list(query: {
    status?: VendorProposalStatus;
    page: number;
    pageSize: number;
  }): Promise<Page<VendorProposalRecord>> {
    const { items, total } = await this.proposals.list({
      ...(query.status ? { status: query.status } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /**
   * Throws VendorProposalResolutionInvalidError (ACCEPTED without a line, DISMISSED with one),
   * VendorProposalNotFoundError, VendorProposalAlreadyResolvedError and VendorServiceLineNotFoundError. Two
   * resolutions of one proposal are serialized by its row lock: the second finds it resolved.
   */
  async resolve(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { outcome: 'ACCEPTED' | 'DISMISSED'; serviceLineId?: string },
  ): Promise<VendorProposalRecord> {
    const serviceLineId = input.serviceLineId ?? null;
    if ((input.outcome === 'ACCEPTED') !== (serviceLineId !== null)) throw new VendorProposalResolutionInvalidError();

    return this.runner.run(async (tx) => {
      const current = await this.proposals.lock(tx, id);
      if (!current) throw new VendorProposalNotFoundError();
      if (current.status !== 'PENDING') throw new VendorProposalAlreadyResolvedError();
      if (serviceLineId !== null && !(await this.dictionary.lineExists(tx, serviceLineId))) {
        throw new VendorServiceLineNotFoundError();
      }

      const resolved = await this.proposals.resolve(tx, id, input.outcome, serviceLineId);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          current.organizationId,
          'VENDOR_PROPOSAL.RESOLVED',
          'VendorDictionaryProposal',
          id,
          { name: current.name, status: current.status },
          { name: resolved.name, status: resolved.status, serviceLineId: resolved.serviceLineId },
        ),
      );

      return resolved;
    });
  }
}
