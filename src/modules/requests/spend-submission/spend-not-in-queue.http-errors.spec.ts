import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { SpendNotInQueueError } from '../spend/spend.errors';
import { toSpendApiException } from '../spend/spend.http-errors';

/** `SPEND.NOT_IN_QUEUE` names the request of the batch that is not waiting, so the client can mark its line (E3a, B3 row 5). */
describe('SPEND.NOT_IN_QUEUE details', () => {
  it('says the request, and stays 409', () => {
    const answer = toSpendApiException(new SpendNotInQueueError('r-1')) as ApiException;

    expect(answer.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(answer.getResponse()).toMatchObject({ code: 'SPEND.NOT_IN_QUEUE', details: { requestId: 'r-1' } });
  });
});
