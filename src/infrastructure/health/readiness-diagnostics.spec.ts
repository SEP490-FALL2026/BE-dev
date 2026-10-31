import { ServiceUnavailableException } from '@nestjs/common';
import { readinessDiagnostic } from './readiness-diagnostics';

const CANARY = 'canary-4f1c2d9e7a6b-postgres://svc:hunter2@db.internal:5432/slm';

/**
 * A failed readiness check is logged by which dependency failed and what kind of error it was, never by what the error says. The
 * canary is a connection string with a password in every place an error can carry one: its message, its stack, the body of the answer
 * and its cause.
 */
describe('readinessDiagnostic', () => {
  it('names the failed dependency, the class, the status and the code of a failed Terminus check, and nothing it says', () => {
    const error = new ServiceUnavailableException({
      status: 'error',
      info: {},
      error: { database: { status: 'down', message: CANARY } },
      details: { database: { status: 'down', message: CANARY } },
    });
    Object.assign(error, { cause: Object.assign(new Error(CANARY), { code: 'P1001' }) });
    error.stack = CANARY;

    const diagnostic = readinessDiagnostic(error);

    expect(diagnostic).toEqual({
      error: 'ServiceUnavailableException',
      statusCode: 503,
      code: 'P1001',
      failed: ['database'],
    });
    expect(JSON.stringify(diagnostic)).not.toContain('hunter2');
    expect(JSON.stringify(diagnostic)).not.toContain('canary');
  });

  it('reads the answer of an error that holds it as `response`, and its own code', () => {
    const error = Object.assign(new Error(CANARY), {
      code: 'ECONNREFUSED',
      response: { error: { cache: { status: 'down' } } },
    });

    expect(readinessDiagnostic(error)).toEqual({
      error: 'Error',
      statusCode: null,
      code: 'ECONNREFUSED',
      failed: ['cache'],
    });
  });

  it('keeps only what has the shape of an identifier: a code, a class or a dependency name that carries text is dropped', () => {
    class Hostile extends Error {
      override name = `Hostile ${CANARY}`;
    }
    const error = Object.assign(new Hostile(CANARY), {
      code: `code ${CANARY}`,
      response: { error: { [`database ${CANARY}`]: { status: 'down' }, ok_name: { status: 'down' } } },
    });

    const diagnostic = readinessDiagnostic(error);

    expect(diagnostic).toEqual({ error: 'Error', statusCode: null, code: null, failed: ['ok_name'] });
  });

  it('bounds the list of failed dependencies', () => {
    const down = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`dep${index}`, { status: 'down' }]));

    expect(readinessDiagnostic(new ServiceUnavailableException({ error: down })).failed).toHaveLength(8);
  });

  it('does not throw for an error whose own accessors throw: the answer 503 is not replaced by a failure to describe it', () => {
    const hostile = {
      getStatus: () => {
        throw new Error(CANARY);
      },
      getResponse: () => {
        throw new Error(CANARY);
      },
    };

    expect(readinessDiagnostic(hostile)).toEqual({ error: 'Error', statusCode: null, code: null, failed: [] });
  });

  it('answers for what is not an error at all, without reading it', () => {
    expect(readinessDiagnostic(CANARY)).toEqual({ error: 'Error', statusCode: null, code: null, failed: [] });
    expect(readinessDiagnostic(null)).toEqual({ error: 'Error', statusCode: null, code: null, failed: [] });
  });
});
