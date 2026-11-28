import request from 'supertest';
import { OBJECT_STORAGE } from '../../src/infrastructure/object-storage/object-storage.port';
import type { ApiAccount } from './api-accounts';
import { PDF, type DocumentWire } from './document-harness';
import { FakeObjectStorage } from './fake-object-storage';
import { RevocationHarness } from './revocation-harness';

/** Revocation fixtures with the same in-memory upload adapter as DocumentHarness. */
export class ProvisioningEvidenceHarness extends RevocationHarness {
  readonly storage = new FakeObjectStorage();

  override start(options: Parameters<RevocationHarness['start']>[0] = {}): Promise<void> {
    return super.start({
      ...options,
      providerOverrides: [{ token: OBJECT_STORAGE, useValue: this.storage }, ...(options.providerOverrides ?? [])],
    });
  }

  createDocument = (body: object, account: ApiAccount = this.it1) =>
    request(this.server()).post('/api/v1/documents').set(this.as(account)).send(body);
  completeDocument = (id: string, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/documents/${id}/complete`).set(this.as(account));

  async putObject(id: string, stored: { contentLength: number; contentType: string; content?: Uint8Array }) {
    const { rows } = await this.ctx.sql.query<{ object_key: string }>(
      `SELECT object_key FROM document_attachments WHERE id = $1`,
      [id],
    );
    this.storage.put(rows[0].object_key, stored);
  }

  async uploaded(account: ApiAccount = this.it1, body: object = { ...PDF, purpose: 'PROVISIONING_EVIDENCE' }) {
    const { document } = this.dataOf<{ document: DocumentWire }>(await this.createDocument(body, account).expect(201));
    await this.putObject(document.id, { contentLength: document.sizeBytes, contentType: document.contentType });
    return this.dataOf<{ document: DocumentWire }>(await this.completeDocument(document.id, account).expect(200))
      .document;
  }
}
