import type { Response } from 'supertest';

/**
 * supertest types `response.body` as `any`. HTTP tests read it through this shape so the lint
 * rules against unsafe `any` access stay on. Only fields the tests actually read are listed;
 * a missing field is `undefined` at runtime and the assertion on it fails visibly.
 */
export interface ApiBody {
  success: boolean;
  message: string;
  data: {
    accessToken: string;
    /** Login and refresh: the opaque, single-use token for `/auth/refresh` and `/auth/logout`. */
    refreshToken: string;
    tokenType: string;
    expiresAt: string;
    appUserId: string;
    loginEmail: string;
    /** Account detail: the latest invitation, or null when there is none. */
    invitation: { usable: boolean } | null;
    /** Password self-service (slice 1c). */
    requested: boolean;
    passwordReset: boolean;
    passwordChanged: boolean;
  };
  error: {
    code: string;
    message: string;
    requestId: string;
    details: {
      retryAfterSeconds: number;
      issues: Array<{ code: string; path: string }>;
      field: string;
      violation: string;
    };
  };
}

export function bodyOf(response: Response): ApiBody {
  return response.body as ApiBody;
}
