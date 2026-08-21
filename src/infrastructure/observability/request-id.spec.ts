import { ConfigService } from '@nestjs/config';
import { RequestContextService } from './request-context.service';
import { RequestIdMiddleware } from './request-id.middleware';
import { resolveRequestId } from './request-id';

const GENERATED_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('keeps a safe inbound identifier when a trusted proxy is configured', () => {
    expect(resolveRequestId('web-01J_SAFE.request', { trustInbound: true })).toBe('web-01J_SAFE.request');
  });

  it('ignores an inbound identifier when no proxy is configured', () => {
    const resolved = resolveRequestId('caller-chosen-id', { trustInbound: false });

    expect(resolved).not.toBe('caller-chosen-id');
    expect(resolved).toMatch(GENERATED_UUID);
  });

  it('ignores an unsafe identifier even behind a trusted proxy', () => {
    expect(resolveRequestId('bad id with spaces', { trustInbound: true })).toMatch(GENERATED_UUID);
    expect(resolveRequestId('x'.repeat(129), { trustInbound: true })).toMatch(GENERATED_UUID);
  });

  it('generates an identifier when none is supplied', () => {
    expect(resolveRequestId(undefined, { trustInbound: true })).toMatch(GENERATED_UUID);
  });
});

describe('RequestIdMiddleware', () => {
  function runWith(trustProxyHops: number, headers: Record<string, string>): string {
    const config = { get: () => trustProxyHops } as unknown as ConfigService<never, true>;
    const middleware = new RequestIdMiddleware(new RequestContextService(), config);
    let emitted = '';
    const request = { header: (name: string) => headers[name.toLowerCase()] } as never;
    const response = {
      setHeader: (_name: string, value: string) => {
        emitted = value;
      },
    } as never;

    middleware.use(request, response, () => undefined);

    return emitted;
  }

  it('honours an inbound identifier when TRUST_PROXY_HOPS is configured', () => {
    expect(runWith(1, { 'x-request-id': 'edge-01J.request' })).toBe('edge-01J.request');
  });

  it('ignores an inbound identifier when TRUST_PROXY_HOPS is zero', () => {
    expect(runWith(0, { 'x-request-id': 'caller-chosen-id' })).toMatch(GENERATED_UUID);
  });

  it('cannot be tricked by a caller asserting its own proxy headers', () => {
    // Trust is a deployment fact read from configuration. `x-forwarded-for` and
    // `x-real-ip` are client-controlled, so a caller that sets them must not thereby
    // gain the ability to choose its own correlation identifier.
    const spoofed = {
      'x-request-id': 'caller-chosen-id',
      'x-forwarded-for': '203.0.113.9',
      'x-real-ip': '203.0.113.9',
    };

    expect(runWith(0, spoofed)).toMatch(GENERATED_UUID);
    expect(runWith(0, spoofed)).not.toBe('caller-chosen-id');
  });

  it('always publishes the identifier it chose on the response', () => {
    expect(runWith(0, {})).toMatch(GENERATED_UUID);
  });
});
