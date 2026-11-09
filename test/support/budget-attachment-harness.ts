import { Client } from 'pg';
import request from 'supertest';
import { OBJECT_STORAGE } from '../../src/infrastructure/object-storage/object-storage.port';
import type { ApiAccount } from './api-accounts';
import { BudgetHarness } from './budget-harness';
import { FakeObjectStorage } from './fake-object-storage';

export interface BudgetAttachmentWire {
  id: string;
  target: 'PROPOSAL' | 'VERSION';
  status: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: { employeeId: string; employeeCode: string; fullName: string } | null;
  createdAt: string;
  proposalId: string | null;
  versionId: string | null;
  attachedAt: string | null;
  removedAt: string | null;
  removedBy: { employeeId: string; employeeCode: string; fullName: string } | null;
}

/** What a declaration answers with: the row, and how to upload (`budgetAttachmentCreate`, no token of any kind). */
export interface AttachmentDataWire {
  attachment: BudgetAttachmentWire;
  upload?: {
    url: string;
    method: 'PUT';
    headers: { 'Content-Type': string; 'Content-Length': string };
    expiresAt: string;
  };
}

/** A row of the lists of a record's documents (`budgetAttachmentSummary`). */
export interface AttachmentSummaryWire {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: 'ATTACHED' | 'REMOVED';
  uploadedBy: { employeeId: string; employeeCode: string; fullName: string } | null;
  attachedAt: string;
  removedAt: string | null;
}

/** A row of "my unattached files" (`budgetUploadSummary`). */
export interface UploadSummaryWire {
  id: string;
  target: 'PROPOSAL' | 'VERSION';
  status: 'AWAITING_UPLOAD' | 'UPLOADED';
  fileName: string;
  contentType: string;
  sizeBytes: number;
  versionId: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface AttachmentListDataWire {
  items: AttachmentSummaryWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface UploadListDataWire {
  items: UploadSummaryWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface AttachmentLinkDataWire {
  url: string;
  expiresAt: string;
}

export interface MineVersionsDataWire {
  items: Array<{ id: string; year: number; number: number; state: string; sentAt: string }>;
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface ErrorEnvelopeWire {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const SAMPLE_PDF = { fileName: 'bao-gia-2027.pdf', contentType: 'application/pdf', sizeBytes: 2048 };
export const SAMPLE_XLSX = {
  fileName: 'bang-tinh.xlsx',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sizeBytes: 4096,
};

export class BudgetAttachmentHarness extends BudgetHarness {
  readonly storage = new FakeObjectStorage();

  errorOf = (response: request.Response): ErrorEnvelopeWire => (response.body as { error: ErrorEnvelopeWire }).error;

  override start(): Promise<void> {
    return super.start({ providerOverrides: [{ token: OBJECT_STORAGE, useValue: this.storage }] });
  }

  declareVersionAttachment = (versionId: string, body: object, account: ApiAccount = this.finance) =>
    request(this.server()).post(`/api/v1/budget-versions/${versionId}/attachments`).set(this.as(account)).send(body);

  declareProposalAttachment = (body: object, account: ApiAccount = this.finance) =>
    request(this.server()).post('/api/v1/budget-proposals/attachments').set(this.as(account)).send(body);

  completeAttachment = (id: string, account: ApiAccount = this.finance) =>
    request(this.server()).post(`/api/v1/budget-attachments/${id}/complete`).set(this.as(account));

  removeVersionAttachment = (versionId: string, attachmentId: string, account: ApiAccount = this.finance) =>
    request(this.server())
      .post(`/api/v1/budget-versions/${versionId}/attachments/${attachmentId}/removal`)
      .set(this.as(account));

  listProposalAttachments = (proposalId: string, query = '', account: ApiAccount = this.finance) =>
    request(this.server()).get(`/api/v1/budget-proposals/${proposalId}/attachments${query}`).set(this.as(account));

  listVersionAttachments = (versionId: string, query = '', account: ApiAccount = this.finance) =>
    request(this.server()).get(`/api/v1/budget-versions/${versionId}/attachments${query}`).set(this.as(account));

  linkAttachment = (id: string, account: ApiAccount = this.finance) =>
    request(this.server()).post(`/api/v1/budget-attachments/${id}/links`).set(this.as(account));

  listMineUploads = (query = '', account: ApiAccount = this.finance) =>
    request(this.server()).get(`/api/v1/budget-attachments/mine${query}`).set(this.as(account));

  discardAttachment = (id: string, account: ApiAccount = this.finance) =>
    request(this.server()).post(`/api/v1/budget-attachments/${id}/discard`).set(this.as(account));

  listMineVersions = (query = '', account: ApiAccount = this.finance) =>
    request(this.server()).get(`/api/v1/budgets/mine/versions${query}`).set(this.as(account));

  /** A file declared, put in the storage as declared and completed, failing on anything but 201 and 200. */
  async uploaded(
    spec: { fileName: string; contentType: string; sizeBytes: number },
    account: ApiAccount,
    target: { versionId?: string } = {},
  ): Promise<string> {
    const declared =
      target.versionId === undefined
        ? await this.declareProposalAttachment(spec, account)
        : await this.declareVersionAttachment(target.versionId, spec, account);
    if (declared.status !== 201) throw new Error(`declare: ${declared.status} ${JSON.stringify(declared.body)}`);
    const id = this.dataOf<AttachmentDataWire>(declared).attachment.id;
    await this.putObject(id, { contentLength: spec.sizeBytes, contentType: spec.contentType });
    const completed = await this.completeAttachment(id, account);
    if (completed.status !== 200) throw new Error(`complete: ${completed.status} ${JSON.stringify(completed.body)}`);

    return id;
  }

  /**
   * Makes a declared file look `ms` older than it is: how a test passes the 24 hours or 7 days that nothing else lets it
   * pass (`created_at` is fixed by the trigger, so it is lifted for this one statement, in one transaction).
   */
  async ageAttachment(id: string, ms: number): Promise<void> {
    const client = new Client({ connectionString: this.ctx.database.url });
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE budget_attachments DISABLE TRIGGER USER');
      await client.query(
        `UPDATE budget_attachments SET created_at = created_at - ($2 * interval '1 millisecond') WHERE id = $1`,
        [id, ms],
      );
      await client.query('ALTER TABLE budget_attachments ENABLE TRIGGER USER');
      await client.query('COMMIT');
    } finally {
      await client.end();
    }
  }

  async putObject(
    id: string,
    stored: { contentLength: number; contentType: string; content?: Uint8Array },
  ): Promise<string> {
    const key = await this.keyOf(id);
    this.storage.put(key, stored);
    return key;
  }

  async keyOf(id: string): Promise<string> {
    return (
      await this.ctx.sql.query<{ object_key: string }>(`SELECT object_key FROM budget_attachments WHERE id = $1`, [id])
    ).rows[0].object_key;
  }

  async finalKeyOf(id: string): Promise<string | null> {
    return (
      await this.ctx.sql.query<{ final_object_key: string | null }>(
        `SELECT final_object_key FROM budget_attachments WHERE id = $1`,
        [id],
      )
    ).rows[0].final_object_key;
  }

  async statusOf(id: string): Promise<string> {
    return (await this.ctx.sql.query<{ status: string }>(`SELECT status FROM budget_attachments WHERE id = $1`, [id]))
      .rows[0].status;
  }

  async attachmentCount(): Promise<number> {
    return Number((await this.ctx.sql.query<{ n: string }>(`SELECT count(*) AS n FROM budget_attachments`)).rows[0].n);
  }
}
