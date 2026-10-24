import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyRequestBodyLimit,
  REQUEST_BODY_LIMIT_BYTES,
  REQUEST_BODY_LIMIT_TEXT,
  URLENCODED_DEPTH_LIMIT,
  URLENCODED_PARAMETER_LIMIT,
} from './request-body-limit';

@Module({})
class EmptyModule {}

/** The names of the middleware the Express router runs, in order. */
function parserNames(app: NestExpressApplication): string[] {
  const router = (app.getHttpAdapter().getInstance() as { router: { stack: { handle?: { name?: string } }[] } }).router;

  return router.stack
    .map((layer) => layer.handle?.name ?? '')
    .filter((name) => name === 'jsonParser' || name === 'urlencodedParser');
}

describe('applyRequestBodyLimit (P29-N1)', () => {
  it('is 100 KiB, written out once', () => {
    expect(REQUEST_BODY_LIMIT_BYTES).toBe(102_400);
    expect(REQUEST_BODY_LIMIT_TEXT).toBe('100 KiB');
  });

  it('limits URL-encoded input to 100 parameters and a depth of 5, as the API contract states (P29-N4)', () => {
    const contract = readFileSync(join(process.cwd(), 'docs', 'rules', 'api-contract.md'), 'utf8');

    expect({ parameters: URLENCODED_PARAMETER_LIMIT, depth: URLENCODED_DEPTH_LIMIT }).toEqual({
      parameters: 100,
      depth: 5,
    });
    expect(contract).toContain(`tối đa ${URLENCODED_PARAMETER_LIMIT} tham số`);
    expect(contract).toContain(`độ sâu lồng tối đa ${URLENCODED_DEPTH_LIMIT}`);
  });

  it('mounts exactly one JSON and one URL-encoded parser: Nest adds no default of its own next to them', async () => {
    const app = await NestFactory.create<NestExpressApplication>(EmptyModule, { logger: false });
    try {
      applyRequestBodyLimit(app);
      await app.init();

      expect(parserNames(app)).toEqual(['jsonParser', 'urlencodedParser']);
    } finally {
      await app.close();
    }
  });

  it('refuses an application that cannot register a body parser', () => {
    expect(() => applyRequestBodyLimit({} as never)).toThrow('Expected an Express application');
  });
});
