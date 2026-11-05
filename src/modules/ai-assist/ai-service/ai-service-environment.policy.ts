import Joi from 'joi';
import { EnvironmentValidationError, validateWithSchema } from '../../../infrastructure/config/environment-validation';
import type { AiServiceSettings } from './ai-service.types';

/**
 * The settings of the AI service, checked when `AiAssistModule` is mounted, as the object storage checks its own: the API, the worker
 * and the commands share no schema for them. No address means no AI service: the API starts and the feature answers that it is
 * unavailable. An address without its token is a mistake of the deployment and stops the start with a message that names the
 * variable, never its value: the token lives in the environment only.
 */
const aiServiceKeys = {
  AI_SERVICE_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .default(''),
  AI_SERVICE_TOKEN: Joi.string().allow('').default(''),
  // The whole call, its retry included, ends before a run is taken for stuck (150 seconds).
  AI_SERVICE_TIMEOUT_MS: Joi.number().integer().min(1_000).max(120_000).default(90_000),
};

export const AI_SERVICE_ENVIRONMENT_KEYS = Object.keys(aiServiceKeys) as (keyof typeof aiServiceKeys)[];

const aiServiceSchema = Joi.object(aiServiceKeys).unknown(true);

interface AiServiceEnvironment {
  AI_SERVICE_BASE_URL: string;
  AI_SERVICE_TOKEN: string;
  AI_SERVICE_TIMEOUT_MS: number;
}

/** This machine: what is sent to it never crosses a network. */
const isLoopback = (hostname: string) =>
  hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname);

/**
 * D7 of the design, TLS between machines: in production the bearer token and the names and reasons of the queue go over HTTPS, or
 * stay on this machine. Outside production any address is accepted. The message names the variable, never the address or the token.
 */
function refusePlainHttpToAnotherMachine(input: Record<string, unknown>, baseUrl: string): void {
  if (input.NODE_ENV !== 'production') return;
  const address = new URL(baseUrl);
  if (address.protocol === 'https:' || isLoopback(address.hostname)) return;
  throw new EnvironmentValidationError(
    'Environment validation failed: AI_SERVICE_BASE_URL must use HTTPS in production unless it points to this machine ' +
      '(localhost, 127.0.0.0/8, ::1)',
  );
}

/** The settings of the AI service from the environment, or null when none is configured. */
export function aiServiceSettingsOf(input: Record<string, unknown>): AiServiceSettings | null {
  const environment = validateWithSchema(aiServiceSchema, input) as AiServiceEnvironment;
  if (environment.AI_SERVICE_BASE_URL === '') return null;
  refusePlainHttpToAnotherMachine(input, environment.AI_SERVICE_BASE_URL);
  if (environment.AI_SERVICE_TOKEN === '') {
    throw new EnvironmentValidationError(
      'Environment validation failed: AI_SERVICE_TOKEN is required when AI_SERVICE_BASE_URL is set',
    );
  }
  // A bearer token travels in one header value: it has no white space (and the message never quotes it).
  if (/\s/.test(environment.AI_SERVICE_TOKEN)) {
    throw new EnvironmentValidationError(
      'Environment validation failed: AI_SERVICE_TOKEN must not contain white space',
    );
  }

  return {
    baseUrl: environment.AI_SERVICE_BASE_URL,
    token: environment.AI_SERVICE_TOKEN,
    timeoutMs: environment.AI_SERVICE_TIMEOUT_MS,
  };
}

/** The same, read from the loaded configuration; the factory of the module calls it when the module is mounted. */
export function aiServiceSettingsFrom(read: (key: string) => unknown): AiServiceSettings | null {
  return aiServiceSettingsOf(
    Object.fromEntries([...AI_SERVICE_ENVIRONMENT_KEYS, 'NODE_ENV'].map((key) => [key, read(key)])),
  );
}
