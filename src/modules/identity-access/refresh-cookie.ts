import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { EnvironmentVariables } from '../../infrastructure/config/env-schema';

export const REFRESH_COOKIE_NAME = 'slm_refresh';

/**
 * The refresh token lives only in an HttpOnly, SameSite=Strict cookie scoped to the auth routes,
 * so script cannot read it and it is not sent with ordinary API calls. Clearing must repeat the
 * same attributes the cookie was set with, or the browser keeps it.
 */
@Injectable()
export class RefreshCookie {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  read(request: Request): string | undefined {
    const value = (request.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE_NAME];

    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  set(response: Response, token: string, remainingMs: number): void {
    response.cookie(REFRESH_COOKIE_NAME, token, { ...this.attributes(), maxAge: Math.max(0, Math.floor(remainingMs)) });
  }

  clear(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.attributes());
  }

  private attributes(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.get('AUTH_COOKIE_SECURE', { infer: true }),
      path: `/${this.config.get('API_PREFIX', { infer: true })}/v1/auth`,
    };
  }
}
