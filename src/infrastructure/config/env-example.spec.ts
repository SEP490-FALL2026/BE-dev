import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  'MINIO_ROOT_USER',
  'MINIO_ROOT_PASSWORD',
  'MINIO_PORT',
  'MINIO_CONSOLE_PORT',
  'DOMAIN',
]);

/** Names that must never reappear: removed from the schema, a value would be silently ignored. */
const REMOVED = ['AUTH_COOKIE_SECURE'];

const SECRET_LIKE = /SECRET|PASSWORD|PEPPER|_KEY(_ID)?$|_KEYS$|ACCESS_KEY/;

interface TemplateEntry {
  name: string;
  value: string;
  commented: boolean;
  productionRequired: boolean;
}

function readTemplate(): TemplateEntry[] {
  const entries: TemplateEntry[] = [];
  // A `# @production-required` marker applies to the next assignment only.
  let markedRequired = false;
  for (const line of readFileSync(join(process.cwd(), '.env.example'), 'utf8').split(/\r?\n/)) {
    if (line.trim() === '# @production-required') {
      markedRequired = true;
      continue;
    }
    const match = /^(#\s?)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    entries.push({
      name: match[2],
      value: match[3],
      commented: match[1] !== undefined,
      productionRequired: markedRequired,
    });
    markedRequired = false;
  }

  return entries;
}

/** The variables the validator knows: every key of a fully defaulted development configuration. */
function schemaNames(): string[] {
  return Object.keys(validateEnvironment({}));
}

/** The variables the production validator reports as missing when nothing is set. */
function productionRequiredNames(): string[] {
  try {
    validateEnvironment({ NODE_ENV: 'production' });
  } catch (error) {
    if (!(error instanceof EnvironmentValidationError)) throw error;

    return [...error.message.matchAll(/"([A-Z][A-Z0-9_]*)" is required/g)].map((match) => match[1]);
  }

  throw new Error('The production validator accepted an empty environment');
}

describe('.env.example', () => {
  const entries = readTemplate();
  const names = entries.map((entry) => entry.name);

  it('lists every schema variable exactly once, plus the Compose-only ones and nothing else', () => {
    const schema = schemaNames();

    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
    expect(schema.filter((name) => !names.includes(name)).sort()).toEqual([]);
    expect(names.filter((name) => !schema.includes(name) && !COMPOSE_ONLY.has(name)).sort()).toEqual([]);
    expect([...COMPOSE_ONLY].filter((name) => !names.includes(name))).toEqual([]);
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

    expect(marked.sort()).toEqual(productionRequiredNames().sort());
  });
});
