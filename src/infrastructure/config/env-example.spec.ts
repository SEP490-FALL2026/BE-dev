import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AI_SERVICE_ENVIRONMENT_KEYS,
  aiServiceSettingsOf,
} from '../../modules/ai-assist/ai-service/ai-service-environment.policy';
import {
  OBJECT_STORAGE_ENVIRONMENT_KEYS,
  validateObjectStorageEnvironment,
} from '../object-storage/object-storage.config';
import { QUEUE_ENVIRONMENT_KEYS, validateQueueEnvironment } from '../queue/queue.config';
import { EnvironmentValidationError, validateEnvironment } from './env-schema';

/**
 * Keeps the checked-in `.env.example` in step with the environment schema. Reads only that template — never `.env`,
 * `.env.production` or any other local file — and compares variable names and their classification, not values.
 */

/** Read by compose.yaml / docker-compose.prod.yml for the containers, never by the application. */
const COMPOSE_ONLY = new Set([
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'POSTGRES_PORT',
  // The two roles of docker-compose.prod.yml; the API and the worker receive only the runtime role's DATABASE_URL.
  'DATABASE_DEPLOY_USER',
  'DATABASE_DEPLOY_PASSWORD',
  'DATABASE_RUNTIME_USER',
  'DATABASE_RUNTIME_PASSWORD',
  'MINIO_ROOT_USER',
  'MINIO_ROOT_PASSWORD',
  'MINIO_PORT',
  'MINIO_CONSOLE_PORT',
  'DOMAIN',
]);

/** Owned by modules the API and the worker do not mount today (the Owner keeps them on standby); validated when a later slice mounts them. */
const NOT_MOUNTED: ReadonlySet<string> = new Set([...OBJECT_STORAGE_ENVIRONMENT_KEYS, ...QUEUE_ENVIRONMENT_KEYS]);

/**
 * Owned and checked by one module when it is mounted, and read by nothing else: the AI service of `ai-assist`.
 * None is required: without an address the feature says the AI service is unavailable.
 */
const MODULE_CHECKED: ReadonlySet<string> = new Set(AI_SERVICE_ENVIRONMENT_KEYS);

/** Names that must never reappear: removed from the schema, a value would be silently ignored. */
const REMOVED = ['AUTH_COOKIE_SECURE'];

const SECRET_LIKE = /SECRET|PASSWORD|PEPPER|_TOKEN$|_KEY(_ID)?$|_KEYS$|ACCESS_KEY/;

interface TemplateEntry {
  name: string;
  value: string;
  commented: boolean;
  productionRequired: boolean;
  requiredOutsideTest: boolean;
  productionRequiredWhenMounted: boolean;
}

const MARKERS = ['# @production-required', '# @required-outside-test', '# @production-required-when-mounted'] as const;

function readTemplate(): TemplateEntry[] {
  const entries: TemplateEntry[] = [];
  // Markers apply to the next assignment only; several may precede it.
  let marked = new Set<string>();
  for (const line of readFileSync(join(process.cwd(), '.env.example'), 'utf8').split(/\r?\n/)) {
    if ((MARKERS as readonly string[]).includes(line.trim())) {
      marked.add(line.trim());
      continue;
    }
    const match = /^(#\s?)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    entries.push({
      name: match[2],
      value: match[3],
      commented: match[1] !== undefined,
      productionRequired: marked.has('# @production-required'),
      requiredOutsideTest: marked.has('# @required-outside-test'),
      productionRequiredWhenMounted: marked.has('# @production-required-when-mounted'),
    });
    marked = new Set();
  }

  return entries;
}

/** The variables the validator knows: every key of a fully defaulted test configuration (the only one with all). */
function schemaNames(): string[] {
  return Object.keys(validateEnvironment({ NODE_ENV: 'test' }));
}

/** The variables the validator reports as missing when nothing but NODE_ENV is set. */
function requiredNames(nodeEnvironment: 'development' | 'production'): string[] {
  try {
    validateEnvironment({ NODE_ENV: nodeEnvironment });
  } catch (error) {
    if (!(error instanceof EnvironmentValidationError)) throw error;

    return [...error.message.matchAll(/"([A-Z][A-Z0-9_]*)" is required/g)].map((match) => match[1]);
  }

  throw new Error(`The ${nodeEnvironment} validator accepted an empty environment`);
}

