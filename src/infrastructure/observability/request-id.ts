import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export interface ResolveRequestIdOptions {
  /**
   * Whether an inbound `x-request-id` may be believed.
   *
   * This must come from server-side configuration (`TRUST_PROXY_HOPS`), never from a
   * request header. Deriving it from `x-forwarded-for` or `x-real-ip` would be no
   * protection at all: those headers are client-controlled, so any caller could assert
   * a proxy hop and then pin every request to an identifier of its choosing — including
   * one already used by somebody else's audit trail.
   */
  trustInbound: boolean;
}

/**
 * Required rather than optional on purpose: every call site has to state its trust
 * decision, so the unsafe behaviour cannot be reached by forgetting an argument.
 */
export function resolveRequestId(provided: string | undefined, options: ResolveRequestIdOptions): string {
  const usable = options.trustInbound && provided !== undefined && SAFE_REQUEST_ID.test(provided);

  return usable ? provided : randomUUID();
}
