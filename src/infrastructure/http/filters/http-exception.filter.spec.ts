import { ArgumentsHost, BadRequestException, HttpStatus, InternalServerErrorException } from '@nestjs/common';
import { ApiException } from '../errors/api.exception';
import { RequestContextService } from '../../observability/request-context.service';
import { HttpExceptionFilter } from './http-exception.filter';

interface CapturedResponse {
  status: number;
  body: { success: false; error: { code: string; message: string; details?: unknown; requestId: string } };
}

function captureResponse(filter: HttpExceptionFilter, exception: unknown): CapturedResponse {
  const captured: Partial<CapturedResponse> = {};
  const response = {
    setHeader: () => response,
    status: (value: number) => {
      captured.status = value;
      return response;
    },
    json: (value: CapturedResponse['body']) => {
      captured.body = value;
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ header: () => undefined }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  filter.catch(exception, host);

  return captured as CapturedResponse;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter(new RequestContextService());
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('uses one code for a thrown non-HttpException', () => {
    const captured = captureResponse(filter, new TypeError('boom'));

    expect(captured.status).toBe(500);
    expect(captured.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('uses the same code for an HttpException carrying a 500', () => {
    const captured = captureResponse(filter, new InternalServerErrorException());

    expect(captured.status).toBe(500);
    expect(captured.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('uses the same code for any other 5xx status', () => {
    const captured = captureResponse(filter, new ApiException(HttpStatus.BAD_GATEWAY, {} as never));

    expect(captured.status).toBe(502);
    expect(captured.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('still derives 4xx codes from the status', () => {
    expect(captureResponse(filter, new BadRequestException()).body.error.code).toBe('HTTP_BAD_REQUEST');
  });

  it('never leaks the internal message of a 5xx', () => {
    const captured = captureResponse(filter, new Error('connection string postgres://app:secret@db/app'));

    expect(captured.body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(captured.body)).not.toContain('secret');
  });

  it('keeps a deliberate code and details from an ApiException', () => {
    const captured = captureResponse(
      filter,
      new ApiException(HttpStatus.CONFLICT, {
        code: 'CATALOG.APPLICATION_SLUG_TAKEN',
        message: 'A catalog application with this slug already exists.',
        details: { slug: 'figma' },
      }),
    );

    expect(captured.status).toBe(409);
    expect(captured.body.error).toMatchObject({
      code: 'CATALOG.APPLICATION_SLUG_TAKEN',
      details: { slug: 'figma' },
    });
  });

  it('always carries a request id', () => {
    expect(captureResponse(filter, new Error('boom')).body.error.requestId).toEqual(expect.stringMatching(/\S/));
  });
});
