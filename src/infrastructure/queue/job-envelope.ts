export interface JobEnvelope<TPayload> {
  schemaVersion: 1;
  correlationId: string;
  idempotencyKey: string;
  requestedBy: string | null;
  payload: TPayload;
}
