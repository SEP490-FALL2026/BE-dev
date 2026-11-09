import { EnvironmentValidationError } from '../../../infrastructure/config/environment-validation';
import {
  AI_SERVICE_ENVIRONMENT_KEYS,
  aiServiceSettingsFrom,
  aiServiceSettingsOf,
} from './ai-service-environment.policy';

const TOKEN = 'a-service-token-of-the-test-run-0123456789';

describe('the settings of the AI service, checked when the module is mounted', () => {
  it('names the three variables it reads', () => {
    expect([...AI_SERVICE_ENVIRONMENT_KEYS]).toEqual([
      'AI_SERVICE_BASE_URL',
      'AI_SERVICE_TOKEN',
      'AI_SERVICE_TIMEOUT_MS',
    ]);
  });

  it('reads no service at all when no address is set, so the API starts and the feature says it is unavailable', () => {
    expect(aiServiceSettingsOf({})).toBeNull();
    expect(aiServiceSettingsOf({ AI_SERVICE_BASE_URL: '', AI_SERVICE_TOKEN: '' })).toBeNull();
    expect(aiServiceSettingsOf({ NODE_ENV: 'production' })).toBeNull();
  });

  it('reads the address, the token and a timeout of 90 seconds by default', () => {
    expect(aiServiceSettingsOf({ AI_SERVICE_BASE_URL: 'http://127.0.0.1:8000', AI_SERVICE_TOKEN: TOKEN })).toEqual({
      baseUrl: 'http://127.0.0.1:8000',
      token: TOKEN,
      timeoutMs: 90_000,
    });
    expect(
      aiServiceSettingsOf({
        AI_SERVICE_BASE_URL: 'https://ai.internal/base/',
        AI_SERVICE_TOKEN: TOKEN,
        AI_SERVICE_TIMEOUT_MS: '30000',
      }),
    ).toEqual({ baseUrl: 'https://ai.internal/base/', token: TOKEN, timeoutMs: 30_000 });
  });

  it('refuses an address without a token, naming the variable and never a value', () => {
    const read = () => aiServiceSettingsOf({ AI_SERVICE_BASE_URL: 'http://127.0.0.1:8000' });

    expect(read).toThrow(EnvironmentValidationError);
    expect(read).toThrow('AI_SERVICE_TOKEN is required when AI_SERVICE_BASE_URL is set');
  });

  it('refuses a token with a space in it without quoting it', () => {
    const read = () =>
      aiServiceSettingsOf({ AI_SERVICE_BASE_URL: 'http://127.0.0.1:8000', AI_SERVICE_TOKEN: 'two words' });

    expect(read).toThrow('AI_SERVICE_TOKEN must not contain white space');
    expect(read).not.toThrow(/two words/);
  });

  it.each([
    [
      'an address that is not a URL',
      { AI_SERVICE_BASE_URL: 'not a url', AI_SERVICE_TOKEN: TOKEN },
      'AI_SERVICE_BASE_URL',
    ],
    [
      'an address of another scheme',
      { AI_SERVICE_BASE_URL: 'ftp://ai.internal', AI_SERVICE_TOKEN: TOKEN },
      'AI_SERVICE_BASE_URL',
    ],
    // The whole call, retry included, ends before a run is taken for stuck (150 seconds).
    [
      'a timeout past two minutes',
      { AI_SERVICE_BASE_URL: 'http://ai', AI_SERVICE_TOKEN: TOKEN, AI_SERVICE_TIMEOUT_MS: '150000' },
      'AI_SERVICE_TIMEOUT_MS',
    ],
    [
      'a timeout under a second',
      { AI_SERVICE_BASE_URL: 'http://ai', AI_SERVICE_TOKEN: TOKEN, AI_SERVICE_TIMEOUT_MS: '10' },
      'AI_SERVICE_TIMEOUT_MS',
    ],
  ])('refuses %s', (_label, input, key) => {
    expect(() => aiServiceSettingsOf(input)).toThrow(EnvironmentValidationError);
    expect(() => aiServiceSettingsOf(input)).toThrow(key);
  });
});

// D7 of the design: TLS is required between machines. The token and the names and reasons of the queue cross the network.
describe('the address of the AI service in production', () => {
  const inProduction = (url: string) =>
    aiServiceSettingsOf({ NODE_ENV: 'production', AI_SERVICE_BASE_URL: url, AI_SERVICE_TOKEN: TOKEN });

  it.each([
    'http://10.0.0.12:8080',
    'http://ai-service:8080',
    'http://ai.example.com/v1',
    'http://localhost.example.com:8080',
    'http://127.0.0.1.nip.io:8080',
  ])('refuses plain HTTP to another machine (%s), naming the variable and never the token or the address', (url) => {
    const read = () => inProduction(url);

    expect(read).toThrow(EnvironmentValidationError);
    expect(read).toThrow('AI_SERVICE_BASE_URL must use HTTPS in production');
    expect(read).not.toThrow(TOKEN);
    expect(read).not.toThrow(new URL(url).host);
  });

  it.each(['http://127.0.0.1:8000', 'http://localhost:8000/v1', 'http://[::1]:8000', 'http://127.0.0.2:8000'])(
    'accepts plain HTTP to this machine (%s): nothing leaves it',
    (url) => {
      expect(inProduction(url)).toEqual({ baseUrl: url, token: TOKEN, timeoutMs: 90_000 });
    },
  );

  it.each(['https://10.0.0.12:8443', 'https://ai.example.com/v1'])('accepts HTTPS to any machine (%s)', (url) => {
    expect(inProduction(url)).toMatchObject({ baseUrl: url });
  });

  it('reads NODE_ENV from the loaded configuration as well, where the module is mounted', () => {
    const loaded: Record<string, string> = {
      NODE_ENV: 'production',
      AI_SERVICE_BASE_URL: 'http://10.0.0.12:8080',
      AI_SERVICE_TOKEN: TOKEN,
    };

    expect(() => aiServiceSettingsFrom((key) => loaded[key])).toThrow(
      'AI_SERVICE_BASE_URL must use HTTPS in production',
    );
  });

  it.each(['development', 'test', undefined])(
    'leaves plain HTTP to another machine alone outside production (%s)',
    (env) => {
      expect(
        aiServiceSettingsOf({ NODE_ENV: env, AI_SERVICE_BASE_URL: 'http://10.0.0.12:8080', AI_SERVICE_TOKEN: TOKEN }),
      ).toMatchObject({ baseUrl: 'http://10.0.0.12:8080' });
    },
  );
});