describe('.env.example', () => {
  const entries = readTemplate();
  const names = entries.map((entry) => entry.name);

  it('lists every schema variable exactly once, plus the not-mounted, module-checked and Compose-only ones and nothing else', () => {
    const schema = schemaNames();
    const apart = (name: string) => COMPOSE_ONLY.has(name) || NOT_MOUNTED.has(name) || MODULE_CHECKED.has(name);

    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
    expect(schema.filter((name) => !names.includes(name)).sort()).toEqual([]);
    expect(names.filter((name) => !schema.includes(name) && !apart(name)).sort()).toEqual([]);
    expect([...COMPOSE_ONLY, ...NOT_MOUNTED, ...MODULE_CHECKED].filter((name) => !names.includes(name))).toEqual([]);
    expect(schema.filter((name) => NOT_MOUNTED.has(name) || MODULE_CHECKED.has(name))).toEqual([]);
  });

  it('requires no variable of the AI service, in production either: without an address the feature is unavailable', () => {
    expect(aiServiceSettingsOf({ NODE_ENV: 'production' })).toBeNull();
    expect(
      entries
        .filter((entry) => MODULE_CHECKED.has(entry.name))
        .filter((entry) => entry.productionRequired || entry.requiredOutsideTest || entry.productionRequiredWhenMounted)
        .map((entry) => entry.name),
    ).toEqual([]);
  });

  it('marks exactly what object storage and the queue require in production once their module is mounted (ADR-0014, E2 = A)', () => {
    const required = (validate: () => unknown): string[] => {
      try {
        validate();
      } catch (error) {
        if (!(error instanceof EnvironmentValidationError)) throw error;

        return [...error.message.matchAll(/"([A-Z][A-Z0-9_]*)" is required/g)].map((match) => match[1]);
      }

      return [];
    };
    const marked = entries.filter((entry) => entry.productionRequiredWhenMounted).map((entry) => entry.name);

    expect(marked.sort()).toEqual(
      [
        ...required(() => validateObjectStorageEnvironment({ NODE_ENV: 'production' })),
        ...required(() => validateQueueEnvironment({ NODE_ENV: 'production' })),
        // Not a Joi requirement but a production rule of the queue: an unauthenticated Redis is refused.
        'REDIS_PASSWORD',
      ].sort(),
    );
    expect(() => validateQueueEnvironment({ NODE_ENV: 'production', REDIS_HOST: 'redis.internal' })).toThrow(
      'REDIS_PASSWORD',
    );
  });

  it('never lists a removed variable', () => {
    expect(names.filter((name) => REMOVED.includes(name))).toEqual([]);
  });

  it('keeps every assignment commented out, so copying it to .env sets nothing', () => {
    expect(entries.filter((entry) => !entry.commented).map((entry) => entry.name)).toEqual([]);
  });

  it('carries no value for a secret-like variable', () => {
    expect(
      entries.filter((entry) => SECRET_LIKE.test(entry.name) && entry.value !== '').map((entry) => entry.name),
    ).toEqual([]);
  });

  it('marks exactly the variables the production validator requires', () => {
    const marked = entries.filter((entry) => entry.productionRequired).map((entry) => entry.name);

    expect(marked.sort()).toEqual(requiredNames('production').sort());
  });

  it('marks exactly the variables development must supply itself, the secrets with no fallback outside test (E3 = C)', () => {
    const marked = entries.filter((entry) => entry.requiredOutsideTest).map((entry) => entry.name);

    expect(marked.sort()).toEqual(requiredNames('development').sort());
    expect(marked.sort()).toEqual(
      [
        'AUTH_ACCESS_TOKEN_SECRET',
        'AUTH_THROTTLE_PEPPER',
        'OUTBOX_PAYLOAD_KEY',
        'OUTBOX_PAYLOAD_KEY_ID',
        'LICENSE_KEY_VAULT_KEY',
        'LICENSE_KEY_VAULT_KEY_ID',
        'LICENSE_KEY_FINGERPRINT_PEPPER',
      ].sort(),
    );
  });
});
