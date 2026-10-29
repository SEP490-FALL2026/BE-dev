import { INestApplication } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { App } from 'supertest/types';
import { Contributions } from '../../../src/core/extension/contributions';
import { Hook } from '../../../src/core/extension/hook';
import { Listeners } from '../../../src/core/extension/listeners';
import { createHttpContractApp } from '../../support/http-contract-app';

/**
 * ADR-0019: every extension point of the API graph is a Nest provider, and a Hook that no module bound fails only when
 * it is first called. This file starts the real API graph once and proves, before any request, that every Hook can
 * answer — a missing `*.listener.ts` registration shows here instead of in production.
 */
describe('extension points of the API graph (ADR-0019)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  function providers(): unknown[] {
    const all: unknown[] = [...app.get(ModulesContainer).values()].flatMap((module) =>
      [...module.providers.values()].map((wrapper) => wrapper.instance),
    );
    return [...new Set(all)];
  }

  it('binds every Hook at start-up', () => {
    const hooks = providers().filter((provider): provider is Hook<unknown> => provider instanceof Hook);

    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks.filter((hook) => !hook.canAnswer()).map((hook) => hook.name)).toEqual([]);
  });

  it('gives every point a unique name', () => {
    const names = providers()
      .filter(
        (provider): provider is Hook<unknown> | Listeners<unknown, unknown> | Contributions<unknown> =>
          provider instanceof Hook || provider instanceof Listeners || provider instanceof Contributions,
      )
      .map((point) => point.name);

    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });
});
