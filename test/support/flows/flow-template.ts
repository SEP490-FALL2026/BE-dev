import { NestFactory } from '@nestjs/core';
import type { AddressInfo, Server } from 'node:net';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { runSeed } from '../../../src/cli/seed/seed-run';
import { INSTALLATION } from '../../../src/cli/seed/fixture/shared-demo-v3/installation';
import { SHARED_DEMO_V3 } from '../../../src/cli/seed/fixture/shared-demo-v3';
import { BudgetAttachmentExpirySweeper } from '../../../src/modules/budgets/attachment/budget-attachment-expiry.job';
import { BudgetYearEndSweeper } from '../../../src/modules/budgets/year-end/year-end.job';
import { DocumentExpirySweeper } from '../../../src/modules/catalog/contract/document-expiry.job';
import { ExpiryReminderSweeper } from '../../../src/modules/licensing/expiry/expiry-reminder.job';
import { HandoverDutySweeper } from '../../../src/modules/licensing/handover/handover-duty.job';
import { SaasIssueSweeper } from '../../../src/modules/licensing/saas-issue/saas-issue.job';
import { ServiceAccountDutySweeper } from '../../../src/modules/licensing/assignment/service-account-duty/service-account-duty.job';
import { SubscriptionRenewalSweeper } from '../../../src/modules/licensing/subscription-renewal/subscription-renewal.job';
import { DecisionFollowUpSweeper } from '../../../src/modules/optimization/decision/decision-follow-up.job';
import { InternalRulesSweeper } from '../../../src/modules/optimization/internal-rules/internal-rules.job';
import { OrganizationChangeSweeper } from '../../../src/modules/organization/change-announcement/organization-change.job';
import { LeaveReturnSweeper } from '../../../src/modules/personnel/leave/leave-return.job';
import { NoticeOverdueSweeper } from '../../../src/modules/personnel/notice/notice-overdue.job';
import { TransferReviewSweeper } from '../../../src/modules/personnel/transfer-review/transfer-review.job';
import { DemoAccountsApi } from '../../../src/modules/installation/public/demo-accounts.api';
import { InstallationApi } from '../../../src/modules/installation/public/installation.api';
import {
  adminUrl,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../disposable-database';
import type { DisposableDatabase } from '../disposable-database';
import { createHttpTestApp, SEED_PASSWORD } from '../http-test-app';

/*
 * The seeded template of the flows runner (spec e2e-main-flows-suite, section 2). Prepared once by test/config/flows-global-setup.ts:
 * a migrated database, the installation of the demo dataset, and `ops:seed` applied through the real routes. Every file of the run
 * copies it (`CREATE DATABASE … TEMPLATE …`), so files are independent and a rerun needs no reset by hand. Nothing here asserts.
 */

const TEMPLATE_ENV = 'SLM_TEST_FLOWS_SEEDED_TEMPLATE';
const quote = (identifier: string): string => '"' + identifier.replaceAll('"', '""') + '"';

/** The password every demo account is given (passed to `runSeed`, never logged). */
export const FLOW_DEMO_PASSWORD = 'a demo password for the tests';
/** The password of the Super Admin of the installation. */
export const FLOW_SUPER_ADMIN_PASSWORD = SEED_PASSWORD;
export const FLOW_SUPER_ADMIN_EMAIL = INSTALLATION.loginEmail;

/**
 * Every timer of the API graph (`*Sweeper`, `*.job.ts`). The hourly and five-minute loops would run beside a clock the test moves,
 * so each is replaced by an empty provider: a pass runs only when the test calls its service with the clock's `now`.
 */
export const SWEEPER_OVERRIDES: { token: unknown; useValue: unknown }[] = [
  BudgetAttachmentExpirySweeper,
  BudgetYearEndSweeper,
  DocumentExpirySweeper,
  ExpiryReminderSweeper,
  HandoverDutySweeper,
  SaasIssueSweeper,
  ServiceAccountDutySweeper,
  SubscriptionRenewalSweeper,
  OrganizationChangeSweeper,
  LeaveReturnSweeper,
  NoticeOverdueSweeper,
  TransferReviewSweeper,
  InternalRulesSweeper,
  DecisionFollowUpSweeper,
].map((token) => ({ token, useValue: {} }));

interface TemplateHandle {
  name: string;
  runId: string;
}

function seededTemplate(): TemplateHandle {
  const value = process.env[TEMPLATE_ENV];
  if (!value) throw new Error('The seeded template of the flows run is missing: global setup did not run.');

  return JSON.parse(value) as TemplateHandle;
}

/** Installs the demo organization and applies the default fixture through the HTTP API of an application on `database`. */
async function seedInto(database: DisposableDatabase): Promise<void> {
  const ctx = await createHttpTestApp({ database, providerOverrides: SWEEPER_OVERRIDES });
  const install = await NestFactory.createApplicationContext(
    (await import('../../../src/modules/installation/installation.module')).InstallationModule,
    { logger: false },
  );
  let demo: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;
  try {
    await install
      .get(InstallationApi)
      .install({ ...INSTALLATION, environment: 'LOCAL_TEST', operatorReference: 'TEST-FLOWS' }, SEED_PASSWORD);
    const { SeedCliModule } = await import('../../../src/modules/installation/seed/seed-cli.module');
    demo = await NestFactory.createApplicationContext(SeedCliModule, { logger: false });
    const apiUrl = `http://127.0.0.1:${((ctx.app.getHttpServer() as unknown as Server).address() as AddressInfo).port}`;
    const outcome = await runSeed({
      args: {
        mode: 'apply',
        fixture: SHARED_DEMO_V3.id,
        apiUrl,
        operator: 'TEST-FLOWS-1',
        environment: 'LOCAL_TEST',
        json: false,
        allowBootstrap: false,
        secretsStdin: true,
      },
      secrets: { superAdminPassword: SEED_PASSWORD, demoAccountPassword: FLOW_DEMO_PASSWORD },
      accounts: demo.get(DemoAccountsApi),
    });
    if ('refused' in outcome) throw new Error(`The seed was refused: ${outcome.refused}`);
    const problems = outcome.report.steps.filter((step) => step.status !== 'done' && step.status !== 'present');
    if (outcome.report.exitCode !== 0 || problems.length > 0) {
      throw new Error(
        `The seed did not complete: ${JSON.stringify(problems.map((step) => [step.key, step.status, step.detail]))}`,
      );
    }
  } finally {
    await demo?.close();
    await install.close();
    await ctx.close();
  }
}

/** globalSetup: a migrated database, seeded with the dataset, named in the environment for the files of the run. */
export async function prepareSeededTemplate(): Promise<void> {
  const database = await provisionDisposableDatabase();
  try {
    await migrateDisposableDatabase(database);
    await seedInto(database);
  } catch (error) {
    await dropDisposableDatabase(database).catch(() => undefined);
    throw error;
  }
  process.env[TEMPLATE_ENV] = JSON.stringify({ name: database.name, runId: database.runId });
}

/** globalTeardown: drops the seeded template by its exact name and marker. */
export async function dropSeededTemplate(): Promise<void> {
  const value = process.env[TEMPLATE_ENV];
  const source = process.env.TEST_DATABASE_ADMIN_URL;
  if (!value || !source) return;
  const template = JSON.parse(value) as TemplateHandle;
  const url = new URL(adminUrl(source));
  url.pathname = '/' + template.name;
  await dropDisposableDatabase({ url: url.toString(), name: template.name, runId: template.runId });
  delete process.env[TEMPLATE_ENV];
}

/** A copy of the seeded template for one file: its own name, the marker of the run, every table as the seed left it. */
export async function cloneSeededTemplate(): Promise<DisposableDatabase> {
  const template = seededTemplate();
  const admin = new URL(adminUrl(process.env.TEST_DATABASE_ADMIN_URL as string));
  const name = 'slm_' + randomBytes(4).toString('hex') + '_test';
  const client = new Client({ connectionString: admin.toString(), application_name: 'slm-disposable-harness' });
  await client.connect();
  try {
    await client.query('CREATE DATABASE ' + quote(name) + ' TEMPLATE ' + quote(template.name));
  } finally {
    await client.end();
  }
  const target = new URL(admin.toString());
  target.pathname = '/' + name;

  return { url: target.toString(), name, runId: template.runId };
}
