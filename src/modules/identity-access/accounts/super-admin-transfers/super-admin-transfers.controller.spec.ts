import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { SuperAdminTransferProblem, SuperAdminTransferRefusedError } from '../account.errors';
import { SuperAdminTransferService } from './super-admin-transfer.service';
import { SuperAdminTransfersController } from './super-admin-transfers.controller';

// H5.0 characterization: the error answers of the Super Admin transfer.

const actor = { appUserId: '00000000-0000-4000-8000-000000000001' } as AuthenticatedPrincipal;

async function rejectionOf(error: Error): Promise<unknown> {
  const controller = new SuperAdminTransfersController({
    transfer: () => Promise.reject(error),
  } as unknown as SuperAdminTransferService);
  try {
    await controller.transfer(actor, { successorAppUserId: '00000000-0000-4000-8000-000000000002' });
  } catch (caught) {
    return caught;
  }
  throw new Error('transfer did not fail');
}

async function answerOf(error: Error) {
  const caught = await rejectionOf(error);
  expect(caught).toBeInstanceOf(ApiException);
  const exception = caught as ApiException;

  return { status: exception.getStatus(), body: exception.getResponse() };
}

describe('SuperAdminTransfersController — error answers (status, code, message)', () => {
  it('answers a caller who no longer holds the role like one who never did (403)', async () => {
    expect(await answerOf(new SuperAdminTransferRefusedError('NOT_HOLDER'))).toEqual({
      status: HttpStatus.FORBIDDEN,
      body: { code: 'AUTHORIZATION.FORBIDDEN', message: 'You do not have permission to perform this action.' },
    });
  });

  it('answers an unknown successor with 404', async () => {
    expect(await answerOf(new SuperAdminTransferRefusedError('SUCCESSOR_NOT_FOUND'))).toEqual({
      status: HttpStatus.NOT_FOUND,
      body: {
        code: 'SUPER_ADMIN_TRANSFER.SUCCESSOR_NOT_FOUND',
        message: 'The Super Admin role cannot be transferred: SUCCESSOR_NOT_FOUND.',
      },
    });
  });

  it.each<SuperAdminTransferProblem>([
    'SUCCESSOR_IS_HOLDER',
    'ACCOUNT_LOCKED',
    'EMPLOYEE_NOT_WORKING',
    'NOT_ACTIVATED',
    'EMAIL_NOT_VERIFIED',
    'WORK_ROLE_HELD',
    'APPROVAL_ROLE_HELD',
    'HEADS_DEPARTMENT',
  ])('answers a successor refused for %s with 422', async (problem) => {
    expect(await answerOf(new SuperAdminTransferRefusedError(problem))).toEqual({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      body: {
        code: `SUPER_ADMIN_TRANSFER.${problem}`,
        message: `The Super Admin role cannot be transferred: ${problem}.`,
      },
    });
  });

  it.each([new TransientDatabaseError('57014', new Error('timeout')), new Error('Query read timeout')])(
    'answers 503 SERVICE_UNAVAILABLE for an unreachable database: %s',
    async (outage) => {
      expect(await answerOf(outage)).toEqual({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        body: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable. Retry shortly.' },
      });
    },
  );

  it('passes an HTTP answer already made through unchanged', async () => {
    const answer = new ApiException(HttpStatus.CONFLICT, { code: 'SOME.CONFLICT', message: 'Already decided.' });

    await expect(rejectionOf(answer)).resolves.toBe(answer);
  });

  it('keeps an unexpected error as it is, so it is reported as an internal error', async () => {
    const defect = new Error('A Super Admin role was transferred before installation');

    await expect(rejectionOf(defect)).resolves.toBe(defect);
  });
});
