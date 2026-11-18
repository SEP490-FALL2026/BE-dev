import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { SHARED_DEMO_V4 } from '../../../src/cli/seed/fixture/shared-demo-v4';
import { bodyOf } from '../api-body';
import { FLOW_DEMO_PASSWORD, FLOW_SUPER_ADMIN_EMAIL, FLOW_SUPER_ADMIN_PASSWORD } from './flow-template';

/** The code of the Super Admin of the installation (not one of the accounts of the dataset's people). */
export const SUPER_ADMIN = 'NV-SA';

export interface FlowSession {
  email: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

/**
 * The people of the demo dataset as accounts that sign in for real: `POST /auth/login` with the email of the dataset and the demo
 * password, the tokens kept per code (`NV-DEV3`, `NV-ENGH`, `NV-CEO`…), refreshed and signed in again after a jump of the clock.
 * Never a token signed by the test. No assertion lives here.
 */
export class FlowActors {
  private readonly sessions = new Map<string, FlowSession>();

  constructor(private readonly app: INestApplication<App>) {}

  /** The login email of a person of the dataset, or of the Super Admin. */
  emailOf(code: string): string {
    if (code === SUPER_ADMIN) return FLOW_SUPER_ADMIN_EMAIL;
    const person = SHARED_DEMO_V4.people.find((candidate) => candidate.code === code);
    if (!person) throw new Error(`The dataset has no person ${code}.`);

    return `${person.email}@${SHARED_DEMO_V4.emailDomain}`;
  }

  /** Signs the person in (again) through the real route and keeps the tokens. */
  signIn(code: string): Promise<FlowSession> {
    const password = code === SUPER_ADMIN ? FLOW_SUPER_ADMIN_PASSWORD : FLOW_DEMO_PASSWORD;

    return this.signInWith(code, this.emailOf(code), password);
  }

  /** Signs in an account the scenario made itself (its own email and password) under a name of the scenario. */
  async signInWith(name: string, email: string, password: string): Promise<FlowSession> {
    const response = await request(this.app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
    if (response.status !== 200) throw new Error(`Sign-in of ${name} answered ${response.status}.`);
    const session = { email, ...(bodyOf(response).data as Omit<FlowSession, 'email'>) };
    this.sessions.set(name, session);

    return session;
  }

  /** The session of a person already signed in; signs them in on first use. */
  async session(code: string): Promise<FlowSession> {
    return this.sessions.get(code) ?? this.signIn(code);
  }

  /** Signs in every given person that is not yet. */
  async ensure(...codes: string[]): Promise<void> {
    for (const code of codes) await this.session(code);
  }

  /** The `Authorization` header of a person already signed in (see `ensure`). */
  as(code: string): { Authorization: string } {
    const session = this.sessions.get(code);
    if (!session) throw new Error(`${code} is not signed in: call ensure('${code}') first.`);

    return { Authorization: `Bearer ${session.accessToken}` };
  }

  /** The refresh route as the browser calls it; the scenario keeps the new tokens with `keep`. */
  refresh(code: string, refreshToken?: string): request.Test {
    const session = this.sessions.get(code);
    if (!session) throw new Error(`${code} is not signed in.`);

    return request(this.app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshToken ?? session.refreshToken });
  }

  /** Keeps the tokens a refresh answered. */
  keep(code: string, response: request.Response): FlowSession {
    const session = this.sessions.get(code);
    if (!session) throw new Error(`${code} is not signed in.`);
    const next = { email: session.email, ...(bodyOf(response).data as Omit<FlowSession, 'email'>) };
    this.sessions.set(code, next);

    return next;
  }
}
