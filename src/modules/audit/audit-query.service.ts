import { Injectable } from '@nestjs/common';
import { AuditEventFilter } from './audit-filter.repo';
import { AuditQueryRepo } from './audit-query.repo';
import { StoredAuditEvent } from './public/audit.types';

export interface AuditEventPage {
  items: StoredAuditEvent[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * Reads the Audit Trail for the Super Admin (`US-01-06`). It writes nothing, and reading is not itself an
 * audited event: the trail records changes to business data (`FR-8.3`), and a read changes none.
 */
@Injectable()
export class AuditQueryService {
  constructor(private readonly repo: AuditQueryRepo) {}

  async list(query: AuditEventFilter & { page: number; pageSize: number }): Promise<AuditEventPage> {
    const { page, pageSize, ...filter } = query;
    const { items, total } = await this.repo.findPage({ ...filter, skip: (page - 1) * pageSize, take: pageSize });

    return {
      items,
      pagination: { page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) },
    };
  }
}
