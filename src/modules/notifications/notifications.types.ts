export type EmailTemplate = 'ACCOUNT_INVITATION';
export type EmailOutboxStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface EnqueueEmailInput {
  organizationId: string;
  recipient: string;
  template: EmailTemplate;
  locale: string;
  /** Identifies the action token behind the link; at most one mail per token. A value, not a foreign key. */
  actionTokenHash: string;
  /** Sealed before it is stored. Holds the token itself, so it never appears in a log or an audit row. */
  payload: Record<string, unknown>;
}

export interface DeliveryState {
  status: EmailOutboxStatus;
  attempts: number;
  lastErrorCode: string | null;
  sentAt: Date | null;
}

export interface ClaimedEmail {
  id: string;
  recipient: string;
  template: string;
  locale: string;
  actionTokenHash: string;
  attempts: number;
  payloadCiphertext: Buffer | null;
  payloadKeyId: string | null;
}

/** Answers whether the link in a mail would still work; supplied by the module that owns the token. */
export type TokenUsability = (actionTokenHash: string) => Promise<boolean>;
