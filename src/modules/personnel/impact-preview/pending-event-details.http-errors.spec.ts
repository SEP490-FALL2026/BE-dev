import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { OffboardingRefusedError } from '../offboarding/offboarding.errors';
import { toOffboardingApiException } from '../offboarding/offboarding.http-errors';
import { recordRefusal } from '../offboarding/offboarding.policy';
import { TransferRefusedError } from '../transfer/transfer.errors';
import { toTransferApiException } from '../transfer/transfer.http-errors';

const answerOf = (answer: unknown) => ({
  status: (answer as ApiException).getStatus(),
  body: (answer as ApiException).getResponse() as { code: string; details?: Record<string, unknown> },
});

/**
 * `OFFBOARDING_CASE.PENDING_EVENT_EXISTS` and `DEPARTMENT_TRANSFER.PENDING_EVENT_EXISTS` name the event that waits, so the client opens it
 * (E3c, B3 rows 7 and 8). Both stay 409; an event the refusal does not know is not named.
 */
describe('details of PENDING_EVENT_EXISTS', () => {
  it('names the transfer that waits when a departure is refused, and stays 409', () => {
    const { status, body } = answerOf(
      toOffboardingApiException(
        new OffboardingRefusedError('PENDING_EVENT_EXISTS', {
          kind: 'TRANSFER',
          effectiveOn: '2026-12-01',
          eventId: 't-1',
        }),
      ),
    );

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.code).toBe('OFFBOARDING_CASE.PENDING_EVENT_EXISTS');
    expect(body.details).toEqual({ kind: 'TRANSFER', effectiveOn: '2026-12-01', eventId: 't-1' });
  });

  it('names the event that waits when a transfer is refused, and stays 409', () => {
    const { status, body } = answerOf(
      toTransferApiException(
        new TransferRefusedError('PENDING_EVENT_EXISTS', {
          kind: 'TRANSFER',
          effectiveOn: '2026-12-01',
          eventId: 't-1',
        }),
      ),
    );

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.code).toBe('DEPARTMENT_TRANSFER.PENDING_EVENT_EXISTS');
    expect(body.details).toEqual({ kind: 'TRANSFER', effectiveOn: '2026-12-01', eventId: 't-1' });
  });

  it('does not name an event the refusal does not know (a transfer that waits only for the one who is handing over)', () => {
    const { status, body } = answerOf(
      toTransferApiException(new TransferRefusedError('PENDING_EVENT_EXISTS', { kind: 'OFFBOARDING' })),
    );

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.details).toEqual({ kind: 'OFFBOARDING' });
    expect(body.details).not.toHaveProperty('eventId');
  });

  it('is told by the policy of a departure with the transfer or the head handover that waits', () => {
    const facts = {
      today: '2026-10-24',
      hireDate: '2020-01-01',
      placementFrom: '2026-01-05',
      lastWorkingDay: '2026-11-03',
      accessBlockMode: 'WITH_LAST_DAY' as const,
      employee: { status: 'ACTIVE' as const, workState: 'WORKING' as const },
      groundsNote: 'Quyết định nghỉ việc số QD-1/2026',
      pendingTransfer: null,
      cancelPendingTransfer: false,
      namedAsSuccessor: null,
      successor: null,
    };

    expect(recordRefusal({ ...facts, pendingTransfer: { id: 't-1', effectiveOn: '2026-11-03' } })?.details).toEqual({
      kind: 'TRANSFER',
      effectiveOn: '2026-11-03',
      eventId: 't-1',
    });
    expect(recordRefusal({ ...facts, namedAsSuccessor: 't-2' })?.details).toEqual({
      kind: 'HEAD_HANDOVER',
      eventId: 't-2',
    });
  });
});
