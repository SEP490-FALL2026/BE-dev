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
    tokenType: string;
    expiresAt: string;
    appUserId: string;
    loginEmail: string;
  };
  error: {
    code: string;
    message: string;
    requestId: string;
    details: { retryAfterSeconds: number; issues: Array<{ code: string; path: string }>; field: string };
  };
}

export function bodyOf(response: Response): ApiBody {
  return response.body as ApiBody;
}
