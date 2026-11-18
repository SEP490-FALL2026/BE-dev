import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PayloadDecryptionError } from '../notifications.errors';

export interface PayloadCipherConfig {
  currentKeyId: string;
  /** Key id -> base64 of 32 bytes. Older keys stay until no pending row is sealed with them. */
  keys: Record<string, string>;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM over the JSON payload. The outbox row id and key id are authenticated data, so a
 * ciphertext copied to another row, or relabelled with another key id, fails to open.
 * Layout: iv (12) | auth tag (16) | ciphertext.
 */
export class PayloadCipher {
  private readonly keys = new Map<string, Buffer>();

  constructor(private readonly config: PayloadCipherConfig) {
    for (const [id, encoded] of Object.entries(config.keys)) {
      const key = Buffer.from(encoded, 'base64');
      if (key.length !== 32) throw new Error(`Outbox payload key "${id}" must be 32 bytes (base64).`);
      this.keys.set(id, key);
    }
    if (!this.keys.has(config.currentKeyId)) {
      throw new Error(`Outbox payload key "${config.currentKeyId}" is not configured.`);
    }
  }

  encrypt(rowId: string, payload: Record<string, unknown>): { keyId: string; ciphertext: Buffer } {
    const keyId = this.config.currentKeyId;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(keyId) as Buffer, iv);
    cipher.setAAD(this.aad(rowId, keyId));
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);

    return { keyId, ciphertext: Buffer.concat([iv, cipher.getAuthTag(), body]) };
  }

  decrypt(rowId: string, keyId: string, ciphertext: Buffer): Record<string, unknown> {
    const key = this.keys.get(keyId);
    if (!key || ciphertext.length < IV_BYTES + TAG_BYTES) throw new PayloadDecryptionError();

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, ciphertext.subarray(0, IV_BYTES));
      decipher.setAAD(this.aad(rowId, keyId));
      decipher.setAuthTag(ciphertext.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      const plain = Buffer.concat([decipher.update(ciphertext.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);

      return JSON.parse(plain.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new PayloadDecryptionError();
    }
  }

  private aad(rowId: string, keyId: string): Buffer {
    return Buffer.from(`${rowId}|${keyId}`, 'utf8');
  }
}
