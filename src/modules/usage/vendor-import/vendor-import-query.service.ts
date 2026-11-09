import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import { UsageImportNotFoundError } from './vendor-import.errors';
import { VendorImportRepo } from './vendor-import.repo';
import { toImportView } from './vendor-import.service';
import type { ImportView, RowOutcome, StoredRow } from './vendor-import.types';

/** Reads of an import and its rows for the IT Admin. An identifier that looks like a secret is already masked in the row. */
@Injectable()
export class VendorImportQueryService {
  constructor(private readonly repo: VendorImportRepo) {}

  async view(id: string): Promise<ImportView> {
    const record = await this.repo.find(id);
    if (!record) throw new UsageImportNotFoundError();

    return toImportView(record);
  }

  async rows(id: string, query: { outcome?: RowOutcome; page: number; pageSize: number }): Promise<Page<StoredRow>> {
    if (!(await this.repo.find(id))) throw new UsageImportNotFoundError();
    const { items, total } = await this.repo.pageRows(id, {
      ...(query.outcome ? { outcome: query.outcome } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(items, total, query.page, query.pageSize);
  }
}
