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

export interface AttachmentDataWire {
  attachment: BudgetAttachmentWire;
  upload?: { uploadToken: string; objectKey: string; maxSizeBytes: number; expiresAt: string };
}

export interface AttachmentListDataWire {
  items: BudgetAttachmentWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface AttachmentLinkDataWire {
  url: string;
  expiresInSeconds: number;
}

export interface MineVersionsDataWire {
  items: Array<{ id: string; number: number; state: string }>;
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
